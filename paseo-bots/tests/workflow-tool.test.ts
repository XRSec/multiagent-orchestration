import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BotSchema, type Bot, type BotGroup } from "../shared/bot";
import { WorkflowDefinitionSchema } from "../shared/workflows";
import type { BotsHost } from "../server/host";
import type { Relay } from "../server/relay";
import type { ToolCaller } from "../server/tools/mcp";

const NOW = "2026-11-18T00:00:00.000Z";
let home = "";
const previousHome = process.env.PASEO_HOME;

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "paseo-bots-wf-tool-"));
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
    contactBots: "off",
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  });
}

describe("run_workflow MCP tool", () => {
  it("resolves team workflows first, falls back to global workflows, and errors cleanly when missing", async () => {
    const { resolveWorkflowForCaller } = await import("../server/tools/workflows");

    const teamWf = WorkflowDefinitionSchema.parse({
      id: "wf-shared",
      name: "Team Override",
      stages: [{ id: "s1", name: "Team Stage", botId: "bot-worker" }],
    });
    const globalWfOverride = WorkflowDefinitionSchema.parse({
      id: "wf-shared",
      name: "Global Original",
      stages: [{ id: "g1", name: "Global Stage", botId: "bot-worker" }],
    });
    const globalOnlyWf = WorkflowDefinitionSchema.parse({
      id: "wf-global-only",
      name: "Global Only",
      stages: [{ id: "g2", name: "Audit", botId: "bot-worker" }],
    });

    const group: BotGroup = {
      id: "team-1",
      name: "Core",
      logo: null,
      leadId: "bot-lead",
      memberIds: ["bot-lead", "bot-worker"],
      instructions: "",
      cwd: null,
      mounts: [],
      workflows: [teamWf],
      createdAt: NOW,
      updatedAt: NOW,
    };

    const resolvedTeam = resolveWorkflowForCaller("wf-shared", "bot-lead", [group], [globalWfOverride, globalOnlyWf]);
    expect(resolvedTeam.scope).toBe("team");
    expect(resolvedTeam.workflow.name).toBe("Team Override");

    const resolvedGlobal = resolveWorkflowForCaller("wf-global-only", "bot-lead", [group], [globalWfOverride, globalOnlyWf]);
    expect(resolvedGlobal.scope).toBe("global");
    expect(resolvedGlobal.workflow.name).toBe("Global Only");

    expect(() => resolveWorkflowForCaller("nonexistent", "bot-lead", [group], [globalOnlyWf])).toThrow(/Available workflows/);
  });

  it("executes a workflow end-to-end through startWorkflowExecution and runWorkflowTool", async () => {
    const { runWorkflowTool, startWorkflowExecution } = await import("../server/tools/workflows");
    const { readTask } = await import("../server/tasks");

    const lead = makeBot({ id: "bot-lead", name: "moAdmin" });
    const worker = makeBot({ id: "bot-worker", name: "moCode", contactBots: "off" });
    const wf = WorkflowDefinitionSchema.parse({
      id: "wf-e2e",
      name: "E2E Flow",
      stages: [
        { id: "plan", name: "Plan", botId: "bot-worker", prompt: "Draft plan", engine: "auto" },
        { id: "exec", name: "Execute", botId: "bot-worker", prompt: "Run plan", engine: "paseo-bot", dependsOn: ["plan"] },
      ],
    });
    const group: BotGroup = {
      id: "team-e2e",
      name: "E2E Team",
      logo: null,
      leadId: "bot-lead",
      memberIds: ["bot-lead", "bot-worker"],
      instructions: "",
      cwd: null,
      mounts: [],
      workflows: [wf],
      createdAt: NOW,
      updatedAt: NOW,
    };

    const appended: unknown[] = [];
    const paseo = {
      agents: {
        list: async () => ({ entries: [{ agent: { id: "lead-agent-1" } }] }),
        ref: () => ({
          timeline: {
            append: async (entry: unknown) => { appended.push(entry); },
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
      values: async () => ({ bots: [lead, worker], groups: [group], workflows: [] }),
      requirePaseo: () => paseo,
      bots: async () => [lead, worker],
      bot: async (id: string) => [lead, worker].find((b) => b.id === id) ?? null,
    } as unknown as BotsHost;

    const caller: ToolCaller = {
      bot: lead,
      agentId: "lead-agent-1",
      host,
      relay: {} as Relay,
    };

    const res = await startWorkflowExecution(caller, {
      workflowId: "wf-e2e",
      input: "Build feature X",
      taskId: "task-wf-e2e",
      wait: true,
      dispatchStage: async (ctx) => ({
        ok: true,
        output: `Completed ${ctx.stage.id} (${ctx.engine})`,
      }),
    });

    expect(res.settled).toBe(true);
    expect(res.state.status).toBe("done");
    expect(res.state.stages[0]?.engine).toBe("native");
    expect(res.state.stages[1]?.engine).toBe("paseo-bot");

    const task = await readTask("task-wf-e2e");
    expect(task?.status).toBe("done");
    expect(appended.length).toBeGreaterThanOrEqual(2);

    // Also test runWorkflowTool rejects invalid cyclic workflow before opening task
    const badWf = {
      id: "wf-bad",
      name: "Cyclic",
      description: "",
      stages: [
        { id: "a", name: "A", botId: "bot-worker", prompt: "", engine: "auto" as const, dependsOn: ["b"], maxRetries: 1 },
        { id: "b", name: "B", botId: "bot-worker", prompt: "", engine: "auto" as const, dependsOn: ["a"], maxRetries: 1 },
      ],
    };
    group.workflows = [wf, badWf];
    await expect(runWorkflowTool.run({ workflow_id: "wf-bad", wait: false }, caller)).rejects.toThrow(/invalid DAG/i);
  });
});
