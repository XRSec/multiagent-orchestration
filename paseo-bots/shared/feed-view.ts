/**
 * Purpose: Shared schema, JSONL pointer/channel parsers, cursor helpers, and timeline distiller for Continuous Feed.
 * Context: Bridges paseo-feed single pointer index (index.jsonl) / legacy JSONL logs and live Paseo agent timelines inside paseo-bots.
 * Usage: import { distillTimelineToFeedEntries, feedChannelStorageKey, parseFeedJsonl, parseFeedPointerJsonl } from "./feed-view";
 */

import { z } from "zod";
import { extractToolFootprintDigest, turnVisibleAssistantBody, type TimelineItemLike } from "./activity";
import { parseCompanionIntentEnvelope } from "./companion-intent";
import { isBriefDispatchMessage } from "./protocol-cards";

export const BotFeedChannelKindSchema = z.enum(["bot", "team"]);
export type BotFeedChannelKind = z.infer<typeof BotFeedChannelKindSchema>;

export const BotFeedSourceSchema = z.enum(["dm", "team", "routine", "delegated", "workflow"]);
export type BotFeedSource = z.infer<typeof BotFeedSourceSchema>;

export const BotFeedStatusSchema = z.enum(["completed", "failed"]);
export type BotFeedStatus = z.infer<typeof BotFeedStatusSchema>;

export interface BotFeedWorkflowMeta {
  workflowTaskId?: string;
  workflowId?: string;
  workflowStageId?: string;
  workflowStageName?: string;
}

export const BotFeedEntrySchema = z.object({
  id: z.string(),
  channelKind: BotFeedChannelKindSchema,
  channelId: z.string(),
  botId: z.string(),
  botName: z.string(),
  teamId: z.string().nullable(),
  agentId: z.string(),
  agentTitle: z.string(),
  archived: z.boolean(),
  turnId: z.string().nullable(),
  timestamp: z.string(),
  command: z.string(),
  reply: z.string(),
  status: BotFeedStatusSchema,
  errorMessage: z.string().nullable(),
  toolsCount: z.number(),
  source: BotFeedSourceSchema,
  hydrated: z.boolean().optional(),
  workflowTaskId: z.string().optional(),
  workflowId: z.string().optional(),
  workflowStageId: z.string().optional(),
  workflowStageName: z.string().optional(),
});
export type BotFeedEntry = z.infer<typeof BotFeedEntrySchema>;

export const BotFeedPointerSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  turnId: z.string().nullable(),
  turnIndex: z.number(),
  botId: z.string(),
  botName: z.string(),
  teamIds: z.array(z.string()),
  agentTitle: z.string(),
  archived: z.boolean(),
  timestamp: z.string(),
  status: BotFeedStatusSchema,
  errorMessage: z.string().nullable(),
  toolsCount: z.number(),
  source: BotFeedSourceSchema,
  commandPreview: z.string(),
  replyPreview: z.string(),
  workflowTaskId: z.string().optional(),
  workflowId: z.string().optional(),
  workflowStageId: z.string().optional(),
  workflowStageName: z.string().optional(),
});
export type BotFeedPointer = z.infer<typeof BotFeedPointerSchema>;

export interface FeedTimelineEntryLike {
  turnId?: string | null;
  timestamp?: string | null;
  item: TimelineItemLike;
}

export interface DistillTimelineInput extends BotFeedWorkflowMeta {
  channelKind: BotFeedChannelKind;
  channelId: string;
  botId: string;
  botName: string;
  teamId: string | null;
  agentId: string;
  agentTitle: string;
  archived: boolean;
  source: BotFeedSource;
  entries: readonly FeedTimelineEntryLike[];
  fallbackTimestamp?: string;
}

interface TurnBucket {
  turnId: string | null;
  timestamp: string;
  items: TimelineItemLike[];
}

const VALID_SOURCES = new Set<BotFeedSource>(["dm", "team", "routine", "delegated", "workflow"]);

