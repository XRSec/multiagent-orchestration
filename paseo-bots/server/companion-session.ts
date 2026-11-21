/**
 * Purpose: Server Persistent Companion Session Engine & Ledger for Dual-Session Intent Compilation & Prose Distillation (Morph B+).
 * Context: Runs hidden background companion sessions paired with main bot agents.
 * Usage: Instantiate CompanionSessionManager in index.server.ts and invoke compileUserTurn / distillTurnReply.
 */

import { join } from "node:path";
import type { PaseoApi } from "./paseo";
import { lastTurn, type TimelineItemLike } from "../shared/activity";
export { extractToolFootprintDigest, turnVisibleAssistantBody, lastTurn } from "../shared/activity";
export { formatCompanionIntentEnvelope, parseCompanionIntentEnvelope, classifyCompanionBypass } from "../shared/companion-intent";
import {
  applyClosedWorldGuard,
  applyConstraintOps,
  classifyCompanionBypass,
  formatCompanionIntentEnvelope,
  SHADOW_FOR_LABEL,
  SHADOW_SESSION_LABEL,
  ShadowSessionRecordSchema,
  shouldBypassCompanionIntent,
  type CompanionBypassReason,
  type RootGoal,
  type ShadowConstraint,
  type ShadowSessionRecord,
  type ShadowSessionRecordV2,
  type ShadowTurnRecord,
  type ShadowTurnRecordV2,
  type StagedConstraintOp,
  type ToolFootprintDigest,
  type WorkspaceTouchpoints,
} from "../shared/companion-intent";
import { isGlobalAssistantBot, LONG_SESSION_SYNC_METADATA, type Bot } from "../shared/bot";
import { botDataPath, pluginDataPath, teamHomePath } from "./bot-home";
import { atomicWrite, ensureRealDirectory, readRegularText } from "./files";
import type { BotsHost } from "./host";
import { computeMemorySyncSnapshot } from "./memory";

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

