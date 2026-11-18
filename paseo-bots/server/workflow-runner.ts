import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { lastTurn } from "../shared/activity";
import type { Bot, BotGroup } from "../shared/bot";
import {
  TEAM_SESSION_LABEL,
  WORKFLOW_TASK_LABEL,
  WORKFLOW_STAGE_LABEL,
  WORKFLOW_ID_LABEL,
  WORKFLOW_STAGE_ID_LABEL,
  sendBotMessage,
} from "../shared/chat";
import { ASKED_BY_LABEL, ASKED_IN_LABEL, ASK_NOTIFY_LABEL } from "../shared/handoff";
import { newUuid } from "../shared/uuid";
import {
  buildStageBriefPrompt,
  parseWorkerHandoff,
  readyStages,
  resolveStepEngine,
  validateWorkflowDAG,
  type TaskStageState,
  type WorkflowDefinition,
  type WorkflowRunState,
  type WorkflowStageDefinition,
} from "../shared/workflows";
import { directSessionBoardPath, teamSessionBoardPath } from "./bot-home";
import { startChat } from "./chats";
import type { BotsHost } from "./host";
import { MEMORY_CURATION_LABEL } from "./memory-curator";
import type { Relay } from "./relay";
import { publishWorkflowCard, settleAndPublish } from "./task-cards";
import {
  listTasks,
  readTask,
  rekeyMember,
  reserveMemberSlot,
  settleTask,
  updateTaskStageChatId,
  updateTaskWorkflow,
  upsertMember,
  type TaskRecord,
} from "./tasks";

const execFileAsync = promisify(execFile);

export const DEFAULT_STALL_TIMEOUT_MS = 120_000;
export const DEFAULT_STAGE_HARD_TIMEOUT_MS = 25 * 60 * 1000;
/** @deprecated Use DEFAULT_STAGE_HARD_TIMEOUT_MS or stall-based timeout. */
export const DEFAULT_STAGE_WAIT_MS = DEFAULT_STAGE_HARD_TIMEOUT_MS;
export const DEFAULT_ORPHAN_STALE_MS = 10 * 60 * 1000;
export const DEFAULT_BACKOFF_BASE_MS = 1000;
export const MAX_BACKOFF_MS = 30_000;
const SLOT_WAIT_MS = 500;
const MAX_SLOT_WAIT_ATTEMPTS = 20;

const activeWorkflowTaskIds = new Set<string>();

/** Returns true when a workflow DAG loop for `taskId` is actively running in this process. */
export function isWorkflowTaskActive(taskId: string): boolean {
  return activeWorkflowTaskIds.has(taskId);
}

export interface StageDispatchContext {
  taskId: string;
  workflow: WorkflowDefinition;
  stage: WorkflowStageDefinition;
  stageState: TaskStageState;
  engine: "native" | "paseo-bot";
  bot: Bot | null;
  prompt: string;
  chatId: string;
  reuseChatId?: string;
  group?: BotGroup | null;
  callerBotId?: string;
  callerAgentId?: string;
  teamSessionId?: string;
  sessionBoardPath?: string;
  stageSeatKey?: string;
  stallTimeoutMs?: number;
  hardTimeoutMs?: number;
}

export interface StageDispatchResult {
  ok: boolean;
  output?: string;
  error?: string;
  chatId?: string;
}

export interface RunWorkflowOptions {
  host: BotsHost;
  relay: Relay;
  taskId: string;
  workflow: WorkflowDefinition;
  userInput?: string;
  group?: BotGroup | null;
  callerBotId?: string;
  callerAgentId?: string;
  notifyCallerOnSettle?: boolean;
  stageTimeoutMs?: number;
  stallTimeoutMs?: number;
  hardTimeoutMs?: number;
  backoffBaseMs?: number;
  teamSessionId?: string;
  sessionBoardPath?: string;
  /** Optional hook for testing or custom stage dispatch. */
  dispatchStage?: (ctx: StageDispatchContext) => Promise<StageDispatchResult>;
}

/**
 * Detects transient API or network errors (429, 5xx, Transport not connected, rate limit)
 * that warrant exponential backoff before retry. Excludes timeouts and validation failures.
 */
