/**
 * Purpose: Pure functions for distilling Paseo timelines into TurnDescriptor, FeedPointer, and FeedEntry records.
 * Context: Strips companion intent wrappers, thinking blocks, and verbose handoff noise across sync and hydration.
 * Usage: unwrapCompanionCommand, distillVisibleReply, previewSnippet, extractTurnsFromTimeline, buildPointerFromTurn, buildEntryFromPointer.
 * Prerequisites: ../shared/protocol.ts contracts.
 */

import crypto from "node:crypto";
import {
  ASKED_BY_LABEL,
  MEMORY_CURATION_LABEL,
  ROUTINE_LABEL,
  SESSION_ROLE_LABEL,
  SHADOW_SESSION_LABEL,
  TEAM_SESSION_LABEL,
  WORKFLOW_STAGE_LABEL,
  WORKFLOW_TASK_LABEL,
  type ChannelKind,
  type FeedEntry,
  type FeedPointer,
  type FeedSource,
} from "../shared/protocol.ts";

export interface TimelineEntryLike {
  timestamp?: string | number | null;
  turnId?: string | null;
  type?: unknown;
  text?: unknown;
  message?: unknown;
  error?: unknown;
  item?: Record<string, unknown>;
}

export interface ExtractTurnsOptions {
  targetTurnId?: string | null;
  turnOutcome?: { kind: "completed" | "failed" | "canceled"; errorMessage?: string | null };
  fallbackTimestamp?: string;
}

export interface TurnDescriptor {
  turnId: string | null;
  turnIndex: number;
  command: string;
  reply: string;
  commandPreview: string;
  replyPreview: string;
  timestamp: string;
  status: "completed" | "failed";
  errorMessage: string | null;
  toolsCount: number;
}

export interface WorkflowMeta {
  workflowTaskId?: string;
  workflowId?: string;
  workflowStageId?: string;
  workflowStageName?: string;
}

export interface BuildPointerMeta extends WorkflowMeta {
  agentId: string;
  botId: string;
  botName: string;
  teamIds: readonly string[];
  agentTitle: string;
  archived: boolean;
  source: FeedSource;
}

interface RawTurn {
  turnId: string | null;
  command: string;
  replyParts: string[];
  toolsCount: number;
  status: "completed" | "failed";
  errorMessage: string | null;
  timestamp: string | null;
}

const COMPANION_TAG_RE = /<companion_intent\b[^>]*>([\s\S]*?)<\/companion_intent>/gi;
const COMPANION_COMMENT_RE = /<!--\s*COMPANION_INTENT[\s\S]*?-->/gi;
const RAW_USER_BLOCK_RE = /(?:^|\n)RAW_USER_MESSAGE:\s*([\s\S]*?)(?=\n(?:TURN|DISTILLED_INTENT|COMPILED_PROMPT|CONTEXT_DIGEST):|$)/i;
const THINKING_TAG_RE = /<(?:thinking|thought)\b[^>]*>[\s\S]*?<\/(?:thinking|thought)>/gi;
const WORKER_HANDOFF_RE = /<worker_handoff\b[^>]*>([\s\S]*?)<\/worker_handoff>/gi;

export function unwrapCompanionCommand(rawText: string): string {
  if (!rawText) return "";
  let embeddedRaw = "";
  let cleaned = rawText.replace(COMPANION_COMMENT_RE, "");
  cleaned = cleaned.replace(COMPANION_TAG_RE, (_full, body: string) => {
    const match = RAW_USER_BLOCK_RE.exec(body);
    if (match?.[1]?.trim() && !embeddedRaw) embeddedRaw = match[1].trim();
    return "";
  });
  cleaned = cleaned.trim();
  if (!cleaned && embeddedRaw) return embeddedRaw;
  if (/^\s*RAW_USER_MESSAGE:/i.test(cleaned)) {
    const directMatch = RAW_USER_BLOCK_RE.exec(cleaned);
    if (directMatch?.[1]) return directMatch[1].trim();
  }
  return cleaned;
}

function summarizeWorkerHandoff(body: string): string {
  const statusMatch = /(?:^|\n)STATUS:\s*([^\n]+)/i.exec(body);
  const summaryMatch = /(?:^|\n)SUMMARY:\s*([\s\S]*?)(?=\n[A-Z][A-Z0-9_]*:|$)/.exec(body);
  const status = statusMatch?.[1]?.trim() ?? "";
  const summary = summaryMatch?.[1]?.trim() ?? "";
  if (status && summary) return `[${status}] ${summary}`;
  if (summary) return summary;
  if (status) return `[${status}]`;
  return body.trim();
}

