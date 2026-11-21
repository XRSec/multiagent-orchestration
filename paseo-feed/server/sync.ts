/**
 * Purpose: Paseo runtime sync engine bridging agent hooks, pointer indexing, and channel messaging.
 * Context: Connects PaseoApi sessions to the single index.jsonl pointer store and live broadcasters.
 * Usage: handleTurnAfter, handleArchiveAfter, syncChannelFromPaseo, listChannelsWithStats, sendToFeedChannel.
 * Prerequisites: ./paseo.ts, ./roster.ts, ./extractor.ts, ./hydrator.ts, ./store.ts, ../shared/protocol.ts.
 */

import type { PluginHandlerContext, PluginHookEvents } from "@getpaseo/plugin/server";
import {
  ASKED_BY_LABEL,
  BOT_LABEL,
  GLOBAL_ASSISTANT_LABEL,
  LIFECYCLE_MOUNT_LABEL,
  LONG_SESSION_ENABLED_LABEL,
  ROUTINE_LABEL,
  SESSION_ROLE_LABEL,
  TEAM_SESSION_LABEL,
  WORKFLOW_STAGE_LABEL,
  WORKFLOW_TASK_LABEL,
  type ChannelKind,
  type FeedChannel,
  type FeedEntry,
  type FeedPointer,
  type FeedUpdateEvent,
} from "../shared/protocol.ts";
import {
  buildEntryFromPointer,
  buildPointerFromTurn,
  extractTurnsFromTimeline,
  extractWorkflowMeta,
  inferFeedSource,
  shouldIgnoreAgent,
  type TimelineEntryLike,
  type TurnDescriptor,
} from "./extractor.ts";
import type { FeedHydrator } from "./hydrator.ts";
import type { PaseoApi } from "./paseo.ts";
import {
  findRosterBot,
  findRosterGroup,
  groupsContainingBot,
  loadRoster,
  resolveChannelLeadBot,
  resolveGroupBotIds,
  type RosterBot,
  type RosterGroup,
  type RosterSnapshot,
} from "./roster.ts";
import {
  markAgentArchived,
  readAllPointers,
  summarizeChannelPointers,
  upsertPointers,
} from "./store.ts";

export type BroadcastFn = (event: FeedUpdateEvent) => void;

export interface SyncOptions {
  dataDir?: string;
  settingsPath?: string;
  hydrator?: FeedHydrator;
}

interface AgentSummaryLike {
  id: string;
  title?: string | null;
  labels?: Readonly<Record<string, string>>;
  archivedAt?: string | null;
  updatedAt?: string;
}

function isHumanChatAgent(agent: Pick<AgentSummaryLike, "labels">): boolean {
  const labels = agent.labels;
  if (shouldIgnoreAgent(labels)) return false;
  if (labels?.[ROUTINE_LABEL]?.trim()) return false;
  if (labels?.[ASKED_BY_LABEL]?.trim()) return false;
  if (
    labels?.[WORKFLOW_TASK_LABEL]?.trim() ||
    labels?.[WORKFLOW_STAGE_LABEL]?.trim() ||
    labels?.["paseo-bots.workflow-task"]?.trim() ||
    labels?.["paseo-bots.workflow-stage"]?.trim()
  ) {
    return false;
  }
  return true;
}

function matchExplicitTeam(roster: RosterSnapshot, labels?: Readonly<Record<string, string>>): RosterGroup | null {
  const raw = labels?.[TEAM_SESSION_LABEL]?.trim();
  if (!raw) return null;
  return (
    roster.groups.find((group) => raw === group.id || raw.startsWith(`${group.id}:`)) ?? null
  );
}

function resolveTargetTeams(
  roster: RosterSnapshot,
  botId: string,
  labels?: Readonly<Record<string, string>>,
): RosterGroup[] {
  const explicit = matchExplicitTeam(roster, labels);
  if (explicit) return [explicit];
  return groupsContainingBot(roster, botId);
}

function projectEntriesForPointer(
  pointer: FeedPointer,
  turn: TurnDescriptor,
): FeedEntry[] {
  const content = { command: turn.command, reply: turn.reply, hydrated: true };
  const entries = [buildEntryFromPointer(pointer, "bot", pointer.botId, content)];
  for (const teamId of pointer.teamIds) {
    entries.push(buildEntryFromPointer(pointer, "team", teamId, content));
  }
  return entries;
}

function emitAdded(broadcast: BroadcastFn, entries: readonly FeedEntry[]): void {
  for (const entry of entries) {
    broadcast({
      kind: "entry_added",
      channelKind: entry.channelKind,
      channelId: entry.channelId,
      agentId: entry.agentId,
      entry,
    });
  }
}

