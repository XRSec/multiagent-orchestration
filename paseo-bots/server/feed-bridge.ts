/**
 * Purpose: Server bridge consuming paseo-feed single pointer index (index.jsonl) with selective hydration and cursor pagination.
 * Context: Invoked by botFeedReadRpc in index.server.ts to power the Continuous Feed inside paseo-bots.
 * Usage: import { readMergedBotFeed } from "./feed-bridge";
 */

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BOT_LABEL, primaryGroupForBot, type Bot, type BotGroup } from "../shared/bot";
import {
  ROUTINE_LABEL,
  SESSION_ROLE_LABEL,
  TEAM_SESSION_LABEL,
  WORKFLOW_STAGE_LABEL,
  WORKFLOW_TASK_LABEL,
} from "../shared/chat";
import { SHADOW_SESSION_LABEL } from "../shared/companion-intent";
import {
  compareFeedChronological,
  distillTimelineToFeedEntries,
  feedChannelStorageKey,
  formatFeedCursor,
  parseFeedCursor,
  parseFeedJsonl,
  parseFeedPointerJsonl,
  type BotFeedChannelKind,
  type BotFeedEntry,
  type BotFeedPointer,
  type BotFeedSource,
  type BotFeedWorkflowMeta,
  type FeedTimelineEntryLike,
} from "../shared/feed-view";
import { ASKED_BY_LABEL } from "../shared/handoff";
import type { BotsHost } from "./host";
import { MEMORY_CURATION_LABEL } from "./memory-curator";
import type { PaseoApi } from "./paseo";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;
const BOT_CHAT_BACKFILL_LIMIT = 12;
const TEAM_MEMBER_CHAT_LIMIT = 10;
const TEAM_TOTAL_CHAT_LIMIT = 20;
const TIMELINE_HYDRATE_TURNS = 50;

type ListedAgent = Awaited<ReturnType<PaseoApi["agents"]["list"]>>["entries"][number]["agent"];

export interface ReadMergedBotFeedInput {
  channelKind: BotFeedChannelKind;
  channelId: string;
  limit?: number;
  beforeCursor?: string;
  humanOnly?: boolean;
}

export interface ReadMergedBotFeedResult {
  entries: BotFeedEntry[];
  hasOlder: boolean;
  nextCursor: string | null;
  totalPointers: number;
}

interface AgentMetadata {
  agent: ListedAgent;
  botId: string;
  botName: string;
  teamIds: string[];
}

interface PointerCandidate {
  pointer: BotFeedPointer;
  isSynthetic: boolean;
  isLegacy: boolean;
  agentMeta?: AgentMetadata;
}

/** Root directory where paseo-feed persists index and channel JSONL files. */
export function feedDataDir(): string {
  return process.env.PASEO_FEED_DATA_DIR || path.join(os.homedir(), ".paseo", "plugin-data", "paseo-feed");
}

/** Full filesystem path for the unified feed pointer index. */
export function feedIndexFilePath(baseDir: string = feedDataDir()): string {
  return path.join(baseDir, "index.jsonl");
}

/** Full filesystem path for a legacy feed channel's JSONL log. */
export function feedChannelFilePath(
  kind: BotFeedChannelKind,
  id: string,
  baseDir: string = feedDataDir(),
): string {
  return path.join(baseDir, "channels", `${feedChannelStorageKey(kind, id)}.jsonl`);
}

