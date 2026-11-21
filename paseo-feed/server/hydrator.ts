/**
 * Purpose: On-demand Paseo timeline hydrator with in-memory LRU cache for FeedPointer slices.
 * Context: Fetches full markdown turns only for agents present in the requested cursor page.
 * Usage: new FeedHydrator(options) or hydratePointers(paseo, channelKind, channelId, pointers, cache?).
 * Prerequisites: ./paseo.ts, ./extractor.ts, and ../shared/protocol.ts.
 */

import type { ChannelKind, FeedEntry, FeedPointer } from "../shared/protocol.ts";
import {
  buildEntryFromPointer,
  extractTurnsFromTimeline,
  extractWorkflowMeta,
  type TimelineEntryLike,
  type TurnDescriptor,
  type WorkflowMeta,
} from "./extractor.ts";
import type { PaseoApi } from "./paseo.ts";

const DEFAULT_MAX_ENTRIES = 128;
const DEFAULT_ACTIVE_TTL_MS = 15_000;
const DEFAULT_TIMELINE_LIMIT = 40;

export interface FeedHydratorOptions {
  maxEntries?: number;
  activeTtlMs?: number;
  timelineLimit?: number;
  now?: () => number;
}

interface CachedAgentTimeline {
  turns: TurnDescriptor[];
  byTurnId: Map<string, TurnDescriptor>;
  byTurnIndex: Map<number, TurnDescriptor>;
  fetchedAt: number;
  archived: boolean;
  workflowMeta?: WorkflowMeta;
}

function buildCachedTimeline(
  turns: TurnDescriptor[],
  fetchedAt: number,
  archived: boolean,
  workflowMeta?: WorkflowMeta,
): CachedAgentTimeline {
  const byTurnId = new Map<string, TurnDescriptor>();
  const byTurnIndex = new Map<number, TurnDescriptor>();
  for (const turn of turns) {
    if (turn.turnId) byTurnId.set(turn.turnId, turn);
    byTurnIndex.set(turn.turnIndex, turn);
  }
  return {
    turns,
    byTurnId,
    byTurnIndex,
    fetchedAt,
    archived,
    ...(workflowMeta && Object.keys(workflowMeta).length > 0 ? { workflowMeta } : {}),
  };
}

