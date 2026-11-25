/**
 * Purpose: Pure UI state, filtering, pagination, formatting, and navigation helpers for paseo-feed.
 * Context: Shared by Sidebar, ChannelList, FeedMessageCard, FeedScreen, and Node unit tests.
 * Usage: Import pure functions and types; contains zero runtime React/RN/SDK dependencies.
 */

import type { ChannelKind, FeedChannel, FeedEntry } from "../shared/protocol.ts";

export type ChannelCategory = "all" | "assistant" | "bots" | "teams";

export type HydratableFeedEntry = FeedEntry & { hydrated?: boolean };

export interface PartitionedChannels {
  globalAssistant: FeedChannel | null;
  pinnedBots: FeedChannel[];
  otherBots: FeedChannel[];
  teams: FeedChannel[];
  totalMatched: number;
}

export interface SidebarActivitySummary {
  hasActive: boolean;
  activeChannelCount: number;
  totalEntryCount: number;
}

export interface FeedPaginationState {
  hasOlder: boolean;
  nextCursor: string | null;
  totalPointers: number;
  loadingOlder: boolean;
}

export interface FeedEntriesPagePayload {
  entries: readonly FeedEntry[];
  hasOlder?: boolean;
  nextCursor?: string | null;
  totalPointers?: number;
}

export interface TaskJumpTarget {
  agentId: string;
  serverId?: string;
}

export interface FeedComposerSendResult {
  ok: boolean;
  agentId?: string | null;
  reason: "sent" | "created" | "no_active_chat" | "channel_not_found" | "error";
  message?: string;
  error?: string;
  lastArchivedAgentId?: string | null;
}

export interface ComposerNoticeState {
  message: string;
  tone: "success" | "warning" | "error";
  actionAgentId?: string | null;
  actionLabel?: string;
}

function parseTimestampMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Compares two feed entries in ascending chronological order with deterministic id tie-breaker. */
export function compareEntriesChronologically(a: FeedEntry, b: FeedEntry): number {
  const aMs = parseTimestampMs(a.timestamp) ?? 0;
  const bMs = parseTimestampMs(b.timestamp) ?? 0;
  if (aMs !== bMs) return aMs - bMs;
  return a.id.localeCompare(b.id);
}

/** Identifies the primary Global Assistant channel, falling back to bot-chief if flag is omitted. */
export function isGlobalAssistantChannel(channel: FeedChannel): boolean {
  if (channel.kind !== "bot") return false;
  if (channel.isGlobalAssistant === true) return true;
  return channel.isGlobalAssistant === undefined && channel.id === "bot-chief";
}

/** Sorts channels by latest activity, active chat presence, entry count, then name. */
export function compareChannelsByActivity(a: FeedChannel, b: FeedChannel): number {
  const aMs = parseTimestampMs(a.lastActivityAt);
  const bMs = parseTimestampMs(b.lastActivityAt);
  if (aMs !== null && bMs !== null && aMs !== bMs) return bMs - aMs;
  if (aMs !== null && bMs === null) return -1;
  if (aMs === null && bMs !== null) return 1;

  const aActive = a.activeAgentId !== null ? 1 : 0;
  const bActive = b.activeAgentId !== null ? 1 : 0;
  if (aActive !== bActive) return bActive - aActive;

  if (a.entryCount !== b.entryCount) return b.entryCount - a.entryCount;
  return a.name.localeCompare(b.name);
}

