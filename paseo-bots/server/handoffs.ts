import type { PluginServerContext } from "@getpaseo/plugin/server";
import { lastTurn } from "../shared/activity";
import { BOT_LABEL } from "../shared/bot";
import { ASKED_BY_LABEL, HANDOFF_CARD, HandoffCardSchema, handoffRequest, handoffStatusRpc, type HandoffCard, type HandoffStatus } from "../shared/handoff";
import type { BotsHost } from "./host";
import type { PaseoApi } from "./paseo";
import { HandoffNotifications } from "./handoff-notifications";

/** A presentation failure must never turn an accepted delegation into a retryable dispatch error. */
export async function publishHandoff(paseo: PaseoApi, card: HandoffCard): Promise<void> {
  try {
    const data = HandoffCardSchema.parse(card);
    await paseo.agents.ref(card.requesterAgentId).timeline.append({ type: "plugin", id: `handoff:${card.targetAgentId}`, ...HANDOFF_CARD, data: { ...data } });
  } catch (error) { console.error("paseo-bots: could not display a bot handoff", error); }
}

/** Match check_chat's bot ownership so later requests cannot invalidate earlier handoff cards. */
export async function handoffStatus(host: BotsHost, requesterAgentId: string, targetAgentId: string): Promise<HandoffStatus | null> {
  const paseo = host.requirePaseo();
  const [requester, target] = await Promise.all([paseo.agents.ref(requesterAgentId).refresh(), paseo.agents.ref(targetAgentId).refresh()]);
  if (!requester || !target) return null;
  const requesterBotId = requester.agent.labels?.[BOT_LABEL];
  if (!requesterBotId || !target.agent.labels?.[BOT_LABEL] || target.agent.labels[ASKED_BY_LABEL] !== requesterBotId) throw new Error("This bot conversation belongs to another request.");
  const page = await paseo.agents.ref(targetAgentId).timeline.refetch({ direction: "tail", projection: "projected", limit: 80 });
  const reply = lastTurn(page.entries.map((entry) => entry.item as { type: string; text?: unknown; name?: unknown })).reply;
  const agent = target.agent;
  const taskId = handoffRequest(agent.labels, agent.metadata)?.taskId;
  return {
    state: chatStateOf(agent),
    reply: reply.length > 6000 ? `${reply.slice(0, 5998)}…` : reply,
    error: agent.lastError?.slice(0, 1000) || null,
    ...(taskId ? { taskId } : {}),
  };
}

/** One place decides what a chat is doing: the handoff card and the task write-back share it. */
export function chatStateOf(agent: { archivedAt?: unknown; pendingPermissions?: unknown; status?: string }): HandoffStatus["state"] {
  if (agent.archivedAt) return "archived";
  if ((agent.pendingPermissions as { length?: number } | undefined)?.length) return "permission";
  if (agent.status === "running" || agent.status === "initializing") return "running";
  if (agent.status === "error") return "error";
  return "finished";
}

export function registerHandoffs(server: PluginServerContext, host: BotsHost): () => Promise<void> {
  const notifications = new HandoffNotifications(host);
  const retry = () => { if (host.paseo) void notifications.retry().catch((error: unknown) => console.error("paseo-bots: could not retry bot completion updates", error)); };
  const detach = host.onAttach(retry);
  const timer = setInterval(retry, 30_000);
  timer.unref();
  server.addHook("agent.turn.after", async (event, context) => {
    host.attach(context.paseo);
    await notifications.finished(event, context.paseo).catch((error: unknown) => console.error("paseo-bots: could not notify the requesting chat", error));
    retry();
  });
  server.handle(handoffStatusRpc, async ({ requesterAgentId, targetAgentId }, context) => {
    host.attach(context.paseo);
    return { status: await handoffStatus(host, requesterAgentId, targetAgentId) };
  });
  return async () => { clearInterval(timer); detach(); await notifications.stop(); };
}