function readAgentLabels(
  refreshedAgent: AgentSummaryLike | null | undefined,
  eventAgent: PluginHookEvents["agent.turn.after"]["agent"],
): Readonly<Record<string, string>> | undefined {
  return (
    refreshedAgent?.labels ??
    (eventAgent as { labels?: Readonly<Record<string, string>> }).labels
  );
}

export async function handleTurnAfter(
  event: PluginHookEvents["agent.turn.after"],
  context: PluginHandlerContext,
  broadcast: BroadcastFn,
  options?: SyncOptions,
): Promise<FeedEntry[]> {
  if (event.outcome.kind === "canceled") return [];
  const session = context.paseo.agents.ref(event.agent.id);
  const refreshed = await session.refresh().catch(() => null);
  const snapshot = refreshed?.agent ?? session.current?.() ?? null;
  const labels = readAgentLabels(snapshot, event.agent);
  if (shouldIgnoreAgent(labels)) return [];
  const botId = labels?.[BOT_LABEL]?.trim();
  if (!botId) return [];

  const roster = loadRoster(options?.settingsPath);
  const botName = findRosterBot(roster, botId)?.name ?? botId;
  const page = await session.timeline.refetch({
    direction: "tail",
    limit: event.turnId ? 1 : 5,
    wholeTurns: true,
  });
  const items = (page.entries ?? []) as unknown as TimelineEntryLike[];
  const turns = extractTurnsFromTimeline(items, {
    targetTurnId: event.turnId,
    turnOutcome: {
      kind: event.outcome.kind,
      errorMessage: event.outcome.kind === "failed" ? event.outcome.error.message : null,
    },
    fallbackTimestamp: snapshot?.updatedAt ?? new Date().toISOString(),
  });
  if (turns.length === 0) return [];

  const teamIds = resolveTargetTeams(roster, botId, labels).map((group) => group.id);
  const source = inferFeedSource(labels);
  const workflowMeta = extractWorkflowMeta(labels);
  const archived = Boolean(snapshot?.archivedAt ?? session.archivedAt);
  const agentTitle = snapshot?.title ?? event.agent.title ?? "";

  const pointers: FeedPointer[] = [];
  const turnByPointerId = new Map<string, TurnDescriptor>();
  const projectedAll: FeedEntry[] = [];

  for (const turn of turns) {
    const pointer = buildPointerFromTurn(turn, {
      agentId: event.agent.id,
      botId,
      botName,
      teamIds,
      agentTitle,
      archived,
      source,
      ...workflowMeta,
    });
    pointers.push(pointer);
    turnByPointerId.set(pointer.id, turn);
    projectedAll.push(...projectEntriesForPointer(pointer, turn));
  }

  const saved = upsertPointers(pointers, options?.dataDir);
  options?.hydrator?.invalidate(event.agent.id);

  const addedEntries: FeedEntry[] = [];
  for (const addedPointer of saved.addedPointers) {
    const turn = turnByPointerId.get(addedPointer.id);
    if (turn) addedEntries.push(...projectEntriesForPointer(addedPointer, turn));
  }
  emitAdded(broadcast, addedEntries);
  return projectedAll;
}

export function handleArchiveAfter(
  event: PluginHookEvents["agent.archive.after"],
  broadcast: BroadcastFn,
  options?: SyncOptions,
): number {
  const updated = markAgentArchived(event.agent.id, options?.dataDir);
  options?.hydrator?.markArchived(event.agent.id);
  broadcast({ kind: "agent_archived", agentId: event.agent.id });
  return updated;
}

async function collectChannelAgents(
  paseo: PaseoApi,
  botIds: readonly string[],
  maxAgents: number,
): Promise<AgentSummaryLike[]> {
  const byId = new Map<string, AgentSummaryLike>();
  for (const botId of botIds) {
    const page = await paseo.agents
      .list({
        filter: { labels: { [BOT_LABEL]: botId }, includeArchived: true, includeBackground: true },
        sort: [{ key: "updated_at", direction: "desc" }],
        page: { limit: maxAgents },
      })
      .catch(() => null);
    for (const entry of page?.entries ?? []) {
      const agent = entry.agent;
      if (!agent || shouldIgnoreAgent(agent.labels)) continue;
      byId.set(agent.id, agent);
    }
  }
  return [...byId.values()]
    .sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0))
    .slice(0, maxAgents);
}

