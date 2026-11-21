import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { BOT_LABEL, isGlobalAssistantBot, primaryGroupForBot, type Bot, type BotGroup } from "../../shared/bot";
import { taskCardOf, type TaskCard } from "../../shared/task-card";
import {
  initWorkflowRunState,
  validateWorkflowDAG,
  workflowSummaryText,
  type WorkflowDefinition,
  type WorkflowRunState,
} from "../../shared/workflows";
import type { BotsHost } from "../host";
import type { Relay } from "../relay";
import { openTask, readTask } from "../tasks";
import { publishWorkflowCard } from "../task-cards";
import { resumeWorkflow, runWorkflowDag, type StageDispatchContext, type StageDispatchResult } from "../workflow-runner";
import { defineTool, type ToolCaller } from "./mcp";

const WORKFLOW_WAIT_MS = 45_000;
const inflightIdempotentRuns = new Map<string, Promise<StartWorkflowRpcResult>>();

function newWorkflowTaskId(): string {
  return `wf-${randomBytes(4).toString("hex")}`;
}

export interface WorkflowLookupResult {
  workflow: WorkflowDefinition;
  scope: "team" | "global";
  group: BotGroup | null;
}

interface RpcWorkflowLookupResult {
  workflow: WorkflowDefinition;
  scope: "team" | "bot" | "global";
  group: BotGroup | null;
  ownerBot: Bot | null;
}

function findWorkflowMatch(
  list: readonly WorkflowDefinition[] | undefined,
  key: string,
): WorkflowDefinition | undefined {
  if (!list || list.length === 0) return undefined;
  return (
    list.find((w) => w.id === key) ??
    list.find((w) => w.name.trim().toLowerCase() === key.toLowerCase())
  );
}

/**
 * Resolves a workflow by ID (or exact name fallback) from the team's workflows first,
 * then from global workflow templates (`settings.workflows`).
 */
export function resolveWorkflowForCaller(
  workflowId: string,
  callerBotId: string,
  groups: readonly BotGroup[],
  globalWorkflows: readonly WorkflowDefinition[],
  groupId?: string,
  allowCrossTeam = false,
): WorkflowLookupResult {
  let group: BotGroup | null = null;
  if (groupId) {
    group = groups.find((g) => g.id === groupId) ?? null;
    if (!group) {
      throw new Error(`Team "${groupId}" not found.`);
    }
    if (!allowCrossTeam && group.leadId !== callerBotId && !group.memberIds.includes(callerBotId)) {
      throw new Error(`Bot "${callerBotId}" is not on team "${groupId}".`);
    }
  } else {
    group = primaryGroupForBot(callerBotId, groups);
  }

  const key = workflowId.trim();
  const teamWorkflows = group?.workflows ?? [];
  const teamMatch = findWorkflowMatch(teamWorkflows, key);
  if (teamMatch) {
    return { workflow: teamMatch, scope: "team", group };
  }

  const globalMatch = findWorkflowMatch(globalWorkflows, key);
  if (globalMatch) {
    return { workflow: globalMatch, scope: "global", group };
  }

  const available = [...teamWorkflows, ...globalWorkflows];
  if (available.length === 0) {
    throw new Error(`No workflow "${workflowId}" found, and no workflows are configured for this team or globally.`);
  }
  const listing = available.map((w) => `"${w.id}" (${w.name})`).join(", ");
  throw new Error(`Workflow "${workflowId}" not found. Available workflows: ${listing}.`);
}

