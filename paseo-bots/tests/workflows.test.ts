import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BotSchema, EMPTY_LIBRARY, type Bot, type BotGroup } from "../shared/bot";
import { applyChanges } from "../shared/changes";
import { teamPrompt } from "../shared/groups";
import { workflowRunRpc } from "../shared/rpc";
import { TaskCardSchema, taskCardOf } from "../shared/task-card";
import type { BotsHost } from "../server/host";
import type { Relay } from "../server/relay";
import {
  WorkflowDefinitionSchema,
  WorkflowStageDefinitionSchema,
  WorkflowStopReasonSchema,
  WorkflowErrorCategorySchema,
  WorkflowBudgetConfigSchema,
  StageUsageMetadataSchema,
  StageOutputContractSchema,
  TaskStageStateSchema,
  WorkflowRunStateSchema,
  buildStageBriefPrompt,
  initWorkflowRunState,
  parseWorkerHandoff,
  readyStages,
  resolveStepEngine,
  validateWorkflowDAG,
  extractJsonFromOutput,
  validateStageOutputContract,
  checkBudget,
  sumUsage,
  MAX_INLINE_UPSTREAM_CHARS,
  type WorkflowDefinition,
  type WorkflowStageDefinition,
  type StageOutputContract,
  type WorkflowBudgetConfig,
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
    expect(group?.cwd).toBe("${REPO_ROOT}");
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

  describe("workflow runtime optimizations (google-antigravity-sdk patterns)", () => {
    it("validates WorkflowStopReasonSchema and WorkflowErrorCategorySchema values", () => {
      const validStopReasons = [
        "completed",
        "failed",
        "timeout",
        "stall_timeout",
        "budget_exceeded",
        "policy_denied",
        "validation_failed",
        "cancelled",
      ];
      for (const reason of validStopReasons) {
        expect(WorkflowStopReasonSchema.parse(reason)).toBe(reason);
      }
      expect(() => WorkflowStopReasonSchema.parse("invalid_reason")).toThrow();

      const validErrorCategories = [
        "transient_api",
        "validation",
        "policy_denied",
        "dag_invalid",
        "cancelled",
        "timeout",
        "stall_timeout",
        "budget_exceeded",
        "unknown",
      ];
      for (const cat of validErrorCategories) {
        expect(WorkflowErrorCategorySchema.parse(cat)).toBe(cat);
      }
      expect(() => WorkflowErrorCategorySchema.parse("nonexistent_cat")).toThrow();
    });

    it("parses declarative budget config on WorkflowDefinition and WorkflowStageDefinition", () => {
      const budget = WorkflowBudgetConfigSchema.parse({
        maxModelCalls: 10,
        maxToolCalls: 50,
        maxTotalTokens: 20000,
      });

      const stage = WorkflowStageDefinitionSchema.parse({
        id: "stage-budgeted",
        name: "Budgeted Stage",
        botId: "bot-worker",
        budget,
        outputContract: {
          format: "json",
          requiredKeys: ["summary", "result"],
        },
      });

      expect(stage.budget).toEqual({
        maxModelCalls: 10,
        maxToolCalls: 50,
        maxTotalTokens: 20000,
      });
      expect(stage.outputContract).toEqual({
        format: "json",
        requiredKeys: ["summary", "result"],
      });

      const wf = WorkflowDefinitionSchema.parse({
        id: "wf-budgeted",
        name: "Budgeted Workflow",
        budget: { maxTotalTokens: 100000 },
        stages: [stage],
      });
      expect(wf.budget?.maxTotalTokens).toBe(100000);

      // Verify backward compatibility: stage and workflow without budget/contract parse cleanly
      const legacyStage = WorkflowStageDefinitionSchema.parse({
        id: "legacy",
        name: "Legacy",
        botId: "bot-w",
      });
      expect(legacyStage.budget).toBeUndefined();
      expect(legacyStage.outputContract).toBeUndefined();
    });

    it("parses optional observability fields on TaskStageStateSchema and WorkflowRunStateSchema", () => {
      const stageState = TaskStageStateSchema.parse({
        id: "s1",
        name: "Stage 1",
        botId: "bot-w",
        engine: "native",
        status: "done",
        stopReason: "completed",
        errorCategory: undefined,
        durationMs: 1450,
        usage: {
          promptTokens: 100,
          candidatesTokens: 40,
          thoughtsTokens: 10,
          totalTokens: 150,
          toolCalls: 3,
          modelCalls: 1,
        },
        repairGuidance: null,
      });

      expect(stageState.stopReason).toBe("completed");
      expect(stageState.durationMs).toBe(1450);
      expect(stageState.usage?.totalTokens).toBe(150);

      const runState = WorkflowRunStateSchema.parse({
        workflowId: "wf-1",
        workflowName: "Flow 1",
        status: "done",
        startedAt: NOW,
        stopReason: "completed",
        durationMs: 3200,
        usage: {
          totalTokens: 150,
          modelCalls: 1,
        },
        stages: [stageState],
      });

      expect(runState.stopReason).toBe("completed");
      expect(runState.durationMs).toBe(3200);
      expect(runState.usage?.totalTokens).toBe(150);
    });

    it("extracts JSON correctly from raw text, code fences, and embedded blocks", () => {
      // 1. Raw JSON
      const rawRes = extractJsonFromOutput('{"status": "ok", "value": 42}');
      expect(rawRes.success).toBe(true);
      expect(rawRes.data).toEqual({ status: "ok", value: 42 });

      // 2. Fenced ```json ... ```
      const fencedRes = extractJsonFromOutput('Here is the data:\n```json\n{"summary": "done", "code": 0}\n```\nHope it helps!');
      expect(fencedRes.success).toBe(true);
      expect(fencedRes.data).toEqual({ summary: "done", code: 0 });

      // 3. Fenced without json tag ``` ... ```
      const plainFence = extractJsonFromOutput('```\n{"key": "val"}\n```');
      expect(plainFence.success).toBe(true);
      expect(plainFence.data).toEqual({ key: "val" });

      // 4. Embedded substring { ... }
      const embeddedRes = extractJsonFromOutput('Leading text {"embedded": true} trailing text');
      expect(embeddedRes.success).toBe(true);
      expect(embeddedRes.data).toEqual({ embedded: true });

      // 5. Invalid JSON
      const invalidRes = extractJsonFromOutput("Not JSON at all {broken");
      expect(invalidRes.success).toBe(false);
    });

    it("validates stage output contracts and generates structured repair guidance", () => {
      const contract: StageOutputContract = {
        format: "json",
        requiredKeys: ["status", "findings"],
      };

      // Valid output satisfying contract
      const validOut = JSON.stringify({ status: "PASS", findings: ["all tests pass"] });
      const validCheck = validateStageOutputContract(validOut, contract);
      expect(validCheck.valid).toBe(true);

      // Missing required key
      const missingOut = JSON.stringify({ status: "PASS" });
      const missingCheck = validateStageOutputContract(missingOut, contract);
      expect(missingCheck.valid).toBe(false);
      expect(missingCheck.error).toContain("missing required key(s): \"findings\"");
      expect(missingCheck.repairGuidance).toContain("<repair_guidance>" in {} ? "" : "Structured output validation failed");
      expect(missingCheck.repairGuidance).toContain("findings");

      // Malformed JSON
      const malformedCheck = validateStageOutputContract("This is plain text with no json", contract);
      expect(malformedCheck.valid).toBe(false);
      expect(malformedCheck.error).toContain("failed JSON contract validation");
      expect(malformedCheck.repairGuidance).toContain("Output could not be parsed as valid JSON");
    });

    it("enforces budget checks and sums usage metadata", () => {
      const budget: WorkflowBudgetConfig = {
        maxModelCalls: 5,
        maxToolCalls: 20,
        maxTotalTokens: 10000,
      };

      expect(checkBudget(budget, { modelCalls: 3, toolCalls: 10, totalTokens: 5000 }).exceeded).toBe(false);
      expect(checkBudget(budget, { modelCalls: 6 }).exceeded).toBe(true);
      expect(checkBudget(budget, { toolCalls: 25 }).exceeded).toBe(true);
      expect(checkBudget(budget, { totalTokens: 12000 }).exceeded).toBe(true);

      const u1 = { promptTokens: 100, totalTokens: 150, modelCalls: 1, toolCalls: 2 };
      const u2 = { promptTokens: 200, totalTokens: 350, modelCalls: 2, toolCalls: 3 };
      const combined = sumUsage(u1, u2);
      expect(combined.promptTokens).toBe(300);
      expect(combined.totalTokens).toBe(500);
      expect(combined.modelCalls).toBe(3);
      expect(combined.toolCalls).toBe(5);
    });

    it("injects <repair_guidance> into <repair_brief> when repairGuidance is present on retry", () => {
      const prompt = buildStageBriefPrompt({
        workflowName: "Pipeline",
        stage: makeStage({ id: "stage-1", name: "Worker" }),
        attempt: 2,
        previousError: "Stage output JSON is missing required key(s): \"summary\".",
        repairGuidance: "Structured output validation failed: Missing required key(s): \"summary\".",
      });

      expect(prompt).toContain("<repair_brief>");
      expect(prompt).toContain("<repair_guidance>");
      expect(prompt).toContain("Structured output validation failed: Missing required key(s): \"summary\".");
      expect(prompt).toContain("</repair_guidance>");
      expect(prompt).toContain("</repair_brief>");
    });
  });

  describe("TaskCard context, workflowRunRpc, and startWorkflowFromRpc", () => {
    let rpcHome = "";
    const previousHome = process.env.PASEO_HOME;

    beforeAll(() => {
      rpcHome = mkdtempSync(join(tmpdir(), "paseo-bots-wf-rpc-"));
      process.env.PASEO_HOME = rpcHome;
    });

    afterAll(() => {
      if (previousHome === undefined) delete process.env.PASEO_HOME;
      else process.env.PASEO_HOME = previousHome;
      rmSync(rpcHome, { recursive: true, force: true });
    });

    it("propagates groupId and sourceChatId (with cardAgentId fallback) onto TaskCard", () => {
      const wf = WorkflowDefinitionSchema.parse({
        id: "wf-ctx",
        name: "Context Flow",
        stages: [{ id: "s1", name: "Stage 1", botId: "bot-a" }],
      });
      const run = initWorkflowRunState(wf);

      const withExplicit = taskCardOf({
        taskId: "task-explicit",
        title: "Workflow: Context Flow",
        status: "running",
        version: 1,
        settledAt: null,
        groupId: "team-alpha",
        sourceChatId: "chat-source-1",
        cardAgentId: "chat-card-fallback",
        members: [],
        workflow: run,
      });
      expect(TaskCardSchema.parse(withExplicit)).toMatchObject({
        groupId: "team-alpha",
        sourceChatId: "chat-source-1",
      });

      const withFallback = taskCardOf({
        taskId: "task-fallback",
        title: "Workflow: Context Flow",
        status: "running",
        version: 1,
        settledAt: null,
        cardAgentId: "chat-card-only",
        members: [],
        workflow: run,
      });
      expect(TaskCardSchema.parse(withFallback)).toMatchObject({
        sourceChatId: "chat-card-only",
      });
      expect(withFallback.groupId).toBeUndefined();

      const bare = taskCardOf({
        taskId: "task-bare",
        title: "Workflow: Context Flow",
        status: "running",
        version: 1,
        settledAt: null,
        members: [],
        workflow: run,
      });
      expect("groupId" in bare).toBe(false);
      expect("sourceChatId" in bare).toBe(false);
    });

    it("validates workflowRunRpc input and output schemas", () => {
      expect(workflowRunRpc.name).toBe("bots.workflows.run");

      const parsedIn = workflowRunRpc.input.parse({
        workflowId: "wf-build",
        goal: "Ship release",
        groupId: "team-1",
        params: { branch: "main", dryRun: false },
        idempotencyKey: "req-123",
      });
      expect(parsedIn.params).toEqual({ branch: "main", dryRun: false });

      expect(() => workflowRunRpc.input.parse({ workflowId: "", goal: "Ship" })).toThrow();
      expect(() => workflowRunRpc.input.parse({ workflowId: "wf-build", goal: "" })).toThrow();

      const parsedOut = workflowRunRpc.output.parse({
        ok: true,
        taskId: "wf-abc",
        chatId: "chat-1",
        status: "done",
        reused: false,
      });
      expect(parsedOut).toEqual({
        ok: true,
        taskId: "wf-abc",
        chatId: "chat-1",
        status: "done",
        reused: false,
      });
    });

    it("handles validation, missing workflows, happy-path team/global launch, and idempotency in startWorkflowFromRpc", async () => {
      const { startWorkflowFromRpc } = await import("../server/tools/workflows");

      const lead = makeBot({ id: "bot-lead", name: "moAdmin", contactBots: "off" });
      const worker = makeBot({ id: "bot-worker", name: "moCode", contactBots: "off" });
      const teamWf = WorkflowDefinitionSchema.parse({
        id: "wf-team-rpc",
        name: "Team RPC Flow",
        stages: [{ id: "impl", name: "Implement", botId: "bot-worker", prompt: "Implement goal" }],
      });
      const globalWf = WorkflowDefinitionSchema.parse({
        id: "wf-global-rpc",
        name: "Global RPC Flow",
        stages: [{ id: "audit", name: "Audit", botId: "bot-worker", prompt: "Audit goal" }],
      });
      const cyclicWf = {
        id: "wf-cyclic-rpc",
        name: "Cyclic RPC Flow",
        description: "",
        stages: [
          { id: "a", name: "A", botId: "bot-worker", prompt: "", engine: "auto" as const, dependsOn: ["b"], maxRetries: 1 },
          { id: "b", name: "B", botId: "bot-worker", prompt: "", engine: "auto" as const, dependsOn: ["a"], maxRetries: 1 },
        ],
      };

      const group: BotGroup = {
        id: "team-rpc",
        name: "RPC Team",
        logo: null,
        leadId: "bot-lead",
        memberIds: ["bot-lead", "bot-worker"],
        instructions: "",
        cwd: null,
        mounts: [],
        workflows: [teamWf, cyclicWf],
        createdAt: NOW,
        updatedAt: NOW,
      };

      const paseo = {
        agents: {
          list: async () => ({ entries: [{ agent: { id: "lead-chat-rpc" } }] }),
          ref: () => ({
            timeline: {
              append: async () => {},
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
        values: async () => ({ bots: [lead, worker], groups: [group], workflows: [globalWf] }),
        requirePaseo: () => paseo,
        bots: async () => [lead, worker],
        bot: async (id: string) => [lead, worker].find((b) => b.id === id) ?? null,
      } as unknown as BotsHost;

      // 1. Validation & missing workflow / group errors
      expect(await startWorkflowFromRpc(host, { workflowId: "wf-team-rpc", goal: "   " })).toMatchObject({
        ok: false,
        error: expect.stringContaining("goal"),
      });
      expect(await startWorkflowFromRpc(host, { workflowId: "missing-wf", goal: "Do X" })).toMatchObject({
        ok: false,
        error: expect.stringContaining("not found"),
      });
      expect(
        await startWorkflowFromRpc(host, { workflowId: "wf-team-rpc", goal: "Do X", groupId: "unknown-team" }),
      ).toMatchObject({
        ok: false,
        error: expect.stringContaining("unknown-team"),
      });
      expect(await startWorkflowFromRpc(host, { workflowId: "wf-cyclic-rpc", goal: "Do X" })).toMatchObject({
        ok: false,
        error: expect.stringContaining("invalid DAG"),
      });

      // 2. Team workflow happy path with params + idempotencyKey
      const dispatchSpy = vi.fn(async (ctx) => ({
        ok: true,
        output: `Ran ${ctx.stage.id}: ${ctx.prompt}`,
      }));
      const firstRun = await startWorkflowFromRpc(
        host,
        {
          workflowId: "wf-team-rpc",
          goal: "Build widget",
          params: { env: "staging" },
          idempotencyKey: "key-alpha",
        },
        { relay: {} as Relay, wait: true, dispatchStage: dispatchSpy },
      );

      expect(firstRun.ok).toBe(true);
      expect(firstRun.reused).toBe(false);
      expect(firstRun.status).toBe("done");
      expect(firstRun.chatId).toBe("lead-chat-rpc");
      expect(firstRun.card).toMatchObject({
        taskId: firstRun.taskId,
        groupId: "team-rpc",
        sourceChatId: "lead-chat-rpc",
        status: "done",
      });
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(dispatchSpy.mock.calls[0]?.[0]?.prompt).toContain("Build widget");
      expect(dispatchSpy.mock.calls[0]?.[0]?.prompt).toContain('"env": "staging"');

      // 3. Replaying with same idempotencyKey returns reused: true without re-running DAG
      const replayRun = await startWorkflowFromRpc(
        host,
        {
          workflowId: "wf-team-rpc",
          goal: "Build widget",
          params: { env: "staging" },
          idempotencyKey: "key-alpha",
        },
        { relay: {} as Relay, wait: true, dispatchStage: dispatchSpy },
      );
      expect(replayRun.ok).toBe(true);
      expect(replayRun.reused).toBe(true);
      expect(replayRun.taskId).toBe(firstRun.taskId);
      expect(dispatchSpy).toHaveBeenCalledTimes(1);

      // 4. Global workflow happy path without groupId
      const globalRun = await startWorkflowFromRpc(
        host,
        { workflowId: "wf-global-rpc", goal: "Audit repo" },
        {
          relay: {} as Relay,
          wait: true,
          dispatchStage: async () => ({ ok: true, output: "Audit ok" }),
        },
      );
      expect(globalRun.ok).toBe(true);
      expect(globalRun.reused).toBe(false);
      expect(globalRun.status).toBe("done");
      expect(globalRun.card?.groupId).toBeUndefined();
      expect(globalRun.card?.sourceChatId).toBe("lead-chat-rpc");
    });
  });
});
