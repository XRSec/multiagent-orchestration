import { rmSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { WorkflowRunState } from "../shared/workflows";
import { pluginDataPath } from "./bot-home";
import { atomicWrite, ensureRealDirectory, readRegularText } from "./files";
import { acquireLease, releaseLease } from "./leases";

// One file per task line. The lease serialises writers; the file holds the monotonic
// version, so a settle is a compare-and-write guarded by the lock rather than a SQL row.
// This module never touches the timeline: a task card is P2b, not this stage.

export type TaskStatus = "issued" | "running" | "blocked" | "done" | "retired";
/** `blocked` is the pre-split value; it reads as `blocked_dead` and is never written again. */
export type MemberStatus = "issued" | "running" | "done" | "blocked" | "blocked_permission" | "blocked_dead" | "failed" | "dead";

export interface TaskMember {
  engine: "native" | "paseo-bot";
  botId?: string;
  handleId?: string;
  status: MemberStatus;
  /** Stamped by the writer; callers never supply it. */
  updatedAt: string;
}

/** What a caller passes to upsertMember: the writer stamps updatedAt. */
export type TaskMemberInput = Omit<TaskMember, "updatedAt">;

export interface TaskRecord {
  taskId: string;
  groupId?: string;
  title: string;
  status: TaskStatus;
  acceptance?: string;
  budget?: { steps?: number; fanout?: number };
  version: number;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
  members: TaskMember[];
  /** Resolved once, at settle time, so a routing change cannot move one card to a second chat. */
  cardAgentId?: string;
  /** Card ids already appended; a replay is refused from here, not from a timeline window. */
  publishedCardIds?: string[];
  /** Runtime workflow DAG state when this task executes a workflow. */
  workflow?: WorkflowRunState;
}

export interface OpenTaskInput {
  taskId: string;
  title: string;
  groupId?: string;
  acceptance?: string;
  budget?: { steps?: number; fanout?: number };
  workflow?: WorkflowRunState;
}

const RECORD_LIMIT = 256 * 1024;
const TASK_ID = /^[A-Za-z0-9._-]{1,120}$/;
const STATUSES: readonly TaskStatus[] = ["issued", "running", "blocked", "done", "retired"];
const MEMBER_STATUSES: readonly MemberStatus[] = ["issued", "running", "done", "blocked", "blocked_permission", "blocked_dead", "failed", "dead"];
/**
 * Statuses that occupy one fanout slot. A member waiting for the user still holds its slot,
 * a dead member does not: the first is work in progress, the second is gone.
 */
export const ACTIVE_MEMBER_STATUSES: readonly MemberStatus[] = ["issued", "running", "blocked_permission"];

/** The one place the pre-split value is translated; readers never rewrite a file they open. */
function normalizeMemberStatus(status: MemberStatus): MemberStatus {
  return status === "blocked" ? "blocked_dead" : status;
}
/** Card ids kept per task. Paired with the 200-entry timeline window: past these, a replay is invisible. */
const PUBLISHED_CARD_LIMIT = 8;

/** A task id becomes a file name: strict allowlist first, then percent-encoding as the fallback. */
function safeId(taskId: string): string {
  if (!taskId || taskId.length > 200) throw new Error("A task id must be 1 to 200 characters.");
  return TASK_ID.test(taskId) ? taskId : encodeURIComponent(taskId).slice(0, 200);
}

function taskFolder(): string {
  return join(pluginDataPath(), "tasks");
}

export function taskFile(taskId: string): string {
  return join(taskFolder(), `${safeId(taskId)}.json`);
}

function memberKey(member: TaskMemberInput): string {
  return member.handleId ?? `${member.engine}:${member.botId ?? ""}`;
}

function parseRecord(text: string, path: string): TaskRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`The task file is not valid JSON: ${path}`);
  }
  const record = raw as Partial<TaskRecord>;
  if (typeof record.taskId !== "string" || typeof record.title !== "string") throw new Error(`The task file has no task id or title: ${path}`);
  if (typeof record.version !== "number" || !Number.isFinite(record.version)) throw new Error(`The task file has no version: ${path}`);
  if (!STATUSES.includes(record.status as TaskStatus)) throw new Error(`The task file has an unknown status: ${path}`);
  if (!Array.isArray(record.members)) throw new Error(`The task file has no member list: ${path}`);
  for (const member of record.members) member.status = normalizeMemberStatus(member.status);
  return record as TaskRecord;
}

