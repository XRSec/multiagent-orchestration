import { rmSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { BOT_LABEL, primaryGroupForBot } from "../shared/bot";
import { TASK_CARD, TaskCardSchema, taskCardId, taskCardOf, type TaskCard } from "../shared/task-card";
import { TASK_MEMBER_CARD, taskMemberCardId, type TaskMemberCard } from "../shared/task-member";
import { pluginDataPath } from "./bot-home";
import { atomicWrite, ensureRealDirectory, readRegularText } from "./files";
import type { BotsHost } from "./host";
import type { PaseoApi } from "./paseo";
import { evaluateTask, recordPublishedCard, setCardAgent } from "./tasks";

// The group overview surface: one host-composed card per task version, appended to the
// task line's requester chat. Nothing here starts a turn, so a card cannot echo into one.

const OUTBOX_LIMIT = 16 * 1024;

function outboxFolder(): string {
  return join(pluginDataPath(), "task-cards");
}

function outboxFile(id: string): string {
  return join(outboxFolder(), `${encodeURIComponent(id)}.json`);
}

/**
 * The team's overview chat: the lead bot's most recent live chat, because the group card is
 * the lead's view of every task line, not the dispatcher's private one. A team without a
 * usable lead chat falls back to the requester, so a card is still never lost.
 */
export async function groupAgentFor(host: BotsHost, input: { groupId?: string; requesterAgentId?: string }): Promise<string | null> {
  if (!input.requesterAgentId) return null;
  const chat = await host.chatOf(input.requesterAgentId);
  const requesterBotId = chat?.botId ?? chat?.labels?.[BOT_LABEL];
  if (!requesterBotId) return null;
  const groups = (await host.values().catch(() => null))?.groups ?? [];
  const group = input.groupId ? (groups.find((entry) => entry.id === input.groupId) ?? null) : primaryGroupForBot(requesterBotId, groups);
  if (!group || (group.leadId !== requesterBotId && !group.memberIds.includes(requesterBotId))) return null;
  return (group.leadId ? await latestChatOf(host, group.leadId) : null) ?? input.requesterAgentId;
}

/** The lead's newest unarchived chat; null when the lead has none or the host cannot list chats. */
async function latestChatOf(host: BotsHost, botId: string): Promise<string | null> {
  try {
    const paseo = host.requirePaseo();
    const page = await paseo.agents.list({
      filter: { labels: { [BOT_LABEL]: botId }, includeArchived: false },
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: 1 },
    });
    const first = page.entries[0]?.agent;
    return typeof first?.id === "string" ? first.id : null;
  } catch {
    return null;
  }
}

interface ProjectedEntry {
  item?: unknown;
  type?: unknown;
  kind?: unknown;
  data?: unknown;
}

/**
 * A projected plugin entry carries no id: the shape is only
 * { type: "plugin", pluginId, kind, version, data }, so a card is identified by its kind plus
 * fields inside data (the append id stays task-card:<taskId>:<version> / task-member:<...>).
 * The window is the tail 200 entries, and a card older than the window reads as absent: it is
 * appended once more, the deliberate trade, because publishedCardIds on the record covers
 * older replays and a duplicate card is cheaper than a missing verdict. A malformed entry
 * reads as "not found" and never throws.
 */
async function alreadyPublished(paseo: PaseoApi, agentId: string, kind: string, match: (data: Record<string, unknown>) => boolean): Promise<boolean> {
  try {
    const page = await paseo.agents.ref(agentId).timeline.refetch({ direction: "tail", projection: "projected", limit: 200 });
    const entries = page?.entries;
    if (!Array.isArray(entries)) return false;
    return entries.some((raw: unknown) => {
      if (!raw || typeof raw !== "object") return false;
      const entry = raw as ProjectedEntry;
      const target = (entry.item ?? entry) as ProjectedEntry | null;
      if (!target || typeof target !== "object") return false;
      if (target.type !== "plugin" || target.kind !== kind) return false;
      const data = target.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) return false;
      return match(data as Record<string, unknown>);
    });
  } catch {
    return false;
  }
}