function pickWorkflowMeta(
  raw: Partial<BotFeedWorkflowMeta> | null | undefined,
): BotFeedWorkflowMeta {
  if (!raw) return {};
  const workflowTaskId = raw.workflowTaskId?.trim();
  const workflowId = raw.workflowId?.trim();
  const workflowStageId = raw.workflowStageId?.trim();
  const workflowStageName = raw.workflowStageName?.trim();
  return {
    ...(workflowTaskId ? { workflowTaskId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(workflowStageId ? { workflowStageId } : {}),
    ...(workflowStageName ? { workflowStageName } : {}),
  };
}

function extractWorkflowMetaFromLabels(
  labels: Record<string, string> | undefined,
  agentTitle?: string | null,
): BotFeedWorkflowMeta {
  if (!labels) return {};
  const workflowTaskId = (labels[WORKFLOW_TASK_LABEL] ?? labels["paseo-bots.workflow-task"])?.trim();
  const workflowId = (
    labels["paseo-bots:workflow-id"] ??
    labels["paseo-bots.workflow-id"] ??
    labels["paseo-bots:workflow"] ??
    labels["paseo-bots.workflow"]
  )?.trim();
  const workflowStageId = (labels[WORKFLOW_STAGE_LABEL] ?? labels["paseo-bots.workflow-stage"])?.trim();
  let workflowStageName = (
    labels["paseo-bots:workflow-stage-name"] ??
    labels["paseo-bots.workflow-stage-name"]
  )?.trim();
  if (!workflowStageName && (workflowTaskId || workflowStageId) && agentTitle) {
    const match = /^\[[^\]]+\]\s+(.+)$/.exec(agentTitle.trim());
    if (match?.[1]?.trim()) {
      workflowStageName = match[1].trim();
    }
  }
  return {
    ...(workflowTaskId ? { workflowTaskId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(workflowStageId ? { workflowStageId } : {}),
    ...(workflowStageName ? { workflowStageName } : {}),
  };
}

function legacyEntryToPointer(entry: BotFeedEntry, turnIndex: number): BotFeedPointer {
  return {
    id: entry.id,
    agentId: entry.agentId,
    turnId: entry.turnId,
    turnIndex,
    botId: entry.botId,
    botName: entry.botName,
    teamIds: entry.teamId
      ? [entry.teamId]
      : entry.channelKind === "team" && entry.channelId
        ? [entry.channelId]
        : [],
    agentTitle: entry.agentTitle,
    archived: entry.archived,
    timestamp: entry.timestamp,
    status: entry.status,
    errorMessage: entry.errorMessage,
    toolsCount: entry.toolsCount,
    source: entry.source,
    commandPreview: entry.command,
    replyPreview: entry.reply,
    ...pickWorkflowMeta(entry),
  };
}

async function readPersistedStore(
  kind: BotFeedChannelKind,
  id: string,
): Promise<{
  hasIndexFile: boolean;
  pointers: BotFeedPointer[];
  legacyById: Map<string, BotFeedEntry>;
}> {
  let hasIndexFile = false;
  const dedup = new Map<string, BotFeedPointer>();
  const legacyById = new Map<string, BotFeedEntry>();

  try {
    const rawIndex = await readFile(feedIndexFilePath(), "utf8");
    hasIndexFile = true;
    for (const ptr of parseFeedPointerJsonl(rawIndex)) {
      const prev = dedup.get(ptr.id);
      dedup.set(ptr.id, prev ? { ...ptr, archived: prev.archived || ptr.archived } : ptr);
    }
  } catch {
    // Index file may not exist yet; continue to read legacy per-channel JSONL.
  }

  const indexIds = new Set(dedup.keys());

  try {
    const rawLegacy = await readFile(feedChannelFilePath(kind, id), "utf8");
    const legacyEntries = parseFeedJsonl(rawLegacy);
    for (let i = 0; i < legacyEntries.length; i++) {
      const entry = legacyEntries[i]!;
      if (indexIds.has(entry.id)) continue;
      const prevLegacy = legacyById.get(entry.id);
      const mergedEntry = prevLegacy ? { ...entry, archived: prevLegacy.archived || entry.archived } : entry;
      legacyById.set(entry.id, mergedEntry);
      dedup.set(entry.id, legacyEntryToPointer(mergedEntry, i));
    }
  } catch {
    // Legacy channel JSONL may not exist; return whatever index.jsonl provided.
  }

  return {
    hasIndexFile,
    pointers: [...dedup.values()],
    legacyById,
  };
}

function isExcludedAgent(labels: Record<string, string> | undefined): boolean {
  if (!labels) return false;
  return labels[SHADOW_SESSION_LABEL] === "true" || labels[MEMORY_CURATION_LABEL] === "true";
}

function isTeamSessionAgent(labels: Record<string, string> | undefined): boolean {
  if (!labels) return false;
  const role = labels[SESSION_ROLE_LABEL];
  return Boolean(labels[TEAM_SESSION_LABEL]) || role === "team-lead" || role === "team-direct-specialist";
}

export function classifySource(
  labels: Record<string, string> | undefined,
  channelKind: BotFeedChannelKind,
): BotFeedSource {
  if (labels?.[ROUTINE_LABEL]) return "routine";
  if (
    labels?.[WORKFLOW_TASK_LABEL] ||
    labels?.[WORKFLOW_STAGE_LABEL] ||
    labels?.["paseo-bots.workflow-task"] ||
    labels?.["paseo-bots.workflow-stage"]
  ) {
    return "workflow";
  }
  const role = labels?.[SESSION_ROLE_LABEL];
  if (
    labels?.[ASKED_BY_LABEL] ||
    role === "worker" ||
    role === "dispatched-worker"
  ) {
    return "delegated";
  }
  if (channelKind === "team") return "team";
  if (labels?.[TEAM_SESSION_LABEL] && (role === "team-lead" || role === "team-direct-specialist")) {
    return "team";
  }
  return "dm";
}

async function listAgentsForBot(paseo: PaseoApi, botId: string, limit: number): Promise<ListedAgent[]> {
  try {
    const page = await paseo.agents.list({
      filter: { labels: { [BOT_LABEL]: botId }, includeArchived: true, includeBackground: true },
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit },
    });
    return page.entries
      .map((entry) => entry.agent)
      .filter((agent) => !isExcludedAgent(agent.labels));
  } catch {
    return [];
  }
}

async function fetchAgentTailEntries(
  paseo: PaseoApi,
  agentId: string,
  limit: number = TIMELINE_HYDRATE_TURNS,
): Promise<FeedTimelineEntryLike[]> {
  try {
    const page = await paseo.agents
      .ref(agentId)
      .timeline.refetch({ direction: "tail", projection: "projected", limit, wholeTurns: true });
    if (!page || page.error || !Array.isArray(page.entries)) return [];
    const entries: FeedTimelineEntryLike[] = [];
    for (const raw of page.entries as Array<{ turnId?: string | null; timestamp?: string | null; item?: unknown }>) {
      if (!raw || !raw.item || typeof (raw.item as { type?: unknown }).type !== "string") continue;
      entries.push({
        turnId: raw.turnId ?? null,
        timestamp: raw.timestamp ?? null,
        item: raw.item as FeedTimelineEntryLike["item"],
      });
    }
    return entries;
  } catch {
    return [];
  }
}

function collectTeamIdsForBot(
  botId: string,
  groups: readonly BotGroup[],
  labels?: Record<string, string>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string | undefined) => {
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      ids.push(candidate);
    }
  };
  add(labels?.[TEAM_SESSION_LABEL]);
  for (const group of groups) {
    if (group.leadId === botId || group.memberIds.includes(botId)) {
      add(group.id);
    }
  }
  return ids;
}