function resolveWorkflowForRpc(
  workflowId: string,
  groups: readonly BotGroup[],
  bots: readonly Bot[],
  globalWorkflows: readonly WorkflowDefinition[],
  groupId?: string,
): RpcWorkflowLookupResult {
  const key = workflowId.trim();
  const trimmedGroupId = groupId?.trim();

  if (trimmedGroupId) {
    const group = groups.find((g) => g.id === trimmedGroupId) ?? null;
    if (!group) {
      throw new Error(`Team "${trimmedGroupId}" not found.`);
    }
    const teamMatch = findWorkflowMatch(group.workflows, key);
    if (teamMatch) {
      return { workflow: teamMatch, scope: "team", group, ownerBot: null };
    }
    for (const bot of bots) {
      if (bot.id !== group.leadId && !group.memberIds.includes(bot.id)) continue;
      const botWorkflows = (bot as Bot & { workflows?: WorkflowDefinition[] }).workflows;
      const botMatch = findWorkflowMatch(botWorkflows, key);
      if (botMatch) {
        return { workflow: botMatch, scope: "bot", group, ownerBot: bot };
      }
    }
    const globalMatch = findWorkflowMatch(globalWorkflows, key);
    if (globalMatch) {
      return { workflow: globalMatch, scope: "global", group, ownerBot: null };
    }
  } else {
    for (const group of groups) {
      const teamMatch = findWorkflowMatch(group.workflows, key);
      if (teamMatch) {
        return { workflow: teamMatch, scope: "team", group, ownerBot: null };
      }
    }
    for (const bot of bots) {
      const botWorkflows = (bot as Bot & { workflows?: WorkflowDefinition[] }).workflows;
      const botMatch = findWorkflowMatch(botWorkflows, key);
      if (botMatch) {
        return {
          workflow: botMatch,
          scope: "bot",
          group: primaryGroupForBot(bot.id, groups),
          ownerBot: bot,
        };
      }
    }
    const globalMatch = findWorkflowMatch(globalWorkflows, key);
    if (globalMatch) {
      const workflowGroupId = (globalMatch as WorkflowDefinition & { groupId?: string }).groupId;
      const explicitWorkflowGroup = workflowGroupId
        ? groups.find((g) => g.id === workflowGroupId) ?? null
        : null;
      return { workflow: globalMatch, scope: "global", group: explicitWorkflowGroup, ownerBot: null };
    }
  }

  const available = [
    ...groups.flatMap((g) => g.workflows ?? []),
    ...bots.flatMap((b) => (b as Bot & { workflows?: WorkflowDefinition[] }).workflows ?? []),
    ...globalWorkflows,
  ];
  if (available.length === 0) {
    throw new Error(`No workflow "${workflowId}" found, and no workflows are configured.`);
  }
  const listing = available.map((w) => `"${w.id}" (${w.name})`).join(", ");
  throw new Error(`Workflow "${workflowId}" not found. Available workflows: ${listing}.`);
}

export interface StartWorkflowInput {
  workflowId: string;
  input?: string;
  groupId?: string;
  taskId?: string;
  wait?: boolean;
  waitTimeoutMs?: number;
  notifyCallerOnSettle?: boolean;
  dispatchStage?: (ctx: StageDispatchContext) => Promise<StageDispatchResult>;
}

export interface StartWorkflowResult {
  taskId: string;
  workflow: WorkflowDefinition;
  scope: "team" | "global";
  state: WorkflowRunState;
  settled: boolean;
}

interface LaunchResolvedWorkflowInput<TScope extends "team" | "bot" | "global"> {
  host: BotsHost;
  relay: Relay;
  bots: readonly Bot[];
  workflow: WorkflowDefinition;
  scope: TScope;
  group: BotGroup | null;
  userInput?: string;
  taskId?: string;
  callerBotId?: string;
  callerAgentId?: string;
  notifyCallerOnSettle: boolean;
  wait?: boolean;
  waitTimeoutMs?: number;
  dispatchStage?: (ctx: StageDispatchContext) => Promise<StageDispatchResult>;
}

