import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { BotsHost } from "./host";
import type { PaseoApi } from "./paseo";
import { handoffRequest } from "../shared/handoff";
import { chatStateOf } from "./handoffs";
import { flushTaskCards, publishMemberReceipt, settleAndPublish } from "./task-cards";
import { findTasksByHandle, listTasks, pruneSettled, upsertMember, type MemberStatus, type TaskMember } from "./tasks";

// Writes a finished turn back onto every task line that owns the chat, then lets the
// evaluator settle. A failure here never touches the turn that already finished.

const MEMBER_OF_STATE: Record<ReturnType<typeof chatStateOf>, MemberStatus> = {
  finished: "done",
  running: "running",
  permission: "blocked_permission",
  archived: "blocked_dead",
  error: "failed",
};

async function recordTurn(host: BotsHost, paseo: PaseoApi, agentId: string): Promise<void> {
  const agent = (await paseo.agents.ref(agentId).refresh())?.agent;
  if (!agent) return;
  const tasks = await findTasksByHandle(agentId);
  if (tasks.length === 0) return;
  const state = chatStateOf(agent);
  const requesterAgentId = handoffRequest(agent.labels, agent.metadata)?.requesterAgentId;
  const botId = (await host.chatOf(agentId))?.botId;
  const page = await paseo.agents.ref(agentId).timeline.refetch({ direction: "tail", projection: "projected", limit: 80 }).catch(() => null);
  const natives = nativeChildren(page?.entries ?? [], botId, await host.bots().catch(() => []));
  for (const task of tasks) {
    if (task.settledAt) continue;
    await upsertMember(task.taskId, { engine: "paseo-bot", ...(botId ? { botId } : {}), handleId: agentId, status: MEMBER_OF_STATE[state] });
    for (const nativeBotId of natives) {
      // Observation and fallback collapse into one write: an AGY child cannot outlive the parent
      // turn, so an `issued` row would only open a window where our own native guard wedges the
      // line. Never leave a native member open, and never特判 it out of ACTIVE_MEMBER_STATUSES:
      // it is terminal in this same callback, so its slot exists for an instant.
      await upsertMember(task.taskId, { engine: "native", ...(nativeBotId ? { botId: nativeBotId } : {}), status: agent.lastError ? "failed" : "done" });
    }
    await settleAndPublish(host, task.taskId, requesterAgentId);
  }
}

/**
 * Archive means closure, death needs evidence. A chat archived after it already reached a
 * terminal state was closed, not lost; a chat archived in flight, waiting for approval, or
 * carrying an error died mid-flight. An error outweighs an optimistic terminal state.
 */
function diedMidFlight(member: TaskMember | undefined, agent: { lastError?: string | null } | undefined): boolean {
  if (agent?.lastError) return true;
  if (!member) return false;
  if (member.status === "blocked_permission") return true;
  return member.status === "issued" || member.status === "running";
}

/**
 * The SDK puts tool arguments in `detail.input`, and only when `detail.type` is `unknown`
 * (`@getpaseo/plugin` `dist/server/provider.d.ts`, `ProviderToolCallDetail`). There is no
 * top-level `input`, so reading one there silently sends every child to the parent's bot;
 * a rendered detail (shell, plan) carries no arguments at all.
 */
function subagentTypeName(item: Record<string, unknown>): unknown {
  const detail = item.detail as { type?: unknown; input?: unknown } | undefined;
  if (!detail || typeof detail !== "object" || detail.type !== "unknown") return undefined;
  const input = detail.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const args = input as Record<string, unknown>;
  return args.TypeName ?? args.typeName ?? args.type_name;
}

/** The AGY tool that starts a native child; a provider may prefix the name. */
const SUBAGENT_TOOL = "invoke_subagent";

/**
 * The native children this turn started, keyed by the bot they act as. Read from the turn's
 * own tool calls, never from history: lastTurn() uses the same boundary (the last user message).
 * memberKey() for a handle-less member is `native:<botId>`, so several children of one bot merge
 * into one row on purpose: parent-level evidence cannot separate them, and a made-up count would
 * be worse than a coarse one.
 */
function nativeChildren(entries: readonly { item?: unknown }[], parentBotId: string | undefined, bots: readonly { id: string; name: string }[]): string[] {
  const items = entries.map((entry) => (entry as { item?: Record<string, unknown> }).item).filter((item): item is Record<string, unknown> => !!item);
  let start = items.length;
  while (start > 0 && items[start - 1]!.type !== "user_message") start--;
  const seen = new Set<string>();
  for (const item of items.slice(start)) {
    if (item.type !== "tool_call" || typeof item.name !== "string" || !item.name.includes(SUBAGENT_TOOL)) continue;
    const raw = subagentTypeName(item);
    const key = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    const match = key ? bots.find((bot) => bot.id.toLowerCase() === key || bot.name.trim().toLowerCase() === key) : undefined;
    seen.add(match?.id ?? parentBotId ?? "");
  }
  return [...seen].filter(Boolean);
}

