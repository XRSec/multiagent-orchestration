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

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "paseo-bots-wf-runner-"));
  process.env.PASEO_HOME = home;
});

afterAll(() => {
  if (previousHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = previousHome;
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
});