export async function readTask(taskId: string): Promise<TaskRecord | null> {
  const path = taskFile(taskId);
  const text = await readRegularText(path, RECORD_LIMIT);
  return text === null ? null : parseRecord(text, path);
}

/** Every write goes through one lease, so two processes cannot interleave a read-modify-write. */
async function withTaskLock<T>(taskId: string, work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const lease = await acquireLease(`task:${taskId}`, { ttlMs: 10_000 });
    if (lease) {
      try {
        return await work();
      } finally {
        await releaseLease(lease);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`The task line "${taskId}" is busy: another write is still in flight.`);
}

async function writeRecord(record: TaskRecord): Promise<TaskRecord> {
  const path = taskFile(record.taskId);
  await mkdir(taskFolder(), { recursive: true, mode: 0o700 });
  await ensureRealDirectory(taskFolder());
  await atomicWrite(path, JSON.stringify(record, null, 2));
  // Read back: a truncated or replaced file must never be reported as written.
  const stored = await readTask(record.taskId);
  if (!stored || stored.version !== record.version || stored.taskId !== record.taskId) throw new Error(`The task file did not keep what was written: ${path}`);
  return stored;
}

export async function openTask(input: OpenTaskInput): Promise<TaskRecord> {
  return withTaskLock(input.taskId, async () => {
    const now = new Date().toISOString();
    const existing = await readTask(input.taskId);
    if (!existing) {
      return writeRecord({
        taskId: input.taskId,
        ...(input.groupId ? { groupId: input.groupId } : {}),
        title: input.title,
        status: input.workflow ? "running" : "issued",
        ...(input.acceptance ? { acceptance: input.acceptance } : {}),
        ...(input.budget ? { budget: input.budget } : {}),
        ...(input.workflow ? { workflow: input.workflow } : {}),
        version: 1,
        createdAt: now,
        updatedAt: now,
        settledAt: null,
        members: [],
      });
    }
    const merged: TaskRecord = {
      ...existing,
      ...(input.groupId ? { groupId: input.groupId } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.acceptance ? { acceptance: input.acceptance } : {}),
      ...(input.budget ? { budget: input.budget } : {}),
      ...(input.workflow ? { workflow: input.workflow } : {}),
      version: existing.version + 1,
      updatedAt: now,
    };
    // Re-opening an unchanged line must not burn a version: a version is a fact change.
    const unchanged = merged.title === existing.title
      && merged.groupId === existing.groupId
      && merged.acceptance === existing.acceptance
      && JSON.stringify(merged.budget ?? null) === JSON.stringify(existing.budget ?? null)
      && JSON.stringify(merged.workflow ?? null) === JSON.stringify(existing.workflow ?? null);
    return unchanged ? existing : writeRecord(merged);
  });
}

/** Atomically updates the workflow run state on an existing task line under its lease lock. */
export async function updateTaskWorkflow(taskId: string, updater: (workflow: WorkflowRunState) => WorkflowRunState): Promise<TaskRecord> {
  return withTaskLock(taskId, async () => {
    const existing = await readTask(taskId);
    if (!existing) throw new Error(`There is no task line "${taskId}" to update workflow state.`);
    if (!existing.workflow) throw new Error(`Task line "${taskId}" has no workflow state.`);
    const nextWorkflow = updater(existing.workflow);
    const now = new Date().toISOString();
    return writeRecord({
      ...existing,
      workflow: nextWorkflow,
      status: nextWorkflow.status === "running" ? "running" : existing.status,
      version: existing.version + 1,
      updatedAt: now,
    });
  });
}

/** One member per handle, so a resumed follow-up refreshes its member instead of adding one. */
function mergeMember(existing: TaskRecord, member: TaskMemberInput, now: string): TaskMember[] {
  const key = memberKey(member);
  return existing.members.some((entry) => memberKey(entry) === key)
    ? existing.members.map((entry) => (memberKey(entry) === key ? { ...entry, ...member, updatedAt: now } : entry))
    : [...existing.members, { ...member, updatedAt: now }];
}

/** Members dedupe by handle, so a resumed follow-up refreshes one member instead of adding one. */
export async function upsertMember(taskId: string, member: TaskMemberInput, options: { expectedVersion?: number } = {}): Promise<TaskRecord> {
  return withTaskLock(taskId, async () => {
    const existing = await readTask(taskId);
    if (!existing) throw new Error(`There is no task line "${taskId}" to add a member to.`);
    if (options.expectedVersion !== undefined && options.expectedVersion < existing.version) {
      throw new Error(`The task line "${taskId}" is already at version ${existing.version}; version ${options.expectedVersion} would move it backwards.`);
    }
    const now = new Date().toISOString();
    return writeRecord({ ...existing, members: mergeMember(existing, member, now), version: existing.version + 1, updatedAt: now });
  });
}

export type SlotReservation =
  | { accepted: true; record: TaskRecord }
  | { accepted: false; reason: "fanout"; inFlight: number; cap: number }
  | { accepted: false; reason: "settled"; record: TaskRecord };

/** Partners that still occupy a fanout slot: a dead or finished member frees its own. */
export function inFlightMembers(record: Pick<TaskRecord, "members">): number {
  return record.members.filter((member) => ACTIVE_MEMBER_STATUSES.includes(member.status)).length;
}

/**
 * Counts the partners in flight and records the new one in the same lock, so two concurrent
 * dispatches cannot both slip under the fanout cap. A refresh of an existing member always
 * passes: the cap limits parallel work, never a follow-up to work already counted.
 */
export async function reserveMemberSlot(taskId: string, member: TaskMemberInput): Promise<SlotReservation> {
  return withTaskLock(taskId, async () => {
    const existing = await readTask(taskId);
    if (!existing) throw new Error(`There is no task line "${taskId}" to add a member to.`);
    // A settled line is a closed fact: dispatching into it would look accepted and go nowhere.
    if (existing.settledAt) return { accepted: false as const, reason: "settled" as const, record: existing };
    const key = memberKey(member);
    const cap = existing.budget?.fanout;
    const inFlight = existing.members.filter((entry) => memberKey(entry) !== key && ACTIVE_MEMBER_STATUSES.includes(entry.status)).length;
    if (cap !== undefined && inFlight >= cap) return { accepted: false as const, reason: "fanout" as const, inFlight, cap };
    const now = new Date().toISOString();
    const record = await writeRecord({
      ...existing,
      members: mergeMember(existing, member, now),
      status: existing.status === "issued" ? "running" : existing.status,
      version: existing.version + 1,
      updatedAt: now,
    });
    return { accepted: true as const, record };
  });
}

/**
 * Moves a reserved slot onto the chat that really materialised, so one partner stays one
 * member even when the host assigns the chat id itself.
 */
export async function rekeyMember(taskId: string, from: string, to: string): Promise<TaskRecord> {
  return withTaskLock(taskId, async () => {
    const existing = await readTask(taskId);
    if (!existing || from === to) return existing ?? { taskId } as TaskRecord;
    const moved = existing.members.find((entry) => memberKey(entry) === from);
    if (!moved) return existing;
    const now = new Date().toISOString();
    const members = existing.members.filter((entry) => memberKey(entry) !== from);
    const index = members.findIndex((entry) => memberKey(entry) === to);
    const claim: TaskMember = { engine: moved.engine, ...(moved.botId ? { botId: moved.botId } : {}), handleId: to, status: "issued", updatedAt: now };
    if (index >= 0) members[index] = claim; else members.push(claim);
    return writeRecord({ ...existing, members, version: existing.version + 1, updatedAt: now });
  });
}

/** Remembers where this task's card goes, so a later flush reuses one destination. */
export async function setCardAgent(taskId: string, agentId: string): Promise<TaskRecord> {
  return withTaskLock(taskId, async () => {
    const existing = await readTask(taskId);
    if (!existing) throw new Error(`There is no task line "${taskId}" to send a card for.`);
    if (existing.cardAgentId === agentId) return existing;
    // Bookkeeping only: the version is a task fact and the card id is derived from it.
    return writeRecord({ ...existing, cardAgentId: agentId, updatedAt: new Date().toISOString() });
  });
}

/** Records a card id so a replay is refused even after the timeline window moves past it. */
export async function recordPublishedCard(taskId: string, cardId: string): Promise<void> {
  await withTaskLock(taskId, async () => {
    const existing = await readTask(taskId);
    if (!existing || existing.publishedCardIds?.includes(cardId)) return;
    const now = new Date().toISOString();
    const published = [...(existing.publishedCardIds ?? []), cardId].slice(-PUBLISHED_CARD_LIMIT);
    await writeRecord({ ...existing, publishedCardIds: published, updatedAt: now });
  });
}

/** Every task line on disk, most recently updated first. */
export async function listTasks(): Promise<TaskRecord[]> {
  const names = await readdir(taskFolder()).catch(() => [] as string[]);
  const records: TaskRecord[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const record = await readTask(name.slice(0, -5)).catch(() => null);
    if (record) records.push(record);
  }
  return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

/**
 * Settles once. A task that already has a settledAt is returned untouched, so a second
 * caller (another process, another turn) can never overwrite the terminal state.
 */
export async function settleTask(taskId: string, input: { status: TaskStatus; note?: string }): Promise<{ settled: boolean; record: TaskRecord }> {
  return withTaskLock(taskId, async () => {
    const existing = await readTask(taskId);
    if (!existing) throw new Error(`There is no task line "${taskId}" to settle.`);
    if (existing.settledAt) return { settled: false, record: existing };
    const now = new Date().toISOString();
    const record = await writeRecord({
      ...existing,
      status: input.status,
      ...(input.note && !existing.acceptance ? { acceptance: input.note } : {}),
      settledAt: now,
      version: existing.version + 1,
      updatedAt: now,
    });
    return { settled: true, record };
  });
}

/**
 * Settled task files are pruned only after this window. Cards must stay self-contained:
 * this cleanup must never be the reason a card is re-sent or cannot be understood. A
 * caller asking for a shorter window gets this one instead.
 */
export const PRUNE_SETTLED_MS = 7 * 24 * 60 * 60 * 1000;

/** Removes settled task files older than the window, so the folder does not grow without end. */
export async function pruneSettled(olderThanMs = PRUNE_SETTLED_MS): Promise<number> {
  const window = Math.max(olderThanMs, PRUNE_SETTLED_MS);
  const folder = taskFolder();
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await ensureRealDirectory(folder);
  const names = await readdir(folder);
  let removed = 0;
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(folder, name);
    const taskId = name.slice(0, -5);
    const lease = await acquireLease(`task:${taskId}`, { ttlMs: 10_000 });
    if (!lease) continue;
    try {
      const record = await readTask(taskId).catch(() => null);
      if (record?.settledAt && Date.now() - Date.parse(record.settledAt) > window) {
        rmSync(path, { force: true });
        removed += 1;
      }
    } finally {
      await releaseLease(lease);
    }
  }
  return removed;
}

/** Every task whose member list contains this handle; the handle is the agent id of a chat. */
export async function findTasksByHandle(handleId: string): Promise<TaskRecord[]> {
  const names = await readdir(taskFolder()).catch(() => [] as string[]);
  const records: TaskRecord[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const record = await readTask(name.slice(0, -5)).catch(() => null);
    if (record?.members.some((member) => member.handleId === handleId)) records.push(record);
  }
  return records;
}

/**
 * Settles a task once every member is terminal and the acceptance is recorded. A settled
 * task, a task with an open member, or a task with no member at all is returned untouched,
 * so only one caller can be told `settled: true` and only it publishes the card.
 */
export async function evaluateTask(taskId: string): Promise<{ settled: boolean; record: TaskRecord }> {
  const record = await readTask(taskId);
  if (!record) throw new Error(`There is no task line "${taskId}" to evaluate.`);
  if (record.settledAt) return { settled: false, record };
  if (record.workflow) {
    if (record.workflow.status === "running") return { settled: false, record };
    return settleTask(taskId, { status: record.workflow.status === "done" ? "done" : "blocked" });
  }
  if (!record.acceptance?.trim()) return { settled: false, record };
  if (record.members.length === 0) return { settled: false, record };
  // Three phases, in this order. A permission wait is not terminal: settling it would publish a
  // blocked card, then a done card after the user approves, two opposite verdicts on one task.
  if (record.members.some((member) => member.status === "running" || member.status === "issued")) return { settled: false, record };
  if (record.members.some((member) => member.status === "blocked_permission")) return { settled: false, record };
  // The first phase is also the engine-A guard: a native child that its parent turn never closed
  // stays `issued` and holds the line, so nobody settles on work that is still running. A native
  // member that reached a terminal state is evidence from the parent turn and must not block.
  const dead = record.members.some((member) => member.status === "blocked_dead" || member.status === "dead" || member.status === "failed");
  return settleTask(taskId, { status: dead ? "blocked" : "done" });
}