export function distillVisibleReply(text: string): string {
  if (!text) return "";
  let cleaned = text.replace(THINKING_TAG_RE, "");
  cleaned = cleaned.replace(WORKER_HANDOFF_RE, (_full, body: string) => summarizeWorkerHandoff(body));
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

export function previewSnippet(text: string, maxLen = 120): string {
  if (!text || maxLen <= 0) return "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLen) return collapsed;
  if (maxLen <= 3) return collapsed.slice(0, maxLen);
  return `${collapsed.slice(0, maxLen - 3)}...`;
}

export function shouldIgnoreAgent(labels?: Readonly<Record<string, string>> | null): boolean {
  if (!labels) return false;
  return (
    labels[SHADOW_SESSION_LABEL] === "true" ||
    labels["paseo-bots:shadow-session"] === "true" ||
    labels[MEMORY_CURATION_LABEL] === "true" ||
    labels["paseo-bots:memory-curation"] === "true"
  );
}

function firstLabel(
  labels: Readonly<Record<string, string>> | null | undefined,
  keys: readonly string[],
): string | undefined {
  if (!labels) return undefined;
  for (const key of keys) {
    const val = labels[key]?.trim();
    if (val) return val;
  }
  return undefined;
}

/** Extracts optional workflow task and stage metadata from Paseo agent labels. */
export function extractWorkflowMeta(
  labels?: Readonly<Record<string, string>> | null,
): WorkflowMeta {
  const workflowTaskId = firstLabel(labels, [WORKFLOW_TASK_LABEL, "paseo-bots.workflow-task"]);
  const workflowId =
    firstLabel(labels, [
      "paseo-bots:workflow-id",
      "paseo-bots.workflow-id",
      "paseo-bots:workflow-name",
      "paseo-bots.workflow-name",
    ]) ?? workflowTaskId;
  const workflowStageId = firstLabel(labels, [WORKFLOW_STAGE_LABEL, "paseo-bots.workflow-stage"]);
  const workflowStageName = firstLabel(labels, [
    "paseo-bots:workflow-stage-name",
    "paseo-bots.workflow-stage-name",
  ]);
  return {
    ...(workflowTaskId ? { workflowTaskId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(workflowStageId ? { workflowStageId } : {}),
    ...(workflowStageName ? { workflowStageName } : {}),
  };
}

export function inferFeedSource(
  labels?: Readonly<Record<string, string>> | null,
  groupIds?: readonly string[],
): FeedSource {
  if (labels?.[ROUTINE_LABEL]?.trim()) return "routine";
  if (
    labels?.[WORKFLOW_TASK_LABEL]?.trim() ||
    labels?.[WORKFLOW_STAGE_LABEL]?.trim() ||
    labels?.["paseo-bots.workflow-task"]?.trim() ||
    labels?.["paseo-bots.workflow-stage"]?.trim()
  ) {
    return "workflow";
  }
  const role = labels?.[SESSION_ROLE_LABEL]?.trim() ?? "";
  if (labels?.[ASKED_BY_LABEL]?.trim() || role === "worker" || role === "dispatched-worker") {
    return "delegated";
  }
  if (
    labels?.[TEAM_SESSION_LABEL]?.trim() ||
    role.startsWith("team") ||
    (groupIds?.length ?? 0) > 0
  ) {
    return "team";
  }
  return "dm";
}

function toIsoTimestamp(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  if (typeof raw === "string" && raw.trim()) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return null;
}

function extractErrorText(item: Record<string, unknown>): string {
  const candidate = item.message ?? item.error ?? item.text;
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  if (candidate && typeof candidate === "object") {
    const nested = (candidate as Record<string, unknown>).message;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return "Agent turn failed";
}

function normalizeRecord(entry: TimelineEntryLike): {
  type: string;
  item: Record<string, unknown>;
  turnId: string | null;
  timestamp: string | null;
} | null {
  const item = entry.item && typeof entry.item === "object" ? entry.item : (entry as Record<string, unknown>);
  if (!item || typeof item.type !== "string") return null;
  const turnId = typeof entry.turnId === "string" && entry.turnId.trim() ? entry.turnId.trim() : null;
  const timestamp = toIsoTimestamp(entry.timestamp ?? item.timestamp);
  return { type: item.type, item, turnId, timestamp };
}

function applyTimelineItem(
  turns: RawTurn[],
  current: RawTurn | null,
  rec: NonNullable<ReturnType<typeof normalizeRecord>>,
): RawTurn {
  if (rec.type === "user_message") {
    const text = typeof rec.item.text === "string" ? rec.item.text : "";
    const next: RawTurn = {
      turnId: rec.turnId,
      command: unwrapCompanionCommand(text),
      replyParts: [],
      toolsCount: 0,
      status: "completed",
      errorMessage: null,
      timestamp: rec.timestamp,
    };
    turns.push(next);
    return next;
  }
  const active = current ?? (() => {
    const created: RawTurn = {
      turnId: rec.turnId,
      command: "",
      replyParts: [],
      toolsCount: 0,
      status: "completed",
      errorMessage: null,
      timestamp: rec.timestamp,
    };
    turns.push(created);
    return created;
  })();
  if (!active.turnId && rec.turnId) active.turnId = rec.turnId;
  if (rec.timestamp) active.timestamp = rec.timestamp;
  if (rec.type === "tool_call") active.toolsCount += 1;
  else if (rec.type === "assistant_message" && typeof rec.item.text === "string") {
    const distilled = distillVisibleReply(rec.item.text);
    if (distilled) active.replyParts.push(distilled);
  } else if (rec.type === "error") {
    active.status = "failed";
    active.errorMessage = extractErrorText(rec.item);
  }
  return active;
}

export function extractTurnsFromTimeline(
  items: readonly TimelineEntryLike[],
  options?: ExtractTurnsOptions,
): TurnDescriptor[] {
  const turns: RawTurn[] = [];
  let current: RawTurn | null = null;
  for (const raw of items) {
    const rec = normalizeRecord(raw);
    if (!rec) continue;
    if (rec.type === "tool_result" || rec.type === "reasoning" || rec.type === "thinking") continue;
    current = applyTimelineItem(turns, current, rec);
  }

  let selected = turns.map((turn, turnIndex) => ({ turn, turnIndex }));
  if (options?.targetTurnId) {
    const byTurn = selected.filter((entry) => entry.turn.turnId === options.targetTurnId);
    if (byTurn.length > 0) selected = byTurn;
    else if (turns.every((t) => !t.turnId) && selected.length > 0) selected = [selected[selected.length - 1]!];
    else selected = [];
  }

  const fallbackTs = options?.fallbackTimestamp ?? new Date(0).toISOString();
  const out: TurnDescriptor[] = [];
  for (let i = 0; i < selected.length; i++) {
    const { turn, turnIndex } = selected[i]!;
    const isLast = i === selected.length - 1;
    let status = turn.status;
    let errorMessage = turn.errorMessage;
    if (isLast && options?.turnOutcome?.kind === "failed") {
      status = "failed";
      errorMessage = errorMessage ?? options.turnOutcome.errorMessage ?? "Agent turn failed";
    }
    const reply = turn.replyParts.join("\n\n").trim();
    if (!turn.command && !reply && !errorMessage) continue;
    const timestamp = turn.timestamp ?? fallbackTs;
    out.push({
      turnId: turn.turnId,
      turnIndex,
      command: turn.command,
      reply,
      commandPreview: previewSnippet(turn.command, 120),
      replyPreview: previewSnippet(reply, 120),
      timestamp,
      status,
      errorMessage,
      toolsCount: turn.toolsCount,
    });
  }
  return out;
}

export function buildPointerId(
  agentId: string,
  turn: Pick<TurnDescriptor, "turnId" | "turnIndex" | "command" | "timestamp">,
): string {
  if (turn.turnId) return `${agentId}:turn:${turn.turnId}`;
  const hash = crypto.createHash("sha256").update(`${turn.command}|${turn.timestamp}`).digest("hex").slice(0, 12);
  return `${agentId}:idx:${turn.turnIndex}:${hash}`;
}

export function buildPointerFromTurn(turn: TurnDescriptor, meta: BuildPointerMeta): FeedPointer {
  const teamIds = Array.from(new Set(meta.teamIds.map((id) => id.trim()).filter(Boolean)));
  const workflowTaskId = meta.workflowTaskId?.trim();
  const workflowId = meta.workflowId?.trim();
  const workflowStageId = meta.workflowStageId?.trim();
  const workflowStageName = meta.workflowStageName?.trim();
  return {
    id: buildPointerId(meta.agentId, turn),
    agentId: meta.agentId,
    turnId: turn.turnId,
    turnIndex: turn.turnIndex,
    botId: meta.botId,
    botName: meta.botName,
    teamIds,
    agentTitle: meta.agentTitle,
    archived: meta.archived,
    timestamp: turn.timestamp,
    status: turn.status,
    errorMessage: turn.errorMessage,
    toolsCount: turn.toolsCount,
    source: meta.source,
    ...(workflowTaskId ? { workflowTaskId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(workflowStageId ? { workflowStageId } : {}),
    ...(workflowStageName ? { workflowStageName } : {}),
    commandPreview: previewSnippet(turn.commandPreview || turn.command, 120),
    replyPreview: previewSnippet(turn.replyPreview || turn.reply, 120),
  };
}

export function buildEntryFromPointer(
  pointer: FeedPointer,
  channelKind: ChannelKind,
  channelId: string,
  content: { command: string; reply: string; hydrated: boolean },
): FeedEntry {
  const workflowTaskId = pointer.workflowTaskId?.trim();
  const workflowId = pointer.workflowId?.trim();
  const workflowStageId = pointer.workflowStageId?.trim();
  const workflowStageName = pointer.workflowStageName?.trim();
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
    command: content.command,
    reply: content.reply,
    hydrated: content.hydrated,
    status: pointer.status,
    errorMessage: pointer.errorMessage,
    toolsCount: pointer.toolsCount,
    source: pointer.source,
    ...(workflowTaskId ? { workflowTaskId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(workflowStageId ? { workflowStageId } : {}),
    ...(workflowStageName ? { workflowStageName } : {}),
  };
}