/** A dead member is a fact before it is a receipt: the record is what other readers trust. */
async function recordArchive(host: BotsHost, paseo: PaseoApi, handleId: string): Promise<void> {
  const tasks = await findTasksByHandle(handleId);
  if (tasks.length === 0) return;
  const agent = (await paseo.agents.ref(handleId).refresh())?.agent;
  const requesterAgentId = agent ? handoffRequest(agent.labels, agent.metadata)?.requesterAgentId : undefined;
  const botId = (await host.chatOf(handleId))?.botId;
  for (const task of tasks) {
    // A settled line is a closed fact: its members and its cards stay as they are.
    if (task.settledAt) continue;
    const member = task.members.find((entry) => entry.handleId === handleId);
    if (diedMidFlight(member, agent)) {
      // The fact first: the record is what other readers trust, the receipt is a projection.
      await upsertMember(task.taskId, { engine: "paseo-bot", ...(botId ? { botId } : {}), handleId, status: "blocked_dead" });
      if (requesterAgentId) {
        const card = { taskId: task.taskId, handleId, ...(botId ? { botId } : {}), status: "blocked_dead" as const, at: new Date().toISOString() };
        await publishMemberReceipt(paseo, requesterAgentId, card).catch((error: unknown) => console.error("paseo-bots: could not show a dead member receipt", error));
      }
    }
    await settleAndPublish(host, task.taskId, requesterAgentId);
  }
}

/** Settled files are cleaned on a slow timer; the window itself lives in `pruneSettled`. */
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * A restart drops the turn that would have closed a member, and the line hangs as `running`
 * forever with no card to say so. Recovery reads the engine, never the timeline: an agent that
 * is gone or archived died, a `lastError` is a failure, an agent alive and clean simply finished.
 * Only a task that is still open is touched, and only one write lands per member.
 */
export async function recoverInterrupted(host: BotsHost, paseo: PaseoApi): Promise<number> {
  let recovered = 0;
  for (const task of await listTasks()) {
    if (task.settledAt) continue;
    try {
      let requesterAgentId: string | undefined;
      for (const member of task.members) {
        // A handle-less native member is closed by the parent turn's own writeback.
        if (!member.handleId) continue;
        const open = member.status === "issued" || member.status === "running";
        const parked = member.status === "blocked_permission";
        if (!open && !parked) continue;
        const agent = (await paseo.agents.ref(member.handleId).refresh())?.agent;
        if (agent) requesterAgentId ??= handoffRequest(agent.labels, agent.metadata)?.requesterAgentId;
        const alive = !!agent && !agent.archivedAt && !agent.lastError && (agent.status === "running" || agent.status === "initializing");
        // A live turn closes itself in turn.after; closing it here would settle work still running.
        if (alive) continue;
        // A parked member is only dead once its agent is gone: an approval can still arrive.
        if (parked && agent && !agent.archivedAt) continue;
        const status: MemberStatus = !agent || agent.archivedAt ? "blocked_dead" : agent.lastError ? "failed" : "done";
        await upsertMember(task.taskId, { engine: member.engine, ...(member.botId ? { botId: member.botId } : {}), handleId: member.handleId, status });
        recovered += 1;
      }
      await settleAndPublish(host, task.taskId, requesterAgentId);
    } catch (error) {
      // One unreadable or busy line must not stop the rest of the folder.
      console.error(`paseo-bots: could not recover the task line "${task.taskId}"`, error);
    }
  }
  return recovered;
}

export function registerTaskTurns(server: PluginServerContext, host: BotsHost): () => void {
  const log = (error: unknown) => console.error("paseo-bots: could not record a task turn", error);
  const flush = () => {
    if (host.paseo) void flushTaskCards(host).catch(log);
  };
  const prune = () => pruneSettled().catch((error: unknown) => console.error("paseo-bots: could not prune settled task lines", error));
  // onAttach replays on every attach, so the flag latches before the first await: a second
  // attach sees it and stops, and recovery is a property of this process, not of a connection.
  let recovered = false;
  const detach = host.onAttach((paseo) => {
    flush();
    if (recovered) return;
    recovered = true;
    void recoverInterrupted(host, paseo).catch(log).finally(() => void prune());
  });
  const timer = setInterval(flush, 30_000);
  timer.unref();
  const pruneTimer = setInterval(prune, PRUNE_INTERVAL_MS);
  pruneTimer.unref();
  const off = server.addHook("agent.turn.after", async ({ agent }, context) => {
    host.attach(context.paseo);
    await recordTurn(host, context.paseo, agent.id).catch(log);
    flush();
  });
  const offArchive = server.addHook("agent.archive.after", async ({ agent }, context) => {
    host.attach(context.paseo);
    await recordArchive(host, context.paseo, agent.id).catch(log);
  });
  return () => {
    off();
    offArchive();
    detach();
    clearInterval(timer);
    clearInterval(pruneTimer);
  };
}