export function isTransientApiError(error: unknown): boolean {
  if (!error) return false;
  const msg = typeof error === "string" ? error : error instanceof Error ? error.message : String(error);

  // Exclude timeouts (stage timeouts, heartbeat stall detectors)
  if (/stalled\s+with\s+no\s+activity/i.test(msg)) return false;
  if (/stage\s+["'].*?["']\s+timed\s*out/i.test(msg) || /timed\s*out\s+after/i.test(msg)) return false;

  // Exclude validation, syntax, worker handoff failures, or DAG errors
  if (/syntax\s*error/i.test(msg) || /validation/i.test(msg) || /invalid\s+dag/i.test(msg)) return false;
  if (/\b(failed|blocked|partial):\b/i.test(msg)) return false;

  // Transient patterns: 429, 5xx, Transport not connected, rate limit, provider not configured reload race
  if (/\b429\b/i.test(msg)) return true;
  if (/\b5\d{2}\b/i.test(msg)) return true;
  if (/transport\s+not\s+connected/i.test(msg)) return true;
  if (/rate\s*limit/i.test(msg)) return true;
  if (/not\s+configured/i.test(msg) || /provider\s+.*?\s+not\s+configured/i.test(msg)) return true;

  return false;
}

/** Computes exponential backoff delay capped at maxMs. */
export function computeBackoffMs(retryCount: number, baseMs = DEFAULT_BACKOFF_BASE_MS, maxMs = MAX_BACKOFF_MS): number {
  const exponent = Math.max(0, retryCount);
  const base = baseMs > 0 ? baseMs : DEFAULT_BACKOFF_BASE_MS;
  const delay = base * Math.pow(2, exponent);
  return Math.min(delay, maxMs);
}

/**
 * Cancels or aborts an agent session and drains it until it reaches a non-running state.
 * Guarantees single-writer exclusion so two concurrent sessions never write the same workspace.
 */
export async function cancelAndDrainAgent(
  paseo: any,
  agentId: string,
  options?: { drainTimeoutMs?: number; pollIntervalMs?: number },
): Promise<boolean> {
  if (!paseo?.agents?.ref) return true;
  const ref = paseo.agents.ref(agentId);
  if (!ref) return true;

  const drainTimeoutMs = options?.drainTimeoutMs ?? 15_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 100;

  const initialSnapshot = await ref.refresh().catch(() => null);
  const initialAgent = initialSnapshot?.agent;
  if (!initialAgent || (initialAgent.status !== "running" && initialAgent.status !== "initializing")) {
    return true;
  }

  // Deny any pending permission with interrupt: true
  if (initialAgent.pendingPermissions && initialAgent.pendingPermissions.length > 0) {
    const permission = initialAgent.pendingPermissions[0];
    if (typeof ref.respondToPermission === "function") {
      await ref.respondToPermission({
        requestId: permission.id,
        response: { behavior: "deny", interrupt: true, message: "Interrupted by workflow runner." },
      }).catch(() => null);
    }
  }

  // Explicitly call cancel() / abort() / reload()
  if (typeof ref.cancel === "function") {
    await ref.cancel().catch(() => null);
  } else if (typeof ref.abort === "function") {
    await ref.abort().catch(() => null);
  } else if (typeof ref.reload === "function") {
    await ref.reload().catch(() => null);
  }

  // Immediate check after cancel signal
  const afterCancel = await ref.refresh().catch(() => null);
  if (!afterCancel?.agent || (afterCancel.agent.status !== "running" && afterCancel.agent.status !== "initializing")) {
    return true;
  }

  // Await and drain until non-running
  const start = Date.now();
  while (Date.now() - start < drainTimeoutMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const snap = await ref.refresh().catch(() => null);
    const status = snap?.agent?.status;
    if (!snap?.agent || (status !== "running" && status !== "initializing")) {
      return true;
    }
  }

  return false;
}

/** Captures git status and git diff from the target workspace directory if available. */
export async function captureWorkspaceSnapshot(cwd?: string): Promise<{ status?: string; diff?: string } | null> {
  const dir = cwd?.trim() || process.cwd();
  try {
    const [statusRes, diffRes] = await Promise.all([
      execFileAsync("git", ["status", "-s"], { cwd: dir, timeout: 5000 }).catch(() => null),
      execFileAsync("git", ["diff", "--stat"], { cwd: dir, timeout: 5000 }).catch(() => null),
    ]);
    const status = statusRes?.stdout?.trim();
    const diff = diffRes?.stdout?.trim();
    if (!status && !diff) return null;
    return {
      ...(status ? { status } : {}),
      ...(diff ? { diff } : {}),
    };
  } catch {
    return null;
  }
}

/** Injects workspace git status & diff into <repair_brief> block so new sessions resume cleanly. */
export function injectWorkspaceSnapshotToPrompt(
  prompt: string,
  snapshot: { status?: string; diff?: string } | null,
): string {
  if (!snapshot || (!snapshot.status && !snapshot.diff)) return prompt;
  const parts: string[] = [];
  if (snapshot.status) {
    parts.push(`- WORKSPACE_GIT_STATUS:\n\`\`\`\n${snapshot.status}\n\`\`\``);
  }
  if (snapshot.diff) {
    parts.push(`- WORKSPACE_GIT_DIFF:\n\`\`\`\n${snapshot.diff}\n\`\`\``);
  }
  const snapshotBlock = parts.join("\n");
  if (prompt.includes("</repair_brief>")) {
    return prompt.replace("</repair_brief>", `${snapshotBlock}\n</repair_brief>`);
  }
  return `<repair_brief>\n${snapshotBlock}\n</repair_brief>\n\n${prompt}`;
}

export interface StageHeartbeatWaitResult {
  completed: boolean;
  stalled: boolean;
  hardTimedOut: boolean;
  agentDisappeared: boolean;
  agent: any | null;
  error?: string;
}

/**
 * Activity-driven heartbeat waiter:
 * Waits for agent turn completion while monitoring incremental timeline/agent activity.
 * Resets stall timer on any activity. Returns immediately if agent reaches non-running state earlier.
 */
export async function waitForStageWithHeartbeat(
  paseo: any,
  chatId: string,
  options?: {
    stallTimeoutMs?: number;
    hardTimeoutMs?: number;
    pollIntervalMs?: number;
  },
): Promise<StageHeartbeatWaitResult> {
  const stallTimeoutMs = options?.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
  const hardTimeoutMs = options?.hardTimeoutMs ?? DEFAULT_STAGE_HARD_TIMEOUT_MS;
  const pollIntervalMs = options?.pollIntervalMs ?? 1000;

  const ref = paseo.agents.ref(chatId);
  const startTime = Date.now();
  let lastActivityTime = Date.now();

  let lastTimelineCount = -1;
  let lastUpdatedAt: string | null = null;
  let lastTurnKey: string | null = null;
  let lastError: string | null = null;

  let subscribedActivity = false;
  let unsubscribe: (() => void) | null = null;
  if (typeof ref?.subscribe === "function") {
    try {
      unsubscribe = ref.subscribe(() => {
        subscribedActivity = true;
      });
    } catch {
      unsubscribe = null;
    }
  }

  try {
    while (true) {
      const now = Date.now();
      if (now - startTime >= hardTimeoutMs) {
        return { completed: false, stalled: false, hardTimedOut: true, agentDisappeared: false, agent: null };
      }
      if (now - lastActivityTime >= stallTimeoutMs) {
        return { completed: false, stalled: true, hardTimedOut: false, agentDisappeared: false, agent: null };
      }

      // Check current agent state
      const snapshot = await ref.refresh().catch(() => null);
      const agent = snapshot?.agent;
      if (!agent) {
        return { completed: false, stalled: false, hardTimedOut: false, agentDisappeared: true, agent: null };
      }

      if (agent.archivedAt) {
        return { completed: false, stalled: false, hardTimedOut: false, agentDisappeared: false, agent, error: `Chat "${chatId}" was archived before completing.` };
      }
      if (agent.pendingPermissions?.length) {
        return { completed: false, stalled: false, hardTimedOut: false, agentDisappeared: false, agent, error: `Stage is waiting for user approval in chat "${chatId}".` };
      }
      if (agent.lastError && agent.status !== "running" && agent.status !== "initializing") {
        return { completed: false, stalled: false, hardTimedOut: false, agentDisappeared: false, agent, error: agent.lastError };
      }

      // If already idle/completed/error (non-running), return immediately
      if (agent.status !== "running" && agent.status !== "initializing") {
        return { completed: true, stalled: false, hardTimedOut: false, agentDisappeared: false, agent };
      }

      // Activity detection:
      let detectedActivity = subscribedActivity;
      subscribedActivity = false;

      if (agent.updatedAt && agent.updatedAt !== lastUpdatedAt) {
        detectedActivity = true;
        lastUpdatedAt = agent.updatedAt;
      }
      const turnKey = agent.activeTurn?.id ?? agent.activeTurn?.updatedAt ?? null;
      if (turnKey && turnKey !== lastTurnKey) {
        detectedActivity = true;
        lastTurnKey = turnKey;
      }
      if (agent.lastError && agent.lastError !== lastError) {
        detectedActivity = true;
        lastError = agent.lastError;
      }

      if (ref.timeline && typeof ref.timeline.refetch === "function") {
        const page = await ref.timeline.refetch({ direction: "tail", projection: "projected", limit: 10 }).catch(() => null);
        const entriesCount = page?.entries?.length ?? 0;
        const lastEntryId = page?.entries?.[page.entries.length - 1]?.id ?? null;
        if (lastTimelineCount === -1) {
          lastTimelineCount = entriesCount;
        } else if (entriesCount !== lastTimelineCount || (lastEntryId && lastEntryId !== lastTurnKey)) {
          detectedActivity = true;
          lastTimelineCount = entriesCount;
          lastTurnKey = lastEntryId;
        }
      }

      if (detectedActivity) {
        lastActivityTime = Date.now();
      }

      // Bounded chunk wait
      const timeRemainingStall = stallTimeoutMs - (Date.now() - lastActivityTime);
      const timeRemainingHard = hardTimeoutMs - (Date.now() - startTime);
      const chunkWaitMs = Math.max(50, Math.min(pollIntervalMs, timeRemainingStall, timeRemainingHard));

      if (typeof ref.waitForFinish === "function") {
        await ref.waitForFinish(chunkWaitMs).catch(() => null);
      } else {
        await new Promise((r) => setTimeout(r, chunkWaitMs));
      }
    }
  } finally {
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch {}
    }
  }
}

export {
  WORKFLOW_TASK_LABEL,
  WORKFLOW_STAGE_LABEL,
  WORKFLOW_ID_LABEL,
  WORKFLOW_STAGE_ID_LABEL,
};

/**
 * Default stage executor: dispatches via Route 1 ("native") or Route 2 ("paseo-bot")
 * using startChat, waits for turn completion, and audits optional <worker_handoff>.
 */
async function defaultStageDispatcher(
  host: BotsHost,
  relay: Relay,
  ctx: StageDispatchContext,
  stageTimeoutMs: number,
): Promise<StageDispatchResult> {
  const targetBot = ctx.bot;
  if (!targetBot) {
    return { ok: false, error: `Target bot "${ctx.stage.botId}" was not found or is archived.` };
  }
  const paseo = host.requirePaseo();
  const labels: Record<string, string> = {
    [ASK_NOTIFY_LABEL]: "false",
    [WORKFLOW_TASK_LABEL]: ctx.taskId,
    [WORKFLOW_STAGE_LABEL]: ctx.stage.id,
    ...(ctx.callerBotId ? { [ASKED_BY_LABEL]: ctx.callerBotId } : {}),
    ...(ctx.callerAgentId ? { [ASKED_IN_LABEL]: ctx.callerAgentId } : {}),
  };
  const stageSkillIds = ctx.stage.skillIds !== undefined
    ? Array.from(new Set([...(targetBot.skillIds ?? []), ...ctx.stage.skillIds]))
    : undefined;
  const stageMcpServerIds = ctx.stage.mcpServerIds !== undefined
    ? Array.from(new Set([...(targetBot.mcpServerIds ?? []), ...ctx.stage.mcpServerIds]))
    : undefined;

  const stageSeatKey = ctx.stageSeatKey ?? (ctx.stage.skillIds && ctx.stage.skillIds.length > 0
    ? `${ctx.stage.id}-${targetBot.id}`
    : undefined);

  let chatId: string | null = null;
  if (ctx.reuseChatId) {
    try {
      // 1. Cancel and drain prior turn if still running before reusing session
      await cancelAndDrainAgent(paseo, ctx.reuseChatId);
      const existingSnapshot = await paseo.agents.ref(ctx.reuseChatId).refresh().catch(() => null);
      const existingAgent = existingSnapshot?.agent;
      if (existingAgent && !existingAgent.archivedAt && existingAgent.status !== "running" && existingAgent.status !== "initializing") {
        await sendBotMessage(paseo, {
          agentId: ctx.reuseChatId,
          text: ctx.prompt,
          bot: targetBot,
        });
        chatId = ctx.reuseChatId;
      }
    } catch {
      chatId = null;
    }
  }

  if (!chatId) {
    // 2. Fallback recreate with workspace snapshot
    if (ctx.reuseChatId) {
      await cancelAndDrainAgent(paseo, ctx.reuseChatId).catch(() => null);
    }
    let promptWithSnapshot = ctx.prompt;
    if (ctx.stageState.retries > 0 || ctx.reuseChatId) {
      const workspaceDir = ctx.group?.cwd ?? ctx.bot?.cwd ?? process.cwd();
      const snapshot = await captureWorkspaceSnapshot(workspaceDir).catch(() => null);
      promptWithSnapshot = injectWorkspaceSnapshotToPrompt(ctx.prompt, snapshot);
    }
    const fallbackChatId = ctx.reuseChatId ? newUuid() : ctx.chatId;
    chatId = await startChat(host, relay, targetBot, {
      prompt: promptWithSnapshot,
      title: `[${ctx.workflow.name}] ${ctx.stage.name}`,
      labels,
      agentId: fallbackChatId,
      ...(ctx.group !== undefined ? { group: ctx.group } : {}),
      ...(ctx.callerBotId ? { askedByBotId: ctx.callerBotId } : {}),
      engine: ctx.engine,
      ...(stageSkillIds !== undefined ? { skillIds: stageSkillIds } : {}),
      ...(stageMcpServerIds !== undefined ? { mcpServerIds: stageMcpServerIds } : {}),
      teamSessionId: ctx.teamSessionId,
      isWorkflowStage: true,
      ...(stageSeatKey ? { stageSeatKey } : {}),
      syncAgy: false,
    });
  }

  // Pre-persist chatId immediately after startChat / in-place reuse
  await updateTaskStageChatId(ctx.taskId, ctx.stage.id, chatId).catch(() => null);

  if (chatId !== ctx.chatId) {
    await rekeyMember(ctx.taskId, ctx.chatId, chatId).catch(() => null);
  }
  await upsertMember(ctx.taskId, {
    engine: ctx.engine,
    botId: targetBot.id,
    handleId: chatId,
    status: "running",
  }).catch(() => null);

  const hardTimeoutMs = ctx.hardTimeoutMs ?? stageTimeoutMs;
  const stallTimeoutMs = ctx.stallTimeoutMs ?? Math.min(DEFAULT_STALL_TIMEOUT_MS, hardTimeoutMs);
  const waitResult = await waitForStageWithHeartbeat(paseo, chatId, {
    stallTimeoutMs,
    hardTimeoutMs,
  });

  if (waitResult.agentDisappeared) {
    return { ok: false, error: `Chat "${chatId}" disappeared before completing.`, chatId };
  }
  if (waitResult.error) {
    return { ok: false, error: waitResult.error, chatId };
  }
  if (waitResult.stalled) {
    const stallSec = Math.round(stallTimeoutMs / 1000);
    return { ok: false, error: `Stage "${ctx.stage.name}" stalled with no activity for ${stallSec}s in chat "${chatId}".`, chatId };
  }
  if (waitResult.hardTimedOut) {
    const hardSec = Math.round(hardTimeoutMs / 1000);
    return { ok: false, error: `Stage "${ctx.stage.name}" timed out after ${hardSec}s in chat "${chatId}".`, chatId };
  }
  const agent = waitResult.agent;
  if (!agent) {
    return { ok: false, error: `Chat "${chatId}" disappeared before completing.`, chatId };
  }
  if (agent.archivedAt) {
    return { ok: false, error: `Chat "${chatId}" was archived before completing.`, chatId };
  }
  if (agent.lastError) {
    return { ok: false, error: agent.lastError, chatId };
  }
  if (agent.pendingPermissions?.length) {
    return { ok: false, error: `Stage "${ctx.stage.name}" is waiting for user approval in chat "${chatId}".`, chatId };
  }
  if (agent.status === "running" || agent.status === "initializing") {
    const hardSec = Math.round(hardTimeoutMs / 1000);
    return { ok: false, error: `Stage "${ctx.stage.name}" timed out after ${hardSec}s in chat "${chatId}".`, chatId };
  }

  const page = await paseo.agents.ref(chatId).timeline.refetch({ direction: "tail", projection: "projected", limit: 80 }).catch(() => null);
  const items = (page?.entries ?? []).map((entry) => entry.item as { type: string; text?: unknown; name?: unknown });
  const reply = lastTurn(items).reply;
  const handoff = parseWorkerHandoff(reply);
  if (handoff.hasBlock && (handoff.status === "FAILED" || handoff.status === "BLOCKED" || handoff.status === "PARTIAL")) {
    const reason = handoff.openIssues && handoff.openIssues.toLowerCase() !== "none"
      ? `${handoff.status}: ${handoff.openIssues}`
      : `${handoff.status}: ${handoff.summary || "Worker reported failure."}`;
    return { ok: false, error: reason, output: reply, chatId };
  }
  return { ok: true, output: reply || `Stage "${ctx.stage.name}" completed.`, chatId };
}

/** Reserves a task pyramid member slot, backing off briefly if the fanout cap is temporarily full. */
async function acquireStageSlot(
  taskId: string,
  engine: "native" | "paseo-bot",
  botId: string,
  handleId: string,
): Promise<{ accepted: boolean; settled?: boolean }> {
  for (let attempt = 0; attempt < MAX_SLOT_WAIT_ATTEMPTS; attempt++) {
    const res = await reserveMemberSlot(taskId, { engine, botId, handleId, status: "issued" });
    if (res.accepted) return { accepted: true };
    if (res.reason === "settled") return { accepted: false, settled: true };
    await new Promise((resolve) => setTimeout(resolve, SLOT_WAIT_MS));
  }
  return { accepted: false };
}

/**
 * Builds a concise distilled summary message of all stages for waking the caller agent.
 */
export function buildWorkflowCompletionSummary(
  workflow: WorkflowDefinition,
  state: WorkflowRunState,
): string {
  const header = `[Workflow Completion: ${workflow.name} — ${state.status.toUpperCase()}]`;

  const stageLines = state.stages.map((s) => {
    const parts = [`- **${s.name}** (\`${s.id}\`): \`${s.status}\``];
    if (s.handoffFilePath) {
      parts.push(`  - Handoff: \`${s.handoffFilePath}\``);
    }
    if (s.error) {
      parts.push(`  - Error: ${s.error}`);
    }
    return parts.join("\n");
  });

  const stagesWithOutput = state.stages.filter((s) => !!s.output?.trim());
  const finalStage = stagesWithOutput[stagesWithOutput.length - 1] ?? state.stages[state.stages.length - 1];
  const finalOutput = finalStage?.output?.trim();

  const sections = [
    header,
    `Workflow "${workflow.name}" has completed with status: **${state.status}**.`,
    `### Stage Summary:\n${stageLines.join("\n")}`,
  ];

  if (finalOutput) {
    sections.push(`### Final Stage Output (${finalStage?.name ?? "Final"}):\n${finalOutput}`);
  }

  sections.push("Please review the final results and deliver the report to the user.");

  return sections.join("\n\n");
}

async function notifyWorkflowCallerOnSettle(
  host: BotsHost,
  options: {
    callerAgentId: string;
    callerBotId?: string;
    workflow: WorkflowDefinition;
    state: WorkflowRunState;
  },
): Promise<void> {
  const { callerAgentId, callerBotId, workflow, state } = options;
  const paseo = host.paseo ?? host.requirePaseo?.();
  if (!paseo) return;

  try {
    const callerRef = paseo.agents?.ref ? paseo.agents.ref(callerAgentId) : null;
    if (callerRef && typeof callerRef.refresh === "function") {
      const snapshot = await callerRef.refresh().catch(() => null);
      const agent = snapshot?.agent;
      if (agent?.archivedAt) {
        return;
      }
    }
  } catch {
    // ignore refresh errors
  }

  const callerBot = callerBotId ? await host.bot(callerBotId).catch(() => null) : null;
  const summaryText = buildWorkflowCompletionSummary(workflow, state);

  await sendBotMessage(paseo, {
    agentId: callerAgentId,
    text: summaryText,
    ...(callerBot ? { bot: callerBot } : {}),
  });
}

/**
 * Cleanly archives unique stage child chats upon workflow terminal settlement
 * so they are removed from the active sidebar while remaining viewable via
 * TaskStageModal ("Open Agent Chat"). Strictly excludes callerAgentId and chats
 * that are already archived.
 */
export async function archiveWorkflowStageChats(
  host: BotsHost,
  options: {
    stages: readonly { chatId?: string | null }[];
    callerAgentId?: string | null;
  },
): Promise<void> {
  const { stages, callerAgentId } = options;
  const paseo = host.paseo ?? host.requirePaseo?.();
  if (!paseo?.agents?.ref) return;

  const trimmedCaller = callerAgentId?.trim();
  const chatIds = new Set<string>();
  for (const stage of stages) {
    const chatId = stage.chatId?.trim();
    if (chatId && (!trimmedCaller || chatId !== trimmedCaller)) {
      chatIds.add(chatId);
    }
  }

  for (const chatId of chatIds) {
    try {
      const ref = paseo.agents.ref(chatId) as {
        archive?: () => Promise<unknown>;
        refresh?: () => Promise<{ agent?: { archivedAt?: string | null } } | null>;
      } | null | undefined;

      if (!ref || typeof ref.archive !== "function") continue;

      if (typeof ref.refresh === "function") {
        const snapshot = await ref.refresh().catch(() => null);
        const agent = (snapshot as any)?.agent ?? snapshot;
        if (agent?.archivedAt) {
          continue;
        }
      }

      await ref.archive().catch(() => null);
    } catch {
      // ignore archive failure for individual chat
    }
  }
}

/**
 * Executes a validated Workflow DAG on an existing TaskRecord:
 * - Topological dependency resolution (`readyStages`)
 * - Parallel execution of all ready stages per wave
 * - Bounded per-stage retries (`maxRetries`) with <repair_brief> context
 * - Failure propagation (marks blocked downstream stages as "skipped")
 * - Live Stage/DAG progress cards via `publishWorkflowCard` and terminal settlement via `settleAndPublish`
 */
export async function runWorkflowDag(options: RunWorkflowOptions): Promise<WorkflowRunState> {
  const {
    host,
    relay,
    taskId,
    workflow,
    userInput,
    group,
    callerBotId,
    callerAgentId,
    notifyCallerOnSettle,
    stageTimeoutMs,
    stallTimeoutMs,
    hardTimeoutMs,
    backoffBaseMs,
    dispatchStage,
  } = options;

  const dagCheck = validateWorkflowDAG(workflow.stages);
  if (!dagCheck.valid) {
    throw new Error(`Invalid workflow DAG "${workflow.name}": ${dagCheck.error}`);
  }

  const effectiveHardTimeoutMs = hardTimeoutMs ?? stageTimeoutMs ?? DEFAULT_STAGE_HARD_TIMEOUT_MS;
  const effectiveStallTimeoutMs = stallTimeoutMs ?? Math.min(DEFAULT_STALL_TIMEOUT_MS, effectiveHardTimeoutMs);

  activeWorkflowTaskIds.add(taskId);
  const archivedStageChatIds = new Set<string>();
  try {
    const stageDefMap = new Map(workflow.stages.map((s) => [s.id, s]));
  const bots = await host.bots().catch(() => [] as Bot[]);
  const botMap = new Map(bots.map((b) => [b.id, b]));

  await publishWorkflowCard(host, taskId, callerAgentId).catch(() => false);

  const callerChat = callerAgentId ? await host.chatOf(callerAgentId).catch(() => null) : null;
  const initialTask = await readTask(taskId);
  const fallbackSessionId = taskId.startsWith("wf-") ? taskId : `wf-${taskId}`;
  const teamSessionId = options.teamSessionId
    ?? initialTask?.workflow?.teamSessionId
    ?? callerChat?.labels?.[TEAM_SESSION_LABEL]
    ?? fallbackSessionId;

  const sessionBoardPath = options.sessionBoardPath
    ?? initialTask?.workflow?.sessionBoardPath
    ?? (group
      ? teamSessionBoardPath(group.id, teamSessionId, group.name)
      : directSessionBoardPath(callerBotId ?? workflow.stages[0]?.botId ?? "workflow", teamSessionId));

  await mkdir(join(sessionBoardPath, "handoffs"), { recursive: true });
  await mkdir(join(sessionBoardPath, "artifacts"), { recursive: true });
  await mkdir(join(sessionBoardPath, "runs"), { recursive: true });

  await updateTaskWorkflow(taskId, (wf) => ({
    ...wf,
    teamSessionId: wf.teamSessionId ?? teamSessionId,
    sessionBoardPath: wf.sessionBoardPath ?? sessionBoardPath,
  }));

  while (true) {
    const task = await readTask(taskId);
    if (!task || !task.workflow) {
      throw new Error(`Task "${taskId}" has no active workflow state.`);
    }
    if (task.settledAt || task.workflow.status !== "running") {
      return task.workflow;
    }

    const stages = task.workflow.stages;
    const allDone = stages.every((s) => s.status === "done");
    if (allDone) {
      const completedAt = new Date().toISOString();
      const updated = await updateTaskWorkflow(taskId, (wf) => ({
        ...wf,
        status: "done",
        currentStageIds: [],
        completedAt,
      }));
      await settleAndPublish(host, taskId, callerAgentId);
      if (notifyCallerOnSettle && callerAgentId) {
        await notifyWorkflowCallerOnSettle(host, {
          callerAgentId,
          callerBotId,
          workflow,
          state: updated.workflow!,
        }).catch((err) => {
          console.warn(`paseo-bots: failed to wake caller agent "${callerAgentId}" on workflow settlement:`, err);
        });
      }
      const unarchivedStages = (updated.workflow?.stages ?? stages).filter(
        (s) => !s.chatId || !archivedStageChatIds.has(s.chatId),
      );
      await archiveWorkflowStageChats(host, {
        stages: unarchivedStages,
        callerAgentId,
      }).catch((err) => {
        console.warn(`paseo-bots: failed to archive workflow stage chats for task "${taskId}":`, err);
      });
      if (host.paseo) {
        const archivedAtIso = new Date().toISOString();
        const stamped = await updateTaskWorkflow(taskId, (wf) => ({
          ...wf,
          chatsArchivedAt: archivedAtIso,
        })).catch(() => null);
        if (stamped?.workflow) {
          return stamped.workflow;
        }
      }
      return updated.workflow!;
    }

    const ready = readyStages(stages);
    const anyFailed = stages.some((s) => s.status === "failed");

    // If no stages are ready (either because a dependency failed or DAG is blocked), fail and skip remaining pending stages.
    if (ready.length === 0 || anyFailed) {
      const completedAt = new Date().toISOString();
      const updated = await updateTaskWorkflow(taskId, (wf) => ({
        ...wf,
        status: "failed",
        currentStageIds: [],
        completedAt,
        stages: wf.stages.map((s) => (s.status === "pending" ? { ...s, status: "skipped" } : s)),
      }));
      await settleAndPublish(host, taskId, callerAgentId);
      if (notifyCallerOnSettle && callerAgentId) {
        await notifyWorkflowCallerOnSettle(host, {
          callerAgentId,
          callerBotId,
          workflow,
          state: updated.workflow!,
        }).catch((err) => {
          console.warn(`paseo-bots: failed to wake caller agent "${callerAgentId}" on workflow settlement:`, err);
        });
      }
      const unarchivedStages = (updated.workflow?.stages ?? stages).filter(
        (s) => !s.chatId || !archivedStageChatIds.has(s.chatId),
      );
      await archiveWorkflowStageChats(host, {
        stages: unarchivedStages,
        callerAgentId,
      }).catch((err) => {
        console.warn(`paseo-bots: failed to archive workflow stage chats for task "${taskId}":`, err);
      });
      if (host.paseo) {
        const archivedAtIso = new Date().toISOString();
        const stamped = await updateTaskWorkflow(taskId, (wf) => ({
          ...wf,
          chatsArchivedAt: archivedAtIso,
        })).catch(() => null);
        if (stamped?.workflow) {
          return stamped.workflow;
        }
      }
      return updated.workflow!;
    }

    // Respect optional fanout cap when launching parallel stages in this wave.
    const cap = task.budget?.fanout;
    const wave = cap && cap > 0 ? ready.slice(0, cap) : ready;
    const waveIds = new Set(wave.map((s) => s.id));

    // Mark wave stages as "running" before launching concurrent dispatches.
    const waveStart = new Date().toISOString();
    await updateTaskWorkflow(taskId, (wf) => ({
      ...wf,
      currentStageIds: wave.map((s) => s.id),
      stages: wf.stages.map((s) => (waveIds.has(s.id) ? { ...s, status: "running", startedAt: s.startedAt ?? waveStart } : s)),
    }));
    await publishWorkflowCard(host, taskId, callerAgentId).catch(() => false);

    // Execute ready stages in parallel.
    await Promise.allSettled(
      wave.map(async (stageState) => {
        const stageDef = stageDefMap.get(stageState.id)!;
        const targetBot = (await host.bot(stageDef.botId).catch(() => null)) ?? botMap.get(stageDef.botId) ?? null;
        const resolvedEngine = resolveStepEngine(stageDef.engine, targetBot, targetBot?.provider);
        const priorChatId = stageState.retries > 0 && stageState.chatId ? stageState.chatId : null;

        // Cancel-and-drain before retry if prior session was still running
        if (priorChatId && host.paseo) {
          await cancelAndDrainAgent(host.paseo, priorChatId).catch(() => null);
        }

        const reservedChatId = priorChatId ?? newUuid();

        const slot = await acquireStageSlot(taskId, resolvedEngine, stageDef.botId, reservedChatId);
        if (!slot.accepted) {
          if (slot.settled) return;
          await updateTaskWorkflow(taskId, (wf) => ({
            ...wf,
            stages: wf.stages.map((s) =>
              s.id === stageState.id
                ? { ...s, status: "failed", error: "Could not acquire concurrency slot (fanout cap).", completedAt: new Date().toISOString() }
                : s,
            ),
          }));
          return;
        }

        // Gather outputs from completed direct upstream dependencies.
        const latestTask = await readTask(taskId);
        const stageLookup = new Map((latestTask?.workflow?.stages ?? stages).map((s) => [s.id, s]));
        const upstreamOutputs = stageDef.dependsOn
          .map((depId) => stageLookup.get(depId))
          .filter((dep): dep is TaskStageState => !!dep && dep.status === "done" && !!dep.output)
          .map((dep) => ({
            stageId: dep.id,
            stageName: dep.name,
            output: dep.output!,
            handoffFilePath: dep.handoffFilePath,
          }));

        const prompt = buildStageBriefPrompt({
          workflowName: workflow.name,
          stage: stageDef,
          userInput,
          upstreamOutputs,
          sessionBoardPath,
          attempt: stageState.retries + 1,
          previousError: stageState.error,
        });

        const stageSeatKey = stageDef.skillIds && stageDef.skillIds.length > 0
          ? `${stageDef.id}-${stageDef.botId}`
          : undefined;

        let result: StageDispatchResult;
        try {
          const ctx: StageDispatchContext = {
            taskId,
            workflow,
            stage: stageDef,
            stageState,
            engine: resolvedEngine,
            bot: targetBot,
            prompt,
            chatId: reservedChatId,
            ...(priorChatId ? { reuseChatId: priorChatId } : {}),
            group,
            callerBotId,
            callerAgentId,
            teamSessionId,
            sessionBoardPath,
            stageSeatKey,
            stallTimeoutMs: effectiveStallTimeoutMs,
            hardTimeoutMs: effectiveHardTimeoutMs,
          };
          result = dispatchStage
            ? await dispatchStage(ctx)
            : await defaultStageDispatcher(host, relay, ctx, effectiveHardTimeoutMs);
        } catch (err) {
          result = { ok: false, error: err instanceof Error ? err.message : String(err), chatId: reservedChatId };
        }

        const effectiveChatId = result.chatId ?? reservedChatId;
        const now = new Date().toISOString();

        if (result.ok) {
          const handoffFileName = `${stageDef.id}-${stageDef.botId}.md`;
          const handoffFilePath = join(sessionBoardPath, "handoffs", handoffFileName);
          await writeFile(handoffFilePath, result.output ?? "", "utf-8");

          await upsertMember(taskId, {
            engine: resolvedEngine,
            botId: stageDef.botId,
            handleId: effectiveChatId,
            status: "done",
          }).catch(() => null);
          await updateTaskWorkflow(taskId, (wf) => ({
            ...wf,
            stages: wf.stages.map((s) =>
              s.id === stageState.id
                ? {
                    ...s,
                    engine: resolvedEngine,
                    status: "done",
                    output: result.output ?? "",
                    handoffFilePath,
                    error: null,
                    chatId: effectiveChatId,
                    completedAt: now,
                  }
                : s,
            ),
          }));
          await archiveWorkflowStageChats(host, {
            stages: [{ chatId: effectiveChatId }],
            callerAgentId,
          }).catch(() => null);
          if (effectiveChatId) {
            archivedStageChatIds.add(effectiveChatId);
          }
        } else {
          const errorMessage = result.error || `Stage "${stageDef.name}" failed.`;
          await upsertMember(taskId, {
            engine: resolvedEngine,
            botId: stageDef.botId,
            handleId: effectiveChatId,
            status: "failed",
          }).catch(() => null);

          // Apply exponential backoff ONLY for transient API/network errors before next retry
          if (stageState.retries < stageDef.maxRetries && isTransientApiError(errorMessage)) {
            const backoffMs = computeBackoffMs(stageState.retries, backoffBaseMs);
            if (backoffMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }
          }

          await updateTaskWorkflow(taskId, (wf) => ({
            ...wf,
            stages: wf.stages.map((s) => {
              if (s.id !== stageState.id) return s;
              if (s.retries < s.maxRetries) {
                return {
                  ...s,
                  engine: resolvedEngine,
                  status: "pending",
                  retries: s.retries + 1,
                  error: errorMessage,
                  chatId: effectiveChatId,
                };
              }
              return {
                ...s,
                engine: resolvedEngine,
                status: "failed",
                error: errorMessage,
                chatId: effectiveChatId,
                completedAt: now,
              };
            }),
          }));
        }
      }),
    );

    await publishWorkflowCard(host, taskId, callerAgentId).catch(() => false);
  }
  } finally {
    activeWorkflowTaskIds.delete(taskId);
  }
}

const ORPHAN_REASON = "Workflow runner interrupted (process restarted or runner stopped).";

export interface ReconcileOrphanWorkflowsOptions {
  host?: BotsHost;
  staleAfterMs?: number;
  nowMs?: number;
  tasks?: TaskRecord[];
}

/**
 * Reconciles residual `status: "running"` workflow tasks that have no active in-memory runner
 * and exceed `staleAfterMs` (pass `0` on server startup to immediately settle all prior runs).
 */
export async function reconcileOrphanWorkflows(options?: ReconcileOrphanWorkflowsOptions): Promise<TaskRecord[]> {
  const staleAfterMs = options?.staleAfterMs ?? DEFAULT_ORPHAN_STALE_MS;
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const tasks = options?.tasks ?? await listTasks();
  const reconciled: TaskRecord[] = [];

  for (const task of tasks) {
    if (!task.workflow || task.workflow.status !== "running" || task.settledAt) continue;
    if (activeWorkflowTaskIds.has(task.taskId)) continue;
    const updatedMs = Date.parse(task.updatedAt);
    if (staleAfterMs > 0 && Number.isFinite(updatedMs) && nowMs - updatedMs < staleAfterMs) {
      continue;
    }

    const rescuedStages = new Map<string, { output: string; handoffFilePath?: string }>();
    if (options?.host?.paseo) {
      const paseo = options.host.paseo;
      for (const stage of task.workflow.stages) {
        if (stage.status === "running" && stage.chatId) {
          try {
            const ref = paseo.agents?.ref ? paseo.agents.ref(stage.chatId) : null;
            if (ref) {
              const snapshot = await ref.refresh?.().catch(() => null);
              const agent = snapshot?.agent;
              if (
                agent &&
                agent.status !== "running" &&
                agent.status !== "initializing" &&
                !agent.lastError &&
                !agent.archivedAt &&
                (!agent.pendingPermissions || agent.pendingPermissions.length === 0)
              ) {
                let reply = "";
                if (ref.timeline && typeof ref.timeline.refetch === "function") {
                  const page = await ref.timeline.refetch({ direction: "tail", projection: "projected", limit: 80 }).catch(() => null);
                  const items = (page?.entries ?? []).map((entry: any) => entry.item as { type: string; text?: unknown; name?: unknown });
                  reply = lastTurn(items).reply.trim();
                }
                if (reply) {
                  const handoff = parseWorkerHandoff(reply);
                  const isFailed = handoff.hasBlock && (handoff.status === "FAILED" || handoff.status === "BLOCKED" || handoff.status === "PARTIAL");
                  if (!isFailed) {
                    let handoffFilePath = stage.handoffFilePath;
                    if (task.workflow.sessionBoardPath) {
                      try {
                        const handoffDir = join(task.workflow.sessionBoardPath, "handoffs");
                        await mkdir(handoffDir, { recursive: true }).catch(() => null);
                        const handoffFileName = `${stage.id}-${stage.botId}.md`;
                        handoffFilePath = join(handoffDir, handoffFileName);
                        await writeFile(handoffFilePath, reply, "utf-8");
                      } catch {
                        // ignore disk write errors
                      }
                    }
                    rescuedStages.set(stage.id, { output: reply, handoffFilePath });
                    await upsertMember(task.taskId, {
                      engine: stage.engine,
                      botId: stage.botId,
                      handleId: stage.chatId,
                      status: "done",
                    }).catch(() => null);
                  }
                }
              }
            }
          } catch {
            // ignore session inspection errors
          }
        }
      }
    }

    await updateTaskWorkflow(task.taskId, (wf) => {
      const updatedStages = wf.stages.map((s) => {
        if (rescuedStages.has(s.id)) {
          const rescued = rescuedStages.get(s.id)!;
          return {
            ...s,
            status: "done" as const,
            output: rescued.output,
            ...(rescued.handoffFilePath ? { handoffFilePath: rescued.handoffFilePath } : {}),
            error: null,
            completedAt: s.completedAt ?? nowIso,
          };
        }
        if (s.status === "running") {
          return {
            ...s,
            status: "failed" as const,
            error: s.error || ORPHAN_REASON,
            completedAt: s.completedAt ?? nowIso,
          };
        }
        if (s.status === "pending") {
          return { ...s, status: "skipped" as const };
        }
        return s;
      });

      const allDone = updatedStages.every((s) => s.status === "done");
      const workflowStatus = allDone ? "done" : "failed";

      return {
        ...wf,
        status: workflowStatus,
        currentStageIds: [],
        completedAt: wf.completedAt ?? nowIso,
        stages: updatedStages,
      };
    }).catch(() => null);

    let settled = false;
    if (options?.host?.paseo) {
      const publishRes = await settleAndPublish(options.host, task.taskId, task.cardAgentId).catch(() => null);
      if (publishRes?.settled) settled = true;
    }
    if (!settled) {
      const currentTask = await readTask(task.taskId).catch(() => null);
      const isDone = currentTask?.workflow?.status === "done";
      await settleTask(task.taskId, {
        status: isDone ? "done" : "blocked",
        note: isDone ? undefined : ORPHAN_REASON,
      }).catch(() => null);
    }

    if (options?.host?.paseo) {
      const currentTask = await readTask(task.taskId).catch(() => null);
      const stagesToArchive = currentTask?.workflow?.stages ?? task.workflow.stages;
      await archiveWorkflowStageChats(options.host, {
        stages: stagesToArchive,
        callerAgentId: task.cardAgentId,
      }).catch((err) => {
        console.warn(`paseo-bots: failed to archive orphan workflow stage chats for task "${task.taskId}":`, err);
      });
      const archivedAtIso = new Date().toISOString();
      await updateTaskWorkflow(task.taskId, (wf) => ({
        ...wf,
        chatsArchivedAt: archivedAtIso,
      })).catch(() => {
        if (task.workflow) {
          task.workflow.chatsArchivedAt = archivedAtIso;
        }
      });
    }

    const updated = await readTask(task.taskId).catch(() => null) ?? task;
    if (updated) reconciled.push(updated);
  }

  return reconciled;
}

/**
 * Sweeps idle/completed background MemoryCurator chats that completed before this code loaded,
 * archiving their agent sessions so stale "Memory check" / "Memory consolidation" chats don't linger.
 */
export async function archiveStaleMemoryCurationChats(host: BotsHost): Promise<number> {
  const paseo = host.paseo;
  if (!paseo?.agents || typeof (paseo.agents as any).list !== "function") return 0;
  let count = 0;
  try {
    const listRes = await (paseo.agents as any).list({
      filter: { includeArchived: false, includeBackground: true },
    }).catch(() => null) ?? await (paseo.agents as any).list().catch(() => null);

    const rawList: any[] = Array.isArray(listRes)
      ? listRes
      : Array.isArray(listRes?.entries)
        ? listRes.entries
        : [];

    for (const item of rawList) {
      const agent = item?.agent ?? item;
      if (!agent || !agent.id) continue;
      if (agent.archivedAt) continue;
      if (agent.status === "running" || agent.status === "initializing") continue;

      const labels = agent.labels ?? {};
      const metadata = agent.metadata ?? {};
      const isCuration = labels[MEMORY_CURATION_LABEL] === "true" ||
        labels[MEMORY_CURATION_LABEL] === true ||
        metadata[MEMORY_CURATION_LABEL] === "true" ||
        metadata[MEMORY_CURATION_LABEL] === true;

      if (isCuration) {
        const ref = paseo.agents.ref ? paseo.agents.ref(agent.id) : null;
        if (ref && typeof ref.archive === "function") {
          await ref.archive().catch(() => null);
          count++;
        }
      }
    }
  } catch {
    // ignore session sweep errors
  }
  return count;
}

/**
 * Retroactively archives unarchived stage chats of already-settled historical workflow tasks on disk,
 * stamping `chatsArchivedAt` so subsequent startups and sweeps are no-ops.
 * Also archives idle background memory curation chats.
 */
export async function archiveSettledWorkflowStageChats(
  host: BotsHost,
  options?: { tasks?: TaskRecord[] },
): Promise<number> {
  if (!host.paseo) return 0;

  const tasks = options?.tasks ?? await listTasks();
  const eligible = tasks.filter((task) =>
    task.workflow &&
    (task.settledAt || task.workflow.status === "done" || task.workflow.status === "failed") &&
    !task.workflow.chatsArchivedAt &&
    !activeWorkflowTaskIds.has(task.taskId)
  );

  let archivedCount = 0;
  for (const task of eligible) {
    if (!task.workflow) continue;
    await archiveWorkflowStageChats(host, {
      stages: task.workflow.stages,
      callerAgentId: task.cardAgentId,
    }).catch((err) => {
      console.warn(`paseo-bots: failed to archive historical workflow stage chats for task "${task.taskId}":`, err);
    });

    const nowIso = new Date().toISOString();
    await updateTaskWorkflow(task.taskId, (wf) => ({
      ...wf,
      chatsArchivedAt: nowIso,
    })).catch(() => {
      if (task.workflow) {
        task.workflow.chatsArchivedAt = nowIso;
      }
    });
    if (task.workflow) {
      task.workflow.chatsArchivedAt = nowIso;
    }
    archivedCount++;
  }

  await archiveStaleMemoryCurationChats(host).catch((err) => {
    console.warn("paseo-bots: failed to sweep stale memory curation chats:", err);
  });

  return archivedCount;
}