async function collectAgentMetadata(
  paseo: PaseoApi,
  channelKind: BotFeedChannelKind,
  channelId: string,
  bots: readonly Bot[],
  groups: readonly BotGroup[],
): Promise<Map<string, AgentMetadata>> {
  const map = new Map<string, AgentMetadata>();
  if (channelKind === "bot") {
    const bot = bots.find((b) => b.id === channelId);
    const botName = bot?.name || channelId;
    const agents = await listAgentsForBot(paseo, channelId, BOT_CHAT_BACKFILL_LIMIT);
    for (const agent of agents) {
      map.set(agent.id, {
        agent,
        botId: channelId,
        botName,
        teamIds: collectTeamIdsForBot(channelId, groups, agent.labels),
      });
    }
    return map;
  }

  const group = groups.find((g) => g.id === channelId);
  if (!group) return map;
  const memberIds = [...new Set([...(group.leadId ? [group.leadId] : []), ...group.memberIds])];
  if (memberIds.length === 0) return map;

  const botNames = new Map(bots.map((b) => [b.id, b.name]));
  const perMember = await Promise.all(
    memberIds.map(async (memberId) => {
      const agents = await listAgentsForBot(paseo, memberId, TEAM_MEMBER_CHAT_LIMIT);
      return agents.map((agent) => ({
        agent,
        botId: memberId,
        botName: botNames.get(memberId) ?? memberId,
      }));
    }),
  );

  const unique = new Map<string, { agent: ListedAgent; botId: string; botName: string }>();
  for (const item of perMember.flat()) {
    if (!unique.has(item.agent.id)) unique.set(item.agent.id, item);
  }

  const prioritized = [...unique.values()]
    .sort((a, b) => {
      const teamDelta = Number(isTeamSessionAgent(b.agent.labels)) - Number(isTeamSessionAgent(a.agent.labels));
      if (teamDelta !== 0) return teamDelta;
      return (Date.parse(b.agent.updatedAt) || 0) - (Date.parse(a.agent.updatedAt) || 0);
    })
    .slice(0, TEAM_TOTAL_CHAT_LIMIT);

  for (const item of prioritized) {
    const teamIds = collectTeamIdsForBot(item.botId, groups, item.agent.labels);
    if (!teamIds.includes(channelId)) teamIds.push(channelId);
    map.set(item.agent.id, {
      agent: item.agent,
      botId: item.botId,
      botName: item.botName,
      teamIds,
    });
  }
  return map;
}