async function launchResolvedWorkflow<TScope extends "team" | "bot" | "global">(
  args: LaunchResolvedWorkflowInput<TScope>,
): Promise<{
  taskId: string;
  workflow: WorkflowDefinition;
  scope: TScope;
  state: WorkflowRunState;
  settled: boolean;
}> {
  const { workflow, scope, group, host, relay, bots } = args;
  const dag = validateWorkflowDAG(workflow.stages);
  if (!dag.valid) {
    throw new Error(`Workflow "${workflow.name}" has an invalid DAG: ${dag.error}`);
  }

  const botMap = new Map(bots.map((b) => [b.id, b]));
  const initialState = initWorkflowRunState(
    workflow,
    (botId) => botMap.get(botId) ?? null,
    (botId) => botMap.get(botId)?.provider,
  );

  const taskId = args.taskId?.trim() || newWorkflowTaskId();
  await openTask({
    taskId,
    title: `Workflow: ${workflow.name}`,
    acceptance: `All ${workflow.stages.length} stage(s) of "${workflow.name}" complete.`,
    ...(group ? { groupId: group.id } : {}),
    ...(args.callerAgentId ? { sourceChatId: args.callerAgentId } : {}),
    workflow: initialState,
  });

  await publishWorkflowCard(host, taskId, args.callerAgentId).catch(() => false);

  const dagPromise = runWorkflowDag({
    host,
    relay,
    taskId,
    workflow,
    userInput: args.userInput,
    group,
    callerBotId: args.callerBotId,
    callerAgentId: args.callerAgentId,
    notifyCallerOnSettle: args.notifyCallerOnSettle,
    ...(args.dispatchStage ? { dispatchStage: args.dispatchStage } : {}),
  });

  if (args.wait) {
    const waitMs = args.waitTimeoutMs ?? WORKFLOW_WAIT_MS;
    const outcome = await Promise.race([
      dagPromise.then((state) => ({ settled: true as const, state })),
      new Promise<{ settled: false }>((resolve) => setTimeout(() => resolve({ settled: false }), waitMs)),
    ]);
    if (outcome.settled) {
      return { taskId, workflow, scope, state: outcome.state, settled: true };
    }
    const latest = (await readTask(taskId).catch(() => null))?.workflow ?? initialState;
    return { taskId, workflow, scope, state: latest, settled: false };
  }

  void dagPromise.catch((error: unknown) => {
    console.error(`paseo-bots: workflow "${workflow.id}" (task ${taskId}) crashed`, error);
  });

  return { taskId, workflow, scope, state: initialState, settled: false };
}

/**
 * Validates, initializes, persists, and starts a workflow DAG run on the Task Pyramid.
 */
export async function startWorkflowExecution(
  caller: ToolCaller,
  args: StartWorkflowInput,
): Promise<StartWorkflowResult> {
  const values = await caller.host.values().catch(() => null);
  const groups = values?.groups ?? [];
  const globalWorkflows = values?.workflows ?? [];

  const { workflow, scope, group } = resolveWorkflowForCaller(
    args.workflowId,
    caller.bot.id,
    groups,
    globalWorkflows,
    args.groupId,
    isGlobalAssistantBot(caller.bot),
  );

  const bots = await caller.host.bots().catch(() => [] as Bot[]);
  return launchResolvedWorkflow({
    host: caller.host,
    relay: caller.relay,
    bots,
    workflow,
    scope,
    group,
    userInput: args.input,
    taskId: args.taskId,
    callerBotId: caller.bot.id,
    callerAgentId: caller.agentId,
    notifyCallerOnSettle: args.notifyCallerOnSettle ?? !args.wait,
    wait: args.wait,
    waitTimeoutMs: args.waitTimeoutMs,
    dispatchStage: args.dispatchStage,
  });
}

