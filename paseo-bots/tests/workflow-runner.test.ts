import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BotSchema, type Bot, type BotGroup } from "../shared/bot";
import { initWorkflowRunState, WorkflowDefinitionSchema } from "../shared/workflows";
import type { BotsHost } from "../server/host";
import type { Relay } from "../server/relay";

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
  const host = {
    paseo,
    attach() {},
    onAttach: () => () => {},
    chatOf: async () => ({ botId: "bot-lead", title: null, routineId: null, labels: {} }),
    values: async () => ({ bots, groups }),
    requirePaseo: () => paseo,
    bots: async () => bots,
    bot: async (id: string) => bots.find((b) => b.id === id) ?? null,
  } as unknown as BotsHost;
  const relay = {} as Relay;
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
});