function buildSyntheticPointer(meta: AgentMetadata, channelKind: BotFeedChannelKind): BotFeedPointer {
  const createdAt = (meta.agent as { createdAt?: string }).createdAt;
  const timestamp = meta.agent.updatedAt || createdAt || new Date().toISOString();
  return {
    id: `live:${meta.agent.id}:${timestamp}`,
    agentId: meta.agent.id,
    turnId: null,
    turnIndex: 0,
    botId: meta.botId,
    botName: meta.botName,
    teamIds: meta.teamIds,
    agentTitle: meta.agent.title?.trim() || "Untitled chat",
    archived: Boolean(meta.agent.archivedAt),
    timestamp,
    status: "completed",
    errorMessage: null,
    toolsCount: 0,
    source: classifySource(meta.agent.labels, channelKind),
    commandPreview: "",
    replyPreview: "",
    ...extractWorkflowMetaFromLabels(meta.agent.labels, meta.agent.title),
  };
}

function pointerMatchesChannel(
  pointer: BotFeedPointer,
  channelKind: BotFeedChannelKind,
  channelId: string,
): boolean {
  return channelKind === "team" ? pointer.teamIds.includes(channelId) : pointer.botId === channelId;
}

function pointerMatchesHumanOnly(pointer: { source: BotFeedSource }, humanOnly: boolean | undefined): boolean {
  if (humanOnly !== true) return true;
  return pointer.source === "dm" || pointer.source === "team";
}

function fallbackPreviewEntry(
  pointer: BotFeedPointer,
  channelKind: BotFeedChannelKind,
  channelId: string,
): BotFeedEntry {
  return {
    id: pointer.id,
    channelKind,
    channelId,
    botId: pointer.botId,
    botName: pointer.botName,
    teamId: channelKind === "team" ? channelId : (pointer.teamIds[0] ?? null),
    agentId: pointer.agentId,
    agentTitle: pointer.agentTitle,
    archived: pointer.archived,
    turnId: pointer.turnId,
    timestamp: pointer.timestamp,
    command: pointer.commandPreview,
    reply: pointer.replyPreview,
    status: pointer.status,
    errorMessage: pointer.errorMessage,
    toolsCount: pointer.toolsCount,
    source: pointer.source,
    ...pickWorkflowMeta(pointer),
    hydrated: false,
  };
}