function matchesChannelQuery(channel: FeedChannel, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const haystack = [channel.name, channel.subtitle, channel.id, channel.lastPreview]
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

/** Partitions channels into global assistant, pinned/other bots, and teams with search filtering. */
export function partitionChannels(
  channels: readonly FeedChannel[],
  query = "",
): PartitionedChannels {
  const normalizedQuery = query.trim().toLowerCase();
  let globalAssistant: FeedChannel | null = null;
  const pinnedBots: FeedChannel[] = [];
  const otherBots: FeedChannel[] = [];
  const teams: FeedChannel[] = [];

  for (const ch of channels) {
    if (!matchesChannelQuery(ch, normalizedQuery)) continue;
    if (ch.kind === "team") {
      teams.push(ch);
      continue;
    }
    if (ch.isGlobalAssistant === true && globalAssistant === null) {
      globalAssistant = ch;
      continue;
    }
    if (ch.pinned) {
      pinnedBots.push(ch);
    } else {
      otherBots.push(ch);
    }
  }

  pinnedBots.sort(compareChannelsByActivity);
  otherBots.sort(compareChannelsByActivity);
  teams.sort(compareChannelsByActivity);

  const totalMatched =
    (globalAssistant ? 1 : 0) + pinnedBots.length + otherBots.length + teams.length;
  return { globalAssistant, pinnedBots, otherBots, teams, totalMatched };
}

/** Filters channels by category tab and search query, keeping global assistant pinned first. */
export function filterChannelsByCategory(
  channels: readonly FeedChannel[],
  category: ChannelCategory,
  query = "",
): FeedChannel[] {
  const partitioned = partitionChannels(channels, query);
  const allBots = [...partitioned.pinnedBots, ...partitioned.otherBots];
  const assistant =
    partitioned.globalAssistant ?? allBots.find((ch) => isGlobalAssistantChannel(ch)) ?? null;
  const nonAssistantBots = assistant ? allBots.filter((ch) => ch !== assistant) : allBots;

  switch (category) {
    case "all":
      return [...(assistant ? [assistant] : []), ...nonAssistantBots, ...partitioned.teams];
    case "assistant":
      return assistant ? [assistant] : [];
    case "bots":
      return nonAssistantBots;
    case "teams":
      return [...partitioned.teams];
  }
}

/** Aggregates active chat state and total entry count across non-archived channels. */
export function summarizeSidebarActivity(
  channels: readonly FeedChannel[],
): SidebarActivitySummary {
  let activeChannelCount = 0;
  let totalEntryCount = 0;
  for (const ch of channels) {
    if (ch.archived) continue;
    if (ch.activeAgentId !== null) activeChannelCount += 1;
    totalEntryCount += Math.max(0, ch.entryCount);
  }
  return {
    hasActive: activeChannelCount > 0,
    activeChannelCount,
    totalEntryCount,
  };
}

/** Selects top non-archived channels for the Paseo native sidebar in priority order. */
export function selectSidebarChannels(
  channels: readonly FeedChannel[],
  maxItems = 8,
): FeedChannel[] {
  if (maxItems <= 0) return [];
  const visible = channels.filter((ch) => !ch.archived);
  const grouped = partitionChannels(visible);
  const ordered: FeedChannel[] = [
    ...(grouped.globalAssistant ? [grouped.globalAssistant] : []),
    ...grouped.pinnedBots,
    ...grouped.teams,
    ...grouped.otherBots,
  ];
  return ordered.slice(0, maxItems);
}

/** Filters feed entries to user-facing DM/team turns when humanOnly is enabled. */
export function filterFeedEntries(
  entries: readonly FeedEntry[],
  humanOnly: boolean,
): FeedEntry[] {
  if (!humanOnly) return entries.slice();
  return entries.filter((entry) => entry.source === "dm" || entry.source === "team");
}

/** Formats an ISO timestamp into "刚刚", "HH:mm" (today), or "MM-DD HH:mm". */
export function formatRelativeTimestamp(
  iso: string | null | undefined,
  nowMs = Date.now(),
): string {
  const ts = parseTimestampMs(iso);
  if (ts === null) return "";

  const diffMs = nowMs - ts;
  if (diffMs > -5_000 && diffMs < 60_000) return "刚刚";

  const target = new Date(ts);
  const now = new Date(nowMs);
  const sameDay =
    target.getFullYear() === now.getFullYear() &&
    target.getMonth() === now.getMonth() &&
    target.getDate() === now.getDate();

  const timePart = `${pad2(target.getHours())}:${pad2(target.getMinutes())}`;
  if (sameDay) return timePart;
  return `${pad2(target.getMonth() + 1)}-${pad2(target.getDate())} ${timePart}`;
}

/** Builds navigation payload for jumping from a feed card to the real Paseo agent chat. */
export function resolveTaskJumpTarget(
  entry: Pick<FeedEntry, "agentId">,
  hostId?: string,
): TaskJumpTarget {
  const trimmedHost = hostId?.trim();
  if (trimmedHost) {
    return { agentId: entry.agentId, serverId: trimmedHost };
  }
  return { agentId: entry.agentId };
}

/** Collapses whitespace and truncates preview text cleanly with an ellipsis. */
export function truncatePreview(text: string, max = 72): string {
  if (max <= 0) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  if (max === 1) return "…";
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

/** Upserts a feed entry by id and keeps chronological ascending timestamp order. */
export function mergeFeedEntry(
  entries: readonly FeedEntry[],
  incoming: FeedEntry,
): FeedEntry[] {
  const next = entries.filter((item) => item.id !== incoming.id);
  next.push(incoming);
  next.sort(compareEntriesChronologically);
  return next;
}

/** Prepends older history entries, deduplicating by id (keeping fresher existing copies). */
export function prependOlderEntries(
  existing: readonly FeedEntry[],
  older: readonly FeedEntry[],
): FeedEntry[] {
  if (older.length === 0) return existing.slice();
  const byId = new Map<string, FeedEntry>();
  for (const item of older) byId.set(item.id, item);
  for (const item of existing) byId.set(item.id, item);
  return Array.from(byId.values()).sort(compareEntriesChronologically);
}

/** Creates an empty cursor pagination state before the initial page loads. */
export function createInitialPaginationState(): FeedPaginationState {
  return {
    hasOlder: false,
    nextCursor: null,
    totalPointers: 0,
    loadingOlder: false,
  };
}

/** Normalizes RPC pagination metadata into client cursor state. */
export function resolvePaginationFromPage(
  page: FeedEntriesPagePayload,
  fallbackTotal?: number,
): FeedPaginationState {
  const nextCursor = page.nextCursor ?? null;
  const hasOlder = Boolean(page.hasOlder && nextCursor !== null);
  const totalPointers =
    typeof page.totalPointers === "number"
      ? page.totalPointers
      : (fallbackTotal ?? page.entries.length);
  return {
    hasOlder,
    nextCursor,
    totalPointers,
    loadingOlder: false,
  };
}

/** Returns true when upward scroll reaches threshold and another older page can be fetched. */
export function shouldTriggerLoadOlder(
  state: Pick<FeedPaginationState, "hasOlder" | "nextCursor" | "loadingOlder">,
  scrollOffsetY: number,
  thresholdPx = 60,
): boolean {
  return (
    state.hasOlder &&
    state.nextCursor !== null &&
    !state.loadingOlder &&
    scrollOffsetY < thresholdPx
  );
}

/** Checks whether merging an incoming entry appended a brand-new item at the bottom. */
export function isEntryAppendedAtBottom(
  prevEntries: readonly FeedEntry[],
  nextEntries: readonly FeedEntry[],
  incomingId: string,
): boolean {
  if (nextEntries.length === 0) return false;
  const existedBefore = prevEntries.some((entry) => entry.id === incomingId);
  if (existedBefore) return false;
  return nextEntries[nextEntries.length - 1]?.id === incomingId;
}

/** Returns true only when an entry explicitly marks its source timeline as unhydrated preview. */
export function isPreviewOnlyEntry(entry: HydratableFeedEntry): boolean {
  return entry.hydrated === false;
}

/** Marks all loaded entries belonging to an archived agent session as archived. */
export function markAgentArchived(
  entries: readonly FeedEntry[],
  agentId: string,
): FeedEntry[] {
  if (!agentId) return entries.slice();
  return entries.map((entry) =>
    entry.agentId === agentId && !entry.archived ? { ...entry, archived: true } : entry,
  );
}

/** Resolves the initial channel from route params or falls back to the top priority channel. */
export function resolveInitialChannel(
  channels: readonly FeedChannel[],
  params: { channelKind?: ChannelKind | string; channelId?: string },
): FeedChannel | null {
  if (channels.length === 0) return null;
  if (params.channelId) {
    const exact = channels.find(
      (ch) =>
        ch.id === params.channelId &&
        (!params.channelKind || ch.kind === params.channelKind),
    );
    if (exact) return exact;
    const byId = channels.find((ch) => ch.id === params.channelId);
    if (byId) return byId;
  }
  const partitioned = partitionChannels(channels);
  if (partitioned.globalAssistant) return partitioned.globalAssistant;
  const chiefFallback = channels.find((ch) => isGlobalAssistantChannel(ch));
  if (chiefFallback) return chiefFallback;
  return selectSidebarChannels(channels, 1)[0] ?? channels[0] ?? null;
}

/** Returns a single uppercase avatar glyph from a channel or bot display name. */
export function channelInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "#";
}

/** Resolves compact display label for a workflow stage pill when present. */
export function resolveWorkflowStageLabel(
  entry: Pick<FeedEntry, "workflowStageName" | "workflowStageId">,
): string | null {
  const name = entry.workflowStageName?.trim();
  if (name) return name;
  const id = entry.workflowStageId?.trim();
  return id || null;
}

/** Resolves the target agentId for the header chat jump button in priority order. */
export function resolveHeaderChatAgentId(
  channel: Pick<FeedChannel, "activeAgentId"> | null,
  entries: readonly Pick<FeedEntry, "agentId">[],
  createdAgentId?: string | null,
): string | null {
  const created = createdAgentId?.trim();
  if (created) return created;
  const active = channel?.activeAgentId?.trim();
  if (active) return active;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entryAgentId = entries[i]?.agentId?.trim();
    if (entryAgentId) return entryAgentId;
  }
  return null;
}

