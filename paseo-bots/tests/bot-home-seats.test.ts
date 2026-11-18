import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  directSessionBoardPath,
  ensureBotHome,
  ensureManagedSessionHome,
  teamAgentSeatPath,
  teamSessionBoardPath,
  type ManagedHomePaths,
} from "../server/bot-home";
import { EMPTY_LIBRARY, type Bot, type BotGroup } from "../shared/bot";
import {
  resolveBotPlacement,
  SESSION_ROLE_LABEL,
  startBotChat,
  TEAM_SESSION_LABEL,
  type BotPlacement,
  type ChatApi,
} from "../shared/chat";
import { makeBot } from "./helpers";

const NOW = "2026-11-18T00:00:00.000Z";

function makeGroup(overrides: Partial<BotGroup> = {}): BotGroup {
  return {
    id: "team-alpha",
    name: "Alpha Team",
    logo: null,
    leadId: "bot-lead",
    memberIds: ["bot-lead", "bot-mocode"],
    instructions: "Ship clean code.",
    cwd: "/team/target-repo",
    mounts: ["/team/target-repo", "/team/shared-docs"],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("Seat & Session Blackboard Path Topology (WP-1)", () => {
  const prevPaseoHome = process.env.PASEO_HOME;
  let tempHome: string;

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), "paseo-seats-test-"));
    process.env.PASEO_HOME = tempHome;
  });

  afterEach(() => {
    if (prevPaseoHome === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = prevPaseoHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  describe("Correlation labels", () => {
    it("exports standard session correlation and role labels", () => {
      expect(TEAM_SESSION_LABEL).toBe("paseo-bots.team-session");
      expect(SESSION_ROLE_LABEL).toBe("paseo-bots.session-role");
    });
  });

  describe("DM path helpers & session provisioning", () => {
    it("computes direct session board path under Bots/<botId>/sessions/<sessionId>", () => {
      const boardPath = directSessionBoardPath("bot-mocode", "sess-dm-1");
      expect(boardPath).toBe(
        join(tempHome, "plugin-data", "paseo-bots", "shared", "Bots", "bot-mocode", "sessions", "sess-dm-1"),
      );
    });

    it("provisions DM managed session home with handoffs, artifacts, and runs directories", async () => {
      const paths: ManagedHomePaths = await ensureManagedSessionHome({
        botId: "bot-mocode",
        sessionId: "sess-dm-100",
      });

      const expectedBotsRoot = join(tempHome, "plugin-data", "paseo-bots", "shared", "Bots");
      const expectedBotHome = join(expectedBotsRoot, "bot-mocode");
      const expectedSessionBoard = join(expectedBotHome, "sessions", "sess-dm-100");

      expect(paths.root).toBe(expectedBotsRoot);
      expect(paths.path).toBe(expectedBotHome);
      expect(paths.botHomePath).toBe(expectedBotHome);
      expect(paths.teamRootPath).toBeNull();
      expect(paths.sessionBoardPath).toBe(expectedSessionBoard);
      expect(paths.runsPath).toBe(join(expectedSessionBoard, "runs"));

      expect(existsSync(paths.root)).toBe(true);
      expect(existsSync(paths.botHomePath)).toBe(true);
      expect(existsSync(paths.path)).toBe(true);
      expect(existsSync(join(paths.sessionBoardPath, "handoffs"))).toBe(true);
      expect(existsSync(join(paths.sessionBoardPath, "artifacts"))).toBe(true);
      expect(existsSync(paths.runsPath)).toBe(true);
    });
  });

  describe("Team agent seat paths & teamwork session provisioning", () => {
    it("computes team agent seat and session board paths with sanitized folder names", () => {
      const seat = teamAgentSeatPath("team-alpha", "bot-mocode", "multiagent-orchestration");
      expect(seat).toBe(
        join(
          tempHome,
          "plugin-data",
          "paseo-bots",
          "shared",
          "Teams",
          "multiagent-orchestration",
          "agents",
          "bot-mocode",
        ),
      );

      const board = teamSessionBoardPath("team-alpha", "sess-team-200", "multiagent-orchestration");
      expect(board).toBe(
        join(
          tempHome,
          "plugin-data",
          "paseo-bots",
          "shared",
          "Teams",
          "multiagent-orchestration",
          "sessions",
          "sess-team-200",
        ),
      );
    });

    it("falls back to groupId when groupName is omitted or sanitizes to empty", () => {
      const seat = teamAgentSeatPath("team-fallback", "bot-modoc");
      expect(seat).toBe(
        join(tempHome, "plugin-data", "paseo-bots", "shared", "Teams", "team-fallback", "agents", "bot-modoc"),
      );

      const board = teamSessionBoardPath("team-fallback", "sess-1");
      expect(board).toBe(
        join(tempHome, "plugin-data", "paseo-bots", "shared", "Teams", "team-fallback", "sessions", "sess-1"),
      );
    });

    it("provisions teamwork seat and session blackboard with icon.svg and isolated directories", async () => {
      const paths = await ensureManagedSessionHome({
        botId: "bot-mocode",
        sessionId: "sess-team-300",
        groupId: "team-alpha",
        groupName: "Alpha Squad",
      });

      const expectedTeamRoot = join(tempHome, "plugin-data", "paseo-bots", "shared", "Teams", "Alpha Squad");
      const expectedSeat = join(expectedTeamRoot, "agents", "bot-mocode");
      const expectedBotHome = join(tempHome, "plugin-data", "paseo-bots", "shared", "Bots", "bot-mocode");
      const expectedBoard = join(expectedTeamRoot, "sessions", "sess-team-300");

      expect(paths.root).toBe(expectedTeamRoot);
      expect(paths.path).toBe(expectedSeat);
      expect(paths.botHomePath).toBe(expectedBotHome);
      expect(paths.teamRootPath).toBe(expectedTeamRoot);
      expect(paths.sessionBoardPath).toBe(expectedBoard);
      expect(paths.runsPath).toBe(join(expectedBoard, "runs"));

      expect(existsSync(join(expectedTeamRoot, "icon.svg"))).toBe(true);
      expect(existsSync(expectedSeat)).toBe(true);
      expect(existsSync(expectedBotHome)).toBe(true);
      expect(existsSync(join(expectedBoard, "handoffs"))).toBe(true);
      expect(existsSync(join(expectedBoard, "artifacts"))).toBe(true);
      expect(existsSync(join(expectedBoard, "runs"))).toBe(true);
    });
  });

  describe("Stage override seats", () => {
    it("allocates ephemeral stage seat under session blackboard seats/<stageSeatKey>", async () => {
      const paths = await ensureManagedSessionHome({
        botId: "bot-mocode",
        sessionId: "wf-sess-999",
        groupId: "team-alpha",
        groupName: "Alpha Team",
        stageSeatKey: "stage-b1-bot-mocode",
      });

      const expectedTeamRoot = join(tempHome, "plugin-data", "paseo-bots", "shared", "Teams", "Alpha Team");
      const expectedBoard = join(expectedTeamRoot, "sessions", "wf-sess-999");
      const expectedStageSeat = join(expectedBoard, "seats", "stage-b1-bot-mocode");

      expect(paths.root).toBe(expectedTeamRoot);
      expect(paths.path).toBe(expectedStageSeat);
      expect(paths.teamRootPath).toBe(expectedTeamRoot);
      expect(paths.sessionBoardPath).toBe(expectedBoard);
      expect(existsSync(expectedStageSeat)).toBe(true);
      expect(existsSync(join(expectedBoard, "handoffs"))).toBe(true);
      expect(existsSync(join(expectedBoard, "artifacts"))).toBe(true);
      expect(existsSync(join(expectedBoard, "runs"))).toBe(true);
    });
  });

  describe("Validation and legacy backward-compatibility", () => {
    it("preserves ensureBotHome return contract for legacy callers", async () => {
      const legacy = await ensureBotHome({ botId: "bot-legacy" });
      expect(legacy).toEqual({
        root: join(tempHome, "plugin-data", "paseo-bots", "shared", "Bots"),
        path: join(tempHome, "plugin-data", "paseo-bots", "shared", "Bots", "bot-legacy"),
      });

      const legacyTeam = await ensureBotHome({
        botId: "bot-legacy",
        groupId: "team-g1",
        groupName: "Legacy Team",
      });
      expect(legacyTeam).toEqual({
        root: join(tempHome, "plugin-data", "paseo-bots", "shared", "Teams", "Legacy Team"),
        path: join(tempHome, "plugin-data", "paseo-bots", "shared", "Bots", "bot-legacy"),
      });
    });

    it("rejects invalid botId, sessionId, and stageSeatKey path traversals", async () => {
      expect(() => teamAgentSeatPath("team-1", "../evil")).toThrow("Invalid bot ID.");
      expect(() => teamSessionBoardPath("team-1", "..")).toThrow("Invalid session ID.");
      expect(() => directSessionBoardPath("bot-1", "bad/sess")).toThrow("Invalid session ID.");

      await expect(
        ensureManagedSessionHome({
          botId: "bot-1",
          sessionId: "sess-1",
          groupId: "team-1",
          stageSeatKey: "../outside",
        }),
      ).rejects.toThrow("Invalid stage seat key.");
    });
  });

  describe("resolveBotPlacement & targetProjectDirs deduplication", () => {
    it("keeps placement.path at home.path in DM mode while collecting bot.cwd and bot.mounts", () => {
      const home: ManagedHomePaths = {
        root: "/shared/Bots",
        path: "/shared/Bots/bot-1",
        botHomePath: "/shared/Bots/bot-1",
        teamRootPath: null,
        sessionBoardPath: "/shared/Bots/bot-1/sessions/s1",
        runsPath: "/shared/Bots/bot-1/sessions/s1/runs",
      };
      const bot = makeBot({
        id: "bot-1",
        cwd: "/my/project",
        mounts: ["/my/project", "/extra/docs", "/extra/docs", ""],
      });

      const placement = resolveBotPlacement(bot, null, home);

      expect(placement.path).toBe("/shared/Bots/bot-1");
      expect(placement.projectRoot).toBe("/shared/Bots");
      expect(placement.projectTitle).toBeNull();
      expect(placement.botHomePath).toBe("/shared/Bots/bot-1");
      expect(placement.teamRootPath).toBeNull();
      expect(placement.sessionBoardPath).toBe("/shared/Bots/bot-1/sessions/s1");
      expect(placement.targetProjectDirs).toEqual(["/my/project", "/extra/docs"]);
    });

    it("keeps placement.path at home.path in teamwork mode while collecting group.cwd, group.mounts, and bot.mounts", () => {
      const home: ManagedHomePaths = {
        root: "/shared/Teams/Core",
        path: "/shared/Teams/Core/agents/bot-mocode",
        botHomePath: "/shared/Bots/bot-mocode",
        teamRootPath: "/shared/Teams/Core",
        sessionBoardPath: "/shared/Teams/Core/sessions/s2",
        runsPath: "/shared/Teams/Core/sessions/s2/runs",
      };
      const group = makeGroup({
        name: "Core Team",
        cwd: "/team/target-repo",
        mounts: ["/team/target-repo", "/team/specs", "  "],
      });
      const bot = makeBot({
        id: "bot-mocode",
        cwd: "/bot/leaked-private-cwd", // should be ignored in teamwork mode
        mounts: ["/team/specs", "/bot/helper-tools"],
      });

      const placement = resolveBotPlacement(bot, group, home);

      expect(placement.path).toBe("/shared/Teams/Core/agents/bot-mocode");
      expect(placement.projectRoot).toBe("/shared/Teams/Core");
      expect(placement.projectTitle).toBe("Core Team");
      expect(placement.botHomePath).toBe("/shared/Bots/bot-mocode");
      expect(placement.teamRootPath).toBe("/shared/Teams/Core");
      expect(placement.sessionBoardPath).toBe("/shared/Teams/Core/sessions/s2");
      expect(placement.targetProjectDirs).toEqual([
        "/team/target-repo",
        "/team/specs",
        "/bot/helper-tools",
      ]);
    });

    it("handles legacy { path, root } home object gracefully", () => {
      const home = { path: "/shared/Bots/bot-legacy", root: "/shared/Bots" };
      const bot = makeBot({ id: "bot-legacy", cwd: "/legacy/dir" });

      const placement = resolveBotPlacement(bot, null, home);

      expect(placement.path).toBe("/shared/Bots/bot-legacy");
      expect(placement.projectRoot).toBe("/shared/Bots");
      expect(placement.projectTitle).toBeNull();
      expect(placement.targetProjectDirs).toEqual(["/legacy/dir"]);
    });

    it("deduplicates targetProjectDirs preserving first occurrence and trims whitespace", () => {
      const home = { path: "/p", root: "/r" };
      const bot = makeBot({
        cwd: " /workspace/app ",
        mounts: ["/workspace/app", "  /workspace/lib  ", "/workspace/app", ""],
      });

      const placement = resolveBotPlacement(bot, null, home);
      expect(placement.targetProjectDirs).toEqual(["/workspace/app", "/workspace/lib"]);
    });
  });

  describe("Managed CWD Invariant with startBotChat", () => {
    it("ensures startBotChat passes managed seat CWD to api.agents.create", async () => {
      const apiAgentsCreate = vi.fn().mockResolvedValue({ id: "agent-seat-test" });
      const mockApi: any = {
        projects: { list: vi.fn().mockResolvedValue({ projects: [] }) },
        workspaces: {
          list: vi.fn().mockResolvedValue({ entries: [] }),
          ref: vi.fn(),
          open: vi.fn().mockResolvedValue({
            id: "ws-team-root",
            current: () => ({ projectId: "prj-t", projectRootPath: "/shared/Teams/Alpha" }),
            refresh: async () => ({ projectId: "prj-t", projectRootPath: "/shared/Teams/Alpha" }),
            setTitle: vi.fn().mockResolvedValue(undefined),
            archive: vi.fn().mockResolvedValue(undefined),
          }),
          create: vi.fn().mockResolvedValue({ id: "ws-seat" }),
        },
        agents: { create: apiAgentsCreate },
        providers: {
          snapshot: vi.fn().mockResolvedValue({
            entries: [{ provider: "agy", models: [{ id: "gemini-4-hydrogen", isDefault: true }] }],
          }),
        },
      };

      const placement: BotPlacement = {
        path: "/shared/Teams/Alpha/agents/bot-mocode",
        projectRoot: "/shared/Teams/Alpha",
        projectTitle: "Alpha",
        botHomePath: "/shared/Bots/bot-mocode",
        teamRootPath: "/shared/Teams/Alpha",
        sessionBoardPath: "/shared/Teams/Alpha/sessions/s1",
        targetProjectDirs: ["/code/repo"],
      };

      const agentId = await startBotChat(mockApi, {
        bot: makeBot({ id: "bot-mocode", name: "moCode", provider: "agy", model: "gemini-4-hydrogen" }),
        library: EMPTY_LIBRARY,
        placement,
        prompt: "Review PR",
        systemPrompt: "You are moCode.",
      });

      expect(agentId).toBe("agent-seat-test");
      expect(apiAgentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: "/shared/Teams/Alpha/agents/bot-mocode",
          workspaceId: "ws-seat",
        }),
      );
    });
  });
});
