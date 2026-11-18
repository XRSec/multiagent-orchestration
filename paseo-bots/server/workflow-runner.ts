import { lastTurn } from "../shared/activity";
import type { Bot, BotGroup } from "../shared/bot";
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
import { startChat } from "./chats";
import type { BotsHost } from "./host";
import type { Relay } from "./relay";
import { publishWorkflowCard, settleAndPublish } from "./task-cards";
import { readTask, rekeyMember, reserveMemberSlot, updateTaskWorkflow, upsertMember } from "./tasks";

const DEFAULT_STAGE_WAIT_MS = 5 * 60 * 1000;
const SLOT_WAIT_MS = 500;
const MAX_SLOT_WAIT_ATTEMPTS = 20;

export interface StageDispatchContext {
  taskId: string;
  workflow: WorkflowDefinition;
  stage: WorkflowStageDefinition;
  stageState: TaskStageState;
  engine: "native" | "paseo-bot";
  bot: Bot | null;
  prompt: string;
  chatId: string;
  group?: BotGroup | null;
  callerBotId?: string;
  callerAgentId?: string;
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
  stageTimeoutMs?: number;
  /** Optional hook for testing or custom stage dispatch. */
  dispatchStage?: (ctx: StageDispatchContext) => Promise<StageDispatchResult>;
}

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
    ...(ctx.callerBotId ? { [ASKED_BY_LABEL]: ctx.callerBotId } : {}),
    ...(ctx.callerAgentId ? { [ASKED_IN_LABEL]: ctx.callerAgentId } : {}),
  };
  const stageSkillIds = ctx.stage.skillIds !== undefined
    ? Array.from(new Set([...(targetBot.skillIds ?? []), ...ctx.stage.skillIds]))
    : undefined;
  const stageMcpServerIds = ctx.stage.mcpServerIds !== undefined
    ? Array.from(new Set([...(targetBot.mcpServerIds ?? []), ...ctx.stage.mcpServerIds]))
    : undefined;

  const chatId = await startChat(host, relay, targetBot, {
    prompt: ctx.prompt,
    title: `[${ctx.workflow.name}] ${ctx.stage.name}`,
    labels,
    agentId: ctx.chatId,
    ...(ctx.group !== undefined ? { group: ctx.group } : {}),
    ...(ctx.callerBotId ? { askedByBotId: ctx.callerBotId } : {}),
    engine: ctx.engine,
    ...(stageSkillIds !== undefined ? { skillIds: stageSkillIds } : {}),
    ...(stageMcpServerIds !== undefined ? { mcpServerIds: stageMcpServerIds } : {}),
  });

  if (chatId !== ctx.chatId) {
    await rekeyMember(ctx.taskId, ctx.chatId, chatId).catch(() => null);
  }
  await upsertMember(ctx.taskId, {
    engine: ctx.engine,
    botId: targetBot.id,
    handleId: chatId,
    status: "running",
  }).catch(() => null);

  await paseo.agents.ref(chatId).waitForFinish(stageTimeoutMs).catch(() => null);
  const snapshot = await paseo.agents.ref(chatId).refresh().catch(() => null);
  const agent = snapshot?.agent;
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

  const page = await paseo.agents.ref(chatId).timeline.refetch({ direction: "tail", projection: "projected", limit: 80 }).catch(() => null);
  const items = (page?.entries ?? []).map((entry) => entry.item as { type: string; text?: unknown; name?: unknown });
  const reply = lastTurn(items).reply;
  const handoff = parseWorkerHandoff(reply);
  if (handoff.hasBlock && (handoff.status === "FAILED" || handoff.status === "BLOCKED")) {
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
 * Executes a validated Workflow DAG on an existing TaskRecord:
 * - Topological dependency resolution (`readyStages`)
 * - Parallel execution of all ready stages per wave
 * - Bounded per-stage retries (`maxRetries`) with <repair_brief> context
 * - Failure propagation (marks blocked downstream stages as "skipped")
 * - Live Stage/DAG progress cards via `publishWorkflowCard` and terminal settlement via `settleAndPublish`
 */
export async function runWorkflowDag(options: RunWorkflowOptions): Promise<WorkflowRunState> {
  const { host, relay, taskId, workflow, userInput, group, callerBotId, callerAgentId, stageTimeoutMs = DEFAULT_STAGE_WAIT_MS, dispatchStage } = options;

  const dagCheck = validateWorkflowDAG(workflow.stages);
  if (!dagCheck.valid) {
    throw new Error(`Invalid workflow DAG "${workflow.name}": ${dagCheck.error}`);
  }

  const stageDefMap = new Map(workflow.stages.map((s) => [s.id, s]));
  const bots = await host.bots().catch(() => [] as Bot[]);
  const botMap = new Map(bots.map((b) => [b.id, b]));

  await publishWorkflowCard(host, taskId, callerAgentId).catch(() => false);

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
        const reservedChatId = newUuid();

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
          .map((dep) => ({ stageId: dep.id, stageName: dep.name, output: dep.output! }));

        const prompt = buildStageBriefPrompt({
          workflowName: workflow.name,
          stage: stageDef,
          userInput,
          upstreamOutputs,
          attempt: stageState.retries + 1,
          previousError: stageState.error,
        });

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
            group,
            callerBotId,
            callerAgentId,
          };
          result = dispatchStage
            ? await dispatchStage(ctx)
            : await defaultStageDispatcher(host, relay, ctx, stageTimeoutMs);
        } catch (err) {
          result = { ok: false, error: err instanceof Error ? err.message : String(err), chatId: reservedChatId };
        }

        const effectiveChatId = result.chatId ?? reservedChatId;
        const now = new Date().toISOString();

        if (result.ok) {
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
                ? { ...s, engine: resolvedEngine, status: "done", output: result.output ?? "", error: null, chatId: effectiveChatId, completedAt: now }
                : s,
            ),
          }));
        } else {
          const errorMessage = result.error || `Stage "${stageDef.name}" failed.`;
          await upsertMember(taskId, {
            engine: resolvedEngine,
            botId: stageDef.botId,
            handleId: effectiveChatId,
            status: "failed",
          }).catch(() => null);

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
}