/** Appends once per task version; the id is the idempotency key, so a replay is a no-op. */
export async function publishTaskCard(paseo: PaseoApi, agentId: string, card: TaskCard): Promise<"appended" | "exists"> {
  const id = taskCardId(card.taskId, card.version);
  const exists = await alreadyPublished(paseo, agentId, TASK_CARD.kind, (data) => data.taskId === card.taskId && data.version === card.version);
  if (exists) return "exists";
  await paseo.agents.ref(agentId).timeline.append({ type: "plugin", id, ...TASK_CARD, data: { ...card } });
  return "appended";
}

/**
 * Appends one member receipt to the task line. The read depth is 200, unlike a group card's
 * long window: a member dies once and a receipt carries no budget, so the tail only has to
 * cover a busy day rather than a task's whole history.
 */
export async function publishMemberReceipt(paseo: PaseoApi, agentId: string, card: TaskMemberCard): Promise<"appended" | "exists"> {
  const id = taskMemberCardId(card.taskId, card.handleId);
  const exists = await alreadyPublished(paseo, agentId, TASK_MEMBER_CARD.kind, (data) => data.taskId === card.taskId && data.handleId === card.handleId);
  if (exists) return "exists";
  await paseo.agents.ref(agentId).timeline.append({ type: "plugin", id, ...TASK_MEMBER_CARD, data: { ...card } });
  return "appended";
}

export async function queueTaskCard(card: TaskCard, agentId: string): Promise<void> {
  await mkdir(outboxFolder(), { recursive: true, mode: 0o700 });
  await ensureRealDirectory(outboxFolder());
  await atomicWrite(outboxFile(taskCardId(card.taskId, card.version)), JSON.stringify({ agentId, card }));
}

/** Retries queued cards; the terminal state is already a fact, so a failure only delays the projection. */
export async function flushTaskCards(host: BotsHost): Promise<number> {
  const paseo = host.paseo;
  if (!paseo) return 0;
  const names = await readdir(outboxFolder()).catch(() => [] as string[]);
  let sent = 0;
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(outboxFolder(), name);
    const text = await readRegularText(path, OUTBOX_LIMIT).catch(() => null);
    if (!text) continue;
    let entry: { agentId?: unknown; card?: unknown };
    try {
      entry = JSON.parse(text) as typeof entry;
    } catch {
      continue;
    }
    const card = TaskCardSchema.safeParse(entry.card);
    if (typeof entry.agentId !== "string" || !card.success) continue;
    try {
      const outcome = await publishTaskCard(paseo, entry.agentId, card.data);
      await recordPublishedCard(card.data.taskId, taskCardId(card.data.taskId, card.data.version)).catch(() => null);
      rmSync(path, { force: true });
      if (outcome === "appended") sent += 1;
    } catch {
      // Keep the entry: the next flush tries again.
    }
  }
  return sent;
}

/**
 * Settles and, only for the caller that settled, publishes the group card. A failure to
 * append keeps the card queued rather than un-settling the task: the state is a fact, the
 * card is a projection of it.
 */
export async function settleAndPublish(host: BotsHost, taskId: string, requesterAgentId?: string): Promise<{ settled: boolean; published: boolean }> {
  const { settled, record } = await evaluateTask(taskId);
  if (!settled) return { settled: false, published: false };
  const card = taskCardOf(record);
  const id = taskCardId(card.taskId, card.version);
  // The recorded id is authoritative; the timeline window is only a fallback for old records.
  if (record.publishedCardIds?.includes(id)) return { settled: true, published: false };
  const agentId = record.cardAgentId ?? await groupAgentFor(host, { groupId: record.groupId, requesterAgentId });
  if (!agentId) return { settled: true, published: false };
  if (record.cardAgentId !== agentId) await setCardAgent(taskId, agentId).catch(() => null);
  await queueTaskCard(card, agentId);
  try {
    const outcome = await publishTaskCard(host.requirePaseo(), agentId, card);
    await recordPublishedCard(taskId, id).catch(() => null);
    rmSync(outboxFile(id), { force: true });
    return { settled: true, published: outcome === "appended" };
  } catch {
    return { settled: true, published: false };
  }
}