export interface StartWorkflowRpcInput {
  workflowId: string;
  goal: string;
  groupId?: string;
  params?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface StartWorkflowRpcOptions {
  relay?: Relay;
  wait?: boolean;
  waitTimeoutMs?: number;
  dispatchStage?: (ctx: StageDispatchContext) => Promise<StageDispatchResult>;
}

export interface StartWorkflowRpcResult {
  ok: boolean;
  taskId?: string;
  chatId?: string;
  status?: string;
  reused?: boolean;
  card?: TaskCard;
  error?: string;
}

async function latestBotChatId(host: BotsHost, botId: string | undefined): Promise<string | undefined> {
  if (!botId || !host.paseo?.agents?.list) return undefined;
  try {
    const page = await host.paseo.agents.list({
      filter: { labels: { [BOT_LABEL]: botId }, includeArchived: false },
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: 1 },
    });
    const id = page.entries[0]?.agent?.id;
    return typeof id === "string" && id.trim() ? id : undefined;
  } catch {
    return undefined;
  }
}

function formatRpcUserInput(goal: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return goal;
  return `${goal}\n\nParameters:\n${JSON.stringify(params, null, 2)}`;
}

/**
 * Starts a workflow run directly from RPC (`bots.workflows.run`), handling lookup,
 * idempotency deduplication, and TaskCard response construction.
 */
