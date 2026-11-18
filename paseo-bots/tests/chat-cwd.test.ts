import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureBotHome } from "../server/bot-home";
import { EMPTY_LIBRARY, primaryGroupForBot, type BotGroup } from "../shared/bot";
import { expandPortablePath, resolveBotPlacement, startBotChat, syncBotWorkspaceTitle } from "../shared/chat";
import { makeBot } from "./helpers";

describe("startBotChat placement cwd", () => {
  it("passes placement.path as cwd and workspace.id to api.agents.create for Bots project workspaces", async () => {
    const workspaceAgentsCreate = vi.fn();
    const apiAgentsCreate = vi.fn().mockResolvedValue({ id: "agent-1" });
    const setTitle = vi.fn().mockResolvedValue(undefined);

    const existingWorkspace = {
      id: "ws-mocode",
      projectId: "proj-bots",
      projectRootPath: "/shared/Bots",
      workspaceDirectory: "/shared/Bots/bot-mocode",
      title: "Old Name",
    };

    const mockApi: any = {
      projects: {
        list: vi.fn().mockResolvedValue({ projects: [{ projectId: "proj-bots", projectRootPath: "/shared/Bots" }] }),
      },
      workspaces: {
        list: vi.fn().mockResolvedValue({ entries: [existingWorkspace] }),
        ref: vi.fn().mockReturnValue({
          id: "ws-mocode",
          current: () => existingWorkspace,
          refresh: async () => existingWorkspace,
          setTitle,
          archive: vi.fn(),
          agents: { create: workspaceAgentsCreate },
        }),
        open: vi.fn(),
        create: vi.fn(),
      },
      agents: {
        create: apiAgentsCreate,
      },
      providers: {
        snapshot: vi.fn().mockResolvedValue({
          entries: [{ provider: "agy", models: [{ id: "gemini-4-hydrogen", isDefault: true }] }],
        }),
      },
    };

    const agentId = await startBotChat(mockApi, {
      bot: makeBot({ id: "bot-mocode", name: "moCode", provider: "agy", model: "gemini-4-hydrogen" }),
      library: EMPTY_LIBRARY,
      placement: { path: "/shared/Bots/bot-mocode", projectRoot: "/shared/Bots" },
      prompt: "Hello",
      systemPrompt: "You are moCode.",
    });

    expect(agentId).toBe("agent-1");
    expect(setTitle).toHaveBeenCalledWith("moCode");
    expect(workspaceAgentsCreate).not.toHaveBeenCalled();
    expect(apiAgentsCreate).toHaveBeenCalledTimes(1);
    expect(apiAgentsCreate.mock.calls[0]?.[0]).toMatchObject({
      cwd: "/shared/Bots/bot-mocode",
      workspaceId: "ws-mocode",
    });
  });

  it("creates workspace under Bots project and passes placement.path as cwd when workspace does not exist yet", async () => {
    const apiAgentsCreate = vi.fn().mockResolvedValue({ id: "agent-2" });
    const rootArchive = vi.fn().mockResolvedValue(undefined);
    const workspaceCreate = vi.fn().mockResolvedValue({ id: "ws-new" });

    const mockApi: any = {
      projects: {
        list: vi.fn().mockResolvedValue({ projects: [] }),
      },
      workspaces: {
        list: vi.fn().mockResolvedValue({ entries: [] }),
        ref: vi.fn(),
        open: vi.fn().mockResolvedValue({
          id: "ws-root",
          current: () => ({ projectId: "proj-bots", projectRootPath: "/shared/Bots" }),
          refresh: async () => ({ projectId: "proj-bots", projectRootPath: "/shared/Bots" }),
          setTitle: vi.fn(),
          archive: rootArchive,
        }),
        create: workspaceCreate,
      },
      agents: {
        create: apiAgentsCreate,
      },
      providers: {
        snapshot: vi.fn().mockResolvedValue({
          entries: [{ provider: "agy", models: [{ id: "gemini-4-hydrogen", isDefault: true }] }],
        }),
      },
    };

    const agentId = await startBotChat(mockApi, {
      bot: makeBot({ id: "bot-mocode", name: "moCode", provider: "agy", model: "gemini-4-hydrogen" }),
      library: EMPTY_LIBRARY,
      placement: { path: "/shared/Bots/bot-mocode", projectRoot: "/shared/Bots" },
      prompt: "Hello",
      systemPrompt: "You are moCode.",
    });

    expect(agentId).toBe("agent-2");
    expect(rootArchive).toHaveBeenCalledTimes(1);
    expect(workspaceCreate).toHaveBeenCalledWith({
      title: "moCode",
      background: true,
      source: { kind: "directory", path: "/shared/Bots/bot-mocode", projectId: "proj-bots" },
    });
    expect(apiAgentsCreate.mock.calls[0]?.[0]).toMatchObject({
      cwd: "/shared/Bots/bot-mocode",
      workspaceId: "ws-new",
    });
  });

  it("uses custom bot.cwd when projectRoot is null", async () => {
    const apiAgentsCreate = vi.fn().mockResolvedValue({ id: "agent-3" });
    const workspaceCreate = vi.fn().mockResolvedValue({ id: "ws-custom" });

    const mockApi: any = {
      projects: { list: vi.fn() },
      workspaces: {
        list: vi.fn().mockResolvedValue({ entries: [] }),
        ref: vi.fn(),
        open: vi.fn(),
        create: workspaceCreate,
      },
      agents: {
        create: apiAgentsCreate,
      },
      providers: {
        snapshot: vi.fn().mockResolvedValue({
          entries: [{ provider: "agy", models: [{ id: "gemini-4-hydrogen", isDefault: true }] }],
        }),
      },
    };

    const agentId = await startBotChat(mockApi, {
      bot: makeBot({ id: "bot-mocode", name: "moCode", provider: "agy", model: "gemini-4-hydrogen", cwd: "/custom/repo" }),
      library: EMPTY_LIBRARY,
      placement: { path: "/custom/repo", projectRoot: null },
      prompt: "Hello",
      systemPrompt: "You are moCode.",
    });

    expect(agentId).toBe("agent-3");
    expect(workspaceCreate).toHaveBeenCalledWith({
      title: "moCode",
      background: true,
      source: { kind: "directory", path: "/custom/repo" },
    });
    expect(apiAgentsCreate.mock.calls[0]?.[0]).toMatchObject({
      cwd: "/custom/repo",
      workspaceId: "ws-custom",
    });
  });

  it("groups team bots under shared/Teams/<groupId> with project rename while keeping cwd at shared/Bots/<botId>", async () => {
    const apiAgentsCreate = vi.fn().mockResolvedValue({ id: "agent-team" });
    const rootArchive = vi.fn().mockResolvedValue(undefined);
    const projectRename = vi.fn().mockResolvedValue(undefined);
    const workspaceCreate = vi.fn().mockResolvedValue({ id: "ws-team-bot" });

    const mockApi: any = {
      projects: {
        list: vi.fn().mockResolvedValue({ projects: [] }),
        rename: projectRename,
      },
      workspaces: {
        list: vi.fn().mockResolvedValue({ entries: [] }),
        ref: vi.fn(),
        open: vi.fn().mockResolvedValue({
          id: "ws-team-root",
          current: () => ({ projectId: "proj-team", projectRootPath: "/shared/Teams/team-alpha", projectDisplayName: "team-alpha" }),
          refresh: async () => ({ projectId: "proj-team", projectRootPath: "/shared/Teams/team-alpha", projectDisplayName: "team-alpha" }),
          setTitle: vi.fn(),
          archive: rootArchive,
        }),
        create: workspaceCreate,
      },
      agents: {
        create: apiAgentsCreate,
      },
      providers: {
        snapshot: vi.fn().mockResolvedValue({
          entries: [{ provider: "agy", models: [{ id: "gemini-4-hydrogen", isDefault: true }] }],
        }),
      },
    };

    const agentId = await startBotChat(mockApi, {
      bot: makeBot({ id: "bot-mocode", name: "moCode", provider: "agy", model: "gemini-4-hydrogen" }),
      library: EMPTY_LIBRARY,
      placement: { path: "/shared/Bots/bot-mocode", projectRoot: "/shared/Teams/team-alpha", projectTitle: "Alpha Squad" },
      prompt: "Hello team",
      systemPrompt: "You are moCode.",
    });

    expect(agentId).toBe("agent-team");
    expect(mockApi.workspaces.open).toHaveBeenCalledWith("/shared/Teams/team-alpha");
    expect(projectRename).toHaveBeenCalledWith("proj-team", "Alpha Squad");
    expect(workspaceCreate).toHaveBeenCalledWith({
      title: "moCode",
      background: true,
      source: { kind: "directory", path: "/shared/Bots/bot-mocode", projectId: "proj-team" },
    });
    expect(apiAgentsCreate.mock.calls[0]?.[0]).toMatchObject({
      cwd: "/shared/Bots/bot-mocode",
      workspaceId: "ws-team-bot",
    });
  });

  it("does not reuse an old Bots project workspace with the same workspaceDirectory when targeting a Team project", async () => {
    const apiAgentsCreate = vi.fn().mockResolvedValue({ id: "agent-team-new" });
    const workspaceCreate = vi.fn().mockResolvedValue({ id: "ws-team-new" });
    const setTitleOld = vi.fn().mockResolvedValue(undefined);
    const oldBotsWorkspace = {
      id: "ws-old-bots",
      projectId: "prj-old-bots",
      projectRootPath: "/shared/Bots",
      workspaceDirectory: "/shared/Bots/bot-moadmin",
      title: "Old moAdmin",
    };

    const mockApi: any = {
      projects: {
        list: vi.fn().mockResolvedValue({
          projects: [
            { projectId: "prj-old-bots", projectRootPath: "/shared/Bots" },
            { projectId: "prj-team", projectRootPath: "/shared/Teams/multiagent-orchestration", projectCustomName: "multiagent-orchestration" },
          ],
        }),
        rename: vi.fn(),
      },
      workspaces: {
        list: vi.fn().mockResolvedValue({ entries: [oldBotsWorkspace] }),
        ref: vi.fn().mockReturnValue({
          id: "ws-old-bots",
          current: () => oldBotsWorkspace,
          refresh: async () => oldBotsWorkspace,
          setTitle: setTitleOld,
          archive: vi.fn(),
        }),
        open: vi.fn(),
        create: workspaceCreate,
      },
      agents: {
        create: apiAgentsCreate,
      },
      providers: {
        snapshot: vi.fn().mockResolvedValue({
          entries: [{ provider: "agy", models: [{ id: "gemini-4-hydrogen", isDefault: true }] }],
        }),
      },
    };

    const bot = makeBot({ id: "bot-moadmin", name: "moAdmin", provider: "agy", model: "gemini-4-hydrogen" });
    const placement = {
      path: "/shared/Bots/bot-moadmin",
      projectRoot: "/shared/Teams/multiagent-orchestration",
      projectTitle: "multiagent-orchestration",
    };

    await syncBotWorkspaceTitle(mockApi, bot, placement);
    expect(setTitleOld).not.toHaveBeenCalled();

    const agentId = await startBotChat(mockApi, {
      bot,
      library: EMPTY_LIBRARY,
      placement,
      prompt: "Hello team",
      systemPrompt: "You are moAdmin.",
    });

    expect(agentId).toBe("agent-team-new");
    expect(setTitleOld).not.toHaveBeenCalled();
    expect(workspaceCreate).toHaveBeenCalledWith({
      title: "moAdmin",
      background: true,
      source: { kind: "directory", path: "/shared/Bots/bot-moadmin", projectId: "prj-team" },
    });
    expect(apiAgentsCreate.mock.calls[0]?.[0]).toMatchObject({
      cwd: "/shared/Bots/bot-moadmin",
      workspaceId: "ws-team-new",
    });
  });
});