export async function readShadowSession(mainAgentId: string): Promise<ShadowSessionRecordV2 | null> {
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

export async function writeShadowSession(record: ShadowSessionRecordV2): Promise<void> {
  const file = shadowSessionFile(record.mainAgentId);
  await atomicWrite(file, JSON.stringify(record, null, 2));
}

// ---------------------------------------------------------------- Circuit Breaker (60s cooldown, 3 failures)

export class CompanionCircuitBreaker {
  private failures = new Map<string, number>();
  private openUntil = new Map<string, number>();
  private halfOpen = new Map<string, boolean>();
  private readonly cooldownMs: number;

  constructor(options?: { cooldownMs?: number }) {
    this.cooldownMs =
      options?.cooldownMs ??
      (Number(process.env.PASEO_BOTS_CIRCUIT_BREAKER_COOLDOWN_MS) || 60_000);
  }

  isOpen(provider = "default"): boolean {
    const until = this.openUntil.get(provider);
    if (!until) return false;
    const now = Date.now();
    if (now < until) {
      return true; // Breaker is OPEN
    }
    // Cooldown elapsed -> transition to HALF-OPEN for 1 probe
    this.openUntil.delete(provider);
    this.halfOpen.set(provider, true);
    return false;
  }

  recordSuccess(provider = "default"): void {
    this.failures.set(provider, 0);
    this.openUntil.delete(provider);
    this.halfOpen.set(provider, false);
  }

  recordFailure(provider = "default"): void {
    const isHalf = this.halfOpen.get(provider);
    if (isHalf) {
      this.openUntil.set(provider, Date.now() + this.cooldownMs);
      this.halfOpen.set(provider, false);
      return;
    }
    const count = (this.failures.get(provider) ?? 0) + 1;
    this.failures.set(provider, count);
    if (count >= 3) {
      this.openUntil.set(provider, Date.now() + this.cooldownMs);
    }
  }

  reset(provider?: string): void {
    if (provider) {
      this.failures.delete(provider);
      this.openUntil.delete(provider);
      this.halfOpen.delete(provider);
    } else {
      this.failures.clear();
      this.openUntil.clear();
      this.halfOpen.clear();
    }
  }

  getFailures(provider = "default"): number {
    return this.failures.get(provider) ?? 0;
  }
}

// ---------------------------------------------------------------- Pending Post-Turn Snapshot

export interface PendingPostTurnSnapshot {
  turnSeq: number;
  rawUserText: string;
  assistantVisibleBody: string;
  footprintDigest: ToolFootprintDigest;
  timestamp: number;
}

// ---------------------------------------------------------------- System Prompts & Assembly

export const SHADOW_SYSTEM_PROMPT = `You are the Companion Intent Compiler and Reply Distiller session (Morph B+ Bounded Structured Ledger).
Your role:
1. When receiving <analyze_user_turn turn="N">:
Analyze the user's latest message against the LEDGER_STATE (<root_goal>, <active_constraints>, <workspace_touchpoints>, <recent_distilled_turns>).
Resolve pronouns, ellipses, and requirement pivots under CLOSED-WORLD rules (never invent file paths).
Output EITHER a compact JSON object (preferred) OR XML tags:
{
  "action": "PASS" | "AUGMENT",
  "inject": {
    "intent_kind": "DISAMBIGUATE" | "PIVOT_CONSTRAINT" | "REVERT_OR_RETRY" | "RECITE_CONSTRAINTS",
    "clarified_goal": "<1-2 concise sentences>",
    "resolved_targets": [{ "phrase": "pronoun", "candidates": ["exact/path/from/ledger"] }],
    "effective_constraints": ["[MUST] ..."]
  },
  "ledger_prep": {
    "distilled_user_intent": "<1-sentence summary of request>",
    "staged_constraint_ops": [{ "op": "ADD" | "SUPERSEDE" | "REVOKE", "target_id": null | "C1", "strength": "MUST" | "MUST_NOT" | "PREFER", "rule": "...", "verbatim_quote": "..." }]
  }
}
OR XML format:
<intent_analysis>
DISTILLED_INTENT: <summary>
COMPILED_PROMPT:
<actionable prompt instructions>
</intent_analysis>

2. When receiving <distill_assistant_reply turn="N">:
Summarize visible prose, preserving concrete decisions, options/questions posed to user, and verifying exit codes from tool footprint.
Output strictly in this XML format:
<reply_summary>
DISTILLED_REPLY: <concise summary preserving decisions, paths, questions>
</reply_summary>

Strict rules:
- NO TOOLS: You do NOT execute any tools or write files.
- Stay concise, accurate, and deterministic. No chit-chat.`;

export const WEDGED_SESSION_ERROR_RE =
  /timed out|timeout|Cannot replace agent|active run cancellation was not acknowledged/i;

export function isWedgedSessionError(error: unknown): boolean {
  if (!error) return false;
  const msg =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : String((error as any)?.message ?? error);
  return WEDGED_SESSION_ERROR_RE.test(msg);
}

export function resolveCompanionModel(
  bot?: Bot | null,
  options?: { thinkingOptionId?: string }
): {
  provider: string;
  model: string;
  thinkingOptionId?: string;
} {
  const envModel = process.env.PASEO_BOTS_COMPANION_MODEL;
  const envThinking = process.env.PASEO_BOTS_COMPANION_THINKING;
  const thinkingOptionId = options?.thinkingOptionId || envThinking || "medium";
  const provider = bot?.provider || "agy";
  if (envModel) {
    return { provider, model: envModel, thinkingOptionId };
  }
  if (provider === "agy") {
    return { provider: "agy", model: "gemini-3.8-flash", thinkingOptionId };
  }
  if (provider === "claude") {
    return { provider: "claude", model: "claude-haiku-4-5", thinkingOptionId };
  }
  return { provider, model: bot?.model || "gemini-3.8-flash", thinkingOptionId };
}

export function formatBoundedLedgerPrompt(
  record: ShadowSessionRecordV2,
  pendingSnapshot?: PendingPostTurnSnapshot
): string {
  const parts: string[] = ["<ledger_state>"];
  if (record.rootGoal) {
    parts.push(`<root_goal turn="${record.rootGoal.turnSeq}">`);
    parts.push(`Summary: ${record.rootGoal.summary}`);
    parts.push(`Anchor: ${record.rootGoal.verbatimAnchor}`);
    parts.push(`</root_goal>`);
  }

  if (record.activeConstraints.length > 0) {
    parts.push("<active_constraints>");
    for (const c of record.activeConstraints) {
      parts.push(`- [${c.id}] [${c.strength}] ${c.rule} (evidence: "${c.verbatimEvidence}", from T${c.validFromTurn})`);
    }
    parts.push("</active_constraints>");
  }

  if (record.recentlyRevokedConstraints.length > 0) {
    parts.push("<recently_revoked_constraints>");
    for (const r of record.recentlyRevokedConstraints) {
      parts.push(`- [${r.id}] ${r.rule} (revoked at T${r.revokedAtTurn}: ${r.reason})`);
    }
    parts.push("</recently_revoked_constraints>");
  }

  const wt = record.workspaceTouchpoints;
  if (
    wt.mutatedFiles.length > 0 ||
    wt.inspectedFiles.length > 0 ||
    wt.commandOutcomes.length > 0 ||
    wt.errorHeadlines.length > 0
  ) {
    parts.push("<workspace_touchpoints>");
    if (wt.mutatedFiles.length > 0) parts.push(`Mutated files: ${wt.mutatedFiles.join(", ")}`);
    if (wt.inspectedFiles.length > 0) parts.push(`Inspected files: ${wt.inspectedFiles.join(", ")}`);
    if (wt.commandOutcomes.length > 0) {
      parts.push(
        `Command outcomes: ${wt.commandOutcomes.map((c) => `${c.command} (exit: ${c.exitCode})`).join("; ")}`
      );
    }
    if (wt.errorHeadlines.length > 0) {
      parts.push(`Error headlines: ${wt.errorHeadlines.join(" | ")}`);
    }
    parts.push("</workspace_touchpoints>");
  }

  if (record.recentTurns.length > 0) {
    parts.push("<recent_distilled_turns>");
    for (const t of record.recentTurns) {
      parts.push(`--- Turn ${t.turnSeq} ---`);
      parts.push(`User: ${t.rawUser}`);
      parts.push(`Distilled Intent: ${t.distilledIntent}`);
      if (t.distilledReply) {
        parts.push(`Assistant Outcome: ${t.distilledReply}`);
      }
    }
    parts.push("</recent_distilled_turns>");
  }

  if (pendingSnapshot) {
    parts.push("<pending_prior_turn>");
    parts.push(`Assistant visible prose: ${pendingSnapshot.assistantVisibleBody.slice(0, 300)}`);
    if (pendingSnapshot.footprintDigest.mutatedFiles.length > 0) {
      parts.push(`Mutated files: ${pendingSnapshot.footprintDigest.mutatedFiles.join(", ")}`);
    }
    if (pendingSnapshot.footprintDigest.commandOutcomes.length > 0) {
      parts.push(
        `Commands: ${pendingSnapshot.footprintDigest.commandOutcomes.map((c) => `${c.command} (exit ${c.exitCode})`).join("; ")}`
      );
    }
    parts.push("</pending_prior_turn>");
  }

  parts.push("</ledger_state>");
  return parts.join("\n");
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

export interface ParsedAnalysis {
  action?: "PASS" | "AUGMENT";
  distilledIntent: string;
  compiledPrompt: string;
  stagedOps?: StagedConstraintOp[];
}

export function parseIntentAnalysis(text: string): ParsedAnalysis | null {
  // 1. Try parsing JSON format
  const jsonMatch = /\{[\s\S]*"action"[\s\S]*\}/.exec(text);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && (parsed.action === "PASS" || parsed.action === "AUGMENT")) {
        const action = parsed.action as "PASS" | "AUGMENT";
        const distilledIntent =
          parsed.ledger_prep?.distilled_user_intent ||
          parsed.inject?.clarified_goal ||
          "";
        let compiledPrompt =
          parsed.inject?.clarified_goal ||
          distilledIntent ||
          "";
        if (
          Array.isArray(parsed.inject?.effective_constraints) &&
          parsed.inject.effective_constraints.length > 0
        ) {
          compiledPrompt +=
            "\n\nConstraints:\n" +
            parsed.inject.effective_constraints
              .map((c: string) => `- ${c}`)
              .join("\n");
        }
        const stagedOps = parsed.ledger_prep?.staged_constraint_ops;
        return { action, distilledIntent, compiledPrompt, stagedOps };
      }
    } catch {
      // Fall through to XML
    }
  }

  // 2. Try parsing XML format
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