export async function startWorkflowFromRpc(
  host: BotsHost,
  input: StartWorkflowRpcInput,
  options?: StartWorkflowRpcOptions,
): Promise<StartWorkflowRpcResult> {
  const workflowId = input.workflowId?.trim();
  if (!workflowId) {
    return { ok: false, error: "Workflow ID is required." };
  }
  const goal = input.goal?.trim();
  if (!goal) {
    return { ok: false, error: "Workflow goal is required." };
  }

  try {
    const values = await host.values().catch(() => null);
    const groups = values?.groups ?? [];
    const globalWorkflows = values?.workflows ?? [];
    const bots = await host.bots().catch(() => [] as Bot[]);

    const resolved = resolveWorkflowForRpc(
      workflowId,
      groups,
      bots,
      globalWorkflows,
      input.groupId,
    );

    const idemKey = input.idempotencyKey?.trim();
    const derivedTaskId = idemKey
      ? `wf-idem-${createHash("sha256").update(`${resolved.workflow.id}:${resolved.group?.id ?? ""}:${idemKey}`).digest("hex").slice(0, 16)}`
      : undefined;

    if (derivedTaskId) {
      const inflight = inflightIdempotentRuns.get(derivedTaskId);
      if (inflight) {
        const res = await inflight;
        return res.ok ? { ...res, reused: true } : res;
      }
    }

    const executeRun = async (): Promise<StartWorkflowRpcResult> => {
      if (derivedTaskId) {
        const existing = await readTask(derivedTaskId).catch(() => null);
        if (existing?.workflow) {
          const card = taskCardOf(existing);
          const chatId =
            existing.sourceChatId ??
            existing.cardAgentId ??
            existing.workflow.stages.find((s) => s.chatId)?.chatId ??
            undefined;
          return {
            ok: true,
            taskId: existing.taskId,
            ...(chatId ? { chatId } : {}),
            status: existing.workflow.status ?? existing.status,
            reused: true,
            card,
          };
        }
      }

      const callerBot =
        resolved.ownerBot ??
        (resolved.group?.leadId ? bots.find((b) => b.id === resolved.group!.leadId) : undefined) ??
        bots.find((b) => b.id === resolved.workflow.stages[0]?.botId) ??
        null;
      const sourceChatId = await latestBotChatId(host, callerBot?.id);

      const res = await launchResolvedWorkflow({
        host,
        relay: options?.relay ?? ({} as Relay),
        bots,
        workflow: resolved.workflow,
        scope: resolved.scope,
        group: resolved.group,
        userInput: formatRpcUserInput(goal, input.params),
        ...(derivedTaskId ? { taskId: derivedTaskId } : {}),
        ...(callerBot?.id ? { callerBotId: callerBot.id } : {}),
        ...(sourceChatId ? { callerAgentId: sourceChatId } : {}),
        notifyCallerOnSettle: false,
        wait: options?.wait ?? false,
        waitTimeoutMs: options?.waitTimeoutMs,
        dispatchStage: options?.dispatchStage,
      });

      const latestRecord = await readTask(res.taskId).catch(() => null);
      const card = latestRecord ? taskCardOf(latestRecord) : undefined;
      const chatId =
        latestRecord?.sourceChatId ??
        latestRecord?.cardAgentId ??
        sourceChatId ??
        res.state.stages.find((s) => s.chatId)?.chatId ??
        undefined;

      return {
        ok: true,
        taskId: res.taskId,
        ...(chatId ? { chatId } : {}),
        status: latestRecord?.workflow?.status ?? res.state.status,
        reused: false,
        ...(card ? { card } : {}),
      };
    };

    if (!derivedTaskId) {
      return await executeRun();
    }

    const promise = executeRun();
    inflightIdempotentRuns.set(derivedTaskId, promise);
    try {
      return await promise;
    } finally {
      inflightIdempotentRuns.delete(derivedTaskId);
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const runWorkflowTool = defineTool({
  name: "run_workflow",
  description:
    "Execute a configured multi-stage workflow DAG (team-scoped or global template). Validates the workflow, opens a task line with live Stage/DAG progress card in chat, and runs stages in topological dependency order with automatic engine routing (native vs paseo-bot) and bounded retries.",
  input: z.object({
    workflow_id: z.string().trim().min(1).max(100).describe("ID (or exact name) of the team or global workflow to run."),
    input: z.string().max(20_000).optional().describe("Self-contained task brief, objective, scope, and acceptance criteria passed to the workflow stages."),
    group_id: z.string().trim().min(1).max(200).optional().describe("Optional team ID when the bot belongs to multiple teams."),
    task_id: z.string().trim().min(1).max(200).optional().describe("Optional task ID to bind this workflow run to."),
    wait: z.boolean().optional().describe("Wait up to 45s for the workflow to finish (default false; returns immediately with live card tracking)."),
  }),
  async run({ workflow_id, input, group_id, task_id, wait = false }, caller) {
    const res = await startWorkflowExecution(caller, {
      workflowId: workflow_id,
      input,
      groupId: group_id,
      taskId: task_id,
      wait,
    });
    const stageLines = res.state.stages
      .map((s) => `- ${s.name} (${s.id}): bot=${s.botId}, engine=${s.engine}, status=${s.status}${s.dependsOn.length ? `, after=[${s.dependsOn.join(", ")}]` : ""}`)
      .join("\n");
    const statusLine = res.settled
      ? `${workflowSummaryText(res.state)} (task ${res.taskId})`
      : `Started ${res.scope} workflow "${res.workflow.name}" (task ${res.taskId}). Live progress card is tracking stages in chat.`;
    return `${statusLine}\n${stageLines}`;
  },
});

export const resumeWorkflowTool = defineTool({
  name: "resume_workflow",
  description:
    "Resume a failed or blocked workflow run from its completed stages. Preserves completed stage outputs and handoffs, resets failed/skipped stages to pending, and re-runs the DAG.",
  input: z.object({
    task_id: z.string().trim().min(1).max(200).describe("Task ID of the failed or blocked workflow run to resume."),
    wait: z.boolean().optional().describe("Wait up to 45s for the resumed workflow to finish (default false)."),
  }),
  async run({ task_id, wait = false }, caller) {
    const res = await resumeWorkflow({
      host: caller.host,
      relay: caller.relay,
      taskId: task_id,
      wait,
    });
    if (!res.ok || !res.state) {
      throw new Error(res.error ?? `Failed to resume workflow task "${task_id}".`);
    }
    const stageLines = res.state.stages
      .map((s) => `- ${s.name} (${s.id}): bot=${s.botId}, engine=${s.engine}, status=${s.status}`)
      .join("\n");
    const statusLine = res.settled
      ? `${workflowSummaryText(res.state)} (task ${task_id})`
      : `Resumed workflow "${res.state.workflowName}" (task ${task_id}). Live progress card is tracking stages in chat.`;
    return `${statusLine}\n${stageLines}`;
  },
});
