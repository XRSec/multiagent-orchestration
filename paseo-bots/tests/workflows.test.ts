import { describe, expect, it } from "vitest";
import { BotSchema, EMPTY_LIBRARY, type Bot, type BotGroup } from "../shared/bot";
import { applyChanges } from "../shared/changes";
import { teamPrompt } from "../shared/groups";
import { TaskCardSchema, taskCardOf } from "../shared/task-card";
import {
  WorkflowDefinitionSchema,
  buildStageBriefPrompt,
  initWorkflowRunState,
  parseWorkerHandoff,
  readyStages,
  resolveStepEngine,
  validateWorkflowDAG,
  type WorkflowDefinition,
  type WorkflowStageDefinition,
} from "../shared/workflows";

const NOW = "2026-11-18T00:00:00.000Z";

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

function makeStage(patch: Partial<WorkflowStageDefinition> & { id: string; name: string }): WorkflowStageDefinition {
  return {
    botId: "bot-worker",
    prompt: "Do work",
    engine: "auto",
    dependsOn: [],
    maxRetries: 1,
    ...patch,
  };
}

describe("workflows schema & DAG validation", () => {
  it("validates a diamond DAG and partitions into parallel layers", () => {
    const wf: WorkflowDefinition = WorkflowDefinitionSchema.parse({
      id: "wf-diamond",
      name: "Diamond Pipeline",
      description: "Research then parallel impl + docs then review",
      stages: [
        { id: "research", name: "Research", botId: "bot-modeep", prompt: "Recon" },
        { id: "impl", name: "Implement", botId: "bot-mocode", prompt: "Code", dependsOn: ["research"] },
        { id: "docs", name: "Docs", botId: "bot-modoc", prompt: "Docs", dependsOn: ["research"] },
        { id: "review", name: "Review", botId: "bot-moci", prompt: "Verify", dependsOn: ["impl", "docs"] },
      ],
    });
    const result = validateWorkflowDAG(wf.stages);
    expect(result.valid).toBe(true);
    expect(result.layers).toEqual([
      ["research"],
      ["impl", "docs"],
      ["review"],
    ]);
  });

  it("rejects cyclic dependencies, self-dependencies, unknown dependencies, and duplicate stage ids", () => {
    expect(validateWorkflowDAG([
      makeStage({ id: "a", name: "A", dependsOn: ["b"] }),
      makeStage({ id: "b", name: "B", dependsOn: ["a"] }),
    ])).toMatchObject({ valid: false, error: expect.stringContaining("Cyclic") });

    expect(validateWorkflowDAG([
      makeStage({ id: "a", name: "A", dependsOn: ["a"] }),
    ])).toMatchObject({ valid: false, error: expect.stringContaining("itself") });

    expect(validateWorkflowDAG([
      makeStage({ id: "a", name: "A", dependsOn: ["missing"] }),
    ])).toMatchObject({ valid: false, error: expect.stringContaining("unknown stage") });

    expect(validateWorkflowDAG([
      makeStage({ id: "a", name: "A" }),
      makeStage({ id: "a", name: "A2" }),
    ])).toMatchObject({ valid: false, error: expect.stringContaining("Duplicate") });
  });

  it("selects only pending stages whose dependencies are all done", () => {
    const wf = WorkflowDefinitionSchema.parse({
      id: "wf-1",
      name: "Pipeline",
      stages: [
        { id: "s1", name: "S1", botId: "b1" },
        { id: "s2", name: "S2", botId: "b2", dependsOn: ["s1"] },
        { id: "s3", name: "S3", botId: "b3", dependsOn: ["s1"] },
        { id: "s4", name: "S4", botId: "b4", dependsOn: ["s2", "s3"] },
      ],
    });
    const run = initWorkflowRunState(wf);
    expect(readyStages(run.stages).map((s) => s.id)).toEqual(["s1"]);

    run.stages[0]!.status = "done";
    expect(readyStages(run.stages).map((s) => s.id)).toEqual(["s2", "s3"]);

    run.stages[1]!.status = "done";
    run.stages[2]!.status = "running";
    expect(readyStages(run.stages)).toEqual([]);

    run.stages[2]!.status = "done";
    expect(readyStages(run.stages).map((s) => s.id)).toEqual(["s4"]);
  });

  it("resolves step dispatch engines ('auto' vs 'native' vs 'paseo-bot')", () => {
    const statelessBot = makeBot({ id: "b-fast", name: "Fast", contactBots: "off", playbooks: [] });
    const statefulBot = makeBot({ id: "b-mem", name: "Mem", contactBots: "ask", playbooks: [{ id: "p1", name: "P", triggers: ["test"], instructions: "Run" }] });

    expect(resolveStepEngine("native", statefulBot, "agy")).toBe("native");
    expect(resolveStepEngine("paseo-bot", statelessBot, "agy")).toBe("paseo-bot");
    expect(resolveStepEngine("auto", statelessBot, "agy")).toBe("native");
    expect(resolveStepEngine("auto", statefulBot, "agy")).toBe("paseo-bot");
    expect(resolveStepEngine("auto", statelessBot, "codex")).toBe("paseo-bot");
  });

  it("builds <task_brief>/<repair_brief> and parses <worker_handoff> status", () => {
    const stage = makeStage({ id: "s1", name: "Build", maxRetries: 2 });
    const first = buildStageBriefPrompt({ workflowName: "CI", stage, userInput: "Ship feature", attempt: 1 });
    expect(first).toContain("<task_brief>");
    expect(first).not.toContain("<repair_brief>");
    expect(first).toContain("<worker_protocol>");

    const retry = buildStageBriefPrompt({
      workflowName: "CI",
      stage,
      attempt: 2,
      previousError: "Test suite failed on line 42",
      upstreamOutputs: [{ stageId: "s0", stageName: "Spec", output: "Plan ready" }],
    });
    expect(retry).toContain("<repair_brief>");
    expect(retry).toContain("Test suite failed on line 42");
    expect(retry).toContain("Plan ready");

    const parsedFail = parseWorkerHandoff("Done\n<worker_handoff>\nSTATUS: FAILED\nSUMMARY: Broken\nOPEN_ISSUES: Type error\n</worker_handoff>");
    expect(parsedFail.hasBlock).toBe(true);
    expect(parsedFail.status).toBe("FAILED");
    expect(parsedFail.openIssues).toBe("Type error");

    const parsedPlain = parseWorkerHandoff("All looks good");
    expect(parsedPlain.hasBlock).toBe(false);
    expect(parsedPlain.status).toBe("UNKNOWN");
  });

  it("injects available workflows into Chief of Staff prompt only", () => {
    const lead = makeBot({ id: "bot-moadmin", name: "moAdmin" });
    const member = makeBot({ id: "bot-mocode", name: "moCode" });
    const teamWf = WorkflowDefinitionSchema.parse({
      id: "wf-team",
      name: "Team Delivery",
      description: "Build and test",
      stages: [{ id: "s1", name: "Code", botId: "bot-mocode" }],
    });
    const globalWf = WorkflowDefinitionSchema.parse({
      id: "wf-global",
      name: "Global Audit",
      stages: [{ id: "g1", name: "Audit", botId: "bot-mocode" }],
    });
    const group: BotGroup = {
      id: "team-1",
      name: "Core",
      logo: null,
      leadId: "bot-moadmin",
      memberIds: ["bot-moadmin", "bot-mocode"],
      instructions: "",
      cwd: null,
      mounts: [],
      workflows: [teamWf],
      createdAt: NOW,
      updatedAt: NOW,
    };

    const leadText = teamPrompt(group, lead, [lead, member], [globalWf]);
    expect(leadText).toContain("run_workflow");
    expect(leadText).toContain("wf-team");
    expect(leadText).toContain("wf-global");
    expect(leadText).toContain("ZERO DIRECT EXECUTION");

    const memberText = teamPrompt(group, member, [lead, member], [globalWf]);
    expect(memberText).not.toContain("run_workflow");
    expect(memberText).not.toContain("wf-team");
  });

  it("serializes workflow progress onto TaskCardSchema", () => {
    const wf = WorkflowDefinitionSchema.parse({
      id: "wf-card",
      name: "Card Test",
      stages: [{ id: "s1", name: "Step 1", botId: "bot-a" }],
    });
    const run = initWorkflowRunState(wf);
    run.stages[0]!.status = "done";
    run.status = "done";

    const card = taskCardOf({
      taskId: "task-wf-1",
      title: "Workflow: Card Test",
      status: "done",
      version: 2,
      settledAt: NOW,
      members: [],
      workflow: run,
    });
    expect(TaskCardSchema.safeParse(card).success).toBe(true);
    expect(card.workflow?.stages[0]?.status).toBe("done");
    expect(card.summary).toContain("1/1 done");
  });

  it("supports save_workflow and delete_workflow via applyChanges", () => {
    const wf = WorkflowDefinitionSchema.parse({
      id: "wf-change",
      name: "Global Flow",
      stages: [{ id: "s1", name: "Step 1", botId: "bot-a" }],
    });
    const base = { bots: [], history: [], library: EMPTY_LIBRARY, groups: [] };
    const afterSave = applyChanges(base, [{ type: "save_workflow", workflow: wf }], { now: NOW, provider: "agy" });
    expect(afterSave.workflows).toHaveLength(1);
    expect(afterSave.workflows?.[0]?.id).toBe("wf-change");

    const afterDelete = applyChanges(afterSave, [{ type: "delete_workflow", workflow_id: "wf-change" }], { now: NOW, provider: "agy" });
    expect(afterDelete.workflows).toHaveLength(0);
  });
});