export function createEmptyLedger(
  mainAgentId: string,
  botId: string,
  provider: string,
  model: string
): ShadowSessionRecordV2 {
  return {
    version: 2,
    mainAgentId,
    botId,
    companionAgentId: null,
    provider,
    model,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    rootGoal: null,
    activeConstraints: [],
    recentlyRevokedConstraints: [],
    workspaceTouchpoints: {
      mutatedFiles: [],
      inspectedFiles: [],
      commandOutcomes: [],
      errorHeadlines: [],
    },
    recentTurns: [],
    turns: [],
  };
}

export interface CompileUserTurnInput {
  mainAgentId: string;
  botId: string;
  groupId?: string | null;
  rawText: string;
  timeoutMs?: number;
  skipBypass?: boolean;
}

export interface CompileUserTurnOutput {
  outgoingText: string;
  bypassed: boolean;
  turnIndex?: number;
  distilledIntent?: string;
  compiledPrompt?: string;
  fallbackReason?: string;
}

export interface CompanionSessionManagerOptions {
  timeoutMs?: number;
  compileTimeoutMs?: number;
  circuitBreakerCooldownMs?: number;
  disableBypassGates?: boolean;
  thinkingOptionId?: "low" | "medium" | "high" | string;
  globalAssistantOnly?: boolean;
}