export async function syncChannelFromPaseo(
  paseo: PaseoApi,
  channelKind: ChannelKind,
  channelId: string,
  maxAgents = 15,
  options?: SyncOptions,
): Promise<{ syncedAgents: number; addedEntries: number }> {
  const roster = loadRoster(options?.settingsPath);
  const group = channelKind === "team" ? findRosterGroup(roster, channelId) : null;
  if (channelKind === "team" && !group) return { syncedAgents: 0, addedEntries: 0 };
  const botIds = channelKind === "bot" ? [channelId] : resolveGroupBotIds(group!);
  if (botIds.length === 0) return { syncedAgents: 0, addedEntries: 0 };

  const agents = await collectChannelAgents(paseo, botIds, maxAgents);
  const allPointers: FeedPointer[] = [];
  let syncedAgents = 0;

  for (const agent of agents) {
    const botId = agent.labels?.[BOT_LABEL]?.trim();
    if (!botId) continue;
    const explicitTeam = matchExplicitTeam(roster, agent.labels);
    if (channelKind === "team" && explicitTeam && explicitTeam.id !== channelId) continue;

    const page = await paseo.agents
      .ref(agent.id)
      .timeline.refetch({ direction: "tail", projection: "projected", limit: 20, wholeTurns: true })
      .catch(() => null);
    if (!page || page.error) continue;
    syncedAgents += 1;

    const items = (page.entries ?? []) as unknown as TimelineEntryLike[];
    const turns = extractTurnsFromTimeline(items, {
      fallbackTimestamp: agent.updatedAt ?? new Date().toISOString(),
    });
    const botName = findRosterBot(roster, botId)?.name ?? botId;
    const teamIds = resolveTargetTeams(roster, botId, agent.labels).map((g) => g.id);
    const source = inferFeedSource(agent.labels);
    const workflowMeta = extractWorkflowMeta(agent.labels);

    for (const turn of turns) {
      allPointers.push(
        buildPointerFromTurn(turn, {
          agentId: agent.id,
          botId,
          botName,
          teamIds,
          agentTitle: agent.title ?? "",
          archived: Boolean(agent.archivedAt),
          source,
          ...workflowMeta,
        }),
      );
    }
  }

  const saved = upsertPointers(allPointers, options?.dataDir);
  for (const addedPointer of saved.addedPointers) {
    options?.hydrator?.invalidate(addedPointer.agentId);
  }
  return { syncedAgents, addedEntries: saved.added };
}

async function mapActiveChatByBot(paseo?: PaseoApi): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!paseo) return map;
  const page = await paseo.agents
    .list({
      filter: { includeArchived: false, includeBackground: true },
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: 200 },
    })
    .catch(() => null);
  for (const entry of page?.entries ?? []) {
    const agent = entry.agent;
    if (!agent || agent.archivedAt || !isHumanChatAgent(agent)) continue;
    const botId = agent.labels?.[BOT_LABEL]?.trim();
    if (botId && !map.has(botId)) map.set(botId, agent.id);
  }
  return map;
}

