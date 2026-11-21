/**
 * Purpose: Single-file JSONL pointer index ledger with cursor-based pagination.
 * Context: Stores one lightweight FeedPointer per turn in index.jsonl without per-channel copies.
 * Usage: upsertPointers, readChannelPointers, readAllPointers, markAgentArchived, getChannelSummary, migrateLegacyChannelsToIndex.
 * Prerequisites: Node fs/path/os and shared FeedPointerSchema contract.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FeedEntrySchema,
  FeedPointerSchema,
  type ChannelKind,
  type FeedEntry,
  type FeedPointer,
} from "../shared/protocol.ts";
import { previewSnippet } from "./extractor.ts";

export const LEGACY_CHANNELS_MIGRATION_MARKER = ".legacy-channels-migrated-v1";

export interface UpsertPointersOptions {
  preserveExisting?: boolean;
}

export interface LegacyMigrationResult {
  migratedCount: number;
  scannedFiles: number;
  skipped: boolean;
}

export interface ReadChannelPointersOptions {
  limit?: number;
  beforeCursor?: string;
  humanOnly?: boolean;
}

export interface ReadChannelPointersResult {
  pointers: FeedPointer[];
  hasOlder: boolean;
  nextCursor: string | null;
  totalPointers: number;
}

export function resolveFeedDataDir(dataDir?: string): string {
  return (
    dataDir ||
    process.env.PASEO_FEED_DATA_DIR ||
    path.join(os.homedir(), ".paseo", "plugin-data", "paseo-feed")
  );
}

export function indexFilePath(dataDir?: string): string {
  return path.join(resolveFeedDataDir(dataDir), "index.jsonl");
}

export function encodePointerCursor(pointer: Pick<FeedPointer, "timestamp" | "id">): string {
  return `${pointer.timestamp}|${pointer.id}`;
}

export function decodePointerCursor(cursor?: string): { timestamp: string; id: string } | null {
  if (!cursor) return null;
  const sep = cursor.indexOf("|");
  if (sep <= 0 || sep === cursor.length - 1) return null;
  return { timestamp: cursor.slice(0, sep), id: cursor.slice(sep + 1) };
}

export function compareCursorKeys(aTs: string, aId: string, bTs: string, bId: string): number {
  const diff = (Date.parse(aTs) || 0) - (Date.parse(bTs) || 0);
  if (diff !== 0) return diff;
  if (aTs !== bTs) return aTs < bTs ? -1 : 1;
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

function sortPointers(pointers: Iterable<FeedPointer>): FeedPointer[] {
  return [...pointers].sort((a, b) => compareCursorKeys(a.timestamp, a.id, b.timestamp, b.id));
}

function unionTeamIds(a: readonly string[], b: readonly string[]): string[] {
  return Array.from(new Set([...a, ...b].map((id) => id.trim()).filter(Boolean)));
}

function normalizePointer(pointer: FeedPointer): FeedPointer {
  const teamIds = unionTeamIds(pointer.teamIds, []);
  if (
    teamIds.length === pointer.teamIds.length &&
    teamIds.every((id, idx) => id === pointer.teamIds[idx])
  ) {
    return pointer;
  }
  return { ...pointer, teamIds };
}

function pointerMatchesChannel(pointer: FeedPointer, kind: ChannelKind, id: string): boolean {
  return kind === "bot" ? pointer.botId === id : pointer.teamIds.includes(id);
}

function readPointersMap(filePath: string): Map<string, FeedPointer> {
  const map = new Map<string, FeedPointer>();
  if (!fs.existsSync(filePath)) return map;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = FeedPointerSchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) map.set(parsed.data.id, normalizePointer(parsed.data));
    } catch {
      // Skip corrupted JSONL line safely
    }
  }
  return map;
}

function writeAtomicFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmpPath, content, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function writeAtomicJsonl(filePath: string, pointers: Iterable<FeedPointer>): void {
  const sorted = sortPointers(pointers);
  const payload = sorted.map((pointer) => JSON.stringify(pointer)).join("\n") + (sorted.length ? "\n" : "");
  writeAtomicFile(filePath, payload);
}

function pickWorkflowFields(
  primary: Partial<FeedPointer>,
  fallback?: Partial<FeedPointer>,
): Pick<FeedPointer, "workflowTaskId" | "workflowId" | "workflowStageId" | "workflowStageName"> {
  const workflowTaskId = primary.workflowTaskId?.trim() || fallback?.workflowTaskId?.trim();
  const workflowId = primary.workflowId?.trim() || fallback?.workflowId?.trim();
  const workflowStageId = primary.workflowStageId?.trim() || fallback?.workflowStageId?.trim();
  const workflowStageName = primary.workflowStageName?.trim() || fallback?.workflowStageName?.trim();
  return {
    ...(workflowTaskId ? { workflowTaskId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(workflowStageId ? { workflowStageId } : {}),
    ...(workflowStageName ? { workflowStageName } : {}),
  };
}

function mergePointerWithExisting(
  prev: FeedPointer,
  incoming: FeedPointer,
  preserveExisting: boolean,
): FeedPointer {
  const teamIds = unionTeamIds(prev.teamIds, incoming.teamIds);
  if (preserveExisting) {
    const workflow = pickWorkflowFields(prev, incoming);
    const sameTeams = teamIds.length === prev.teamIds.length && teamIds.every((id, idx) => id === prev.teamIds[idx]);
    const sameWorkflow =
      workflow.workflowTaskId === prev.workflowTaskId &&
      workflow.workflowId === prev.workflowId &&
      workflow.workflowStageId === prev.workflowStageId &&
      workflow.workflowStageName === prev.workflowStageName;
    if (sameTeams && sameWorkflow) return prev;
    return { ...prev, teamIds, ...workflow };
  }
  return {
    ...incoming,
    ...pickWorkflowFields(incoming, prev),
    teamIds,
    archived: prev.archived || incoming.archived,
    commandPreview: incoming.commandPreview || prev.commandPreview,
    replyPreview: incoming.replyPreview || prev.replyPreview,
  };
}

export function readAllPointers(dataDir?: string): FeedPointer[] {
  return sortPointers(readPointersMap(indexFilePath(dataDir)).values());
}

export function upsertPointers(
  pointers: readonly FeedPointer[],
  dataDir?: string,
  options?: UpsertPointersOptions,
): { added: number; updated: number; addedPointers: FeedPointer[] } {
  if (pointers.length === 0) return { added: 0, updated: 0, addedPointers: [] };
  const filePath = indexFilePath(dataDir);
  const map = readPointersMap(filePath);
  const preserveExisting = Boolean(options?.preserveExisting);
  let added = 0;
  let updated = 0;
  let dirty = false;
  const addedPointers: FeedPointer[] = [];

  for (const raw of pointers) {
    const item = normalizePointer(raw);
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      added += 1;
      addedPointers.push(item);
      dirty = true;
    } else {
      const merged = mergePointerWithExisting(prev, item, preserveExisting);
      if (JSON.stringify(prev) !== JSON.stringify(merged)) {
        map.set(item.id, merged);
        updated += 1;
        dirty = true;
      }
    }
  }

  if (dirty) writeAtomicJsonl(filePath, map.values());
  return { added, updated, addedPointers };
}

export function readChannelPointers(
  kind: ChannelKind,
  id: string,
  options?: ReadChannelPointersOptions,
  dataDir?: string,
): ReadChannelPointersResult {
  const all = readAllPointers(dataDir);
  let matched = all.filter((pointer) => pointerMatchesChannel(pointer, kind, id));
  if (options?.humanOnly) {
    matched = matched.filter((pointer) => pointer.source === "dm" || pointer.source === "team");
  }
  const totalPointers = matched.length;

  const cursor = decodePointerCursor(options?.beforeCursor);
  const windowed = cursor
    ? matched.filter((p) => compareCursorKeys(p.timestamp, p.id, cursor.timestamp, cursor.id) < 0)
    : matched;

  const limit =
    typeof options?.limit === "number" && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : 20;
  const startIdx = Math.max(0, windowed.length - limit);
  const pointers = windowed.slice(startIdx);
  const hasOlder = startIdx > 0;
  const nextCursor = hasOlder && pointers.length > 0 ? encodePointerCursor(pointers[0]!) : null;
  return { pointers, hasOlder, nextCursor, totalPointers };
}

export function markAgentArchived(agentId: string, dataDir?: string): number {
  const filePath = indexFilePath(dataDir);
  if (!fs.existsSync(filePath)) return 0;
  const map = readPointersMap(filePath);
  let updatedCount = 0;
  for (const [id, pointer] of map.entries()) {
    if (pointer.agentId === agentId && !pointer.archived) {
      map.set(id, { ...pointer, archived: true });
      updatedCount += 1;
    }
  }
  if (updatedCount > 0) writeAtomicJsonl(filePath, map.values());
  return updatedCount;
}

export function summarizeChannelPointers(
  allPointers: readonly FeedPointer[],
  kind: ChannelKind,
  id: string,
): { entryCount: number; lastActivityAt: string | null; lastPreview: string } {
  const matched = allPointers.filter((pointer) => pointerMatchesChannel(pointer, kind, id));
  if (matched.length === 0) {
    return { entryCount: 0, lastActivityAt: null, lastPreview: "" };
  }
  const last = matched[matched.length - 1]!;
  const rawPreview = last.replyPreview || last.commandPreview || last.errorMessage || "";
  return {
    entryCount: matched.length,
    lastActivityAt: last.timestamp,
    lastPreview: rawPreview.replace(/\s+/g, " ").trim().slice(0, 160),
  };
}

export function getChannelSummary(
  kind: ChannelKind,
  id: string,
  dataDir?: string,
): { entryCount: number; lastActivityAt: string | null; lastPreview: string } {
  return summarizeChannelPointers(readAllPointers(dataDir), kind, id);
}

function legacyEntryToPointer(entry: FeedEntry, rawRecord: Record<string, unknown>): FeedPointer {
  const rawTurnIndex = rawRecord.turnIndex;
  const turnIndex =
    typeof rawTurnIndex === "number" && Number.isFinite(rawTurnIndex) && rawTurnIndex >= 0
      ? Math.floor(rawTurnIndex)
      : 0;
  const teamIds = unionTeamIds(
    entry.teamId ? [entry.teamId] : [],
    entry.channelKind === "team" && entry.channelId ? [entry.channelId] : [],
  );
  return {
    id: entry.id,
    agentId: entry.agentId,
    turnId: entry.turnId,
    turnIndex,
    botId: entry.botId,
    botName: entry.botName,
    teamIds,
    agentTitle: entry.agentTitle,
    archived: entry.archived,
    timestamp: entry.timestamp,
    status: entry.status,
    errorMessage: entry.errorMessage,
    toolsCount: entry.toolsCount,
    source: entry.source,
    ...pickWorkflowFields(entry),
    commandPreview: previewSnippet(entry.command, 120),
    replyPreview: previewSnippet(entry.reply, 120),
  };
}

function mergeLegacyPointer(prev: FeedPointer, next: FeedPointer): FeedPointer {
  return {
    id: prev.id,
    agentId: prev.agentId || next.agentId,
    turnId: prev.turnId ?? next.turnId,
    turnIndex: Math.max(prev.turnIndex, next.turnIndex),
    botId: prev.botId || next.botId,
    botName: prev.botName || next.botName,
    teamIds: unionTeamIds(prev.teamIds, next.teamIds),
    agentTitle: prev.agentTitle || next.agentTitle,
    archived: prev.archived || next.archived,
    timestamp: prev.timestamp || next.timestamp,
    status: prev.status === "failed" || next.status === "failed" ? "failed" : prev.status || next.status,
    errorMessage: prev.errorMessage || next.errorMessage,
    toolsCount: Math.max(prev.toolsCount, next.toolsCount),
    source: prev.source || next.source,
    ...pickWorkflowFields(prev, next),
    commandPreview: prev.commandPreview || next.commandPreview,
    replyPreview: prev.replyPreview || next.replyPreview,
  };
}

function scanLegacyChannelFile(filePath: string, legacyById: Map<string, FeedPointer>): void {
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const raw = JSON.parse(trimmed) as unknown;
      if (!raw || typeof raw !== "object") continue;
      const parsed = FeedEntrySchema.safeParse(raw);
      if (!parsed.success) continue;
      const pointer = legacyEntryToPointer(parsed.data, raw as Record<string, unknown>);
      const prev = legacyById.get(pointer.id);
      legacyById.set(pointer.id, prev ? mergeLegacyPointer(prev, pointer) : pointer);
    } catch {
      // Skip corrupted legacy JSONL line safely
    }
  }
}

export function migrateLegacyChannelsToIndex(dataDir?: string): LegacyMigrationResult {
  const dir = resolveFeedDataDir(dataDir);
  const markerPath = path.join(dir, LEGACY_CHANNELS_MIGRATION_MARKER);
  if (fs.existsSync(markerPath)) {
    return { migratedCount: 0, scannedFiles: 0, skipped: true };
  }
  const channelsDir = path.join(dir, "channels");
  if (!fs.existsSync(channelsDir) || !fs.statSync(channelsDir).isDirectory()) {
    return { migratedCount: 0, scannedFiles: 0, skipped: false };
  }
  const files = fs
    .readdirSync(channelsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const legacyById = new Map<string, FeedPointer>();
  let scannedFiles = 0;
  for (const fileName of files) {
    scanLegacyChannelFile(path.join(channelsDir, fileName), legacyById);
    scannedFiles += 1;
  }

  const saved = upsertPointers([...legacyById.values()], dir, { preserveExisting: true });
  const migratedCount = saved.added + saved.updated;
  const markerPayload = `${JSON.stringify(
    { migratedAt: new Date().toISOString(), scannedFiles, migratedCount },
    null,
    2,
  )}\n`;
  writeAtomicFile(markerPath, markerPayload);
  return { migratedCount, scannedFiles, skipped: false };
}