export class CompanionSessionManager {
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly inFlightDistillations = new Map<string, Promise<void>>();
  private readonly pendingSnapshots = new Map<string, PendingPostTurnSnapshot>();
  public readonly circuitBreaker: CompanionCircuitBreaker;

  private readonly host: BotsHost;
  private readonly options?: CompanionSessionManagerOptions;

  constructor(
    host: BotsHost,
    options?: CompanionSessionManagerOptions
  ) {
    this.host = host;
    this.options = options;
    this.circuitBreaker = new CompanionCircuitBreaker({
      cooldownMs: options?.circuitBreakerCooldownMs,
    });
  }

  private enqueue<T>(mainAgentId: string, op: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(mainAgentId) ?? Promise.resolve();
    const run = async () => {
      try {
        await prev;
      } catch {
        // ignore errors from previous operations
      }
      return op();
    };
    const next = run();
    this.queues.set(mainAgentId, next.catch(() => null));
    return next;
  }

  recordPendingPostTurnSnapshot(mainAgentId: string, snapshot: PendingPostTurnSnapshot): void {
    this.pendingSnapshots.set(mainAgentId, snapshot);
  }

  getPendingPostTurnSnapshot(mainAgentId: string): PendingPostTurnSnapshot | undefined {
    return this.pendingSnapshots.get(mainAgentId);
  }

  async readLedger(mainAgentId: string): Promise<ShadowSessionRecordV2 | null> {
    return readShadowSession(mainAgentId);
  }

  isEnabledForBot(bot: Pick<Bot, "id" | "isGlobalAssistant"> | null | undefined): boolean {
    if (!this.options?.globalAssistantOnly) return true;
    return isGlobalAssistantBot(bot);
  }

  private async resolvePostCompactionMemoryPrefix(input: {
    mainAgentId: string;
    botId: string;
    groupId?: string | null;
  }): Promise<string | null> {
    const paseo = this.host.paseo;
    if (!paseo) return null;

    const agentRef = paseo.agents.ref(input.mainAgentId);
    const refreshed =
      typeof agentRef.refresh === "function"
        ? await agentRef.refresh().catch(() => null)
        : null;
    const chat = refreshed?.agent ?? (await this.host.chatOf(input.mainAgentId).catch(() => null));
    const metadata = (chat as { metadata?: Record<string, unknown> } | null)?.metadata;
    const rawSync = metadata?.[LONG_SESSION_SYNC_METADATA];
    if (!rawSync || typeof rawSync !== "object") return null;

    const syncObj = rawSync as Record<string, unknown>;
    if (syncObj.pendingMemorySync !== true) return null;

    let teamRootPath: string | null = null;
    if (input.groupId) {
      const values = await this.host.values().catch(() => null);
      const group = values?.groups?.find((g) => g.id === input.groupId);
      teamRootPath = teamHomePath(input.groupId, group?.name);
    }

    const snapshot = await computeMemorySyncSnapshot(botDataPath(input.botId), teamRootPath).catch(() => null);
    const prevHash =
      typeof syncObj.lastSyncedMemoryHash === "string" ? syncObj.lastSyncedMemoryHash : null;
    const nextHash = snapshot?.hash ?? prevHash;
    const changed = Boolean(snapshot && snapshot.hash !== prevHash);

    if (typeof agentRef.setMetadata === "function") {
      await agentRef
        .setMetadata({
          [LONG_SESSION_SYNC_METADATA]: {
            ...syncObj,
            pendingMemorySync: false,
            lastSyncedMemoryHash: nextHash ?? null,
          },
        })
        .catch(() => null);
    }

    return changed ? snapshot!.envelope : null;
  }

