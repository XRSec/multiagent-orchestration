import type { PluginHookEvents } from "@getpaseo/plugin/server";
import { extractToolFootprintDigest, hasMemorySignal, lastTurn, lastUserText, logLine, turnVisibleAssistantBody } from "../shared/activity";
import { SESSION_ROLE_LABEL } from "../shared/chat";
import { parseCompanionIntentEnvelope, SHADOW_SESSION_LABEL } from "../shared/companion-intent";
import { ASKED_BY_LABEL } from "../shared/handoff";
import { isBriefDispatchMessage } from "../shared/protocol-cards";
import type { BotsHost } from "./host";
import type { MemoryJournal } from "./journal";
import { appendDailyLog } from "./memory";
import { MEMORY_CURATION_LABEL, type MemoryCurator } from "./memory-curator";
import type { RoutineScheduler } from "./scheduler";
import { WORKFLOW_STAGE_LABEL, WORKFLOW_TASK_LABEL } from "./workflow-runner";
import type { CompanionSessionManager } from "./companion-session";

// What happens around each turn of a bot's chat: the journal notes memory
// changes, and the daily log gets a line saying what the bot did.

/** How many turns to read back after a turn ends (0.16+ wholeTurns API). */
const TURN_TAIL = 1;

export async function turnStarted(host: BotsHost, journal: MemoryJournal, { agent }: { agent: Pick<PluginHookEvents["agent.turn.before"]["agent"], "id"> }): Promise<void> {
  const botId = await host.botIdOf(agent.id);
  if (botId) await journal.begin(botId);
}

export async function turnEnded(
  host: BotsHost,
  journal: MemoryJournal,
  scheduler: Pick<RoutineScheduler, "finished">,
  { agent, outcome, turnId, timeline }: { agent: Pick<PluginHookEvents["agent.turn.after"]["agent"], "id" | "title"> & { workspaceId?: string | null; parentAgentId?: string | null; provider?: string; cwd?: string }; outcome: PluginHookEvents["agent.turn.after"]["outcome"]; turnId?: string | null; timeline?: unknown },
  curator?: Pick<MemoryCurator, "isCurationAgent" | "curateTurnFallback">,
  companionManager?: Pick<CompanionSessionManager, "distillTurnReply">,
): Promise<void> {
  const chat = await host.chatOf(agent.id);
  if (!chat) return;

  // Guard 1: Companion shadow sessions are completely invisible to logs, curation, and recursion
  if (chat.labels?.[SHADOW_SESSION_LABEL] === "true") return;

  const { botId } = chat;
  const title = chat.title?.trim() || agent.title?.trim() || "Untitled chat";
  const memoryChanged = await journal.end(botId, { id: agent.id, title });
  const items = timeline && Array.isArray(timeline) && timeline.length > 0 ? timeline : await latestItems(host, agent.id, turnId);
  const { reply, tools } = lastTurn(items);
  const userText = lastUserText(items);
  if (chat.routineId) await scheduler.finished(chat.routineId, agent.id, outcome, reply);
  if (outcome.kind === "canceled") return;

  const isCuration = chat.labels[MEMORY_CURATION_LABEL] === "true" || (curator?.isCurationAgent(agent.id) ?? false);
  if (isCuration) {
    await host.paseo?.agents.ref(agent.id).archive?.().catch(() => null);
  }

  const isHumanTurn =
    !isCuration &&
    chat.routineId == null &&
    !chat.labels[ASKED_BY_LABEL] &&
    !chat.labels[WORKFLOW_TASK_LABEL] &&
    !chat.labels[WORKFLOW_STAGE_LABEL] &&
    chat.labels[SESSION_ROLE_LABEL] !== "worker" &&
    chat.labels[SESSION_ROLE_LABEL] !== "dispatched-worker" &&
    !isBriefDispatchMessage(userText);

  // Guard 2: MemoryCurator input hygiene - extract rawUserText so COMPILED_PROMPT never triggers curation
  const rawUser = parseCompanionIntentEnvelope(userText)?.rawUserText ?? userText;

  if (outcome.kind === "completed" && curator && isHumanTurn && !memoryChanged && hasMemorySignal(rawUser)) {
    void curator.curateTurnFallback({ botId, agentId: agent.id, chatTitle: title, userText: rawUser, reply }).catch((error: unknown) => {
      console.error("paseo-bots: memory fallback curation failed", error);
    });
  }

  // Post-turn visible prose distillation for companion session ledger (gated cleanly for global assistant when enabled)
  if (outcome.kind === "completed" && isHumanTurn && companionManager) {
    const bot = typeof (companionManager as any).isEnabledForBot === "function"
      ? await host.bot(botId).catch(() => null)
      : null;
    const companionEnabled =
      typeof (companionManager as any).isEnabledForBot === "function"
        ? (companionManager as any).isEnabledForBot(bot)
        : true;
    const visibleBody = companionEnabled ? turnVisibleAssistantBody(items) : "";
    if (visibleBody.trim()) {
      const footprint = extractToolFootprintDigest(items);
      if (typeof (companionManager as any).recordPendingPostTurnSnapshot === "function") {
        (companionManager as any).recordPendingPostTurnSnapshot(agent.id, {
          turnSeq: 0,
          rawUserText: rawUser,
          assistantVisibleBody: visibleBody,
          footprintDigest: footprint,
          timestamp: Date.now(),
        });
      }
      void companionManager
        .distillTurnReply({ mainAgentId: agent.id, botId, assistantBody: visibleBody, footprint })
        .catch((error: unknown) => {
          console.error("paseo-bots: reply distillation failed", error);
        });
    }
  }

  const line = logLine({ at: new Date(), chat: title, reply, tools, failure: outcome.kind === "failed" ? outcome.error.message : null });
  if (line) await appendDailyLog(botId, line);
}

/**
 * The newest turn of a chat, read back from Paseo: since Paseo 0.16 the turn-ended hook
 * omits `timeline` completely; refetch the tail turn with `wholeTurns: true` and filter by `turnId`.
 */
async function latestItems(host: BotsHost, agentId: string, turnId?: string | null): Promise<{ type: string; text?: unknown; name?: unknown }[]> {
  const page = await host.paseo?.agents
    .ref(agentId)
    .timeline.refetch({ direction: "tail", projection: "projected", limit: TURN_TAIL, wholeTurns: true })
    .catch(() => null);
  const entries = (page?.entries ?? []) as { turnId?: string | null; item: unknown }[];
  const hasTurnIds = turnId && entries.some((entry) => entry.turnId != null);
  const filtered = hasTurnIds ? entries.filter((entry) => entry.turnId === turnId) : entries;
  return filtered.map((entry) => entry.item as { type: string; text?: unknown; name?: unknown });
}
