import { randomBytes } from "node:crypto";
import { z } from "zod";
import { primaryGroupForBot, type Bot, type BotGroup } from "../../shared/bot";
import {
  initWorkflowRunState,
  validateWorkflowDAG,
  workflowSummaryText,
  type WorkflowDefinition,
  type WorkflowRunState,
} from "../../shared/workflows";
import { openTask, readTask } from "../tasks";
import { publishWorkflowCard } from "../task-cards";
import { runWorkflowDag, type StageDispatchContext, type StageDispatchResult } from "../workflow-runner";
import { defineTool, type ToolCaller } from "./mcp";

const WORKFLOW_WAIT_MS = 45_000;

function newWorkflowTaskId(): string {
  return `wf-${randomBytes(4).toString("hex")}`;
}

export interface WorkflowLookupResult {
  workflow: WorkflowDefinition;
  scope: "team" | "global";
  group: BotGroup | null;
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
): WorkflowLookupResult {
  let group: BotGroup | null = null;
  if (groupId) {
    group = groups.find((g) => g.id === groupId) ?? null;
    if (!group || (group.leadId !== callerBotId && !group.memberIds.includes(callerBotId))) {
      throw new Error(`Bot "${callerBotId}" is not on team "${groupId}".`);
    }
  } else {
    group = primaryGroupForBot(callerBotId, groups);
  }

  const key = workflowId.trim();
  const teamWorkflows = group?.workflows ?? [];
  const teamMatch = teamWorkflows.find((w) => w.id === key)
    ?? teamWorkflows.find((w) => w.name.trim().toLowerCase() === key.toLowerCase());
  if (teamMatch) {
    return { workflow: teamMatch, scope: "team", group };
  }

  const globalMatch = globalWorkflows.find((w) => w.id === key)
    ?? globalWorkflows.find((w) => w.name.trim().toLowerCase() === key.toLowerCase());
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

export interface StartWorkflowInput {
  workflowId: string;
  input?: string;
  groupId?: string;
  taskId?: string;
  wait?: boolean;
  waitTimeoutMs?: number;
  dispatchStage?: (ctx: StageDispatchContext) => Promise<StageDispatchResult>;
}

export interface StartWorkflowResult {
  taskId: string;
  workflow: WorkflowDefinition;
  scope: "team" | "global";
  state: WorkflowRunState;
  settled: boolean;
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
  );

  const dag = validateWorkflowDAG(workflow.stages);
  if (!dag.valid) {
    throw new Error(`Workflow "${workflow.name}" has an invalid DAG: ${dag.error}`);
  }

  const bots = await caller.host.bots().catch(() => [] as Bot[]);
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
    workflow: initialState,
  });

  await publishWorkflowCard(caller.host, taskId, caller.agentId).catch(() => false);

  const dagPromise = runWorkflowDag({
    host: caller.host,
    relay: caller.relay,
    taskId,
    workflow,
    userInput: args.input,
    group,
    callerBotId: caller.bot.id,
    callerAgentId: caller.agentId,
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