export const NEAR_BOTTOM_THRESHOLD_PX = 64;
export const SCROLL_PIN_COOLDOWN_MS = 150;
export const WEB_KEYBOARD_MIN_HEIGHT_PX = 80;

export type ImeLikeEvent =
  | {
      isComposing?: boolean;
      keyCode?: number;
      nativeEvent?: unknown;
    }
  | object
  | null
  | undefined;

/** Returns true while an IME composition session is active (incl. WebKit keyCode 229). */
export function isImeComposing(event: ImeLikeEvent): boolean {
  if (!event || typeof event !== "object") return false;
  const target = ((event as { nativeEvent?: unknown }).nativeEvent ?? event) as {
    isComposing?: boolean;
    keyCode?: number;
  };
  return Boolean(target?.isComposing) || target?.keyCode === 229;
}

/** Computes virtual-keyboard occlusion height from window.visualViewport metrics. */
export function computeVisualViewportKeyboardHeight(
  innerHeight: number,
  vvHeight: number,
  vvOffsetTop = 0,
  minHeight = WEB_KEYBOARD_MIN_HEIGHT_PX,
): number {
  if (!Number.isFinite(innerHeight) || !Number.isFinite(vvHeight)) return 0;
  const offset = Number.isFinite(vvOffsetTop) ? Math.max(0, vvOffsetTop) : 0;
  const occluded = innerHeight - (vvHeight + offset);
  return occluded > minHeight ? occluded : 0;
}