  async compileUserTurn(input: CompileUserTurnInput): Promise<CompileUserTurnOutput> {
    const { mainAgentId, botId, rawText } = input;

    const bot = await this.host.bot(botId).catch(() => null);
    if (!this.isEnabledForBot(bot)) {
      return {
        outgoingText: rawText,
        bypassed: true,
        fallbackReason: "Companion restricted to global assistant",
      };
    }

    // Check post-compaction memory sync BEFORE G0-G5 bypasses so even short first turns after compaction sync changed memory.
    const memoryPrefix = await this.resolvePostCompactionMemoryPrefix({
      mainAgentId,
      botId,
      groupId: input.groupId,
    }).catch(() => null);
    const withMemory = (text: string) => (memoryPrefix ? `${memoryPrefix}\n\n${text}` : text);

    // Read current ledger (if exists) to evaluate turn count
    const existingRecord = await readShadowSession(mainAgentId);
    const currentTurnsCount = existingRecord ? existingRecord.turns.length : 0;

    // G0–G5 0ms Deterministic Bypass Gate
    const shouldCheckBypass = !input.skipBypass && !this.options?.disableBypassGates;
    if (shouldCheckBypass) {
      const bypassResult = classifyCompanionBypass({
        rawText,
        turnsCount: currentTurnsCount,
      });

      if (bypassResult.bypassed) {
        if (bypassResult.needsBackfill) {
          // Async background backfill without blocking the user turn
          void this.backgroundBackfill({
            mainAgentId,
            botId,
            rawText,
            gate: bypassResult.gate!,
            existingRecord,
          }).catch((err) => {
            console.warn(`[paseo-bots] Companion background backfill failed for ${mainAgentId}:`, err);
          });
        }
        return {
          outgoingText: withMemory(rawText),
          bypassed: true,
          fallbackReason: bypassResult.gate,
        };
      }
    }

    try {
      return await this.enqueue(mainAgentId, async () => {
        const paseo = this.host.paseo;
        if (!paseo) {
          return { outgoingText: withMemory(rawText), bypassed: true, fallbackReason: "Paseo host unavailable" };
        }

        const liveBot = bot ?? (await this.host.bot(botId));
        const { provider, model, thinkingOptionId } = resolveCompanionModel(liveBot, this.options);

        // Check 60s Circuit Breaker (3 consecutive failures)
        if (this.circuitBreaker.isOpen(provider)) {
          return {
            outgoingText: withMemory(rawText),
            bypassed: true,
            fallbackReason: "Circuit breaker open (cooldown active)",
          };
        }

        // 150ms Fast-Follow Race: wait at most 150ms if Turn N-1 distillation is in-flight
        const inFlight = this.inFlightDistillations.get(mainAgentId);
        let pendingSnapshot: PendingPostTurnSnapshot | undefined;
        if (inFlight) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), 150);
          });
          const finishedInTime = await Promise.race([
            inFlight.then(() => true).catch(() => true),
            timeoutPromise,
          ]);
          if (timer) clearTimeout(timer);

