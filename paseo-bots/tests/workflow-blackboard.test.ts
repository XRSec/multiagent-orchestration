import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startChat } from "../server/chats";
import type { BotsHost } from "../server/host";
import type { Relay } from "../server/relay";
import { openTask, readTask } from "../server/tasks";
import { runWorkflowDag, type StageDispatchContext } from "../server/workflow-runner";
import { BotSchema, type Bot, type BotGroup } from "../shared/bot";
import { SESSION_ROLE_LABEL, TEAM_SESSION_LABEL } from "../shared/chat";
import {
  buildStageBriefPrompt,
  initWorkflowRunState,
  MAX_INLINE_UPSTREAM_CHARS,
  TaskStageStateSchema,
  WorkflowDefinitionSchema,
  WorkflowRunStateSchema,
} from "../shared/workflows";

const NOW = "2026-11-18T00:00:00.000Z";
let testHome = "";
const prevPaseoHome = process.env.PASEO_HOME;
const prevAgyAgentsDir = process.env.AGY_AGENTS_DIR;

beforeAll(() => {
  testHome = mkdtempSync(join(tmpdir(), "paseo-wf-blackboard-"));
  process.env.PASEO_HOME = testHome;
  process.env.AGY_AGENTS_DIR = join(testHome, "agents");
});

