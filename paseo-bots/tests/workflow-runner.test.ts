import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BotSchema, type Bot, type BotGroup } from "../shared/bot";
import { initWorkflowRunState, WorkflowDefinitionSchema } from "../shared/workflows";
import type { BotsHost } from "../server/host";
import type { Relay } from "../server/relay";
import {
  cancelAndDrainAgent,
  computeBackoffMs,
  injectWorkspaceSnapshotToPrompt,
  isTransientApiError,
  waitForStageWithHeartbeat,
} from "../server/workflow-runner";

const NOW = "2026-11-18T00:00:00.000Z";
let home = "";
const previousHome = process.env.PASEO_HOME;
const previousAgyAgentsDir = process.env.AGY_AGENTS_DIR;

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "paseo-bots-wf-runner-"));
  process.env.PASEO_HOME = home;
  process.env.AGY_AGENTS_DIR = join(home, "agents");
});

afterAll(() => {
  if (previousHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = previousHome;
  if (previousAgyAgentsDir === undefined) delete process.env.AGY_AGENTS_DIR;
  else process.env.AGY_AGENTS_DIR = previousAgyAgentsDir;
  rmSync(home, { recursive: true, force: true });
});

function makeBot(patch: Partial<Bot> & { id: string; name: string }): Bot {
  return BotSchema.parse({
    avatar: { seed: patch.id, palette: null, shape: "circle", imageUrl: null },
    provider: "agy",
    contactBots: "ask",
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  });
}

function makeFakeHost(bots: Bot[], groups: BotGroup[]) {
  const appended: { id?: string; kind?: string; data?: unknown }[] = [];
  const paseo = {
    agents: {
      list: async () => ({ entries: [{ agent: { id: "lead-chat-1" } }] }),
      ref: () => ({
        timeline: {
          append: async (entry: { id?: string; kind?: string; data?: unknown }) => {
            appended.push(entry);
          },
          refetch: async () => ({ entries: [] }),
        },
      }),
    },
  };
  let currentPaseo: unknown = paseo;
  const host = {
    get paseo() {
      return currentPaseo;
    },
    attach(next: unknown) {
      currentPaseo = next;
    },
    onAttach: () => () => {},
    chatOf: async () => ({ botId: "bot-lead", title: null, routineId: null, labels: {} }),
    values: async () => ({ bots, groups }),
    library: async () => ({ skills: [], mcpServers: [] }),
    requirePaseo: () => currentPaseo,
    bots: async () => bots,
    bot: async (id: string) => bots.find((b) => b.id === id) ?? null,
  } as unknown as BotsHost;
  const relay = {
    mountTools: async () => [],
    mountApps: async () => null,
  } as unknown as Relay;
  return { host, relay, appended };
}

describe("workflow-runner DAG execution", () => {
  it("runs diamond DAG with parallel stages, passes upstream outputs, and publishes live cards", async () => {
    const { openTask, readTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");

    const bots = [
      makeBot({ id: "bot-lead", name: "moAdmin" }),
      makeBot({ id: "bot-scout", name: "Scout", contactBots: "off", playbooks: [] }),
      makeBot({ id: "bot-coder", name: "Coder", contactBots: "ask" }),
      makeBot({ id: "bot-docs", name: "Docs", contactBots: "off", playbooks: [] }),
      makeBot({ id: "bot-ci", name: "CI", contactBots: "off", playbooks: [] }),
    ];
    const group: BotGroup = {
      id: "team-1",
      name: "Core",
      logo: null,
      leadId: "bot-lead",
      memberIds: bots.map((b) => b.id),
      instructions: "",
      cwd: null,
      mounts: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-diamond",
      name: "Diamond Delivery",
      stages: [
        { id: "research", name: "Research", botId: "bot-scout", prompt: "Analyze", engine: "auto" },
        { id: "code", name: "Code", botId: "bot-coder", prompt: "Implement", engine: "paseo-bot", dependsOn: ["research"] },
        { id: "docs", name: "Docs", botId: "bot-docs", prompt: "Document", engine: "native", dependsOn: ["research"] },
        { id: "verify", name: "Verify", botId: "bot-ci", prompt: "Test", engine: "auto", dependsOn: ["code", "docs"] },
      ],
    });

    const botMap = new Map(bots.map((b) => [b.id, b]));
    const initial = initWorkflowRunState(workflow, (id) => botMap.get(id) ?? null, (id) => botMap.get(id)?.provider);
    await openTask({
      taskId: "task-wf-diamond",
      title: "Workflow: Diamond Delivery",
      acceptance: "All stages complete",
      groupId: group.id,
      workflow: initial,
    });

    const { host, relay, appended } = makeFakeHost(bots, [group]);
    const startedTimes = new Map<string, number>();
    const resolvedEngines = new Map<string, string>();
    let verifyPrompt = "";

    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "task-wf-diamond",
      workflow,
      userInput: "Implement Route 3",
      group,
      callerBotId: "bot-lead",
      callerAgentId: "lead-chat-1",
      dispatchStage: async (ctx) => {
        startedTimes.set(ctx.stage.id, Date.now());
        resolvedEngines.set(ctx.stage.id, ctx.engine);
        if (ctx.stage.id === "verify") verifyPrompt = ctx.prompt;
        await new Promise((r) => setTimeout(r, 15));
        return { ok: true, output: `Result from ${ctx.stage.id}` };
      },
    });

    expect(finalState.status).toBe("done");
    expect(finalState.stages.every((s) => s.status === "done")).toBe(true);
    expect(resolvedEngines.get("research")).toBe("native");
    expect(resolvedEngines.get("code")).toBe("paseo-bot");
    expect(resolvedEngines.get("docs")).toBe("native");
    expect(resolvedEngines.get("verify")).toBe("native");

    // Verify parallel wave: code & docs started after research, and before verify
    expect(startedTimes.get("code")!).toBeGreaterThanOrEqual(startedTimes.get("research")!);
    expect(startedTimes.get("docs")!).toBeGreaterThanOrEqual(startedTimes.get("research")!);
    expect(startedTimes.get("verify")!).toBeGreaterThanOrEqual(startedTimes.get("code")!);
    expect(startedTimes.get("verify")!).toBeGreaterThanOrEqual(startedTimes.get("docs")!);

    // Verify upstream outputs were injected into verify prompt
    expect(verifyPrompt).toContain("Result from code");
    expect(verifyPrompt).toContain("Result from docs");

    // Verify task persistence & live card emissions
    const persisted = await readTask("task-wf-diamond");
    expect(persisted?.status).toBe("done");
    expect(persisted?.settledAt).not.toBeNull();
    expect(persisted?.members).toHaveLength(4);
    expect(appended.length).toBeGreaterThanOrEqual(2);
    const lastCard = appended[appended.length - 1]!.data as { status: string; workflow?: { status: string } };
    expect(lastCard.status).toBe("done");
    expect(lastCard.workflow?.status).toBe("done");
  });

  it("retries failed stages up to maxRetries with <repair_brief> and recovers", async () => {
    const { openTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");

    const bots = [makeBot({ id: "bot-lead", name: "Lead" }), makeBot({ id: "bot-worker", name: "Worker" })];
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-retry",
      name: "Retry Test",
      stages: [
        { id: "build", name: "Build", botId: "bot-worker", prompt: "Build it", maxRetries: 2 },
      ],
    });
    const initial = initWorkflowRunState(workflow);
    await openTask({ taskId: "task-wf-retry", title: "Workflow: Retry Test", acceptance: "Done", workflow: initial });

    const { host, relay } = makeFakeHost(bots, []);
    let attempts = 0;
    let sawRepairBrief = false;

    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "task-wf-retry",
      workflow,
      callerAgentId: "lead-chat-1",
      dispatchStage: async (ctx) => {
        attempts += 1;
        if (attempts === 1) {
          return { ok: false, error: "Syntax error in module" };
        }
        if (ctx.prompt.includes("<repair_brief>") && ctx.prompt.includes("Syntax error in module")) {
          sawRepairBrief = true;
        }
        return { ok: true, output: "Build succeeded" };
      },
    });

    expect(attempts).toBe(2);
    expect(sawRepairBrief).toBe(true);
    expect(finalState.status).toBe("done");
    expect(finalState.stages[0]?.retries).toBe(1);
    expect(finalState.stages[0]?.status).toBe("done");
  });

  it("propagates failure and marks downstream stages skipped when retries are exhausted", async () => {
    const { openTask, readTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");

    const bots = [makeBot({ id: "bot-lead", name: "Lead" }), makeBot({ id: "bot-worker", name: "Worker" })];
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-fail",
      name: "Failure Propagation",
      stages: [
        { id: "step1", name: "Step 1", botId: "bot-worker", prompt: "Fail step", maxRetries: 1 },
        { id: "step2", name: "Step 2", botId: "bot-worker", prompt: "Downstream", dependsOn: ["step1"] },
      ],
    });
    const initial = initWorkflowRunState(workflow);
    await openTask({ taskId: "task-wf-fail", title: "Workflow: Fail", acceptance: "Done", workflow: initial });

    const { host, relay } = makeFakeHost(bots, []);
    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "task-wf-fail",
      workflow,
      callerAgentId: "lead-chat-1",
      dispatchStage: async () => ({ ok: false, error: "Persistent failure" }),
    });

    expect(finalState.status).toBe("failed");
    expect(finalState.stages[0]?.status).toBe("failed");
    expect(finalState.stages[0]?.retries).toBe(1);
    expect(finalState.stages[1]?.status).toBe("skipped");

    const task = await readTask("task-wf-fail");
    expect(task?.status).toBe("blocked");
    expect(task?.settledAt).not.toBeNull();
  });

  it("passes stage-level skillIds and mcpServerIds overrides in dispatch context", async () => {
    const { openTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");

    const bots = [
      makeBot({ id: "bot-lead", name: "Lead" }),
      makeBot({ id: "bot-worker", name: "Worker", skillIds: ["bot-default-skill"], mcpServerIds: ["bot-default-mcp"] }),
    ];
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-overrides",
      name: "Skill & MCP Overrides",
      stages: [
        {
          id: "step1",
          name: "Step 1",
          botId: "bot-worker",
          prompt: "Do work with stage skills",
          skillIds: ["stage-skill-1"],
          mcpServerIds: ["stage-mcp-1"],
        },
      ],
    });
    const initial = initWorkflowRunState(workflow);
    await openTask({ taskId: "task-wf-overrides", title: "Workflow: Overrides", acceptance: "Done", workflow: initial });

    const { host, relay } = makeFakeHost(bots, []);
    let capturedCtx: any = null;

    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "task-wf-overrides",
      workflow,
      callerAgentId: "lead-chat-1",
      dispatchStage: async (ctx) => {
        capturedCtx = ctx;
        return { ok: true, output: "Success" };
      },
    });

    expect(finalState.status).toBe("done");
    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx.stage.skillIds).toEqual(["stage-skill-1"]);
    expect(capturedCtx.stage.mcpServerIds).toEqual(["stage-mcp-1"]);
  });

  it("avoids double wf- prefix in teamSessionId and injects SESSION_BOARD + TASK_MANIFEST", async () => {
    const { openTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");

    const bots = [makeBot({ id: "bot-lead", name: "Lead" }), makeBot({ id: "bot-worker", name: "Worker" })];
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-prefix-check",
      name: "Prefix Check",
      stages: [{ id: "step1", name: "Step 1", botId: "bot-worker", prompt: "Inspect manifest" }],
    });
    const initial = initWorkflowRunState(workflow);
    await openTask({ taskId: "wf-deadbeef", title: "Workflow: Prefix Check", acceptance: "Done", workflow: initial });

    const { host, relay } = makeFakeHost(bots, []);
    let capturedTeamSessionId = "";
    let capturedPrompt = "";

    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "wf-deadbeef",
      workflow,
      callerAgentId: "lead-chat-1",
      dispatchStage: async (ctx) => {
        capturedTeamSessionId = ctx.teamSessionId ?? "";
        capturedPrompt = ctx.prompt;
        return { ok: true, output: "Done" };
      },
    });

    expect(finalState.status).toBe("done");
    expect(capturedTeamSessionId).toBe("wf-deadbeef");
    expect(finalState.teamSessionId).toBe("wf-deadbeef");
    expect(capturedPrompt).toContain("- SESSION_BOARD:");
    expect(capturedPrompt).toContain("- TASK_MANIFEST:");
    expect(capturedPrompt).toContain("TASK_MANIFEST.md");
  });

  it("reconciles orphan running workflow tasks on startup or past staleness threshold (DoD-2)", async () => {
    const { openTask, readTask, updateTaskWorkflow } = await import("../server/tasks");
    const { reconcileOrphanWorkflows } = await import("../server/workflow-runner");

    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-orphan",
      name: "Orphan Pipeline",
      stages: [
        { id: "s1", name: "Stage 1", botId: "bot-worker", prompt: "Step 1" },
        { id: "s2", name: "Stage 2", botId: "bot-worker", prompt: "Step 2", dependsOn: ["s1"] },
      ],
    });

    await openTask({
      taskId: "task-orphan-1",
      title: "Orphan Run",
      acceptance: "Done",
      workflow: initWorkflowRunState(workflow),
    });
    await updateTaskWorkflow("task-orphan-1", (wf) => ({
      ...wf,
      currentStageIds: ["s1"],
      stages: wf.stages.map((s) => (s.id === "s1" ? { ...s, status: "running", startedAt: "2026-01-01T00:00:00.000Z" } : s)),
    }));

    const reconciled = await reconcileOrphanWorkflows({ staleAfterMs: 0 });
    expect(reconciled.some((r) => r.taskId === "task-orphan-1")).toBe(true);

    const settled = await readTask("task-orphan-1");
    expect(settled?.workflow?.status).toBe("failed");
    expect(settled?.workflow?.stages[0]?.status).toBe("failed");
    expect(settled?.workflow?.stages[0]?.error).toContain("interrupted");
    expect(settled?.workflow?.stages[1]?.status).toBe("skipped");
    expect(settled?.status).toBe("blocked");
    expect(settled?.settledAt).not.toBeNull();
  });

  it("reuses prior stage chatId via sendBotMessage on <repair_brief> retries (DoD-3B)", async () => {
    const { openTask, readTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");
    const { EMPTY_LIBRARY } = await import("../shared/bot");

    const bots = [makeBot({ id: "bot-worker", name: "Worker", model: "gemini-3.8-flash" })];
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-retry-reuse",
      name: "Retry Reuse",
      stages: [{ id: "step1", name: "Step 1", botId: "bot-worker", prompt: "Build feature", maxRetries: 1 }],
    });
    await openTask({
      taskId: "task-retry-reuse",
      title: "Workflow: Retry Reuse",
      acceptance: "Done",
      workflow: initWorkflowRunState(workflow),
    });

    const sentMessages: { agentId: string; text: string }[] = [];
    const createdAgents = new Set<string>();
    let createCalls = 0;
    const fakePaseo = {
      providers: {
        list: async () => [{ provider: "agy", status: "ready", models: [{ id: "gemini-3.8-flash" }] }],
      },
      projects: {
        list: async () => ({ projects: [] }),
        rename: async () => {},
      },
      workspaces: {
        list: async () => ({ entries: [] }),
        open: async () => ({
          current: () => ({ projectId: "proj-1", projectDisplayName: "Bots" }),
          refresh: async () => ({ projectId: "proj-1", projectDisplayName: "Bots" }),
          archive: async () => {},
        }),
        create: async () => ({ id: "ws-1", current: () => ({ id: "ws-1" }), refresh: async () => ({ id: "ws-1" }) }),
        ref: (ws: any) => ({
          id: ws?.id ?? "ws-1",
          current: () => ws,
          setTitle: async () => {},
        }),
      },
      agents: {
        list: async () => ({ entries: [{ agent: { id: "lead-chat-1" } }] }),
        create: async (opts: any) => {
          createCalls += 1;
          const id = opts.agentId ?? `created-${createCalls}`;
          createdAgents.add(id);
          return { id, status: "idle" };
        },
        ref: (id: string) => ({
          send: async (text: string) => {
            sentMessages.push({ agentId: id, text });
          },
          waitForFinish: async () => {},
          refresh: async () => (createdAgents.has(id) ? { agent: { id, status: "idle" } } : null),
          timeline: {
            append: async () => {},
            refetch: async () => ({
              entries: [
                {
                  item: {
                    type: "assistant_message",
                    text:
                      createCalls === 1 && sentMessages.length === 0
                        ? "<worker_handoff>\nSTATUS: FAILED\nSUMMARY: Compile error\nOPEN_ISSUES: Type error\n</worker_handoff>"
                        : "<worker_handoff>\nSTATUS: PASS\nSUMMARY: Fixed\nOPEN_ISSUES: None\n</worker_handoff>",
                  },
                },
              ],
            }),
          },
        }),
      },
    };
    const host = {
      paseo: fakePaseo,
      attach() {},
      onAttach: () => () => {},
      chatOf: async () => ({ botId: "bot-lead", title: null, routineId: null, labels: {} }),
      values: async () => ({ bots, groups: [], library: EMPTY_LIBRARY }),
      library: async () => EMPTY_LIBRARY,
      requirePaseo: () => fakePaseo,
      bots: async () => bots,
      bot: async (id: string) => bots.find((b) => b.id === id) ?? null,
    } as unknown as BotsHost;
    const relay = {
      mountTools: async () => null,
      mountApps: async () => null,
    } as unknown as Relay;

    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "task-retry-reuse",
      workflow,
      callerAgentId: "lead-chat-1",
    });

    expect(finalState.status).toBe("done");
    expect(createCalls).toBe(1);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.agentId).toBe(finalState.stages[0]!.chatId);
    expect(sentMessages[0]!.text).toContain("<repair_brief>");

    const task = await readTask("task-retry-reuse");
    expect(task?.settledAt).not.toBeNull();
  });

  it("resets stall timer on incremental heartbeat activity and detects zero-activity stalls", async () => {
    // 1. Activity resets stall timer
    let status = "running";
    let updatedAt = "2026-11-18T00:00:00.000Z";
    let timelineCount = 1;
    const fakePaseo = {
      agents: {
        ref: () => ({
          refresh: async () => ({ agent: { status, updatedAt } }),
          timeline: {
            refetch: async () => ({ entries: Array.from({ length: timelineCount }, (_, i) => ({ id: `e-${i}` })) }),
          },
          waitForFinish: async (ms: number) => {
            await new Promise((r) => setTimeout(r, Math.min(ms, 20)));
          },
        }),
      },
    };

    const timer = setInterval(() => {
      timelineCount += 1;
      updatedAt = new Date().toISOString();
    }, 20);

    const finishTimeout = setTimeout(() => {
      status = "idle";
      clearInterval(timer);
    }, 80);

    const activeResult = await waitForStageWithHeartbeat(fakePaseo, "chat-active", {
      stallTimeoutMs: 50,
      hardTimeoutMs: 500,
      pollIntervalMs: 15,
    });
    clearTimeout(finishTimeout);
    clearInterval(timer);

    expect(activeResult.completed).toBe(true);
    expect(activeResult.stalled).toBe(false);

    // 2. Zero activity triggers stall
    const staticPaseo = {
      agents: {
        ref: () => ({
          refresh: async () => ({ agent: { status: "running", updatedAt: "static" } }),
          timeline: { refetch: async () => ({ entries: [{ id: "e-1" }] }) },
          waitForFinish: async (ms: number) => {
            await new Promise((r) => setTimeout(r, Math.min(ms, 15)));
          },
        }),
      },
    };

    const stallResult = await waitForStageWithHeartbeat(staticPaseo, "chat-stalled", {
      stallTimeoutMs: 40,
      hardTimeoutMs: 500,
      pollIntervalMs: 15,
    });
    expect(stallResult.stalled).toBe(true);
    expect(stallResult.completed).toBe(false);
  });

  it("calls cancel() and drains running agent before retry (Single-Writer Exclusion)", async () => {
    let cancelCalled = false;
    let agentStatus = "running";
    const fakePaseo = {
      agents: {
        ref: (id: string) => ({
          cancel: async () => {
            cancelCalled = true;
            agentStatus = "idle";
          },
          refresh: async () => ({ agent: { id, status: agentStatus } }),
        }),
      },
    };

    const drained = await cancelAndDrainAgent(fakePaseo, "stuck-chat", {
      drainTimeoutMs: 500,
      pollIntervalMs: 10,
    });

    expect(cancelCalled).toBe(true);
    expect(drained).toBe(true);
    expect(agentStatus).toBe("idle");
  });

  it("pre-persists chatId immediately after startChat returns, and in-place resumes with sendBotMessage on retry", async () => {
    const { openTask, readTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");
    const { EMPTY_LIBRARY } = await import("../shared/bot");

    const bots = [makeBot({ id: "bot-worker", name: "Worker", model: "gemini-3.8-flash" })];
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-stall-resume",
      name: "Stall and In-Place Resume",
      stages: [{ id: "step1", name: "Step 1", botId: "bot-worker", prompt: "Compute data", maxRetries: 1 }],
    });
    await openTask({
      taskId: "task-stall-resume",
      title: "Workflow: Stall and In-Place Resume",
      acceptance: "Done",
      workflow: initWorkflowRunState(workflow),
    });

    let cancelCalled = false;
    let turnCount = 0;
    const sentMessages: { agentId: string; text: string }[] = [];
    let prePersistedChatId: string | null = null;

    let agentStatus = "running";
    const fakePaseo = {
      providers: { list: async () => [{ provider: "agy", status: "ready", models: [{ id: "gemini-3.8-flash" }] }] },
      projects: { list: async () => ({ projects: [] }), rename: async () => {} },
      workspaces: {
        list: async () => ({ entries: [] }),
        open: async () => ({ current: () => ({ projectId: "p-1" }), refresh: async () => ({ projectId: "p-1" }), archive: async () => {} }),
        create: async () => ({ id: "ws-1", current: () => ({ id: "ws-1" }), refresh: async () => ({ id: "ws-1" }) }),
        ref: () => ({ setTitle: async () => {} }),
      },
      agents: {
        list: async () => ({ entries: [{ agent: { id: "caller-1" } }] }),
        create: async (opts: any) => {
          const id = opts.agentId ?? "chat-stall-1";
          return { id, status: "idle" };
        },
        ref: (id: string) => ({
          cancel: async () => {
            cancelCalled = true;
            agentStatus = "idle";
          },
          send: async (text: string) => {
            sentMessages.push({ agentId: id, text });
            agentStatus = "idle";
          },
          waitForFinish: async (ms: number) => {
            if (turnCount === 1) {
              const taskOnDisk = await readTask("task-stall-resume");
              prePersistedChatId = taskOnDisk?.workflow?.stages[0]?.chatId ?? null;
              await new Promise((r) => setTimeout(r, ms));
            } else {
              agentStatus = "idle";
            }
          },
          refresh: async () => {
            turnCount += 1;
            if (turnCount === 1) {
              agentStatus = "running";
            }
            return { agent: { id, status: agentStatus, updatedAt: "static-ts" } };
          },
          timeline: {
            append: async () => {},
            refetch: async () => ({
              entries: [
                {
                  item: {
                    type: "assistant_message",
                    text:
                      sentMessages.length > 0
                        ? "<worker_handoff>\nSTATUS: PASS\nSUMMARY: Recovered\nOPEN_ISSUES: None\n</worker_handoff>"
                        : "Still calculating...",
                  },
                },
              ],
            }),
          },
        }),
      },
    };

    const host = {
      paseo: fakePaseo,
      attach() {},
      onAttach: () => () => {},
      chatOf: async () => ({ botId: "bot-lead", title: null, routineId: null, labels: {} }),
      values: async () => ({ bots, groups: [], library: EMPTY_LIBRARY }),
      library: async () => EMPTY_LIBRARY,
      requirePaseo: () => fakePaseo,
      bots: async () => bots,
      bot: async (id: string) => bots.find((b) => b.id === id) ?? null,
    } as unknown as BotsHost;
    const relay = {
      mountTools: async () => null,
      mountApps: async () => null,
    } as unknown as Relay;

    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "task-stall-resume",
      workflow,
      callerAgentId: "caller-1",
      stallTimeoutMs: 30,
      hardTimeoutMs: 500,
    });

    expect(finalState.status).toBe("done");
    expect(prePersistedChatId).not.toBeNull();
    expect(prePersistedChatId).toBe(finalState.stages[0]?.chatId);
    expect(cancelCalled).toBe(true);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.agentId).toBe(finalState.stages[0]?.chatId);
    expect(sentMessages[0]!.text).toContain("<repair_brief>");
  });

  it("applies exponential backoff ONLY for transient API errors (429, 5xx, Transport, rate limit) and not timeouts", async () => {
    // 1. isTransientApiError unit tests
    expect(isTransientApiError("429 Too Many Requests")).toBe(true);
    expect(isTransientApiError("500 Internal Server Error")).toBe(true);
    expect(isTransientApiError("502 Bad Gateway")).toBe(true);
    expect(isTransientApiError("503 Service Unavailable")).toBe(true);
    expect(isTransientApiError("Transport not connected")).toBe(true);
    expect(isTransientApiError("Rate limit exceeded for model")).toBe(true);
    expect(isTransientApiError("Provider 'antigravity' not configured")).toBe(true);
    expect(isTransientApiError("provider agy not configured")).toBe(true);
    expect(isTransientApiError("AI model provider is not configured")).toBe(true);

    // Negative tests: timeouts, stalls, validation
    expect(isTransientApiError('Stage "build" stalled with no activity for 120s in chat "c-1".')).toBe(false);
    expect(isTransientApiError('Stage "build" timed out after 300s in chat "c-1".')).toBe(false);
    expect(isTransientApiError("Syntax error in module.ts: line 4")).toBe(false);
    expect(isTransientApiError("Invalid workflow DAG: cycle detected")).toBe(false);
    expect(isTransientApiError("FAILED: Tests failed with exit code 1")).toBe(false);

    // computeBackoffMs unit tests
    expect(computeBackoffMs(0, 100)).toBe(100);
    expect(computeBackoffMs(1, 100)).toBe(200);
    expect(computeBackoffMs(2, 100)).toBe(400);
    expect(computeBackoffMs(10, 100, 1000)).toBe(1000);

    // 2. Integration test in runWorkflowDag
    const { openTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");

    const bots = [makeBot({ id: "bot-w", name: "Worker" })];
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-backoff-test",
      name: "Backoff Test",
      stages: [{ id: "s1", name: "S1", botId: "bot-w", prompt: "Run", maxRetries: 1 }],
    });
    await openTask({
      taskId: "task-backoff-test",
      title: "Workflow: Backoff Test",
      acceptance: "Done",
      workflow: initWorkflowRunState(workflow),
    });

    const { host, relay } = makeFakeHost(bots, []);
    let attempts = 0;
    const startTime = Date.now();

    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "task-backoff-test",
      workflow,
      callerAgentId: "lead-chat-1",
      backoffBaseMs: 40,
      dispatchStage: async () => {
        attempts += 1;
        if (attempts === 1) {
          return { ok: false, error: "429 Too Many Requests" };
        }
        return { ok: true, output: "Success" };
      },
    });

    const elapsed = Date.now() - startTime;
    expect(attempts).toBe(2);
    expect(finalState.status).toBe("done");
    expect(elapsed).toBeGreaterThanOrEqual(35); // Waited exponential backoff (~40ms)
  });

  it("injects workspace git status & diff into <repair_brief> on fallback recreate", () => {
    const prompt = "<repair_brief>\n- WORKFLOW: W1\n- STAGE_ID: S1\n</repair_brief>\n\n<task_brief>\nDo work\n</task_brief>";
    const snapshot = {
      status: "M src/app.ts\n?? src/new.ts",
      diff: " src/app.ts | 5 ++++-\n 1 file changed, 4 insertions(+), 1 deletion(-)",
    };

    const injected = injectWorkspaceSnapshotToPrompt(prompt, snapshot);
    expect(injected).toContain("- WORKSPACE_GIT_STATUS:\n```\nM src/app.ts");
    expect(injected).toContain("- WORKSPACE_GIT_DIFF:\n```\n src/app.ts");
    expect(injected).toContain("</repair_brief>");
  });

  it("supports passing pre-fetched tasks to reconcileOrphanWorkflows to avoid double-scanning", async () => {
    const { openTask, readTask, updateTaskWorkflow } = await import("../server/tasks");
    const { reconcileOrphanWorkflows } = await import("../server/workflow-runner");

    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-orphan-prefetched",
      name: "Prefetched Orphan Pipeline",
      stages: [{ id: "s1", name: "Stage 1", botId: "bot-worker", prompt: "Step 1" }],
    });

    await openTask({
      taskId: "task-orphan-prefetched",
      title: "Prefetched Orphan Run",
      acceptance: "Done",
      workflow: initWorkflowRunState(workflow),
    });
    await updateTaskWorkflow("task-orphan-prefetched", (wf) => ({
      ...wf,
      stages: wf.stages.map((s) => ({ ...s, status: "running", startedAt: "2026-01-01T00:00:00.000Z" })),
    }));

    const task = await readTask("task-orphan-prefetched");
    expect(task).not.toBeNull();

    const reconciled = await reconcileOrphanWorkflows({ tasks: [task!], staleAfterMs: 0 });
    expect(reconciled.some((r) => r.taskId === "task-orphan-prefetched")).toBe(true);

    const settled = await readTask("task-orphan-prefetched");
    expect(settled?.workflow?.status).toBe("failed");
    expect(settled?.status).toBe("blocked");
  });

  it("rescues cleanly completed sessions in reconcileOrphanWorkflows before settling remaining stages", async () => {
    const { openTask, readTask, updateTaskWorkflow } = await import("../server/tasks");
    const { reconcileOrphanWorkflows } = await import("../server/workflow-runner");
    const { existsSync, readFileSync } = await import("node:fs");

    const sessionBoardPath = join(home, "board-rescue-test");
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-orphan-rescue",
      name: "Rescue Pipeline",
      stages: [
        { id: "s1", name: "Stage 1", botId: "bot-worker", prompt: "Step 1" },
        { id: "s2", name: "Stage 2", botId: "bot-worker", prompt: "Step 2", dependsOn: ["s1"] },
      ],
    });

    const initWf = initWorkflowRunState(workflow);
    initWf.sessionBoardPath = sessionBoardPath;

    await openTask({
      taskId: "task-orphan-rescue",
      title: "Rescue Run",
      acceptance: "Done",
      workflow: initWf,
    });

    // Mark s1 as running with chatId "chat-clean-done", and s2 as pending
    await updateTaskWorkflow("task-orphan-rescue", (wf) => ({
      ...wf,
      stages: wf.stages.map((s) =>
        s.id === "s1"
          ? { ...s, status: "running", chatId: "chat-clean-done", startedAt: "2026-01-01T00:00:00.000Z" }
          : s,
      ),
    }));

    const mockPaseo = {
      agents: {
        ref: (chatId: string) => {
          if (chatId === "chat-clean-done") {
            return {
              refresh: async () => ({
                agent: {
                  status: "idle",
                  lastError: null,
                  archivedAt: null,
                  pendingPermissions: [],
                },
              }),
              timeline: {
                refetch: async () => ({
                  entries: [
                    {
                      item: {
                        type: "assistant_message",
                        text: "<worker_handoff>\nSTATUS: PASS\nSUMMARY: Stage 1 executed cleanly.\nVERIFICATION_PROOF: vitest ok\n</worker_handoff>",
                      },
                    },
                  ],
                }),
                append: async () => {},
              },
            };
          }
          return null;
        },
      },
    };

    const host = {
      paseo: mockPaseo,
      requirePaseo: () => mockPaseo,
      chatOf: async () => ({ botId: "bot-worker", title: null, routineId: null, labels: {} }),
      values: async () => ({ bots: [], groups: [] }),
    } as unknown as BotsHost;

    const task = await readTask("task-orphan-rescue");
    expect(task).not.toBeNull();

    const reconciled = await reconcileOrphanWorkflows({ host, tasks: [task!], staleAfterMs: 0 });
    expect(reconciled.some((r) => r.taskId === "task-orphan-rescue")).toBe(true);

    const settled = await readTask("task-orphan-rescue");
    const s1 = settled?.workflow?.stages.find((s) => s.id === "s1");
    const s2 = settled?.workflow?.stages.find((s) => s.id === "s2");

    // s1 was cleanly completed, so it was rescued to done
    expect(s1?.status).toBe("done");
    expect(s1?.output).toContain("Stage 1 executed cleanly.");
    expect(s1?.handoffFilePath).toBe(join(sessionBoardPath, "handoffs", "s1-bot-worker.md"));
    expect(existsSync(s1!.handoffFilePath!)).toBe(true);
    expect(readFileSync(s1!.handoffFilePath!, "utf-8")).toContain("Stage 1 executed cleanly.");

    // s2 was pending and got skipped as a dead stage
    expect(s2?.status).toBe("skipped");
    expect(settled?.workflow?.status).toBe("failed");
    expect(settled?.status).toBe("blocked");
  });

  it("wakes callerAgentId with distilled stage summary on background workflow completion when notifyCallerOnSettle is enabled", async () => {
    const { openTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");

    const bots = [
      makeBot({ id: "bot-lead", name: "moAdmin" }),
      makeBot({ id: "bot-worker", name: "Worker" }),
    ];
    const group: BotGroup = {
      id: "team-wake",
      name: "TeamWake",
      logo: null,
      leadId: "bot-lead",
      memberIds: bots.map((b) => b.id),
      instructions: "",
      cwd: null,
      mounts: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-wake-caller",
      name: "Wake Caller Workflow",
      stages: [
        { id: "s1", name: "Planning", botId: "bot-lead", prompt: "Plan", engine: "auto" },
        { id: "s2", name: "Execution", botId: "bot-worker", prompt: "Execute", engine: "auto", dependsOn: ["s1"] },
      ],
    });

    const botMap = new Map(bots.map((b) => [b.id, b]));
    const initial = initWorkflowRunState(workflow, (id) => botMap.get(id) ?? null, (id) => botMap.get(id)?.provider);
    await openTask({
      taskId: "task-wf-wake-caller",
      title: "Workflow: Wake Caller",
      acceptance: "All stages complete",
      groupId: group.id,
      workflow: initial,
    });

    const sentMessages: { agentId: string; text: string; options?: unknown }[] = [];
    const mockCallerRef = {
      refresh: async () => ({
        agent: {
          id: "caller-chat-wake-1",
          status: "idle",
          archivedAt: null,
        },
      }),
      send: async (text: string, options?: unknown) => {
        sentMessages.push({ agentId: "caller-chat-wake-1", text, options });
      },
      timeline: {
        append: async () => {},
        refetch: async () => ({ entries: [] }),
      },
    };

    const mockPaseo = {
      agents: {
        list: async () => ({ entries: [{ agent: { id: "caller-chat-wake-1" } }] }),
        ref: (id: string) => {
          if (id === "caller-chat-wake-1") return mockCallerRef;
          return {
            timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
          };
        },
      },
    };

    const host = {
      paseo: mockPaseo,
      requirePaseo: () => mockPaseo,
      chatOf: async () => ({ botId: "bot-lead", title: null, routineId: null, labels: {} }),
      values: async () => ({ bots, groups: [group] }),
      library: async () => ({ skills: [], mcpServers: [] }),
      bots: async () => bots,
      bot: async (id: string) => bots.find((b) => b.id === id) ?? null,
    } as unknown as BotsHost;

    const relay = {
      mountTools: async () => [],
      mountApps: async () => null,
    } as unknown as Relay;

    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "task-wf-wake-caller",
      workflow,
      userInput: "Please execute full workflow in background",
      group,
      callerBotId: "bot-lead",
      callerAgentId: "caller-chat-wake-1",
      notifyCallerOnSettle: true,
      dispatchStage: async (ctx) => {
        return {
          ok: true,
          output: `Output of ${ctx.stage.name}: finished successfully with handoff deliverables.`,
        };
      },
    });

    expect(finalState.status).toBe("done");
    expect(finalState.stages.every((s) => s.status === "done")).toBe(true);

    // Verify callerAgentId received the completion wake via sendBotMessage
    expect(sentMessages).toHaveLength(1);
    const wake = sentMessages[0]!;
    expect(wake.agentId).toBe("caller-chat-wake-1");
    expect(wake.text).toContain("[Workflow Completion: Wake Caller Workflow — DONE]");
    expect(wake.text).toContain("Workflow \"Wake Caller Workflow\" has completed with status: **done**.");
    expect(wake.text).toContain("Planning");
    expect(wake.text).toContain("Execution");
    expect(wake.text).toContain("handoffs/s1-bot-lead.md");
    expect(wake.text).toContain("handoffs/s2-bot-worker.md");
    expect(wake.text).toContain("Output of Execution: finished successfully with handoff deliverables.");
    expect(wake.text).toContain("Please review the final results and deliver the report to the user.");
  });

  it("safely skips waking callerAgentId when caller chat is archived", async () => {
    const { openTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");

    const bots = [makeBot({ id: "bot-worker", name: "Worker" })];
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-archived-caller",
      name: "Archived Caller",
      stages: [{ id: "step1", name: "Step 1", botId: "bot-worker", prompt: "Work", engine: "auto" }],
    });
    const botMap = new Map(bots.map((b) => [b.id, b]));
    const initial = initWorkflowRunState(workflow, (id) => botMap.get(id) ?? null, (id) => botMap.get(id)?.provider);
    await openTask({
      taskId: "task-wf-archived-caller",
      title: "Workflow: Archived Caller",
      acceptance: "Done",
      workflow: initial,
    });

    let sendCalled = false;
    const mockCallerRef = {
      refresh: async () => ({
        agent: {
          id: "archived-chat",
          status: "idle",
          archivedAt: new Date().toISOString(),
        },
      }),
      send: async () => {
        sendCalled = true;
      },
      timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
    };

    const mockPaseo = {
      agents: {
        list: async () => ({ entries: [] }),
        ref: (id: string) => (id === "archived-chat" ? mockCallerRef : { timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) } }),
      },
    };

    const host = {
      paseo: mockPaseo,
      requirePaseo: () => mockPaseo,
      chatOf: async () => ({ botId: "bot-worker", title: null, routineId: null, labels: {} }),
      values: async () => ({ bots, groups: [] }),
      library: async () => ({ skills: [], mcpServers: [] }),
      bots: async () => bots,
      bot: async (id: string) => bots.find((b) => b.id === id) ?? null,
    } as unknown as BotsHost;

    const relay = { mountTools: async () => [], mountApps: async () => null } as unknown as Relay;

    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "task-wf-archived-caller",
      workflow,
      callerAgentId: "archived-chat",
      notifyCallerOnSettle: true,
      dispatchStage: async () => ({ ok: true, output: "Done" }),
    });

    expect(finalState.status).toBe("done");
    expect(sendCalled).toBe(false);
  });

  it("archives stage child chats upon workflow settlement while strictly sparing callerAgentId and already-archived chats", async () => {
    const { openTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");

    const bots = [
      makeBot({ id: "bot-stage-1", name: "Worker 1" }),
      makeBot({ id: "bot-stage-2", name: "Worker 2" }),
      makeBot({ id: "bot-stage-3", name: "Worker 3" }),
    ];
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-archive-stages",
      name: "Archive Stages",
      stages: [
        { id: "step1", name: "Step 1", botId: "bot-stage-1", prompt: "Work 1", engine: "auto" },
        { id: "step2", name: "Step 2", botId: "bot-stage-2", prompt: "Work 2", engine: "auto", dependsOn: ["step1"] },
        { id: "step3", name: "Step 3", botId: "bot-stage-3", prompt: "Work 3", engine: "auto", dependsOn: ["step2"] },
      ],
    });
    const botMap = new Map(bots.map((b) => [b.id, b]));
    const initial = initWorkflowRunState(workflow, (id) => botMap.get(id) ?? null, (id) => botMap.get(id)?.provider);
    await openTask({
      taskId: "task-wf-archive-stages",
      title: "Workflow: Archive Stages",
      acceptance: "Done",
      workflow: initial,
    });

    const archivedChatIds: string[] = [];
    const callerArchiveSpy = vi.fn(async () => {
      archivedChatIds.push("caller-chat-id");
    });
    const stage1ArchiveSpy = vi.fn(async () => {
      archivedChatIds.push("stage-chat-1");
    });
    const stage2ArchiveSpy = vi.fn(async () => {
      archivedChatIds.push("stage-chat-2");
    });
    const stage3AlreadyArchivedSpy = vi.fn(async () => {
      archivedChatIds.push("stage-chat-3");
    });

    const mockRefs: Record<string, any> = {
      "caller-chat-id": {
        refresh: async () => ({ agent: { id: "caller-chat-id", status: "idle", archivedAt: null } }),
        archive: callerArchiveSpy,
        send: async () => {},
        timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
      },
      "stage-chat-1": {
        refresh: async () => ({ agent: { id: "stage-chat-1", status: "idle", archivedAt: null } }),
        archive: stage1ArchiveSpy,
        timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
      },
      "stage-chat-2": {
        refresh: async () => ({ agent: { id: "stage-chat-2", status: "idle", archivedAt: null } }),
        archive: stage2ArchiveSpy,
        timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
      },
      "stage-chat-3": {
        refresh: async () => ({ agent: { id: "stage-chat-3", status: "idle", archivedAt: "2026-11-18T00:00:00.000Z" } }),
        archive: stage3AlreadyArchivedSpy,
        timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
      },
    };

    const mockPaseo = {
      agents: {
        list: async () => ({ entries: [] }),
        ref: (id: string) => mockRefs[id] ?? {
          timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
        },
      },
    };

    const host = {
      paseo: mockPaseo,
      requirePaseo: () => mockPaseo,
      chatOf: async () => ({ botId: "bot-stage-1", title: null, routineId: null, labels: {} }),
      values: async () => ({ bots, groups: [] }),
      library: async () => ({ skills: [], mcpServers: [] }),
      bots: async () => bots,
      bot: async (id: string) => bots.find((b) => b.id === id) ?? null,
    } as unknown as BotsHost;

    const relay = { mountTools: async () => [], mountApps: async () => null } as unknown as Relay;

    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "task-wf-archive-stages",
      workflow,
      callerAgentId: "caller-chat-id",
      notifyCallerOnSettle: true,
      dispatchStage: async (ctx) => {
        if (ctx.stage.id === "step1") {
          return { ok: true, output: "Stage 1 Done", chatId: "stage-chat-1" };
        }
        if (ctx.stage.id === "step2") {
          return { ok: true, output: "Stage 2 Done", chatId: "stage-chat-2" };
        }
        return { ok: true, output: "Stage 3 Done", chatId: "stage-chat-3" };
      },
    });

    expect(finalState.status).toBe("done");

    // Stage 1 and 2 must be archived
    expect(stage1ArchiveSpy).toHaveBeenCalledTimes(1);
    expect(stage2ArchiveSpy).toHaveBeenCalledTimes(1);
    expect(archivedChatIds).toContain("stage-chat-1");
    expect(archivedChatIds).toContain("stage-chat-2");

    // Stage 3 was already archived; its archive method must not be called
    expect(stage3AlreadyArchivedSpy).not.toHaveBeenCalled();

    // callerAgentId must NEVER be archived
    expect(callerArchiveSpy).not.toHaveBeenCalled();
    expect(archivedChatIds).not.toContain("caller-chat-id");
  });

  it("archives stage child chats upon failed workflow terminal settlement without archiving callerAgentId", async () => {
    const { openTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");

    const bots = [
      makeBot({ id: "bot-stage-1", name: "Worker 1" }),
      makeBot({ id: "bot-stage-2", name: "Worker 2" }),
    ];
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-archive-failed",
      name: "Archive Failed",
      stages: [
        { id: "step1", name: "Step 1", botId: "bot-stage-1", prompt: "Work 1", engine: "auto" },
        { id: "step2", name: "Step 2", botId: "bot-stage-2", prompt: "Work 2", engine: "auto", dependsOn: ["step1"] },
      ],
    });
    const botMap = new Map(bots.map((b) => [b.id, b]));
    const initial = initWorkflowRunState(workflow, (id) => botMap.get(id) ?? null, (id) => botMap.get(id)?.provider);
    await openTask({
      taskId: "task-wf-archive-failed",
      title: "Workflow: Archive Failed",
      acceptance: "Done",
      workflow: initial,
    });

    const stage1ArchiveSpy = vi.fn(async () => {});
    const callerArchiveSpy = vi.fn(async () => {});

    const mockRefs: Record<string, any> = {
      "caller-chat-fail": {
        refresh: async () => ({ agent: { id: "caller-chat-fail", status: "idle", archivedAt: null } }),
        archive: callerArchiveSpy,
        send: async () => {},
        timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
      },
      "stage-chat-fail-1": {
        refresh: async () => ({ agent: { id: "stage-chat-fail-1", status: "idle", archivedAt: null } }),
        archive: stage1ArchiveSpy,
        timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
      },
    };

    const mockPaseo = {
      agents: {
        list: async () => ({ entries: [] }),
        ref: (id: string) => mockRefs[id] ?? {
          timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
        },
      },
    };

    const host = {
      paseo: mockPaseo,
      requirePaseo: () => mockPaseo,
      chatOf: async () => ({ botId: "bot-stage-1", title: null, routineId: null, labels: {} }),
      values: async () => ({ bots, groups: [] }),
      library: async () => ({ skills: [], mcpServers: [] }),
      bots: async () => bots,
      bot: async (id: string) => bots.find((b) => b.id === id) ?? null,
    } as unknown as BotsHost;

    const relay = { mountTools: async () => [], mountApps: async () => null } as unknown as Relay;

    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "task-wf-archive-failed",
      workflow,
      callerAgentId: "caller-chat-fail",
      notifyCallerOnSettle: true,
      dispatchStage: async () => {
        return { ok: false, error: "Unrecoverable fatal failure", chatId: "stage-chat-fail-1" };
      },
    });

    expect(finalState.status).toBe("failed");
    expect(stage1ArchiveSpy).toHaveBeenCalledTimes(1);
    expect(callerArchiveSpy).not.toHaveBeenCalled();
  });

  it("archiveWorkflowStageChats deduplicates, ignores empty/caller chatIds, and safely handles errors", async () => {
    const { archiveWorkflowStageChats } = await import("../server/workflow-runner");

    const archivedCalls: string[] = [];
    const mockPaseo = {
      agents: {
        ref: (id: string) => {
          if (id === "throwing-chat") {
            return {
              archive: vi.fn(async () => {
                throw new Error("Simulated archive failure");
              }),
            };
          }
          return {
            archive: vi.fn(async () => {
              archivedCalls.push(id);
            }),
          };
        },
      },
    };

    const host = {
      paseo: mockPaseo,
    } as unknown as BotsHost;

    await archiveWorkflowStageChats(host, {
      stages: [
        { chatId: "chat-duplicate" },
        { chatId: "chat-duplicate" },
        { chatId: "caller-chat" },
        { chatId: "  " },
        { chatId: null },
        { chatId: "throwing-chat" },
        { chatId: "chat-unique" },
      ],
      callerAgentId: "caller-chat",
    });

    expect(archivedCalls).toEqual(["chat-duplicate", "chat-unique"]);
  });

  it("immediately archives completed stage session on stage status 'done' before subsequent stages finish", async () => {
    const { openTask } = await import("../server/tasks");
    const { runWorkflowDag } = await import("../server/workflow-runner");

    const bots = [
      makeBot({ id: "bot-stage-1", name: "Worker 1" }),
      makeBot({ id: "bot-stage-2", name: "Worker 2" }),
    ];
    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-immediate-stage-archive",
      name: "Immediate Stage Archive Pipeline",
      stages: [
        { id: "step1", name: "Step 1", botId: "bot-stage-1", prompt: "Work 1", engine: "auto" },
        { id: "step2", name: "Step 2", botId: "bot-stage-2", prompt: "Work 2", engine: "auto", dependsOn: ["step1"] },
      ],
    });
    const botMap = new Map(bots.map((b) => [b.id, b]));
    const initial = initWorkflowRunState(workflow, (id) => botMap.get(id) ?? null, (id) => botMap.get(id)?.provider);
    await openTask({
      taskId: "task-wf-immediate-stage-archive",
      title: "Workflow: Immediate Stage Archive",
      acceptance: "Done",
      workflow: initial,
    });

    const timeline: string[] = [];
    const stage1ArchiveSpy = vi.fn(async () => {
      timeline.push("archive:stage-1");
    });
    const stage2ArchiveSpy = vi.fn(async () => {
      timeline.push("archive:stage-2");
    });

    const mockRefs: Record<string, any> = {
      "stage-chat-seq-1": {
        refresh: async () => ({ agent: { id: "stage-chat-seq-1", status: "idle", archivedAt: null } }),
        archive: stage1ArchiveSpy,
        timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
      },
      "stage-chat-seq-2": {
        refresh: async () => ({ agent: { id: "stage-chat-seq-2", status: "idle", archivedAt: null } }),
        archive: stage2ArchiveSpy,
        timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
      },
    };

    const mockPaseo = {
      agents: {
        list: async () => ({ entries: [] }),
        ref: (id: string) => mockRefs[id] ?? {
          timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) },
        },
      },
    };

    const host = {
      paseo: mockPaseo,
      requirePaseo: () => mockPaseo,
      chatOf: async () => ({ botId: "bot-stage-1", title: null, routineId: null, labels: {} }),
      values: async () => ({ bots, groups: [] }),
      library: async () => ({ skills: [], mcpServers: [] }),
      bots: async () => bots,
      bot: async (id: string) => bots.find((b) => b.id === id) ?? null,
    } as unknown as BotsHost;

    const relay = { mountTools: async () => [], mountApps: async () => null } as unknown as Relay;

    const finalState = await runWorkflowDag({
      host,
      relay,
      taskId: "task-wf-immediate-stage-archive",
      workflow,
      dispatchStage: async (ctx) => {
        if (ctx.stage.id === "step1") {
          timeline.push("finish:step1");
          return { ok: true, output: "Step 1 result", chatId: "stage-chat-seq-1" };
        }
        if (ctx.stage.id === "step2") {
          // Verify Stage 1 is ALREADY archived before Stage 2 completes!
          expect(timeline).toContain("archive:stage-1");
          timeline.push("finish:step2");
          return { ok: true, output: "Step 2 result", chatId: "stage-chat-seq-2" };
        }
        return { ok: false, error: "unknown stage" };
      },
    });

    expect(finalState.status).toBe("done");
    expect(finalState.chatsArchivedAt).toBeTruthy();
    expect(stage1ArchiveSpy).toHaveBeenCalled();
    expect(stage2ArchiveSpy).toHaveBeenCalled();
    // Stage 1 archive must have occurred before Step 2 finished
    const archive1Index = timeline.indexOf("archive:stage-1");
    const finish2Index = timeline.indexOf("finish:step2");
    expect(archive1Index).toBeGreaterThan(-1);
    expect(finish2Index).toBeGreaterThan(-1);
    expect(archive1Index).toBeLessThan(finish2Index);
  });

  it("reconcileOrphanWorkflows archives stage chatIds of reconciled orphan workflows (excluding cardAgentId) and stamps chatsArchivedAt", async () => {
    const { openTask, readTask, updateTaskWorkflow } = await import("../server/tasks");
    const { reconcileOrphanWorkflows } = await import("../server/workflow-runner");

    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-orphan-archive",
      name: "Orphan Archive Pipeline",
      stages: [
        { id: "stg1", name: "Stage 1", botId: "bot-worker", prompt: "Step 1" },
        { id: "stg2", name: "Stage 2", botId: "bot-worker", prompt: "Step 2", dependsOn: ["stg1"] },
      ],
    });

    const initWf = initWorkflowRunState(workflow);
    await openTask({
      taskId: "task-orphan-archive-test",
      title: "Orphan Archive Task",
      acceptance: "Done",
      workflow: initWf,
    });

    // Populate stage chatIds and cardAgentId
    await updateTaskWorkflow("task-orphan-archive-test", (wf) => ({
      ...wf,
      stages: wf.stages.map((s, idx) => ({
        ...s,
        status: idx === 0 ? "running" : "pending",
        chatId: `orphan-stage-chat-${idx + 1}`,
      })),
    }));

    const archivedChats: string[] = [];
    const mockPaseo = {
      agents: {
        ref: (chatId: string) => ({
          refresh: async () => ({ agent: { id: chatId, status: "idle", archivedAt: null } }),
          archive: vi.fn(async () => {
            archivedChats.push(chatId);
          }),
          timeline: {
            refetch: async () => ({ entries: [] }),
            append: async () => {},
          },
        }),
      },
    };

    const host = {
      paseo: mockPaseo,
      requirePaseo: () => mockPaseo,
      chatOf: async () => ({ botId: "bot-worker", title: null, routineId: null, labels: {} }),
      values: async () => ({ bots: [], groups: [] }),
    } as unknown as BotsHost;

    const task = await readTask("task-orphan-archive-test");
    expect(task).not.toBeNull();
    task!.cardAgentId = "caller-card-chat-safe";

    const reconciled = await reconcileOrphanWorkflows({ host, tasks: [task!], staleAfterMs: 0 });
    expect(reconciled.length).toBe(1);
    expect(archivedChats).toContain("orphan-stage-chat-1");
    expect(archivedChats).toContain("orphan-stage-chat-2");
    expect(archivedChats).not.toContain("caller-card-chat-safe");

    const settled = await readTask("task-orphan-archive-test");
    expect(settled?.workflow?.chatsArchivedAt).toBeTruthy();
  });

  it("archiveSettledWorkflowStageChats retroactively archives already-settled historical tasks and stamps chatsArchivedAt", async () => {
    const { openTask, readTask, settleTask, updateTaskWorkflow } = await import("../server/tasks");
    const { archiveSettledWorkflowStageChats } = await import("../server/workflow-runner");
    const { MEMORY_CURATION_LABEL } = await import("../server/memory-curator");

    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-historical-1",
      name: "Historical Pipeline 1",
      stages: [
        { id: "h1", name: "Hist 1", botId: "bot-worker", prompt: "Step 1" },
      ],
    });

    // Pre-sweep any residue tasks on disk from prior tests in this suite
    const cleanupHost = {
      paseo: {
        agents: {
          ref: () => ({ refresh: async () => null, archive: async () => {} }),
        },
      },
    } as unknown as BotsHost;
    await archiveSettledWorkflowStageChats(cleanupHost);

    const archivedChats: string[] = [];
    const curationAgent = {
      id: "stale-curation-agent-1",
      status: "idle",
      archivedAt: null as string | null,
      labels: { [MEMORY_CURATION_LABEL]: "true" },
    };
    const mockPaseo = {
      agents: {
        list: async () => ({
          entries: curationAgent.archivedAt ? [] : [{ agent: curationAgent }],
        }),
        ref: (chatId: string) => ({
          refresh: async () => ({ agent: { id: chatId, status: "idle", archivedAt: null } }),
          archive: vi.fn(async () => {
            if (chatId === curationAgent.id) {
              curationAgent.archivedAt = new Date().toISOString();
            }
            archivedChats.push(chatId);
          }),
        }),
      },
    };

    const host = {
      paseo: mockPaseo,
      requirePaseo: () => mockPaseo,
    } as unknown as BotsHost;

    // Create 2 settled historical tasks
    for (const id of ["wf-hist-task-1", "wf-hist-task-2"]) {
      const initWf = initWorkflowRunState(workflow);
      initWf.status = "done";
      initWf.stages[0]!.status = "done";
      initWf.stages[0]!.chatId = `chat-${id}`;
      await openTask({
        taskId: id,
        title: `Historical ${id}`,
        acceptance: "Done",
        workflow: initWf,
      });
      await settleTask(id, { status: "done" });
    }

    // First call: retroactively archives the 2 tasks from disk and sweeps 1 stale memory curation chat
    const count1 = await archiveSettledWorkflowStageChats(host);
    expect(count1).toBe(2);
    expect(archivedChats).toContain("chat-wf-hist-task-1");
    expect(archivedChats).toContain("chat-wf-hist-task-2");
    expect(archivedChats).toContain("stale-curation-agent-1");

    const t1 = await readTask("wf-hist-task-1");
    const t2 = await readTask("wf-hist-task-2");
    expect(t1?.workflow?.chatsArchivedAt).toBeTruthy();
    expect(t2?.workflow?.chatsArchivedAt).toBeTruthy();

    // Second call: no-op since both tasks are stamped with chatsArchivedAt on disk
    archivedChats.length = 0;
    const count2 = await archiveSettledWorkflowStageChats(host);
    expect(count2).toBe(0);
    expect(archivedChats).toHaveLength(0);

    // Also supports passing in-memory pre-fetched tasks directly
    const countWithTasks = await archiveSettledWorkflowStageChats(host, { tasks: [t1!, t2!] });
    expect(countWithTasks).toBe(0);

    // If host.paseo is missing: returns 0
    const count3 = await archiveSettledWorkflowStageChats({ paseo: null } as any);
    expect(count3).toBe(0);
  });

  it("reconcileOrphanWorkflows passes wholeTurns: true on timeline.refetch and notifies callerAgentId once without duplicates", async () => {
    const { openTask, readTask } = await import("../server/tasks");
    const { reconcileOrphanWorkflows } = await import("../server/workflow-runner");

    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-orphan-notify",
      name: "Orphan Notify Pipeline",
      stages: [
        { id: "s1", name: "Stage 1", botId: "bot-worker", prompt: "Step 1" },
      ],
    });

    const initWf = initWorkflowRunState(workflow);
    initWf.status = "running";
    initWf.callerAgentId = "originating-caller-agent";
    initWf.callerBotId = "bot-moadmin";
    initWf.stages[0]!.status = "running";
    initWf.stages[0]!.chatId = "orphan-notify-stage-chat";

    await openTask({
      taskId: "task-orphan-notify-test",
      title: "Orphan Notify Test",
      acceptance: "Done",
      workflow: initWf,
    });

    const refetchCalls: Array<Record<string, unknown>> = [];
    const sentMessages: Array<{ agentId: string; text: string }> = [];

    const mockPaseo = {
      agents: {
        ref: (id: string) => ({
          refresh: async () => ({
            agent: {
              id,
              status: "idle",
              archivedAt: null,
              lastError: null,
              pendingPermissions: [],
            },
          }),
          archive: async () => {},
          send: async (text: string) => {
            sentMessages.push({ agentId: id, text });
          },
          timeline: {
            refetch: async (opts: Record<string, unknown>) => {
              refetchCalls.push(opts);
              return { entries: [] };
            },
            append: async () => {},
          },
        }),
      },
    };

    const host = {
      paseo: mockPaseo,
      requirePaseo: () => mockPaseo,
      bot: async () => null,
      chatOf: async () => null,
      values: async () => ({ bots: [], groups: [] }),
    } as unknown as BotsHost;

    const task = await readTask("task-orphan-notify-test");
    expect(task).not.toBeNull();
    task!.cardAgentId = "card-fallback-agent";

    // First run settles and notifies callerAgentId
    const reconciled1 = await reconcileOrphanWorkflows({ host, tasks: [task!], staleAfterMs: 0 });
    expect(reconciled1).toHaveLength(1);
    expect(refetchCalls.length).toBeGreaterThanOrEqual(1);
    expect(refetchCalls[0]).toMatchObject({ wholeTurns: true });
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.agentId).toBe("originating-caller-agent");
    expect(sentMessages[0]!.text).toContain("Orphan Notify Pipeline");
    expect(sentMessages[0]!.text).toContain("FAILED");

    // Second run on the already-settled task must not send duplicate notifications
    const settledTask = await readTask("task-orphan-notify-test");
    const reconciled2 = await reconcileOrphanWorkflows({ host, tasks: [settledTask!], staleAfterMs: 0 });
    expect(reconciled2).toHaveLength(0);
    expect(sentMessages).toHaveLength(1);
  });

  it("resumeWorkflow reopens a failed workflow, preserves done stages, resets failed/skipped stages, and completes the DAG", async () => {
    const { openTask, readTask, settleTask } = await import("../server/tasks");
    const { resumeWorkflow } = await import("../server/workflow-runner");

    const workflow = WorkflowDefinitionSchema.parse({
      id: "wf-resume-dag",
      name: "Resume DAG Pipeline",
      stages: [
        { id: "s1", name: "Research", botId: "bot-modeep", prompt: "Do research" },
        { id: "s2", name: "Code", botId: "bot-mocode", prompt: "Implement", dependsOn: ["s1"] },
        { id: "s3", name: "Verify", botId: "bot-moci", prompt: "Verify", dependsOn: ["s2"] },
      ],
    });

    const initWf = initWorkflowRunState(workflow);
    initWf.status = "failed";
    initWf.callerAgentId = "resume-caller-agent";
    initWf.userInput = "Build feature X";
    initWf.completedAt = new Date().toISOString();
    initWf.stages[0] = {
      ...initWf.stages[0]!,
      status: "done",
      output: "Research output preserved",
      handoffFilePath: "/tmp/research.md",
      chatId: "chat-s1",
      completedAt: new Date().toISOString(),
    };
    initWf.stages[1] = {
      ...initWf.stages[1]!,
      status: "failed",
      error: "Transient error",
      retries: 1,
      chatId: "chat-s2-old",
      completedAt: new Date().toISOString(),
    };
    initWf.stages[2] = {
      ...initWf.stages[2]!,
      status: "skipped",
    };

    await openTask({
      taskId: "task-resume-dag-test",
      title: "Resume DAG Test",
      acceptance: "All stages done",
      workflow: initWf,
    });
    await settleTask("task-resume-dag-test", { status: "blocked", note: "Stage 2 failed" });

    const dispatchedStages: string[] = [];
    const sentMessages: string[] = [];

    const mockPaseo = {
      agents: {
        ref: () => ({
          refresh: async () => ({ agent: { status: "idle", archivedAt: null } }),
          archive: async () => {},
          send: async (text: string) => {
            sentMessages.push(text);
          },
          timeline: {
            refetch: async () => ({ entries: [] }),
            append: async () => {},
          },
        }),
      },
    };

    const host = {
      paseo: mockPaseo,
      requirePaseo: () => mockPaseo,
      bots: async () => [],
      bot: async () => null,
      chatOf: async () => null,
      values: async () => ({ bots: [], groups: [], workflows: [workflow] }),
    } as unknown as BotsHost;

    const relay = {} as unknown as Relay;

    const res = await resumeWorkflow({
      host,
      relay,
      taskId: "task-resume-dag-test",
      wait: true,
      dispatchStage: async (ctx) => {
        dispatchedStages.push(ctx.stage.id);
        expect(ctx.prompt).toContain("Build feature X");
        if (ctx.stage.id === "s2") {
          expect(ctx.prompt).toContain("Research output preserved");
        }
        return { ok: true, output: `Output from ${ctx.stage.id}`, chatId: `chat-${ctx.stage.id}-new` };
      },
    });

    expect(res.ok).toBe(true);
    expect(res.settled).toBe(true);
    expect(res.state?.status).toBe("done");
    // Only s2 and s3 should have been dispatched; s1 was preserved as done
    expect(dispatchedStages).toEqual(["s2", "s3"]);

    const finalTask = await readTask("task-resume-dag-test");
    expect(finalTask?.status).toBe("done");
    expect(finalTask?.settledAt).toBeTruthy();
    expect(finalTask?.workflow?.stages[0]?.output).toBe("Research output preserved");
    expect(finalTask?.workflow?.stages[1]?.status).toBe("done");
    expect(finalTask?.workflow?.stages[2]?.status).toBe("done");
    expect(sentMessages.some((m) => m.includes("Resume DAG Pipeline"))).toBe(true);

    // Resuming an already-done task should return ok: false
    const resAgain = await resumeWorkflow({ host, relay, taskId: "task-resume-dag-test" });
    expect(resAgain.ok).toBe(false);
  });

  it("does not treat transient IPC/shutdown errors in ref.refresh() as agentDisappeared", async () => {
    let attempts = 0;
    const ipcPaseo = {
      agents: {
        ref: () => ({
          refresh: async () => {
            attempts += 1;
            if (attempts <= 2) {
              throw new Error("IPC channel closed");
            }
            return { agent: { status: "idle", updatedAt: "2026-11-18T00:00:01Z" } };
          },
        }),
      },
    };

    const recovered = await waitForStageWithHeartbeat(ipcPaseo, "chat-ipc-recover", {
      stallTimeoutMs: 500,
      hardTimeoutMs: 1000,
      pollIntervalMs: 15,
    });
    expect(attempts).toBe(3);
    expect(recovered.completed).toBe(true);
    expect(recovered.agentDisappeared).toBe(false);

    // Aborted signal during IPC error returns aborted without agentDisappeared
    const ac = new AbortController();
    const abortingPaseo = {
      agents: {
        ref: () => ({
          refresh: async () => {
            ac.abort();
            throw new Error("Transport not connected");
          },
        }),
      },
    };
    const abortedResult = await waitForStageWithHeartbeat(abortingPaseo, "chat-ipc-abort", {
      stallTimeoutMs: 500,
      hardTimeoutMs: 1000,
      pollIntervalMs: 15,
      signal: ac.signal,
    });
    expect(abortedResult.aborted).toBe(true);
    expect(abortedResult.agentDisappeared).toBe(false);

    // Explicit not-found error still triggers agentDisappeared
    const missingPaseo = {
      agents: {
        ref: () => ({
          refresh: async () => {
            throw new Error('Agent "chat-missing" not found');
          },
        }),
      },
    };
    const missingResult = await waitForStageWithHeartbeat(missingPaseo, "chat-missing", {
      stallTimeoutMs: 500,
      hardTimeoutMs: 1000,
      pollIntervalMs: 15,
    });
    expect(missingResult.agentDisappeared).toBe(true);
  });
});