/** Resolves FlatList keyboardDismissMode; web uses "none" so programmatic scroll never blurs input. */
export function resolveKeyboardDismissMode(platform: string): "none" | "interactive" | "on-drag" {
  if (platform === "web") return "none";
  return platform === "ios" ? "interactive" : "on-drag";
}

/** Resolves root container bottom padding from active keyboard height or home-indicator inset. */
export function resolveContainerBottomPadding(keyboardHeight: number, bottomInset: number): number {
  return keyboardHeight > 0 ? keyboardHeight : Math.max(0, bottomInset);
}

/** Returns true when scroll position is within threshold of the bottom edge. */
export function isNearBottom(
  contentOffsetY: number,
  contentHeight: number,
  viewportHeight: number,
  thresholdPx = NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  if (contentHeight <= viewportHeight) return true;
  return contentHeight - (contentOffsetY + viewportHeight) <= thresholdPx;
}

/** Returns true after the post-user-scroll cooldown expires so layout growth can re-pin. */
export function canPinScrollToEnd(
  lastUserScrollAt: number,
  now = Date.now(),
  cooldownMs = SCROLL_PIN_COOLDOWN_MS,
): boolean {
  return lastUserScrollAt === 0 || now - lastUserScrollAt >= cooldownMs;
}

/** Computes restored scroll offset after older entries are prepended above the viewport. */
export function computePrependRestoreOffset(
  prevScrollY: number,
  prevContentHeight: number,
  nextContentHeight: number,
): number | null {
  if (prevContentHeight <= 0 || nextContentHeight <= prevContentHeight) return null;
  return Math.max(0, prevScrollY + (nextContentHeight - prevContentHeight));
}

/** Guards auto-loading older pages against initial bottom-follow and short viewports. */
export function shouldAutoLoadOlder(opts: {
  initialFollow: boolean;
  pagination: Pick<FeedPaginationState, "hasOlder" | "nextCursor" | "loadingOlder">;
  scrollOffsetY: number;
  contentHeight: number;
  viewportHeight: number;
  thresholdPx?: number;
}): boolean {
  if (opts.initialFollow) return false;
  if (opts.contentHeight <= opts.viewportHeight) return false;
  return shouldTriggerLoadOlder(opts.pagination, opts.scrollOffsetY, opts.thresholdPx);
}

/** Maps a feed.send response into a UI notice banner state, or null when silent. */
export function resolveComposerNotice(
  result: FeedComposerSendResult,
): ComposerNoticeState | null {
  if (result.ok) {
    if (result.reason === "created") {
      const agentId = result.agentId?.trim() || null;
      return {
        message: result.message || "已自动创建新会话并发送",
        tone: "success",
        actionAgentId: agentId,
        ...(agentId ? { actionLabel: "打开会话 ↗" } : {}),
      };
    }
    return null;
  }
  if (result.reason === "no_active_chat") {
    const archivedId = result.lastArchivedAgentId?.trim() || null;
    return {
      message: result.message || "当前频道暂无活跃会话，无法直接投递指令。",
      tone: "warning",
      actionAgentId: archivedId,
      ...(archivedId ? { actionLabel: "查看最近任务 ↗" } : {}),
    };
  }
  return {
    message: result.message || result.error || "发送失败，请稍后重试。",
    tone: "error",
  };
}
