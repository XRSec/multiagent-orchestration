/**
 * Purpose: Server Persistent Companion Session Engine & Ledger for Dual-Session Intent Compilation & Prose Distillation.
 * Context: Runs hidden background companion sessions paired with main bot agents.
 * Usage: Instantiate CompanionSessionManager in index.server.ts and invoke compileUserTurn / distillTurnReply.
 */

import { join } from "node:path";
import type { PaseoApi } from "@getpaseo/client";
import { lastTurn, type TimelineItemLike } from "../shared/activity";
import {
  formatCompanionIntentEnvelope,
  SHADOW_FOR_LABEL,
  SHADOW_SESSION_LABEL,
  ShadowSessionRecordSchema,
  shouldBypassCompanionIntent,
  type ShadowSessionRecord,
  type ShadowTurnRecord,
} from "../shared/companion-intent";
import { type Bot } from "../shared/bot";
import { pluginDataPath } from "./bot-home";
import { atomicWrite, ensureRealDirectory, readRegularText } from "./files";
import type { BotsHost } from "./host";

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

function safeId(id: string): string {
  if (!id || id.length > 200) throw new Error("An ID must be 1 to 200 characters.");
  return SAFE_ID_RE.test(id) ? id : encodeURIComponent(id).slice(0, 200);
}

export function shadowSessionsDir(): string {
  return process.env.PASEO_BOTS_SHADOW_DIR || join(pluginDataPath(), "shadow-sessions");
}

export function shadowSessionFile(mainAgentId: string): string {
  return join(shadowSessionsDir(), `${safeId(mainAgentId)}.json`);
}

export async function readShadowSession(mainAgentId: string): Promise<ShadowSessionRecord | null> {
  const file = shadowSessionFile(mainAgentId);
  const text = await readRegularText(file, 2 * 1024 * 1024);
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    return ShadowSessionRecordSchema.parse(raw);
  } catch (error) {
    console.warn(`[paseo-bots] Failed to parse shadow session for ${mainAgentId}:`, error);
    return null;
  }
}

export async function writeShadowSession(record: ShadowSessionRecord): Promise<void> {
  const file = shadowSessionFile(record.mainAgentId);
  await atomicWrite(file, JSON.stringify(record, null, 2));
}

export const SHADOW_SYSTEM_PROMPT = `You are a fast, silent Companion Intent Compiler and Reply Distiller session.
Your role:
1. When receiving <analyze_user_turn turn="N">:
Analyze the user's latest message in context of previous conversation turns and distilled replies.
Produce a concise, single- or multi-line distilled user intent (what the user actually wants done), and a compiled, self-contained, actionable prompt for the main agent.
Output strictly in this XML format:
<intent_analysis>
DISTILLED_INTENT: <concise summary of actual user intent>
COMPILED_PROMPT:
<self-contained, clear, actionable prompt instructions for the main agent>
</intent_analysis>

2. When receiving <distill_assistant_reply turn="N">:
Summarize the assistant's visible response.
Preserve key conclusions, concrete decisions, code snippets/file paths referenced, and any pending options or questions posed to the user (so that follow-up replies like "选第二个" or "继续" can be accurately disambiguated).
Output strictly in this XML format:
<reply_summary>
DISTILLED_REPLY: <concise summary preserving key decisions, options, paths, questions>
</reply_summary>

Strict rules:
- NO TOOLS: You do NOT execute any tools or write files.
- Stay concise, accurate, and deterministic.
- Do NOT output any extraneous conversational greetings or chit-chat outside the requested XML tags.`;

export function resolveCompanionModel(bot?: Bot | null): { provider: string; model: string } {
  const envModel = process.env.PASEO_BOTS_COMPANION_MODEL;
  const provider = bot?.provider || "agy";
  if (envModel) {
    return { provider, model: envModel };
  }
  if (provider === "agy") {
    return { provider: "agy", model: "gemini-3.8-flash" };
  }
  if (provider === "claude") {
    return { provider: "claude", model: "claude-haiku-4-5" };
  }
  return { provider, model: bot?.model || "gemini-3.8-flash" };
}

export function formatPriorDistilledHistory(turns: readonly ShadowTurnRecord[]): string {
  if (turns.length === 0) return "";
  const lines: string[] = ["<prior_distilled_history>"];
  for (const turn of turns) {
    lines.push(`--- Turn ${turn.turnIndex} ---`);
    lines.push(`User: ${turn.rawUser}`);
    lines.push(`Distilled Intent: ${turn.distilledIntent}`);
    if (turn.distilledReply) {
      lines.push(`Assistant Summary: ${turn.distilledReply}`);
    }
  }
  lines.push("</prior_distilled_history>");
  return lines.join("\n");
}

