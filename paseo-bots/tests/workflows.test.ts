import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BotSchema, EMPTY_LIBRARY, type Bot, type BotGroup } from "../shared/bot";
import { applyChanges } from "../shared/changes";
import { teamPrompt } from "../shared/groups";
import { TaskCardSchema, taskCardOf } from "../shared/task-card";
import {
  WorkflowDefinitionSchema,
  WorkflowStageDefinitionSchema,
  buildStageBriefPrompt,
  initWorkflowRunState,
  parseWorkerHandoff,
  readyStages,
  resolveStepEngine,
  validateWorkflowDAG,
  MAX_INLINE_UPSTREAM_CHARS,
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

  it("supports stage-level skillIds and mcpServerIds overrides in WorkflowStageDefinitionSchema", () => {
    const stage = WorkflowStageDefinitionSchema.parse({
      id: "stage-with-overrides",
      name: "Specialized Stage",
      botId: "bot-worker",
      skillIds: ["skill-a", "skill-b"],
      mcpServerIds: ["mcp-server-1"],
    });

    expect(stage.skillIds).toEqual(["skill-a", "skill-b"]);
    expect(stage.mcpServerIds).toEqual(["mcp-server-1"]);

    const wf = WorkflowDefinitionSchema.parse({
      id: "wf-overrides",
      name: "Overrides Flow",
      stages: [stage],
    });
    expect(wf.stages[0]?.skillIds).toEqual(["skill-a", "skill-b"]);
    expect(wf.stages[0]?.mcpServerIds).toEqual(["mcp-server-1"]);
  });

  it("validates production multiagent-orchestration group workflow in bots.json", () => {
    const botsJsonPath = resolve(__dirname, "../../paseo-bots-plugin-settings/bots.json");
    const raw = JSON.parse(readFileSync(botsJsonPath, "utf8")) as {
      version: number;
      values: {
        bots?: Array<{ id: string; model: string | null; modeId: string }>;
        groups: Array<BotGroup & { workflows?: WorkflowDefinition[] }>;
      };
    };
    const group = raw.values?.groups?.find((g) => g.id === "team-mwgv59i8dfdv");
    expect(group).toBeDefined();
    expect(group?.cwd).toBe("/Users/xr/IDEA.localized/multiagent-orchestration");
    expect(Array.isArray(group?.workflows)).toBe(true);

    const moadmin = raw.values?.bots?.find((b) => b.id === "bot-moadmin");
    expect(moadmin).toBeDefined();
    expect(moadmin?.model).toBe("gemini-4-hydrogen");
    expect(moadmin?.modeId).toBe("full-access");

    const wf = group?.workflows?.find((w) => w.id === "wf-moadmin-closed-loop");
    expect(wf).toBeDefined();

    const parsed = WorkflowDefinitionSchema.parse(wf);
    expect(parsed.id).toBe("wf-moadmin-closed-loop");
    expect(parsed.stages.length).toBe(7);

    const dag = validateWorkflowDAG(parsed.stages);
    expect(dag.valid).toBe(true);
    expect(dag.layers).toEqual([
      ["moadmin-plan"],
      ["modeep-recon"],
      ["mocode-impl"],
      ["moci-verify"],
      ["moadmin-review"],
      ["modoc-writeback"],
      ["moadmin-finalize"],
    ]);

    // Verify all stage botIds belong to the team
    for (const stage of parsed.stages) {
      expect(group?.memberIds).toContain(stage.botId);
      expect(stage.maxRetries).toBe(2);
    }

    // Verify moAdmin stages use paseo-bot engine
    expect(parsed.stages.find((s) => s.id === "moadmin-plan")?.engine).toBe("paseo-bot");
    expect(parsed.stages.find((s) => s.id === "moadmin-review")?.engine).toBe("paseo-bot");
    expect(parsed.stages.find((s) => s.id === "moadmin-finalize")?.engine).toBe("paseo-bot");
  });

  it("parses 6-field <worker_handoff> blocks including markdown bold headers", async () => {
    const { parseWorkerHandoff, buildStageBriefPrompt } = await import("../shared/workflows");
    const reply = [
      "All done.",
      "<worker_handoff>",
      "**STATUS:** PARTIAL",
      "**SUMMARY:**",
      "- Updated workflow runner",
      "- TOUCHED_FILES: server/workflow-runner.ts",
      "**VERIFICATION_PROOF:** vitest exit 0",
      "**DOD_CHECKLIST:**",
      "- [x] DoD-1 -> verified",
      "**OPEN_ISSUES:** Pending UI test",
      "</worker_handoff>",
    ].join("\n");

    const parsed = parseWorkerHandoff(reply);
    expect(parsed.hasBlock).toBe(true);
    expect(parsed.status).toBe("PARTIAL");
    expect(parsed.summary).toContain("Updated workflow runner");
    expect(parsed.touchedFiles).toBe("server/workflow-runner.ts");
    expect(parsed.verificationProof).toBe("vitest exit 0");
    expect(parsed.dodChecklist).toContain("DoD-1");
    expect(parsed.openIssues).toBe("Pending UI test");

    const brief = buildStageBriefPrompt({
      workflowName: "Test WF",
      stage: { id: "s1", name: "Stage 1", botId: "bot-1", prompt: "Do it", engine: "auto", dependsOn: [], maxRetries: 1 },
      sessionBoardPath: "/tmp/board/wf-123",
      attempt: 1,
    });
    expect(brief).toContain("- SESSION_BOARD: /tmp/board/wf-123");
    expect(brief).toContain("- TASK_MANIFEST: /tmp/board/wf-123/TASK_MANIFEST.md");
  });

  it("deduplicates worker protocol suffix if prompt or role already includes <worker_handoff> / WORKER_PROTOCOL", () => {
    const stageWithHandoff = makeStage({
      id: "plan",
      name: "Plan",
      prompt: "Execute plan. Output: Conclude with <worker_handoff>\nSTATUS: PASS\nVERIFICATION_PROOF: vitest\n</worker_handoff>",
    });
    const prompt1 = buildStageBriefPrompt({
      workflowName: "WF",
      stage: stageWithHandoff,
      attempt: 1,
    });
    // Should NOT have appended a second <worker_protocol> block at the end
    const occurrences = (prompt1.match(/<worker_handoff>/g) || []).length;
    expect(occurrences).toBe(1);
    expect(prompt1).not.toContain("<worker_protocol>");

    const stageWithProtocol = makeStage({
      id: "plan",
      name: "Plan",
      prompt: "Execute according to WORKER_PROTOCOL and deliver results.",
    });
    const prompt2 = buildStageBriefPrompt({
      workflowName: "WF",
      stage: stageWithProtocol,
      attempt: 1,
    });
    expect(prompt2).not.toContain("<worker_protocol>");

    const standardStage = makeStage({
      id: "impl",
      name: "Impl",
      prompt: "Write implementation.",
    });
    const prompt3 = buildStageBriefPrompt({
      workflowName: "WF",
      stage: standardStage,
      attempt: 1,
    });
    expect(prompt3).toContain("<worker_protocol>");
  });

  it("truncates upstream output handoff-first to preserve VERIFICATION_PROOF within MAX_INLINE_UPSTREAM_CHARS", () => {
    const longProse = "Detailed analysis notes: " + "X".repeat(2500) + "\n";
    const handoffBlock = [
      "<worker_handoff>",
      "STATUS: PASS",
      "SUMMARY: Completed database migration",
      "TOUCHED_FILES: prisma/schema.prisma",
      "VERIFICATION_PROOF: pnpm test run (exit code 0, 42 tests passed)",
      "OPEN_ISSUES: None",
      "</worker_handoff>",
    ].join("\n");

    const fullOutput = longProse + handoffBlock;
    expect(fullOutput.length).toBeGreaterThan(MAX_INLINE_UPSTREAM_CHARS);

    const prompt = buildStageBriefPrompt({
      workflowName: "Pipeline",
      stage: makeStage({ id: "verify", name: "Verify" }),
      upstreamOutputs: [
        {
          stageId: "migration",
          stageName: "Migration",
          output: fullOutput,
        },
      ],
      attempt: 1,
    });

    // Verification proof and handoff block must be fully preserved
    expect(prompt).toContain("<worker_handoff>");
    expect(prompt).toContain("STATUS: PASS");
    expect(prompt).toContain("VERIFICATION_PROOF: pnpm test run (exit code 0, 42 tests passed)");
    expect(prompt).toContain("OPEN_ISSUES: None");
    expect(prompt).toContain("Detailed analysis notes:");
    expect(prompt).toContain("...[truncated]");

    // Upstream context for this stage must stay within MAX_INLINE_UPSTREAM_CHARS budget
    const upstreamContext = prompt.slice(prompt.indexOf("### From \"Migration\""), prompt.indexOf("</task_brief>"));
    expect(upstreamContext.length).toBeLessThanOrEqual(MAX_INLINE_UPSTREAM_CHARS + 100);
  });

  describe("Backtick/Prose-Safe <worker_handoff> Extraction", () => {
    it("does not get tricked by inline backtick `<worker_handoff>` prose mentions", () => {
      const reply = [
        "Please note that `<worker_handoff>` format is required by the orchestrator.",
        "Here are the intermediate notes and logs...",
        "<worker_handoff>",
        "STATUS: PASS",
        "SUMMARY: Real handoff summary.",
        "TOUCHED_FILES: shared/workflows.ts",
        "VERIFICATION_PROOF: vitest exit 0",
        "DOD_CHECKLIST: - [x] All refined",
        "OPEN_ISSUES: None",
        "</worker_handoff>",
      ].join("\n");

      const parsed = parseWorkerHandoff(reply);
      expect(parsed.hasBlock).toBe(true);
      expect(parsed.status).toBe("PASS");
      expect(parsed.summary).toBe("Real handoff summary.");
      expect(parsed.touchedFiles).toBe("shared/workflows.ts");
      expect(parsed.verificationProof).toBe("vitest exit 0");
      expect(parsed.openIssues).toBe("None");
    });

    it("returns hasBlock: false when `<worker_handoff>` appears solely in inline backtick prose", () => {
      const reply = "I was instructed to output `<worker_handoff>` with STATUS: PASS, but I had an error.";
      const parsed = parseWorkerHandoff(reply);
      expect(parsed.hasBlock).toBe(false);
      expect(parsed.status).toBe("UNKNOWN");
      expect(parsed.summary).toBe(reply);
    });

    it("extracts the LAST valid closed <worker_handoff> block when multiple blocks exist", () => {
      const reply = [
        "First draft:",
        "<worker_handoff>",
        "STATUS: PARTIAL",
        "SUMMARY: Draft work.",
        "</worker_handoff>",
        "Final verified output:",
        "<worker_handoff>",
        "STATUS: PASS",
        "SUMMARY: Completed verified work.",
        "VERIFICATION_PROOF: all tests pass",
        "</worker_handoff>",
      ].join("\n");

      const parsed = parseWorkerHandoff(reply);
      expect(parsed.hasBlock).toBe(true);
      expect(parsed.status).toBe("PASS");
      expect(parsed.summary).toBe("Completed verified work.");
      expect(parsed.verificationProof).toBe("all tests pass");
    });

    it("buildStageBriefPrompt preserves upstream prose without swallowing it into a backtick match", () => {
      const upstream = [
        "I formatted this according to `<worker_handoff>` schema.",
        "Important upstream discovery: API port changed to 8080.",
        "<worker_handoff>",
        "STATUS: PASS",
        "SUMMARY: Config updated.",
        "TOUCHED_FILES: config.json",
        "VERIFICATION_PROOF: check ok",
        "</worker_handoff>",
      ].join("\n");

      const prompt = buildStageBriefPrompt({
        workflowName: "Pipeline",
        stage: makeStage({ id: "stage-2", name: "Consumer" }),
        upstreamOutputs: [
          {
            stageId: "stage-1",
            stageName: "Producer",
            output: upstream,
          },
        ],
        attempt: 1,
      });

      expect(prompt).toContain("<worker_handoff>");
      expect(prompt).toContain("STATUS: PASS");
      expect(prompt).toContain("Config updated.");
    });
  });
});