function findMatchedTurn(
  pointer: BotFeedPointer,
  distilled: readonly BotFeedEntry[] | undefined,
): BotFeedEntry | undefined {
  if (!distilled || distilled.length === 0) return undefined;
  if (pointer.turnId) {
    const byTurn = distilled.find((entry) => entry.turnId === pointer.turnId);
    if (byTurn) return byTurn;
  }
  const byId = distilled.find((entry) => entry.id === pointer.id);
  if (byId) return byId;
  if (!pointer.turnId && pointer.turnIndex >= 0 && pointer.turnIndex < distilled.length) {
    return distilled[pointer.turnIndex];
  }
  return undefined;
}

function buildAgentDistillContext(
  agentId: string,
  meta: AgentMetadata | undefined,
  fallbackPointer: BotFeedPointer | undefined,
  channelKind: BotFeedChannelKind,
  channelId: string,
  bots: readonly Bot[],
  groups: readonly BotGroup[],
): {
  botId: string;
  botName: string;
  teamId: string | null;
  agentTitle: string;
  archived: boolean;
  source: BotFeedSource;
  fallbackTimestamp: string;
  workflowMeta: BotFeedWorkflowMeta;
} {
  const workflowMeta = pickWorkflowMeta({
    ...pickWorkflowMeta(fallbackPointer),
    ...(meta ? extractWorkflowMetaFromLabels(meta.agent.labels, meta.agent.title) : {}),
  });

  if (meta) {
    const createdAt = (meta.agent as { createdAt?: string }).createdAt;
    return {
      botId: meta.botId,
      botName: meta.botName,
      teamId: channelKind === "team" ? channelId : (meta.teamIds[0] ?? null),
      agentTitle: meta.agent.title?.trim() || fallbackPointer?.agentTitle || "Untitled chat",
      archived: Boolean(meta.agent.archivedAt) || Boolean(fallbackPointer?.archived),
      source: classifySource(meta.agent.labels, channelKind),
      fallbackTimestamp: meta.agent.updatedAt || createdAt || fallbackPointer?.timestamp || new Date().toISOString(),
      workflowMeta,
    };
  }

  const botId = fallbackPointer?.botId ?? channelId;
  const botName = fallbackPointer?.botName || bots.find((b) => b.id === botId)?.name || botId;
  const teamId =
    channelKind === "team"
      ? channelId
      : (fallbackPointer?.teamIds[0] ?? primaryGroupForBot(botId, groups)?.id ?? null);
  return {
    botId,
    botName,
    teamId,
    agentTitle: fallbackPointer?.agentTitle || "Untitled chat",
    archived: Boolean(fallbackPointer?.archived),
    source: fallbackPointer?.source ?? (channelKind === "team" ? "team" : "dm"),
    fallbackTimestamp: fallbackPointer?.timestamp || new Date().toISOString(),
    workflowMeta,
  };
}

/**
 * Reads persisted pointer index (with legacy channel fallback), merges live agent metadata,
 * applies cursor pagination before timeline hydration, hydrates ONLY unique agentIds in the
 * requested slice, and returns paginated entries plus cursor metadata.
 */