describe("primaryGroupForBot", () => {
  const makeGroup = (overrides: Partial<BotGroup> & Pick<BotGroup, "id" | "name">): BotGroup => ({
    id: overrides.id,
    name: overrides.name,
    logo: null,
    leadId: overrides.leadId ?? null,
    memberIds: overrides.memberIds ?? [],
    instructions: "",
    cwd: overrides.cwd ?? null,
    mounts: overrides.mounts ?? [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  it("prefers the group where the bot is leadId, then first memberIds match, then null", () => {
    const groups: BotGroup[] = [
      makeGroup({ id: "g-member-1", name: "Member First", leadId: "bot-other", memberIds: ["bot-a", "bot-other"] }),
      makeGroup({ id: "g-lead", name: "Lead Team", leadId: "bot-a", memberIds: ["bot-a"] }),
      makeGroup({ id: "g-member-2", name: "Member Second", leadId: "bot-x", memberIds: ["bot-b"] }),
    ];

    expect(primaryGroupForBot("bot-a", groups)?.id).toBe("g-lead");
    expect(primaryGroupForBot("bot-b", groups)?.id).toBe("g-member-2");
    expect(primaryGroupForBot("bot-unassigned", groups)).toBeNull();
  });
});

describe("ensureBotHome", () => {
  const prevPaseoHome = process.env.PASEO_HOME;
  let tempHome: string | null = null;

  afterEach(() => {
    if (prevPaseoHome === undefined) delete process.env.PASEO_HOME;
    else process.env.PASEO_HOME = prevPaseoHome;
    if (tempHome) {
      rmSync(tempHome, { recursive: true, force: true });
      tempHome = null;
    }
  });

  it("returns shared/Teams/<sanitized-group-name> as root with icon.svg when groupId and groupName are provided, and falls back to shared/Bots otherwise", async () => {
    tempHome = mkdtempSync(join(tmpdir(), "paseo-bots-home-"));
    process.env.PASEO_HOME = tempHome;

    const teamHome = await ensureBotHome({ botId: "bot-mocode", groupId: "team-alpha", groupName: "multiagent-orchestration" });
    expect(teamHome.root).toBe(join(tempHome, "plugin-data", "paseo-bots", "shared", "Teams", "multiagent-orchestration"));
    expect(teamHome.path).toBe(join(tempHome, "plugin-data", "paseo-bots", "shared", "Bots", "bot-mocode"));
    expect(existsSync(join(teamHome.root, "icon.svg"))).toBe(true);
    expect(existsSync(teamHome.path)).toBe(true);

    const sanitizedHome = await ensureBotHome({ botId: "bot-x", groupId: "team-x", groupName: "X / AI:Feed" });
    expect(sanitizedHome.root).toBe(join(tempHome, "plugin-data", "paseo-bots", "shared", "Teams", "X - AI-Feed"));

    const idFallbackHome = await ensureBotHome({ botId: "bot-y", groupId: "team-beta" });
    expect(idFallbackHome.root).toBe(join(tempHome, "plugin-data", "paseo-bots", "shared", "Teams", "team-beta"));

    const fallbackHome = await ensureBotHome({ botId: "bot-solo" });
    expect(fallbackHome.root).toBe(join(tempHome, "plugin-data", "paseo-bots", "shared", "Bots"));
    expect(fallbackHome.path).toBe(join(tempHome, "plugin-data", "paseo-bots", "shared", "Bots", "bot-solo"));
  });

  it("expands portable ${REPO_ROOT} and ~ paths across macOS and Windows in resolveBotPlacement", () => {
    expect(
      expandPortablePath("${REPO_ROOT}", {
        repoRootPath: "D:\\work\\multiagent-orchestration",
        userHomePath: "C:\\Users\\partner",
      }),
    ).toBe("D:\\work\\multiagent-orchestration");

    expect(
      expandPortablePath("${REPO_ROOT}/paseo-bots", {
        repoRootPath: "D:\\work\\multiagent-orchestration",
        userHomePath: "C:\\Users\\partner",
      }),
    ).toBe("D:\\work\\multiagent-orchestration\\paseo-bots");

    expect(
      expandPortablePath("~/projects/demo", {
        repoRootPath: "/Users/me/repo",
        userHomePath: "C:\\Users\\partner",
      }),
    ).toBe("C:\\Users\\partner\\projects\\demo");

    const bot = makeBot({ id: "bot-mocode", cwd: null, mounts: ["~/shared-notes"] });
    const group: Pick<BotGroup, "id" | "name" | "cwd" | "mounts"> = {
      id: "team-1",
      name: "multiagent-orchestration",
      cwd: "${REPO_ROOT}",
      mounts: [],
    };
    const placement = resolveBotPlacement(bot, group, {
      path: "/managed/seat",
      root: "/managed/root",
      repoRootPath: "/Users/partner/code/multiagent-orchestration",
      userHomePath: "/Users/partner",
    });
    expect(placement.targetProjectDirs).toEqual([
      "/Users/partner/code/multiagent-orchestration",
      "/Users/partner/shared-notes",
    ]);
  });
});