          if (!finishedInTime) {
            // Distillation did not complete in 150ms; retrieve pending snapshot to avoid blocking
            pendingSnapshot = this.pendingSnapshots.get(mainAgentId);
          }
        }

        let record = await readShadowSession(mainAgentId);
        if (!record) {
          record = createEmptyLedger(mainAgentId, botId, provider, model);
        }

        // Verify or create companion background agent
        let companionAgentId = record.companionAgentId;
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
          const thinkingOptionId =
            this.options?.thinkingOptionId ??
            process.env.PASEO_BOTS_COMPANION_THINKING ??
            "medium";
          const priorDistilledHistory = formatPriorDistilledHistory(record.turns);
          const systemPrompt = priorDistilledHistory
            ? `${SHADOW_SYSTEM_PROMPT}\n\n${priorDistilledHistory}`
            : SHADOW_SYSTEM_PROMPT;
          const config = {
            provider: `${provider}/${model}`,
            thinkingOptionId,
            mcpServers: {},
            systemPrompt,
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
        }

        const turnIndex = record.turns.length + 1;

        // Assemble Bounded Structured Ledger Context (<root_goal>, <active_constraints>, etc.)
        const ledgerContext = formatBoundedLedgerPrompt(record, pendingSnapshot);
        const analyzePrompt = `<analyze_user_turn turn="${turnIndex}">\n${rawText}\n</analyze_user_turn>`;
        const promptToSend = `${ledgerContext}\n\n${analyzePrompt}`;

        // Hard Timeout (configurable via input.timeoutMs, compileTimeoutMs, options.timeoutMs, or env PASEO_BOTS_COMPANION_TIMEOUT_MS)
        const timeoutMs =
          input.timeoutMs ||
          this.options?.compileTimeoutMs ||
          this.options?.timeoutMs ||
          Number(process.env.PASEO_BOTS_COMPANION_TIMEOUT_MS) ||
          9_000;

        const companionRef = paseo.agents.ref(companionAgentId);
        try {
          await companionRef.run(promptToSend, { timeoutMs });
        } catch (runErr) {
          this.circuitBreaker.recordFailure(provider);
          if (isWedgedSessionError(runErr)) {
            await companionRef.archive?.().catch(() => null);
            record.companionAgentId = null;
            await writeShadowSession(record).catch(() => null);
          }
          throw runErr;
        }

        const page = await companionRef.timeline.refetch({
          direction: "tail",
          projection: "projected",
          limit: 10,
        });
        const items = (page?.entries ?? []).map((e: any) => (e.item ?? e) as TimelineItemLike);
        const { reply } = lastTurn(items);

        const analysis = parseIntentAnalysis(reply);
        if (!analysis) {
          this.circuitBreaker.recordFailure(provider);
          return {
            outgoingText: withMemory(rawText),
            bypassed: true,
            fallbackReason: "Companion did not return valid intent analysis",
          };
        }

        // Successfully parsed -> record circuit breaker success
        this.circuitBreaker.recordSuccess(provider);

        // Action: PASS -> User message is already clear; zero envelope added
        if (analysis.action === "PASS") {
          // Still track turn in ledger
          const turnRecord: ShadowTurnRecord = {
            turnIndex,
            rawUser: rawText,
            distilledIntent: analysis.distilledIntent || rawText.slice(0, 160),
            compiledPrompt: rawText,
            distilledReply: null,
            createdAt: new Date().toISOString(),
            completedAt: null,
          };
          record.turns.push(turnRecord);
          record.recentTurns = [
            ...record.recentTurns,
            {
              turnSeq: turnIndex,
              rawUser: rawText,
              distilledIntent: turnRecord.distilledIntent,
              distilledReply: null,
              compiledPrompt: rawText,
              createdAt: turnRecord.createdAt,
              completedAt: null,
            },
          ].slice(-5);
          record.updatedAt = new Date().toISOString();
          await writeShadowSession(record);

          return {
            outgoingText: withMemory(rawText),
            bypassed: false,
            turnIndex,
            distilledIntent: turnRecord.distilledIntent,
            compiledPrompt: rawText,
          };
        }

        // Action: AUGMENT -> Closed-World Guard & Patch-Only Constraint Ops
        const allowedSources = [
          rawText,
          record.rootGoal?.summary ?? "",
          record.rootGoal?.verbatimAnchor ?? "",
          ...record.activeConstraints.map((c) => `${c.rule} ${c.verbatimEvidence}`),
          ...record.workspaceTouchpoints.mutatedFiles,
          ...record.workspaceTouchpoints.inspectedFiles,
          ...record.recentTurns.map((t) => `${t.rawUser} ${t.distilledIntent} ${t.distilledReply ?? ""}`),
        ];

        const guardResult = applyClosedWorldGuard(
          analysis.compiledPrompt,
          allowedSources,
          rawText
        );
        const finalCompiledPrompt = guardResult.cleanedPrompt;

        // Apply Patch-Only Constraint Ops
        if (analysis.stagedOps && analysis.stagedOps.length > 0) {
          const updatedConstraints = applyConstraintOps(
            record,
            analysis.stagedOps,
            turnIndex,
            rawText
          );
          record.activeConstraints = updatedConstraints.activeConstraints;
          record.recentlyRevokedConstraints = updatedConstraints.recentlyRevokedConstraints;
        }

        // Establish rootGoal on early turn if missing
        if (!record.rootGoal) {
          record.rootGoal = {
            summary: analysis.distilledIntent.slice(0, 160),
            verbatimAnchor: rawText.slice(0, 200),
            turnSeq: turnIndex,
          };
        }

        const turnRecord: ShadowTurnRecord = {
          turnIndex,
          rawUser: rawText,
          distilledIntent: analysis.distilledIntent,
          compiledPrompt: finalCompiledPrompt,
          distilledReply: null,
          createdAt: new Date().toISOString(),
          completedAt: null,
        };

        record.turns.push(turnRecord);
        record.recentTurns = [
          ...record.recentTurns,
          {
            turnSeq: turnIndex,
            rawUser: rawText,
            distilledIntent: analysis.distilledIntent,
            distilledReply: null,
            compiledPrompt: finalCompiledPrompt,
            createdAt: turnRecord.createdAt,
            completedAt: null,
          },
        ].slice(-5);
        record.updatedAt = new Date().toISOString();
        await writeShadowSession(record);

        const compiledWithMemory = withMemory(finalCompiledPrompt);
        const outgoingText = formatCompanionIntentEnvelope({
          rawUserText: rawText,
          turnIndex,
          distilledIntent: analysis.distilledIntent,
          compiledPrompt: compiledWithMemory,
        });

        return {
          outgoingText,
          bypassed: false,
          turnIndex,
          distilledIntent: analysis.distilledIntent,
          compiledPrompt: compiledWithMemory,
        };
      });
    } catch (error) {
      const fallbackReason = error instanceof Error ? error.message : String(error);
      console.warn(`[paseo-bots] Companion compile failed for ${mainAgentId}, failing open:`, error);
      return { outgoingText: withMemory(rawText), bypassed: true, fallbackReason };
    }
  }

  /**
   * Asynchronous background backfill for G0/G2/G3/G4 bypasses.
   * Records initial rootGoal and constraints without blocking user turn.
   */
  private async backgroundBackfill(input: {
    mainAgentId: string;
    botId: string;
    rawText: string;
    gate: CompanionBypassReason;
    existingRecord?: ShadowSessionRecordV2 | null;
  }): Promise<void> {
    const { mainAgentId, botId, rawText, gate } = input;
    const bot = await this.host.bot(botId);
    const { provider, model } = resolveCompanionModel(bot);

    let record = input.existingRecord ?? (await readShadowSession(mainAgentId));
    if (!record) {
      record = createEmptyLedger(mainAgentId, botId, provider, model);
    }

    const turnIndex = record.turns.length + 1;
    let distilledIntent = rawText.slice(0, 160);

    if (gate === "G0_COLD_START") {
      record.rootGoal = {
        summary: rawText.slice(0, 160),
        verbatimAnchor: rawText.slice(0, 200),
        turnSeq: 1,
      };
      distilledIntent = rawText.slice(0, 160);
    } else if (gate === "G2_SHORT_CONFIRMATION") {
      distilledIntent = `确认方案: ${rawText}`;
    } else if (gate === "G3_DEICTIC_FREE_ATOMIC_COMMAND") {
      distilledIntent = `执行原子命令: ${rawText}`;
    } else if (gate === "G4_LARGE_STACK_OR_DIFF") {
      distilledIntent = "提供错误堆栈 / 代码 Diff";
    }

    const turnRecord: ShadowTurnRecord = {
      turnIndex,
      rawUser: rawText,
      distilledIntent,
      compiledPrompt: rawText,
      distilledReply: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    record.turns.push(turnRecord);
    record.recentTurns = [
      ...record.recentTurns,
      {
        turnSeq: turnIndex,
        rawUser: rawText,
        distilledIntent,
        distilledReply: null,
        compiledPrompt: rawText,
        createdAt: turnRecord.createdAt,
        completedAt: null,
      },
    ].slice(-5);
    record.updatedAt = new Date().toISOString();

    await writeShadowSession(record);
  }

  async distillTurnReply(input: {
    mainAgentId: string;
    botId: string;
    assistantBody: string;
    footprint?: ToolFootprintDigest;
  }): Promise<void> {
    const { mainAgentId, assistantBody, footprint } = input;
    if (!assistantBody.trim()) return;

    // Track in-flight distillation so next turn can race it with 150ms timeout
    const distillationPromise = (async () => {
      const paseo = this.host.paseo;
      if (!paseo) return;

      const record = await readShadowSession(mainAgentId);
      if (!record || record.turns.length === 0) return;

      const lastTurnRecord = record.turns[record.turns.length - 1]!;
      if (lastTurnRecord.distilledReply !== null) return; // Already distilled

      // Merge ToolFootprintDigest into workspaceTouchpoints
      if (footprint) {
        const wt = record.workspaceTouchpoints;
        for (const f of footprint.mutatedFiles) {
          if (!wt.mutatedFiles.includes(f)) wt.mutatedFiles.unshift(f);
        }
        wt.mutatedFiles = wt.mutatedFiles.slice(0, 12);

        for (const f of footprint.inspectedFiles) {
          if (!wt.mutatedFiles.includes(f) && !wt.inspectedFiles.includes(f)) {
            wt.inspectedFiles.unshift(f);
          }
        }
        wt.inspectedFiles = wt.inspectedFiles.slice(0, 8);

        for (const cmd of footprint.commandOutcomes) {
          wt.commandOutcomes.unshift(cmd);
        }
        wt.commandOutcomes = wt.commandOutcomes.slice(0, 5);

        for (const err of footprint.errorHeadlines) {
          if (!wt.errorHeadlines.includes(err)) wt.errorHeadlines.unshift(err);
        }
        wt.errorHeadlines = wt.errorHeadlines.slice(0, 2);
      }

      let companionAgentId = record.companionAgentId;
      if (!companionAgentId) {
        // Record without companion LLM distillation
        lastTurnRecord.distilledReply = assistantBody.slice(0, 220);
        lastTurnRecord.completedAt = new Date().toISOString();
        if (record.recentTurns.length > 0) {
          record.recentTurns[record.recentTurns.length - 1]!.distilledReply = lastTurnRecord.distilledReply;
          record.recentTurns[record.recentTurns.length - 1]!.footprintDigest = footprint;
        }
        record.updatedAt = new Date().toISOString();
        await writeShadowSession(record);
        return;
      }

      const snapshot = await paseo.agents.ref(companionAgentId).refresh().catch(() => null);
      const agent = snapshot?.agent as { archivedAt?: string | null; status?: string } | undefined;
      if (!agent || agent.archivedAt || agent.status === "archived") {
        return;
      }

      const distillPrompt = `<distill_assistant_reply turn="${lastTurnRecord.turnIndex}">\n${assistantBody.trim()}\n</distill_assistant_reply>`;
      const companionRef = paseo.agents.ref(companionAgentId);
      try {
        await companionRef.run(distillPrompt, { timeoutMs: 15_000 });
      } catch (distillErr) {
        if (isWedgedSessionError(distillErr)) {
          await companionRef.archive?.().catch(() => null);
          record.companionAgentId = null;
          if (lastTurnRecord.distilledReply === null) {
            lastTurnRecord.distilledReply = assistantBody.slice(0, 220);
            lastTurnRecord.completedAt = new Date().toISOString();
            if (record.recentTurns.length > 0) {
              record.recentTurns[record.recentTurns.length - 1]!.distilledReply = lastTurnRecord.distilledReply;
              record.recentTurns[record.recentTurns.length - 1]!.footprintDigest = footprint;
            }
          }
          record.updatedAt = new Date().toISOString();
          await writeShadowSession(record).catch(() => null);
        }
        throw distillErr;
      }

      const page = await companionRef.timeline.refetch({
        direction: "tail",
        projection: "projected",
        limit: 10,
      });
      const items = (page?.entries ?? []).map((e: any) => (e.item ?? e) as TimelineItemLike);
      const { reply } = lastTurn(items);

      const summary = parseReplySummary(reply) ?? (reply.trim() || null);
      lastTurnRecord.distilledReply = summary;
      lastTurnRecord.completedAt = new Date().toISOString();

      if (record.recentTurns.length > 0) {
        record.recentTurns[record.recentTurns.length - 1]!.distilledReply = summary;
        record.recentTurns[record.recentTurns.length - 1]!.footprintDigest = footprint;
      }
      record.updatedAt = new Date().toISOString();

      await writeShadowSession(record);
    })();

    this.inFlightDistillations.set(mainAgentId, distillationPromise);

    try {
      await distillationPromise;
    } catch (error) {
      console.warn(`[paseo-bots] Companion reply distillation failed for ${mainAgentId}:`, error);
    } finally {
      if (this.inFlightDistillations.get(mainAgentId) === distillationPromise) {
        this.inFlightDistillations.delete(mainAgentId);
      }
      this.pendingSnapshots.delete(mainAgentId);
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
      this.inFlightDistillations.delete(mainAgentId);
      this.pendingSnapshots.delete(mainAgentId);
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