export async function readMergedBotFeed(
  host: BotsHost,
  input: ReadMergedBotFeedInput,
): Promise<ReadMergedBotFeedResult> {
  const [persisted, values] = await Promise.all([
    readPersistedStore(input.channelKind, input.channelId),
    host.values().catch(() => null),
  ]);
  const bots = values?.bots ?? [];
  const groups = values?.groups ?? [];

  const agentMetaById = host.paseo
    ? await collectAgentMetadata(host.paseo, input.channelKind, input.channelId, bots, groups)
    : new Map<string, AgentMetadata>();

  const latestIndexedMsByAgent = new Map<string, number>();
  const persistedTurnKeys = new Set<string>();
  const persistedNullTurnIdxKeys = new Set<string>();
  const persistedIds = new Set<string>();
  const candidates: PointerCandidate[] = [];

  for (const rawPtr of persisted.pointers) {
    const meta = agentMetaById.get(rawPtr.agentId);
    const archived = rawPtr.archived || Boolean(meta?.agent.archivedAt);
    const liveWorkflowMeta = meta ? extractWorkflowMetaFromLabels(meta.agent.labels, meta.agent.title) : {};
    const liveSource = meta ? classifySource(meta.agent.labels, input.channelKind) : rawPtr.source;
    const mergedSource: BotFeedSource = liveSource === "workflow" ? "workflow" : rawPtr.source;
    const mergedMeta = pickWorkflowMeta({ ...liveWorkflowMeta, ...rawPtr });
    const pointer: BotFeedPointer = {
      ...rawPtr,
      archived,
      source: mergedSource,
      ...mergedMeta,
    };
    const ms = Date.parse(pointer.timestamp) || 0;
    const prevLatest = latestIndexedMsByAgent.get(pointer.agentId);
    if (prevLatest === undefined || ms > prevLatest) {
      latestIndexedMsByAgent.set(pointer.agentId, ms);
    }
    persistedIds.add(pointer.id);
    if (pointer.turnId) persistedTurnKeys.add(`${pointer.agentId}::turn:${pointer.turnId}`);
    else persistedNullTurnIdxKeys.add(`${pointer.agentId}::idx:${pointer.turnIndex}`);

    candidates.push({
      pointer,
      isSynthetic: false,
      isLegacy: persisted.legacyById.has(pointer.id),
      agentMeta: meta,
    });
  }

  for (const meta of agentMetaById.values()) {
    const updatedMs = Date.parse(meta.agent.updatedAt) || 0;
    const latestIndexed = latestIndexedMsByAgent.get(meta.agent.id);
    if (latestIndexed !== undefined && updatedMs <= latestIndexed) {
      continue;
    }
    candidates.push({
      pointer: buildSyntheticPointer(meta, input.channelKind),
      isSynthetic: true,
      isLegacy: false,
      agentMeta: meta,
    });
  }

  const filtered = candidates
    .filter((cand) => pointerMatchesChannel(cand.pointer, input.channelKind, input.channelId))
    .filter((cand) => pointerMatchesHumanOnly(cand.pointer, input.humanOnly))
    .sort((a, b) => compareFeedChronological(a.pointer, b.pointer));

  const baseTotalPointers = filtered.length;
  const cursor = parseFeedCursor(input.beforeCursor);

  const beforeCursorCandidates = cursor
    ? filtered.filter((cand) => {
        if (compareFeedChronological(cand.pointer, cursor) < 0) return true;
        if (!cand.isSynthetic || persisted.hasIndexFile || !cand.agentMeta) return false;
        const createdAt = (cand.agentMeta.agent as { createdAt?: string }).createdAt ?? cand.agentMeta.agent.updatedAt;
        return (Date.parse(createdAt) || 0) <= cursor.timestampMs;
      })
    : filtered;

  const rawLimit = input.limit ?? DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT)));
  const sliceStart = Math.max(0, beforeCursorCandidates.length - limit);
  const earlierCount = sliceStart;
  const pageCandidates = beforeCursorCandidates.slice(sliceStart);

  const agentIdsToHydrate = new Set<string>();
  const fallbackPtrByAgent = new Map<string, BotFeedPointer>();
  const metaByAgent = new Map<string, AgentMetadata>();
  for (const cand of pageCandidates) {
    if (!fallbackPtrByAgent.has(cand.pointer.agentId)) {
      fallbackPtrByAgent.set(cand.pointer.agentId, cand.pointer);
    }
    if (cand.agentMeta) {
      metaByAgent.set(cand.pointer.agentId, cand.agentMeta);
    } else if (agentMetaById.has(cand.pointer.agentId)) {
      metaByAgent.set(cand.pointer.agentId, agentMetaById.get(cand.pointer.agentId)!);
    }
    if (!cand.isLegacy || cand.isSynthetic) {
      agentIdsToHydrate.add(cand.pointer.agentId);
    }
  }

  const distilledByAgent = new Map<string, BotFeedEntry[]>();
  if (host.paseo && agentIdsToHydrate.size > 0) {
    const paseo = host.paseo;
    await Promise.all(
      [...agentIdsToHydrate].map(async (agentId) => {
        const timeline = await fetchAgentTailEntries(paseo, agentId, TIMELINE_HYDRATE_TURNS);
        if (timeline.length === 0) return;
        const ctx = buildAgentDistillContext(
          agentId,
          metaByAgent.get(agentId),
          fallbackPtrByAgent.get(agentId),
          input.channelKind,
          input.channelId,
          bots,
          groups,
        );
        const distilled = distillTimelineToFeedEntries({
          channelKind: input.channelKind,
          channelId: input.channelId,
          botId: ctx.botId,
          botName: ctx.botName,
          teamId: ctx.teamId,
          agentId,
          agentTitle: ctx.agentTitle,
          archived: ctx.archived,
          source: ctx.source,
          entries: timeline,
          fallbackTimestamp: ctx.fallbackTimestamp,
          ...ctx.workflowMeta,
        });
        distilledByAgent.set(agentId, distilled);
      }),
    );
  }

  const resolvedMap = new Map<string, BotFeedEntry>();

  for (const cand of pageCandidates) {
    if (cand.isSynthetic) continue;
    const legacy = persisted.legacyById.get(cand.pointer.id);
    if (legacy) {
      const archived = legacy.archived || cand.pointer.archived;
      const teamId = legacy.teamId ?? (input.channelKind === "team" ? input.channelId : null);
      const mergedMeta = pickWorkflowMeta({ ...cand.pointer, ...legacy });
      const source: BotFeedSource = cand.pointer.source === "workflow" ? "workflow" : legacy.source;
      resolvedMap.set(legacy.id, { ...legacy, teamId, archived, source, ...mergedMeta, hydrated: true });
      continue;
    }

    const distilled = distilledByAgent.get(cand.pointer.agentId);
    const matched = findMatchedTurn(cand.pointer, distilled);
    if (matched) {
      const mergedMeta = pickWorkflowMeta({ ...matched, ...cand.pointer });
      resolvedMap.set(cand.pointer.id, {
        ...matched,
        id: cand.pointer.id,
        channelKind: input.channelKind,
        channelId: input.channelId,
        botId: cand.pointer.botId,
        botName: cand.pointer.botName,
        teamId: input.channelKind === "team" ? input.channelId : (cand.pointer.teamIds[0] ?? matched.teamId),
        agentTitle: cand.pointer.agentTitle || matched.agentTitle,
        archived: cand.pointer.archived || matched.archived,
        turnId: cand.pointer.turnId ?? matched.turnId,
        timestamp: cand.pointer.timestamp,
        source: cand.pointer.source,
        ...mergedMeta,
        hydrated: true,
      });
    } else {
      resolvedMap.set(cand.pointer.id, fallbackPreviewEntry(cand.pointer, input.channelKind, input.channelId));
    }
  }

  for (const cand of pageCandidates) {
    if (!cand.isSynthetic) continue;
    const distilled = distilledByAgent.get(cand.pointer.agentId) ?? [];
    for (let i = 0; i < distilled.length; i++) {
      const entry = distilled[i]!;
      if (persistedIds.has(entry.id) || resolvedMap.has(entry.id)) continue;
      if (entry.turnId && persistedTurnKeys.has(`${entry.agentId}::turn:${entry.turnId}`)) continue;
      if (!entry.turnId && persistedNullTurnIdxKeys.has(`${entry.agentId}::idx:${i}`)) continue;
      if (!pointerMatchesHumanOnly(entry, input.humanOnly)) continue;
      if (cursor && compareFeedChronological(entry, cursor) >= 0) continue;
      resolvedMap.set(entry.id, { ...entry, hydrated: true });
    }
  }

  const resolved = [...resolvedMap.values()].sort(compareFeedChronological);
  const trimmed = resolved.length > limit ? resolved.slice(-limit) : resolved;
  const hasOlder = earlierCount > 0 || resolved.length > limit;
  const nextCursor = hasOlder && trimmed.length > 0 ? formatFeedCursor(trimmed[0]!) : null;
  const syntheticDelta = resolved.length - pageCandidates.length;
  const totalPointers = Math.max(trimmed.length, baseTotalPointers + (syntheticDelta > 0 ? syntheticDelta : 0));

  return {
    entries: trimmed,
    hasOlder,
    nextCursor,
    totalPointers,
  };
}