/** Returns the sanitized filesystem storage key for a feed channel. */
export function feedChannelStorageKey(kind: BotFeedChannelKind, id: string): string {
  return `${kind}__${id.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function pickWorkflowMeta(raw: Record<string, unknown> | BotFeedWorkflowMeta | null | undefined): BotFeedWorkflowMeta {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const workflowTaskId = asNonEmptyString(obj.workflowTaskId);
  const workflowId = asNonEmptyString(obj.workflowId);
  const workflowStageId = asNonEmptyString(obj.workflowStageId);
  const workflowStageName = asNonEmptyString(obj.workflowStageName);
  return {
    ...(workflowTaskId ? { workflowTaskId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(workflowStageId ? { workflowStageId } : {}),
    ...(workflowStageName ? { workflowStageName } : {}),
  };
}

function normalizeFeedRecord(raw: unknown): BotFeedEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = asNonEmptyString(obj.id);
  const channelKind = obj.channelKind === "bot" || obj.channelKind === "team" ? obj.channelKind : null;
  const channelId = asNonEmptyString(obj.channelId);
  const botId = asNonEmptyString(obj.botId);
  const agentId = asNonEmptyString(obj.agentId);
  const turnId = asNonEmptyString(obj.turnId);
  const timestamp = asNonEmptyString(obj.timestamp);
  if (!id || !channelKind || !channelId || !botId || !agentId || !timestamp) return null;

  const botName = asNonEmptyString(obj.botName) ?? botId;
  const teamId = typeof obj.teamId === "string" && obj.teamId.trim() ? obj.teamId : null;
  const agentTitle = asNonEmptyString(obj.agentTitle) ?? "Untitled chat";
  const archived = obj.archived === true;
  const command = typeof obj.command === "string" ? obj.command : "";
  const reply = typeof obj.reply === "string" ? obj.reply : "";
  const status: BotFeedStatus = obj.status === "failed" ? "failed" : "completed";
  const errorMessage = typeof obj.errorMessage === "string" && obj.errorMessage.trim() ? obj.errorMessage : null;
  const rawCount = typeof obj.toolsCount === "number" && Number.isFinite(obj.toolsCount) && obj.toolsCount >= 0 ? Math.floor(obj.toolsCount) : 0;
  const source: BotFeedSource =
    typeof obj.source === "string" && VALID_SOURCES.has(obj.source as BotFeedSource)
      ? (obj.source as BotFeedSource)
      : channelKind === "team"
        ? "team"
        : "dm";

  return {
    id,
    channelKind,
    channelId,
    botId,
    botName,
    teamId,
    agentId,
    agentTitle,
    archived,
    turnId,
    timestamp,
    command,
    reply,
    status,
    errorMessage,
    toolsCount: rawCount,
    source,
    ...pickWorkflowMeta(obj),
  };
}

/** Parses persisted JSONL feed lines, tolerating blank and corrupt lines. */
export function parseFeedJsonl(raw: string): BotFeedEntry[] {
  if (!raw) return [];
  const entries: BotFeedEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const normalized = normalizeFeedRecord(JSON.parse(trimmed));
      if (normalized) entries.push(normalized);
    } catch {
      // Ignore corrupt or partial JSONL lines.
    }
  }
  return entries;
}

function normalizeTeamIds(rawTeamIds: unknown, rawTeamId: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: unknown) => {
    const str = asNonEmptyString(candidate);
    if (str && !seen.has(str)) {
      seen.add(str);
      out.push(str);
    }
  };
  if (Array.isArray(rawTeamIds)) {
    for (const item of rawTeamIds) add(item);
  }
  if (out.length === 0) add(rawTeamId);
  return out;
}

function normalizePointerRecord(raw: unknown): BotFeedPointer | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = asNonEmptyString(obj.id);
  const agentId = asNonEmptyString(obj.agentId);
  const botId = asNonEmptyString(obj.botId);
  const timestamp = asNonEmptyString(obj.timestamp);
  if (!id || !agentId || !botId || !timestamp) return null;

  const turnId = asNonEmptyString(obj.turnId);
  const turnIndex =
    typeof obj.turnIndex === "number" && Number.isFinite(obj.turnIndex) && obj.turnIndex >= 0
      ? Math.floor(obj.turnIndex)
      : 0;
  const botName = asNonEmptyString(obj.botName) ?? botId;
  const teamIds = normalizeTeamIds(obj.teamIds, obj.teamId);
  const agentTitle = asNonEmptyString(obj.agentTitle) ?? "Untitled chat";
  const archived = obj.archived === true;
  const status: BotFeedStatus = obj.status === "failed" ? "failed" : "completed";
  const errorMessage = typeof obj.errorMessage === "string" && obj.errorMessage.trim() ? obj.errorMessage : null;
  const toolsCount =
    typeof obj.toolsCount === "number" && Number.isFinite(obj.toolsCount) && obj.toolsCount >= 0
      ? Math.floor(obj.toolsCount)
      : 0;
  const source: BotFeedSource =
    typeof obj.source === "string" && VALID_SOURCES.has(obj.source as BotFeedSource)
      ? (obj.source as BotFeedSource)
      : "dm";
  const commandPreview =
    typeof obj.commandPreview === "string"
      ? obj.commandPreview
      : typeof obj.command === "string"
        ? obj.command
        : "";
  const replyPreview =
    typeof obj.replyPreview === "string"
      ? obj.replyPreview
      : typeof obj.reply === "string"
        ? obj.reply
        : "";

  return {
    id,
    agentId,
    turnId,
    turnIndex,
    botId,
    botName,
    teamIds,
    agentTitle,
    archived,
    timestamp,
    status,
    errorMessage,
    toolsCount,
    source,
    commandPreview,
    replyPreview,
    ...pickWorkflowMeta(obj),
  };
}

/** Parses persisted index.jsonl pointer records, tolerating blank and corrupt lines. */
export function parseFeedPointerJsonl(raw: string): BotFeedPointer[] {
  if (!raw) return [];
  const pointers: BotFeedPointer[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const normalized = normalizePointerRecord(JSON.parse(trimmed));
      if (normalized) pointers.push(normalized);
    } catch {
      // Ignore corrupt or partial JSONL lines.
    }
  }
  return pointers;
}

/** Formats a stable pagination cursor (`timestamp|id`) for a feed item. */
export function formatFeedCursor(item: { timestamp: string; id: string }): string {
  return `${item.timestamp}|${item.id}`;
}

/** Parses a `timestamp|id` pagination cursor, returning null when invalid. */
export function parseFeedCursor(
  cursor: string | null | undefined,
): { timestamp: string; timestampMs: number; id: string } | null {
  if (typeof cursor !== "string") return null;
  const sep = cursor.indexOf("|");
  if (sep <= 0) return null;
  const timestamp = cursor.slice(0, sep).trim();
  const id = cursor.slice(sep + 1).trim();
  if (!timestamp || !id) return null;
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs)) return null;
  return { timestamp, timestampMs, id };
}

/** Sorts feed pointers or entries chronologically ascending, breaking ties by id. */
export function compareFeedChronological(
  a: { timestamp: string; id: string },
  b: { timestamp: string; id: string },
): number {
  const diff = (Date.parse(a.timestamp) || 0) - (Date.parse(b.timestamp) || 0);
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
}

function resolveTimestamp(candidate: string | null | undefined, fallback: string): string {
  if (candidate && Number.isFinite(Date.parse(candidate))) return candidate;
  return fallback;
}

function groupEntriesIntoTurns(entries: readonly FeedTimelineEntryLike[], fallbackTimestamp: string): TurnBucket[] {
  const buckets: TurnBucket[] = [];
  for (const entry of entries) {
    if (!entry || !entry.item || typeof entry.item.type !== "string") continue;
    const entryTurnId = asNonEmptyString(entry.turnId);
    const ts = resolveTimestamp(entry.timestamp, fallbackTimestamp);
    const current = buckets[buckets.length - 1];
    const startsNew =
      !current ||
      entry.item.type === "user_message" ||
      Boolean(entryTurnId && current.turnId && entryTurnId !== current.turnId);

    if (startsNew) {
      buckets.push({ turnId: entryTurnId, timestamp: ts, items: [entry.item] });
      continue;
    }
    if (!current.turnId && entryTurnId) current.turnId = entryTurnId;
    if ((Date.parse(ts) || 0) >= (Date.parse(current.timestamp) || 0)) {
      current.timestamp = ts;
    }
    current.items.push(entry.item);
  }
  return buckets;
}

function extractTurnError(items: readonly TimelineItemLike[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.type !== "error") continue;
    const msg =
      asNonEmptyString(item.text) ??
      asNonEmptyString(item.error) ??
      asNonEmptyString((item as Record<string, unknown>).message);
    return msg ?? "Turn failed";
  }
  return null;
}

/** Distills raw Paseo timeline items into clean Continuous Feed entries per turn. */
export function distillTimelineToFeedEntries(input: DistillTimelineInput): BotFeedEntry[] {
  const fallback = resolveTimestamp(input.fallbackTimestamp, new Date(0).toISOString());
  const buckets = groupEntriesIntoTurns(input.entries, fallback);
  const out: BotFeedEntry[] = [];

  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i]!;
    const userItem = bucket.items.find((item) => item.type === "user_message");
    const rawUserText = userItem ? String(userItem.text ?? "") : "";
    const command = (parseCompanionIntentEnvelope(rawUserText)?.rawUserText ?? rawUserText).trim();
    const reply = turnVisibleAssistantBody(bucket.items).trim();
    const footprint = extractToolFootprintDigest(bucket.items);

    const toolCallCount = bucket.items.filter((item) => item.type === "tool_call").length;
    const toolsCount =
      toolCallCount > 0
        ? toolCallCount
        : footprint.mutatedFiles.length + footprint.inspectedFiles.length + footprint.commandOutcomes.length;

    const explicitError = extractTurnError(bucket.items);
    let status: BotFeedStatus = "completed";
    let errorMessage: string | null = null;
    if (explicitError) {
      status = "failed";
      errorMessage = explicitError || footprint.errorHeadlines[0] || "Turn failed";
    } else if (!reply && footprint.errorHeadlines.length > 0) {
      status = "failed";
      errorMessage = footprint.errorHeadlines[0]!;
    }

    if (!command && !reply && status !== "failed") continue;

    const turnId = bucket.turnId;
    const id = turnId
      ? `${input.channelKind}:${input.channelId}:${input.agentId}:turn:${turnId}`
      : `${input.channelKind}:${input.channelId}:${input.agentId}:idx:${i}`;
    const source: BotFeedSource =
      input.source !== "routine" && input.source !== "workflow" && command && isBriefDispatchMessage(command)
        ? "delegated"
        : input.source;

    const baseMeta = pickWorkflowMeta(input);
    const workflowMeta: BotFeedWorkflowMeta = { ...baseMeta };
    if (source === "workflow" && command) {
      if (!workflowMeta.workflowStageId) {
        const stageIdMatch = /^[ \t]*-\s*STAGE_ID:\s*(.+)$/im.exec(command);
        const extracted = asNonEmptyString(stageIdMatch?.[1]);
        if (extracted) workflowMeta.workflowStageId = extracted;
      }
      if (!workflowMeta.workflowStageName) {
        const stageNameMatch = /^[ \t]*-\s*STAGE_NAME:\s*(.+)$/im.exec(command);
        const extracted = asNonEmptyString(stageNameMatch?.[1]);
        if (extracted) workflowMeta.workflowStageName = extracted;
      }
    }

    out.push({
      id,
      channelKind: input.channelKind,
      channelId: input.channelId,
      botId: input.botId,
      botName: input.botName || input.botId,
      teamId: input.teamId,
      agentId: input.agentId,
      agentTitle: input.agentTitle.trim() || "Untitled chat",
      archived: input.archived,
      turnId,
      timestamp: bucket.timestamp,
      command,
      reply,
      status,
      errorMessage,
      toolsCount,
      source,
      ...workflowMeta,
    });
  }

  return out;
}