export function parseIntentAnalysis(text: string): { distilledIntent: string; compiledPrompt: string } | null {
  const match = /<intent_analysis>([\s\S]*?)<\/intent_analysis>/i.exec(text);
  if (!match) return null;
  const content = match[1]!;
  const intentMatch = /DISTILLED_INTENT:\s*([\s\S]*?)(?=\n\s*COMPILED_PROMPT:|$)/i.exec(content);
  const promptMatch = /COMPILED_PROMPT:\s*([\s\S]*?)$/i.exec(content);
  if (!intentMatch || !promptMatch) return null;
  const distilledIntent = intentMatch[1]!.trim();
  const compiledPrompt = promptMatch[1]!.trim();
  if (!distilledIntent || !compiledPrompt) return null;
  return { distilledIntent, compiledPrompt };
}

export function parseReplySummary(text: string): string | null {
  const match = /<reply_summary>([\s\S]*?)<\/reply_summary>/i.exec(text);
  if (!match) return null;
  const content = match[1]!;
  const replyMatch = /DISTILLED_REPLY:\s*([\s\S]*?)$/i.exec(content);
  return replyMatch ? replyMatch[1]!.trim() : content.trim();
}

export interface CompileUserTurnInput {
  mainAgentId: string;
  botId: string;
  groupId?: string | null;
  rawText: string;
}

export interface CompileUserTurnOutput {
  outgoingText: string;
  bypassed: boolean;
  turnIndex?: number;
  distilledIntent?: string;
  compiledPrompt?: string;
  fallbackReason?: string;
}