function applyWorkflowMetaFallback(pointer: FeedPointer, fallback?: WorkflowMeta): FeedPointer {
  if (!fallback) return pointer;
  const workflowTaskId = pointer.workflowTaskId || fallback.workflowTaskId;
  const workflowId = pointer.workflowId || fallback.workflowId;
  const workflowStageId = pointer.workflowStageId || fallback.workflowStageId;
  const workflowStageName = pointer.workflowStageName || fallback.workflowStageName;
  if (
    workflowTaskId === pointer.workflowTaskId &&
    workflowId === pointer.workflowId &&
    workflowStageId === pointer.workflowStageId &&
    workflowStageName === pointer.workflowStageName
  ) {
    return pointer;
  }
  return {
    ...pointer,
    ...(workflowTaskId ? { workflowTaskId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(workflowStageId ? { workflowStageId } : {}),
    ...(workflowStageName ? { workflowStageName } : {}),
  };
}

function pickNearestPreviewMatch(pointer: FeedPointer, candidates: readonly TurnDescriptor[]): TurnDescriptor | null {
  if (candidates.length === 0) return null;
  const pointerMs = Date.parse(pointer.timestamp) || 0;
  let best = candidates[0]!;
  let bestDelta = Math.abs((Date.parse(best.timestamp) || 0) - pointerMs);
  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const delta = Math.abs((Date.parse(candidate.timestamp) || 0) - pointerMs);
    const sameReply = Boolean(pointer.replyPreview && candidate.replyPreview === pointer.replyPreview);
    const bestSameReply = Boolean(pointer.replyPreview && best.replyPreview === pointer.replyPreview);
    if (delta < bestDelta || (delta === bestDelta && sameReply && !bestSameReply)) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

function matchTurnForPointer(pointer: FeedPointer, cached: CachedAgentTimeline): TurnDescriptor | null {
  if (pointer.turnId) {
    const exact = cached.byTurnId.get(pointer.turnId);
    if (exact) return exact;
  } else {
    const byIdx = cached.byTurnIndex.get(pointer.turnIndex);
    if (byIdx && (!pointer.commandPreview || byIdx.commandPreview === pointer.commandPreview)) {
      return byIdx;
    }
  }

  const candidates = cached.turns.filter((turn) => {
    if (pointer.turnId && turn.turnId && turn.turnId !== pointer.turnId) return false;
    if (pointer.commandPreview) return turn.commandPreview === pointer.commandPreview;
    if (pointer.replyPreview) return turn.replyPreview === pointer.replyPreview;
    return false;
  });
  return pickNearestPreviewMatch(pointer, candidates);
}

export class FeedHydrator {
  private readonly cache: Map<string, CachedAgentTimeline>;
  private readonly maxEntries: number;
  private readonly activeTtlMs: number;
  private readonly timelineLimit: number;
  private readonly now: () => number;

  constructor(options?: FeedHydratorOptions) {
    this.cache = new Map();
    this.maxEntries = Math.max(1, options?.maxEntries ?? DEFAULT_MAX_ENTRIES);
    this.activeTtlMs = Math.max(0, options?.activeTtlMs ?? DEFAULT_ACTIVE_TTL_MS);
    this.timelineLimit = Math.max(1, options?.timelineLimit ?? DEFAULT_TIMELINE_LIMIT);
    this.now = options?.now ?? (() => Date.now());
  }

  get size(): number {
    return this.cache.size;
  }

  invalidate(agentId: string): void {
    this.cache.delete(agentId);
  }

  markArchived(agentId: string): void {
    const existing = this.cache.get(agentId);
    if (!existing) return;
    existing.archived = true;
  }

  clear(): void {
    this.cache.clear();
  }

  private getFresh(agentId: string): CachedAgentTimeline | null {
    const entry = this.cache.get(agentId);
    if (!entry) return null;
    if (!entry.archived && this.now() - entry.fetchedAt >= this.activeTtlMs) {
      this.cache.delete(agentId);
      return null;
    }
    this.cache.delete(agentId);
    this.cache.set(agentId, entry);
    return entry;
  }

  private put(agentId: string, entry: CachedAgentTimeline): void {
    if (this.cache.has(agentId)) this.cache.delete(agentId);
    this.cache.set(agentId, entry);
    while (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
    }
  }

  private async fetchAndCacheAgent(
    paseo: PaseoApi,
    agentId: string,
    isPointerArchived: boolean,
  ): Promise<CachedAgentTimeline | null> {
    const page = await paseo.agents
      .ref(agentId)
      .timeline.refetch({
        direction: "tail",
        projection: "projected",
        limit: this.timelineLimit,
        wholeTurns: true,
      })
      .catch(() => null);
    if (!page || page.error || !Array.isArray(page.entries)) return null;

    const turns = extractTurnsFromTimeline(page.entries as unknown as TimelineEntryLike[]);
    if (turns.length === 0) return null;

    const pageAgent = (
      page as { agent?: { archivedAt?: string | null; labels?: Readonly<Record<string, string>> } }
    ).agent;
    const archived = isPointerArchived || Boolean(pageAgent?.archivedAt);
    const workflowMeta = extractWorkflowMeta(pageAgent?.labels);
    const cached = buildCachedTimeline(turns, this.now(), archived, workflowMeta);
    this.put(agentId, cached);
    return cached;
  }

  async hydratePointers(
    paseo: PaseoApi,
    channelKind: ChannelKind,
    channelId: string,
    pointers: readonly FeedPointer[],
  ): Promise<FeedEntry[]> {
    if (pointers.length === 0) return [];

    const agentMeta = new Map<string, boolean>();
    for (const pointer of pointers) {
      agentMeta.set(pointer.agentId, (agentMeta.get(pointer.agentId) ?? false) || pointer.archived);
    }

    const resolved = new Map<string, CachedAgentTimeline | null>();
    const toFetch: Array<{ agentId: string; archived: boolean }> = [];
    for (const [agentId, archived] of agentMeta.entries()) {
      const hit = this.getFresh(agentId);
      if (hit) resolved.set(agentId, hit);
      else toFetch.push({ agentId, archived });
    }

    await Promise.all(
      toFetch.map(async ({ agentId, archived }) => {
        resolved.set(agentId, await this.fetchAndCacheAgent(paseo, agentId, archived));
      }),
    );

    return pointers.map((pointer) => {
      const cached = resolved.get(pointer.agentId) ?? null;
      const effectivePointer = applyWorkflowMetaFallback(pointer, cached?.workflowMeta);
      const matched = cached ? matchTurnForPointer(pointer, cached) : null;
      if (matched) {
        return buildEntryFromPointer(effectivePointer, channelKind, channelId, {
          command: matched.command,
          reply: matched.reply,
          hydrated: true,
        });
      }
      return buildEntryFromPointer(effectivePointer, channelKind, channelId, {
        command: pointer.commandPreview,
        reply: pointer.replyPreview,
        hydrated: false,
      });
    });
  }
}

export async function hydratePointers(
  paseo: PaseoApi,
  channelKind: ChannelKind,
  channelId: string,
  pointers: readonly FeedPointer[],
  cache?: FeedHydrator,
): Promise<FeedEntry[]> {
  return (cache ?? new FeedHydrator()).hydratePointers(paseo, channelKind, channelId, pointers);
}