afterAll(() => {
  if (prevPaseoHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = prevPaseoHome;
  if (prevAgyAgentsDir === undefined) delete process.env.AGY_AGENTS_DIR;
  else process.env.AGY_AGENTS_DIR = prevAgyAgentsDir;
  rmSync(testHome, { recursive: true, force: true });
});

function makeTestBot(patch: Partial<Bot> & { id: string; name: string }): Bot {
  return BotSchema.parse({
    avatar: { seed: patch.id, palette: null, shape: "circle", imageUrl: null },
    provider: "agy",
    contactBots: "ask",
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  });
}

function makeFakeHost(bots: Bot[], groups: BotGroup[], chatMetadataLookup?: Record<string, { labels: Record<string, string> }>) {
  const appended: { id?: string; kind?: string; data?: unknown }[] = [];
  const createdAgents: Array<{ id: string; opts: Record<string, unknown> }> = [];

  const agentsApi = {
    list: async () => ({ entries: [{ agent: { id: "caller-chat-1" } }] }),
    create: async (opts: Record<string, unknown>) => {
      const id = (opts.agentId as string) || `agent-${createdAgents.length + 1}`;
      createdAgents.push({ id, opts });
      return { id };
    },
    ref: (agentId: string) => ({
      timeline: {
        append: async (entry: { id?: string; kind?: string; data?: unknown }) => {
          appended.push(entry);
        },
        refetch: async () => ({ entries: [] }),
      },
      waitForFinish: async () => {},
      refresh: async () => ({
        agent: {
          id: agentId,
          lastError: null,
          archivedAt: null,
          pendingPermissions: [],
        },
      }),
    }),
  };

  const workspacesApi = {
    list: async () => ({ entries: [] }),
    create: async (opts: Record<string, unknown>) => ({
      id: `ws-${Date.now()}`,
      agents: {
        create: async (createOpts: Record<string, unknown>) => agentsApi.create(createOpts),
      },
    }),
    open: async (root: string) => ({
      id: "ws-team-root",
      projectId: "prj-team-root",
      current: () => ({ projectId: "prj-team-root", projectRootPath: root }),
      refresh: async () => ({ projectId: "prj-team-root", projectRootPath: root }),
      setTitle: async () => {},
      archive: async () => {},
    }),
    ref: (ws: unknown) => ({
      setTitle: async () => {},
    }),
  };

  const providersApi = {
    snapshot: async () => ({
      entries: [{ provider: "agy", models: [{ id: "gemini-4-hydrogen", isDefault: true }] }],
    }),
  };

  const projectsApi = {
    list: async () => ({ projects: [] }),
    create: async (opts: Record<string, unknown>) => ({ id: `prj-${Date.now()}`, ...opts }),
    rename: async () => {},
  };

  const paseo = {
    agents: agentsApi,
    workspaces: workspacesApi,
    providers: providersApi,
    projects: projectsApi,
  };

  const host = {
    paseo,
    attach() {},
    onAttach: () => () => {},
    chatOf: async (chatId: string) => {
      const found = chatMetadataLookup?.[chatId];
      if (found) {
        return { botId: "bot-lead", title: null, routineId: null, labels: found.labels };
      }
      return { botId: "bot-lead", title: null, routineId: null, labels: {} };
    },
    values: async () => ({ bots, groups }),
    requirePaseo: () => paseo,
    bots: async () => bots,
    bot: async (id: string) => bots.find((b) => b.id === id) ?? null,
    library: async () => ({ skills: [], playbooks: [], mcpServers: [] }),
  } as unknown as BotsHost;

  const relay = {
    mountTools: async () => null,
    mountApps: async () => null,
  } as unknown as Relay;

  return { host, relay, appended, createdAgents };
}

describe("Workflow Blackboard Wiring & File-Backed Stage Handoffs (WP-5)", () => {
  describe("Zod schema extensions", () => {
    it("parses teamSessionId and sessionBoardPath on WorkflowRunStateSchema", () => {
      const runState = WorkflowRunStateSchema.parse({
        workflowId: "wf-1",
        workflowName: "Pipeline",
        status: "running",
        stages: [],
        startedAt: NOW,
        teamSessionId: "team-sess-123",
        sessionBoardPath: "/path/to/board",
      });

      expect(runState.teamSessionId).toBe("team-sess-123");
      expect(runState.sessionBoardPath).toBe("/path/to/board");
    });

    it("parses handoffFilePath on TaskStageStateSchema", () => {
      const stageState = TaskStageStateSchema.parse({
        id: "s1",
        name: "Stage 1",
        botId: "bot-mocode",
        engine: "native",
        status: "done",
        handoffFilePath: "/path/to/board/handoffs/s1-bot-mocode.md",
      });

      expect(stageState.handoffFilePath).toBe("/path/to/board/handoffs/s1-bot-mocode.md");
    });
  });

  describe("buildStageBriefPrompt upstream truncation & file pointer", () => {
    it("cites Full upstream output saved at: <handoffFilePath> when handoffFilePath is present", () => {
      const prompt = buildStageBriefPrompt({
        workflowName: "Delivery",
        stage: { id: "code", name: "Code", botId: "bot-mocode", prompt: "Write code", engine: "auto", dependsOn: [], maxRetries: 1 },
        upstreamOutputs: [
          {
            stageId: "research",
            stageName: "Recon",
            output: "Research findings: use Fastify over Express.",
            handoffFilePath: "/teams/Core/sessions/sess-1/handoffs/research-bot-modeep.md",
          },
        ],
        attempt: 1,
      });

      expect(prompt).toContain("### From \"Recon\" (research):");
      expect(prompt).toContain("Research findings: use Fastify over Express.");
      expect(prompt).toContain("Full upstream output saved at: /teams/Core/sessions/sess-1/handoffs/research-bot-modeep.md");
    });

    it("truncates inline upstream context exceeding MAX_INLINE_UPSTREAM_CHARS = 2000", () => {
      const longOutput = "A".repeat(3000);
      const prompt = buildStageBriefPrompt({
        workflowName: "Delivery",
        stage: { id: "code", name: "Code", botId: "bot-mocode", prompt: "Write code", engine: "auto", dependsOn: [], maxRetries: 1 },
        upstreamOutputs: [
          {
            stageId: "research",
            stageName: "Recon",
            output: longOutput,
            handoffFilePath: "/teams/Core/sessions/sess-1/handoffs/research-bot-modeep.md",
          },
        ],
        attempt: 1,
      });

      expect(prompt).toContain("...[truncated]");
      expect(prompt).toContain("Full upstream output saved at: /teams/Core/sessions/sess-1/handoffs/research-bot-modeep.md");

      // Verify that the inline repeated text in upstream context does not contain the full 3000 chars
      expect(prompt).not.toContain("A".repeat(2001));
      expect(prompt).toContain("A".repeat(MAX_INLINE_UPSTREAM_CHARS));
    });

    it("extracts distilled <worker_handoff> block when present in upstream output", () => {
      const verboseTurnOutput = [
        "Thinking about the problem deeply...",
        "Running tests...",
        "Here are all 50 lines of logs...",
        "<worker_handoff>",
        "STATUS: PASS",
        "SUMMARY: Implemented endpoint /api/v1/health",
        "TOUCHED_FILES: src/routes/health.ts",
        "VERIFICATION_PROOF: vitest run health.test.ts (exit code 0)",
        "OPEN_ISSUES: None",
        "</worker_handoff>",
      ].join("\n");

      const prompt = buildStageBriefPrompt({
        workflowName: "Delivery",
        stage: { id: "test", name: "Test", botId: "bot-moci", prompt: "Verify", engine: "auto", dependsOn: [], maxRetries: 1 },
        upstreamOutputs: [
          {
            stageId: "code",
            stageName: "Code",
            output: verboseTurnOutput,
            handoffFilePath: "/teams/Core/sessions/sess-1/handoffs/code-bot-mocode.md",
          },
        ],
        attempt: 1,
      });

      expect(prompt).toContain("<worker_handoff>");
      expect(prompt).toContain("SUMMARY: Implemented endpoint /api/v1/health");
      expect(prompt).toContain("Full upstream output saved at: /teams/Core/sessions/sess-1/handoffs/code-bot-mocode.md");
      expect(prompt).not.toContain("Thinking about the problem deeply...");
    });
  });

  describe("runWorkflowDag shared blackboard & handoffs persistence", () => {
    it("persists completed stage outputs to <sessionBoardPath>/handoffs/*.md and shares sessionBoardPath across waves", async () => {
      const bots = [
        makeTestBot({ id: "bot-lead", name: "moAdmin" }),
        makeTestBot({ id: "bot-modeep", name: "moDeep" }),
        makeTestBot({ id: "bot-mocode", name: "moCode" }),
        makeTestBot({ id: "bot-moci", name: "moCI" }),
      ];

      const group: BotGroup = {
        id: "team-delivery",
        name: "Delivery Squad",
        logo: null,
        leadId: "bot-lead",
        memberIds: bots.map((b) => b.id),
        instructions: "Ship quality software.",
        cwd: null,
        mounts: [],
        createdAt: NOW,
        updatedAt: NOW,
      };

      const workflow = WorkflowDefinitionSchema.parse({
        id: "wf-chain-3",
        name: "3-Stage Sequential Pipeline",
        stages: [
          { id: "recon", name: "Recon", botId: "bot-modeep", prompt: "Investigate architecture" },
          { id: "impl", name: "Implement", botId: "bot-mocode", prompt: "Implement code", dependsOn: ["recon"] },
          { id: "qa", name: "Quality Check", botId: "bot-moci", prompt: "Run tests", dependsOn: ["impl"] },
        ],
      });

      const initialRun = initWorkflowRunState(workflow, (id) => bots.find((b) => b.id === id) ?? null);
      const taskId = "task-wf-blackboard-1";
      await openTask({
        taskId,
        title: "Workflow: 3-Stage Pipeline",
        acceptance: "All 3 stages complete",
        groupId: group.id,
        workflow: initialRun,
      });

      const callerChatId = "lead-chat-session-42";
      const { host, relay } = makeFakeHost(bots, [group], {
        [callerChatId]: { labels: { [TEAM_SESSION_LABEL]: "team-sess-alpha-99" } },
      });

      const seenContexts: StageDispatchContext[] = [];
      let downstreamPromptForImpl = "";

      const finalState = await runWorkflowDag({
        host,
        relay,
        taskId,
        workflow,
        userInput: "Build feature X",
        group,
        callerBotId: "bot-lead",
        callerAgentId: callerChatId,
        dispatchStage: async (ctx) => {
          seenContexts.push(ctx);
          if (ctx.stage.id === "impl") {
            downstreamPromptForImpl = ctx.prompt;
          }
          if (ctx.stage.id === "recon") {
            // Return an output that exceeds 2000 characters
            return {
              ok: true,
              output: "Recon findings for feature X:\n" + "DETAILED_SPEC_LINE\n".repeat(150),
            };
          }
          return { ok: true, output: `Completed stage ${ctx.stage.id}` };
        },
      });

      expect(finalState.status).toBe("done");
      expect(finalState.teamSessionId).toBe("team-sess-alpha-99");

      const expectedBoard = join(
        testHome,
        "plugin-data",
        "paseo-bots",
        "shared",
        "Teams",
        "Delivery Squad",
        "sessions",
        "team-sess-alpha-99",
      );
      expect(finalState.sessionBoardPath).toBe(expectedBoard);

      // Verify all 3 stages received the exact same sessionBoardPath and teamSessionId
      expect(seenContexts).toHaveLength(3);
      for (const ctx of seenContexts) {
        expect(ctx.teamSessionId).toBe("team-sess-alpha-99");
        expect(ctx.sessionBoardPath).toBe(expectedBoard);
      }

      // Verify <sessionBoardPath>/handoffs/<stage.id>-<botId>.md persistence on disk
      const reconHandoff = join(expectedBoard, "handoffs", "recon-bot-modeep.md");
      const implHandoff = join(expectedBoard, "handoffs", "impl-bot-mocode.md");
      const qaHandoff = join(expectedBoard, "handoffs", "qa-bot-moci.md");

      expect(existsSync(reconHandoff)).toBe(true);
      expect(existsSync(implHandoff)).toBe(true);
      expect(existsSync(qaHandoff)).toBe(true);

      const reconSaved = readFileSync(reconHandoff, "utf-8");
      expect(reconSaved).toContain("Recon findings for feature X:");
      expect(reconSaved).toContain("DETAILED_SPEC_LINE");

      // Verify handoffFilePath populated on TaskStageState
      const reconStage = finalState.stages.find((s) => s.id === "recon")!;
      const implStage = finalState.stages.find((s) => s.id === "impl")!;
      const qaStage = finalState.stages.find((s) => s.id === "qa")!;

      expect(reconStage.handoffFilePath).toBe(reconHandoff);
      expect(implStage.handoffFilePath).toBe(implHandoff);
      expect(qaStage.handoffFilePath).toBe(qaHandoff);

      // Verify downstream stage received truncated upstream output with file pointer
      expect(downstreamPromptForImpl).toContain("...[truncated]");
      expect(downstreamPromptForImpl).toContain(`Full upstream output saved at: ${reconHandoff}`);

      // Verify persisted task in tasks store also recorded the blackboard fields
      const persistedTask = await readTask(taskId);
      expect(persistedTask?.workflow?.teamSessionId).toBe("team-sess-alpha-99");
      expect(persistedTask?.workflow?.sessionBoardPath).toBe(expectedBoard);
      expect(persistedTask?.workflow?.stages[0]?.handoffFilePath).toBe(reconHandoff);
    });
  });

  describe("Stage-override seat isolation", () => {
    it("allocates ephemeral override seat when stage.skillIds is non-empty and standard seat otherwise", async () => {
      const bots = [
        makeTestBot({ id: "bot-lead", name: "moAdmin" }),
        makeTestBot({ id: "bot-mocode", name: "moCode", skillIds: ["base-coding"] }),
      ];

      const group: BotGroup = {
        id: "team-override",
        name: "Override Team",
        logo: null,
        leadId: "bot-lead",
        memberIds: ["bot-lead", "bot-mocode"],
        instructions: "Seat isolation test",
        cwd: null,
        mounts: [],
        createdAt: NOW,
        updatedAt: NOW,
      };

      const workflow = WorkflowDefinitionSchema.parse({
        id: "wf-seat-isolation",
        name: "Seat Isolation DAG",
        stages: [
          {
            id: "stage-custom-skills",
            name: "Stage with Custom Skills",
            botId: "bot-mocode",
            prompt: "Use specialized skill",
            skillIds: ["reverse-engineering", "kernel-probe"],
          },
          {
            id: "stage-standard-skills",
            name: "Stage with Standard Skills",
            botId: "bot-mocode",
            prompt: "Use default skills",
            dependsOn: ["stage-custom-skills"],
          },
        ],
      });

      const initial = initWorkflowRunState(workflow, (id) => bots.find((b) => b.id === id) ?? null);
      const taskId = "task-wf-seat-isolation-1";
      await openTask({
        taskId,
        title: "Workflow: Seat Isolation",
        acceptance: "All stages complete",
        groupId: group.id,
        workflow: initial,
      });

      const { host, relay } = makeFakeHost(bots, [group]);
      const recordedSeats: Array<{ stageId: string; stageSeatKey?: string }> = [];

      await runWorkflowDag({
        host,
        relay,
        taskId,
        workflow,
        group,
        callerBotId: "bot-lead",
        dispatchStage: async (ctx) => {
          recordedSeats.push({
            stageId: ctx.stage.id,
            stageSeatKey: ctx.stageSeatKey,
          });
          return { ok: true, output: `Done ${ctx.stage.id}` };
        },
      });

      expect(recordedSeats).toHaveLength(2);
      // Stage with skillIds has stageSeatKey = "<stageId>-<botId>"
      expect(recordedSeats[0]!.stageId).toBe("stage-custom-skills");
      expect(recordedSeats[0]!.stageSeatKey).toBe("stage-custom-skills-bot-mocode");

      // Stage without skillIds has undefined stageSeatKey
      expect(recordedSeats[1]!.stageId).toBe("stage-standard-skills");
      expect(recordedSeats[1]!.stageSeatKey).toBeUndefined();
    });
  });

  describe("startChat session blackboard & correlation wiring", () => {
    it("stamps TEAM_SESSION_LABEL and SESSION_ROLE_LABEL and provisions managed seat paths", async () => {
      const bot = makeTestBot({ id: "bot-mocode", name: "moCode" });
      const group: BotGroup = {
        id: "team-chats-test",
        name: "Chats Team",
        logo: null,
        leadId: "bot-lead",
        memberIds: ["bot-lead", "bot-mocode"],
        instructions: "Test chats.ts blackboard wiring",
        cwd: "/mounted/project",
        mounts: ["/mounted/project"],
        createdAt: NOW,
        updatedAt: NOW,
      };

      const { host, relay, createdAgents } = makeFakeHost([bot], [group]);

      // 1. Direct Specialist in Teamwork mode
      await startChat(host, relay, bot, {
        prompt: "Help me write a test",
        title: "Direct specialist turn",
        labels: { "custom.flag": "true" },
        group,
        teamSessionId: "team-sess-specialist-1",
        syncAgy: false,
      });

      expect(createdAgents).toHaveLength(1);
      const specialistCall = createdAgents[0]!;
      const specialistLabels = specialistCall.opts.labels as Record<string, string>;
      expect(specialistLabels[TEAM_SESSION_LABEL]).toBe("team-sess-specialist-1");
      expect(specialistLabels[SESSION_ROLE_LABEL]).toBe("team-direct-specialist");
      expect(specialistLabels["custom.flag"]).toBe("true");

      const expectedSeatPath = join(
        testHome,
        "plugin-data",
        "paseo-bots",
        "shared",
        "Teams",
        "Chats Team",
        "agents",
        "bot-mocode",
      );
      expect(specialistCall.opts.cwd).toBe(expectedSeatPath);

      // 2. Dispatched Worker in Workflow stage with stageSeatKey
      await startChat(host, relay, bot, {
        prompt: "Execute workflow stage",
        title: "[Pipeline] Stage 1",
        labels: {},
        group,
        teamSessionId: "team-sess-stage-2",
        isWorkflowStage: true,
        stageSeatKey: "stage-1-bot-mocode",
        syncAgy: false,
      });

      expect(createdAgents).toHaveLength(2);
      const workerCall = createdAgents[1]!;
      const workerLabels = workerCall.opts.labels as Record<string, string>;
      expect(workerLabels[TEAM_SESSION_LABEL]).toBe("team-sess-stage-2");
      expect(workerLabels[SESSION_ROLE_LABEL]).toBe("dispatched-worker");

      const expectedOverrideSeat = join(
        testHome,
        "plugin-data",
        "paseo-bots",
        "shared",
        "Teams",
        "Chats Team",
        "sessions",
        "team-sess-stage-2",
        "seats",
        "stage-1-bot-mocode",
      );
      expect(workerCall.opts.cwd).toBe(expectedOverrideSeat);
      expect(existsSync(expectedOverrideSeat)).toBe(true);

      // Verify blackboard folders were provisioned under sessionBoardPath
      const boardDir = join(
        testHome,
        "plugin-data",
        "paseo-bots",
        "shared",
        "Teams",
        "Chats Team",
        "sessions",
        "team-sess-stage-2",
      );
      expect(existsSync(join(boardDir, "handoffs"))).toBe(true);
      expect(existsSync(join(boardDir, "artifacts"))).toBe(true);
      expect(existsSync(join(boardDir, "runs"))).toBe(true);
    });

    it("defaults teamSessionId to agentId and sessionRole to dm in direct mode", async () => {
      const bot = makeTestBot({ id: "bot-dm-tester", name: "DMTester" });
      const { host, relay, createdAgents } = makeFakeHost([bot], []);

      const assignedAgentId = "agent-dm-fixed-id";
      await startChat(host, relay, bot, {
        prompt: "Hello DM",
        title: "DM Chat",
        labels: {},
        agentId: assignedAgentId,
        group: null,
        syncAgy: false,
      });

      expect(createdAgents).toHaveLength(1);
      const dmCall = createdAgents[0]!;
      const dmLabels = dmCall.opts.labels as Record<string, string>;
      expect(dmLabels[TEAM_SESSION_LABEL]).toBe(assignedAgentId);
      expect(dmLabels[SESSION_ROLE_LABEL]).toBe("dm");

      const expectedDmSeat = join(
        testHome,
        "plugin-data",
        "paseo-bots",
        "shared",
        "Bots",
        "bot-dm-tester",
      );
      expect(dmCall.opts.cwd).toBe(expectedDmSeat);
    });
  });
});