export class CompanionSessionManager {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly host: BotsHost) {}

  private enqueue<T>(mainAgentId: string, op: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(mainAgentId) ?? Promise.resolve();
    const run = async () => {
      try {
        await prev;
      } catch {
        // ignore errors from previous turns in the queue
      }
      return op();
    };
    const next = run();
    this.queues.set(mainAgentId, next.catch(() => null));
    return next;
  }

  async readLedger(mainAgentId: string): Promise<ShadowSessionRecord | null> {
    return readShadowSession(mainAgentId);
  }

  async compileUserTurn(input: CompileUserTurnInput): Promise<CompileUserTurnOutput> {
    const { mainAgentId, botId, rawText } = input;

    if (shouldBypassCompanionIntent(rawText)) {
      return { outgoingText: rawText, bypassed: true };
    }

    try {
      return await this.enqueue(mainAgentId, async () => {
        const paseo = this.host.paseo;
        if (!paseo) {
          return { outgoingText: rawText, bypassed: true, fallbackReason: "Paseo host unavailable" };
        }

        const bot = await this.host.bot(botId);
        let record = await readShadowSession(mainAgentId);
        const { provider, model } = resolveCompanionModel(bot);

        if (!record) {
          record = {
            version: 1,
            mainAgentId,
            botId,
            companionAgentId: null,
            provider,
            model,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            turns: [],
          };
        }

        // Verify or create companion agent
        let companionAgentId = record.companionAgentId;
        let needsPriorHistory = false;

        if (companionAgentId) {
          const snapshot = await paseo.agents.ref(companionAgentId).refresh().catch(() => null);
          const agent = snapshot?.agent as { archivedAt?: string | null; status?: string } | undefined;
          if (!agent || agent.archivedAt || agent.status === "archived") {
            companionAgentId = null;
          }
        }

        if (!companionAgentId) {
          const cwd = join(shadowSessionsDir(), "cwd");
          await ensureRealDirectory(cwd);
          const title = `[Companion] ${bot?.name ?? botId}`;
          const config = {
            provider: `${provider}/${model}`,
            thinkingOptionId: "low",
            mcpServers: {},
            systemPrompt: SHADOW_SYSTEM_PROMPT,
            systemPromptMode: "replace" as const,
          };

          const created = await paseo.agents.create({
            background: true,
            cwd,
            title,
            labels: {
              "paseo-bots:shadow-bot": bot?.id ?? botId,
              [SHADOW_SESSION_LABEL]: "true",
              [SHADOW_FOR_LABEL]: mainAgentId,
            },
            config,
          });

          companionAgentId = created.id;
          record.companionAgentId = companionAgentId;
          record.provider = provider;
          record.model = model;
          if (record.turns.length > 0) {
            needsPriorHistory = true;
          }
        }

        const turnIndex = record.turns.length + 1;
        const analyzePrompt = `<analyze_user_turn turn="${turnIndex}">\n${rawText}\n</analyze_user_turn>`;
        const promptToSend = needsPriorHistory
          ? `${formatPriorDistilledHistory(record.turns)}\n\n${analyzePrompt}`
          : analyzePrompt;

        const companionRef = paseo.agents.ref(companionAgentId);
        await companionRef.run(promptToSend, { timeoutMs: 15_000 });

        const page = await companionRef.timeline.refetch({ direction: "tail", projection: "projected", limit: 10 });
        const items = (page?.entries ?? []).map((e: any) => (e.item ?? e) as TimelineItemLike);
        const { reply } = lastTurn(items);

        const analysis = parseIntentAnalysis(reply);
        if (!analysis) {
          return {
            outgoingText: rawText,
            bypassed: true,
            fallbackReason: "Companion did not return valid intent_analysis XML",
          };
        }

        const turnRecord: ShadowTurnRecord = {
          turnIndex,
          rawUser: rawText,
          distilledIntent: analysis.distilledIntent,
          compiledPrompt: analysis.compiledPrompt,
          distilledReply: null,
          createdAt: new Date().toISOString(),
          completedAt: null,
        };

        record.turns.push(turnRecord);
        record.updatedAt = new Date().toISOString();
        await writeShadowSession(record);

        const outgoingText = formatCompanionIntentEnvelope({
          rawUserText: rawText,
          turnIndex,
          distilledIntent: analysis.distilledIntent,
          compiledPrompt: analysis.compiledPrompt,
        });

        return {
          outgoingText,
          bypassed: false,
          turnIndex,
          distilledIntent: analysis.distilledIntent,
          compiledPrompt: analysis.compiledPrompt,
        };
      });
    } catch (error) {
      const fallbackReason = error instanceof Error ? error.message : String(error);
      console.warn(`[paseo-bots] Companion compile failed for ${mainAgentId}, failing open:`, error);
      return { outgoingText: rawText, bypassed: true, fallbackReason };
    }
  }

  async distillTurnReply(input: { mainAgentId: string; botId: string; assistantBody: string }): Promise<void> {
    const { mainAgentId, assistantBody } = input;
    if (!assistantBody.trim()) return;

    try {
      await this.enqueue(mainAgentId, async () => {
        const paseo = this.host.paseo;
        if (!paseo) return;

        const record = await readShadowSession(mainAgentId);
        if (!record || record.turns.length === 0) return;

        const lastTurnRecord = record.turns[record.turns.length - 1]!;
        if (lastTurnRecord.distilledReply !== null) return; // Already distilled

        let companionAgentId = record.companionAgentId;
        if (!companionAgentId) return;

        const snapshot = await paseo.agents.ref(companionAgentId).refresh().catch(() => null);
        const agent = snapshot?.agent as { archivedAt?: string | null; status?: string } | undefined;
        if (!agent || agent.archivedAt || agent.status === "archived") {
          return;
        }

        const distillPrompt = `<distill_assistant_reply turn="${lastTurnRecord.turnIndex}">\n${assistantBody.trim()}\n</distill_assistant_reply>`;
        const companionRef = paseo.agents.ref(companionAgentId);
        await companionRef.run(distillPrompt, { timeoutMs: 15_000 });

        const page = await companionRef.timeline.refetch({ direction: "tail", projection: "projected", limit: 10 });
        const items = (page?.entries ?? []).map((e: any) => (e.item ?? e) as TimelineItemLike);
        const { reply } = lastTurn(items);

        const summary = parseReplySummary(reply) ?? (reply.trim() || null);
        lastTurnRecord.distilledReply = summary;
        lastTurnRecord.completedAt = new Date().toISOString();
        record.updatedAt = new Date().toISOString();

        await writeShadowSession(record);
      });
    } catch (error) {
      console.warn(`[paseo-bots] Companion reply distillation failed for ${mainAgentId}:`, error);
    }
  }

  async archiveForMainAgent(mainAgentId: string): Promise<void> {
    try {
      const record = await readShadowSession(mainAgentId);
      if (record?.companionAgentId && this.host.paseo) {
        await this.host.paseo.agents.ref(record.companionAgentId).archive?.().catch(() => null);
      }
    } catch {
      // ignore archive errors
    } finally {
      this.queues.delete(mainAgentId);
    }
  }

  async sweepOrphanShadowSessions(paseo: PaseoApi): Promise<number> {
    let count = 0;
    try {
      const listRes = await paseo.agents
        .list({ filter: { labels: { [SHADOW_SESSION_LABEL]: "true" }, includeBackground: true } })
        .catch(() => null);
      const rawList: any[] = Array.isArray(listRes)
        ? listRes
        : Array.isArray(listRes?.entries)
          ? listRes.entries
          : [];

      for (const item of rawList) {
        const agent = item?.agent ?? item;
        if (!agent || !agent.id || agent.archivedAt) continue;
        const labels = agent.labels ?? {};
        if (labels[SHADOW_SESSION_LABEL] === "true") {
          const mainId = labels[SHADOW_FOR_LABEL];
          if (mainId) {
            const mainSnapshot = await paseo.agents.ref(mainId).refresh().catch(() => null);
            const mainAgent = mainSnapshot?.agent as { archivedAt?: string | null } | undefined;
            if (!mainAgent || mainAgent.archivedAt) {
              const ref = paseo.agents.ref(agent.id);
              if (ref && typeof ref.archive === "function") {
                await ref.archive().catch(() => null);
                count++;
              }
            }
          }
        }
      }
    } catch {
      // ignore sweep errors
    }
    return count;
  }
}