function compareChannels(a: FeedChannel, b: FeedChannel): number {
  if (Boolean(a.isGlobalAssistant) !== Boolean(b.isGlobalAssistant)) {
    return a.isGlobalAssistant ? -1 : 1;
  }
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const aMs = a.lastActivityAt ? Date.parse(a.lastActivityAt) || 0 : -1;
  const bMs = b.lastActivityAt ? Date.parse(b.lastActivityAt) || 0 : -1;
  if (aMs !== bMs) return bMs - aMs;
  if (a.kind !== b.kind) return a.kind === "bot" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export async function listChannelsWithStats(
  paseo?: PaseoApi,
  options?: SyncOptions & { includeArchived?: boolean },
): Promise<FeedChannel[]> {
  const includeArchived = options?.includeArchived ?? false;
  const roster = loadRoster(options?.settingsPath);
  const allPointers = readAllPointers(options?.dataDir);
  const activeByBot = await mapActiveChatByBot(paseo);
  const channels: FeedChannel[] = [];

  for (const bot of roster.bots) {
    if (!includeArchived && bot.archived) continue;
    const stats = summarizeChannelPointers(allPointers, "bot", bot.id);
    channels.push({
      kind: "bot",
      id: bot.id,
      name: bot.name,
      subtitle: bot.subtitle,
      pinned: bot.pinned,
      archived: bot.archived,
      isGlobalAssistant: bot.isGlobalAssistant,
      entryCount: stats.entryCount,
      lastActivityAt: stats.lastActivityAt,
      lastPreview: stats.lastPreview,
      activeAgentId: activeByBot.get(bot.id) ?? null,
    });
  }

  for (const group of roster.groups) {
    if (!includeArchived && group.archived) continue;
    const stats = summarizeChannelPointers(allPointers, "team", group.id);
    const activeAgentId =
      resolveGroupBotIds(group).map((id) => activeByBot.get(id)).find(Boolean) ?? null;
    channels.push({
      kind: "team",
      id: group.id,
      name: group.name,
      subtitle: group.subtitle,
      pinned: group.pinned,
      archived: group.archived,
      leadId: group.leadId,
      memberIds: group.memberIds,
      entryCount: stats.entryCount,
      lastActivityAt: stats.lastActivityAt,
      lastPreview: stats.lastPreview,
      activeAgentId,
    });
  }
  return channels.sort(compareChannels);
}

function buildColdStartConfig(bot: RosterBot): Record<string, unknown> | undefined {
  const provider = bot.provider?.trim();
  const model = bot.model?.trim();
  const engine = bot.engine?.trim();
  if (!provider && !model && !engine) return undefined;
  return {
    ...(provider
      ? { provider: model && !provider.includes("/") ? `${provider}/${model}` : provider }
      : model
        ? { model }
        : {}),
    ...(engine ? { engine } : {}),
  };
}

function buildColdStartLabels(
  channelKind: ChannelKind,
  channelId: string,
  target: { bot: RosterBot; group?: RosterGroup },
): Record<string, string> {
  return {
    [BOT_LABEL]: target.bot.id,
    [LIFECYCLE_MOUNT_LABEL]: "true",
    ...(target.bot.isGlobalAssistant ? { [GLOBAL_ASSISTANT_LABEL]: "true" } : {}),
    ...(target.bot.longSessionEnabled ? { [LONG_SESSION_ENABLED_LABEL]: "true" } : {}),
    ...(channelKind === "team"
      ? {
          [TEAM_SESSION_LABEL]: channelId,
          [SESSION_ROLE_LABEL]:
            target.group?.leadId === target.bot.id ? "team-lead" : "team-direct-specialist",
        }
      : {}),
  };
}

function extractCreatedAgentId(created: unknown): string | null {
  if (!created || typeof created !== "object") return null;
  const rec = created as { agent?: { id?: unknown }; id?: unknown };
  const raw = rec.agent?.id ?? rec.id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function sendToFeedChannel(
  paseo: PaseoApi,
  channelKind: ChannelKind,
  channelId: string,
  text: string,
  options?: SyncOptions,
): Promise<{
  ok: boolean;
  agentId: string | null;
  reason: "sent" | "created" | "no_active_chat" | "channel_not_found" | "error";
  message?: string;
  error?: string;
  lastArchivedAgentId?: string | null;
}> {
  const roster = loadRoster(options?.settingsPath);
  const target = resolveChannelLeadBot(roster, channelKind, channelId);
  if (!target) {
    if (channelKind === "bot") {
      return { ok: false, agentId: null, reason: "channel_not_found", message: `Bot "${channelId}" not found.` };
    }
    if (!findRosterGroup(roster, channelId)) {
      return { ok: false, agentId: null, reason: "channel_not_found", message: `Team "${channelId}" not found.` };
    }
    return {
      ok: false,
      agentId: null,
      reason: "no_active_chat",
      lastArchivedAgentId: null,
      message: "Team has no lead or member bot.",
    };
  }

  let selectedAgentId: string | null = null;
  try {
    const page = await paseo.agents.list({
      filter: { labels: { [BOT_LABEL]: target.bot.id }, includeArchived: true, includeBackground: true },
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: 50 },
    });
    const humanChats = (page.entries ?? [])
      .map((entry) => entry.agent)
      .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent && isHumanChatAgent(agent)))
      .sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0));

    const active = humanChats.find((agent) => !agent.archivedAt);
    if (active) {
      selectedAgentId = active.id;
      await paseo.agents.ref(active.id).send(text);
      return { ok: true, agentId: active.id, reason: "sent" };
    }

    const createFn = (
      paseo.agents as unknown as {
        create?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
      }
    ).create;
    if (typeof createFn !== "function") {
      const lastArchived = humanChats.find((agent) => Boolean(agent.archivedAt));
      return { ok: false, agentId: null, reason: "no_active_chat", lastArchivedAgentId: lastArchived?.id ?? null };
    }

    const cwd = target.group?.cwd?.trim() || target.bot.cwd?.trim() || process.cwd() || ".";
    const title =
      channelKind === "team"
        ? `[${target.group?.name || channelId}] ${target.bot.name}`
        : `[${target.bot.name}]`;
    const labels = buildColdStartLabels(channelKind, channelId, target);
    const config = buildColdStartConfig(target.bot);
    const created = await createFn.call(paseo.agents, {
      cwd,
      title,
      prompt: text,
      labels,
      ...(config ? { config } : {}),
    });
    const createdAgentId = extractCreatedAgentId(created);
    if (!createdAgentId) {
      const errMsg = "Cold-start agent creation did not return an agentId.";
      return { ok: false, agentId: null, reason: "error", message: errMsg, error: errMsg };
    }
    return { ok: true, agentId: createdAgentId, reason: "created" };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      agentId: selectedAgentId,
      reason: "error",
      message: errMsg,
      error: errMsg,
    };
  }
}
