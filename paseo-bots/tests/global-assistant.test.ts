import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  APPS_MCP_NAME,
  BOT_LABEL,
  botSettings,
  EMPTY_LIBRARY,
  GLOBAL_ASSISTANT_LABEL,
  isGlobalAssistantBot,
  LIFECYCLE_MOUNT_LABEL,
  LONG_SESSION_ENABLED_LABEL,
  LONG_SESSION_SYNC_METADATA,
  TOOLS_MCP_NAME,
  type Bot,
  type BotGroup,
  type BotSettingsValues,
} from "../shared/bot";
import { resolveSessionRole, sessionRolePrompt } from "../shared/groups";
import { BotsHost } from "../server/host";
import { connectSchedulerHost, isAuthConnectionError, nextRetryDelayMs } from "../server/connection";
import { Relay } from "../server/relay";
import { botDataPath, ensureBotsHome } from "../server/bot-home";
import { startChat } from "../server/chats";
import { registerBotSessionLifecycle } from "../server/bot-lifecycle";
import { systemPrompt } from "../server/prompt";
import { computeMemorySyncSnapshot } from "../server/memory";
import { CompanionSessionManager, readShadowSession } from "../server/companion-session";
import { startBotChat, TEAM_SESSION_LABEL } from "../shared/chat";
import { ASKED_BY_LABEL, TIER_DEPTH_LABEL } from "../shared/handoff";
import { askBot, listTeams } from "../server/tools/bots";
import { resolveWorkflowForCaller } from "../server/tools/workflows";

function makeBot(patch: Partial<Bot> = {}): Bot {
  const id = patch.id ?? "bot-1";
  return {
    id,
    name: patch.name ?? id,
    title: "",
    description: "",
    avatar: { seed: id, palette: null, shape: "circle", imageUrl: null },
    hostId: null,
    provider: "agy",
    model: "gemini-4-hydrogen",
    modeId: "full-access",
    thinkingOptionId: null,
    fallbackModels: [],
    providerConfigs: [],
    soul: "",
    mcpServerIds: [],
    alwaysAllow: [],
    skillIds: [],
    apps: [],
    appRules: {},
    voice: { name: null, readReplies: false },
    contactBots: "allow",
    routines: [],
    playbooks: [],
    cwd: null,
    mounts: [],
    pinned: false,
    archived: false,
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
    ...patch,
  };
}

function makeGroup(patch: Partial<BotGroup> = {}): BotGroup {
  return {
    id: patch.id ?? "team-1",
    name: patch.name ?? "Team 1",
    logo: null,
    leadId: patch.leadId ?? null,
    memberIds: patch.memberIds ?? [],
    instructions: "",
    cwd: null,
    mounts: [],
    workflows: [],
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
    ...patch,
  };
}

describe("Global Personal Assistant (L1 Router), Cross-Team Routing & Hash-Gated Memory Sync", () => {
  let home = "";

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "paseo-bots-global-l1-"));
    process.env.PASEO_HOME = home;
  });

  afterAll(async () => {
    delete process.env.PASEO_HOME;
    await rm(home, { recursive: true, force: true });
  });

  it("identifies Global Assistant role and renders dedicated lightweight L1 router prompt", () => {
    const chief = makeBot({ id: "bot-chief", name: "全局助理", isGlobalAssistant: true });
    expect(isGlobalAssistantBot(chief)).toBe(true);
    expect(isGlobalAssistantBot(makeBot({ id: "bot-moadmin" }))).toBe(false);

    expect(
      resolveSessionRole({ botId: chief.id, group: null, isGlobalAssistant: true }),
    ).toBe("team-lead");

    const prompt = sessionRolePrompt("team-lead", { isGlobalAssistant: true });
    expect(prompt).toContain("Global Personal Assistant (L1 Chief of Staff Router)");
    expect(prompt).toContain("list_teams");
    expect(prompt).toContain("ask_bot(bot, message, team_id)");
    expect(prompt).toContain("Green (Full Autonomy)");
    expect(prompt).toContain("Red (Hard Circuit-Breaker");
  });

  it("list_teams returns teams, cwd, leads, members, and workflows", async () => {
    const chief = makeBot({ id: "bot-chief", name: "全局助理", isGlobalAssistant: true });
    const moadmin = makeBot({ id: "bot-moadmin", name: "moAdmin" });
    const groupA = makeGroup({
      id: "team-a",
      name: "Project Alpha",
      cwd: "/repos/alpha",
      leadId: "bot-moadmin",
      memberIds: ["bot-moadmin"],
      workflows: [
        {
          id: "wf-alpha",
          name: "Alpha Pipeline",
          description: "",
          stages: [{ id: "s1", name: "Code", botId: "bot-moadmin", prompt: "", engine: "auto", dependsOn: [], maxRetries: 1 }],
        },
      ],
    });
    const host = {
      bots: async () => [chief, moadmin],
      bot: async (id: string) => [chief, moadmin].find((b) => b.id === id) ?? null,
      values: async () => ({ bots: [chief, moadmin], groups: [groupA] } as unknown as BotSettingsValues),
      library: async () => EMPTY_LIBRARY,
    } as unknown as BotsHost;

    const output = await listTeams.run({}, { bot: chief, host, agentId: "c1", relay: {} as Relay });
    expect(output).toContain("Project Alpha (id: team-a)");
    expect(output).toContain("cwd: /repos/alpha");
    expect(output).toContain("lead: moAdmin (bot-moadmin)");
    expect(output).toContain("workflows: Alpha Pipeline (wf-alpha)");

    const emptyHost = {
      bots: async () => [chief],
      values: async () => ({ bots: [chief], groups: [] } as unknown as BotSettingsValues),
    } as unknown as BotsHost;
    expect(await listTeams.run({}, { bot: chief, host: emptyHost, agentId: "c2", relay: {} as Relay })).toBe("There are no teams configured.");
  });

  it("routes ask_bot across teams with team_id, isolates teamSessionId, sets tier-depth=2, and seeds global assistant metadata", async () => {
    const chief = makeBot({ id: "bot-chief", name: "全局助理", isGlobalAssistant: true });
    const moadmin = makeBot({ id: "bot-moadmin", name: "moAdmin" });
    const coder = makeBot({ id: "bot-mocode", name: "moCode" });
    const outsider = makeBot({ id: "bot-outsider", name: "Outsider" });
    const groupB = makeGroup({
      id: "team-b",
      name: "Project Beta",
      cwd: home,
      leadId: "bot-moadmin",
      memberIds: ["bot-moadmin", "bot-mocode"],
    });
    const groupOther = makeGroup({
      id: "team-other",
      name: "Other Team",
      leadId: "bot-outsider",
      memberIds: ["bot-outsider"],
    });

    const createdAgents: Array<{ id: string; cwd: string; labels: Record<string, string>; config: Record<string, unknown> }> = [];
    const metadataWrites: Array<{ agentId: string; patch: Record<string, unknown> }> = [];
    const chats: Record<string, { labels: Record<string, string>; botId: string }> = {
      "chief-chat": { botId: chief.id, labels: { [TEAM_SESSION_LABEL]: "chief-session", [GLOBAL_ASSISTANT_LABEL]: "true" } },
      "outsider-chat": { botId: outsider.id, labels: { [TEAM_SESSION_LABEL]: "outsider-session" } },
    };

    const fakePaseo = {
      config: { get: async () => ({ config: {} }) },
      projects: {
        list: async () => ({ projects: [] }),
        rename: async () => undefined,
      },
      workspaces: {
        open: async () => ({
          current: () => ({ projectId: "proj-1", projectDisplayName: "Project Beta" }),
          archive: async () => undefined,
        }),
        list: async () => ({ entries: [] }),
        create: async () => ({ id: "ws-1" }),
        ref: () => ({ setTitle: async () => undefined }),
      },
      agents: {
        create: async (input: { agentId?: string; cwd: string; labels?: Record<string, string>; config: Record<string, unknown> }) => {
          const id = input.agentId ?? `agent-${createdAgents.length + 1}`;
          createdAgents.push({ id, cwd: input.cwd, labels: input.labels ?? {}, config: input.config });
          return { id };
        },
        ref: (id: string) => ({
          refresh: async () => ({ agent: { id, status: "idle", labels: createdAgents.find((a) => a.id === id)?.labels ?? {}, metadata: {} } }),
          setMetadata: async (patch: Record<string, unknown>) => { metadataWrites.push({ agentId: id, patch }); },
          timeline: { refetch: async () => ({ entries: [] }) },
          waitForFinish: async () => null,
        }),
      },
    };

    const host = {
      requirePaseo: () => fakePaseo,
      paseo: fakePaseo,
      bots: async () => [chief, moadmin, coder, outsider],
      bot: async (id: string) => [chief, moadmin, coder, outsider].find((b) => b.id === id) ?? null,
      values: async () => ({ bots: [chief, moadmin, coder, outsider], groups: [groupB, groupOther] } as unknown as BotSettingsValues),
      library: async () => EMPTY_LIBRARY,
      chatOf: async (agentId: string) => chats[agentId] ?? null,
    } as unknown as BotsHost;

    const relay = { mountTools: async () => ({ type: "http", url: "http://127.0.0.1:1/bots", headers: {} }) } as unknown as Relay;

    // Starting a global assistant chat auto-tags long-session & global-assistant labels and seeds memory sync metadata
    const chiefChatId = await startChat(host, relay, chief, {
      prompt: "Morning briefing",
      title: "Global Assistant",
      labels: {},
      syncAgy: false,
    });
    const chiefCreated = createdAgents.find((a) => a.id === chiefChatId);
    expect(chiefCreated).toBeDefined();
    expect(chiefCreated!.labels[GLOBAL_ASSISTANT_LABEL]).toBe("true");
    expect(chiefCreated!.labels[LONG_SESSION_ENABLED_LABEL]).toBe("true");
    expect(String(chiefCreated!.config.systemPrompt ?? "")).toContain("Global Personal Assistant (L1 Chief of Staff Router)");
    expect(metadataWrites.some((w) => w.agentId === chiefChatId && Boolean(w.patch[LONG_SESSION_SYNC_METADATA]))).toBe(true);

    // Routing ask_bot with team_id spawns L2 worker in target group with isolated teamSessionId
    const reply = await askBot.run(
      { bot: "bot-moadmin", team_id: "team-b", message: "Ship feature X", wait: false },
      { bot: chief, host, agentId: "chief-chat", relay },
    );

    const dispatched = createdAgents.at(-1)!;
    expect(reply).toContain(`Asked moAdmin in chat ${dispatched.id}`);
    expect(dispatched.labels[TIER_DEPTH_LABEL]).toBe("2");
    expect(dispatched.labels[TEAM_SESSION_LABEL]).not.toBe("chief-session");

    // Non-global outsider blocked from dispatching across unrelated teams
    await expect(
      askBot.run(
        { bot: "bot-moadmin", team_id: "team-other", message: "Sneaky cross-team" },
        { bot: coder, host, agentId: "outsider-chat", relay },
      ),
    ).rejects.toThrow(/cannot dispatch across to unrelated team/i);

    // Workflow resolution allows cross-team only when allowCrossTeam is true
    const wfGroup = makeGroup({
      ...groupB,
      workflows: [
        {
          id: "wf-b",
          name: "Beta WF",
          description: "",
          stages: [{ id: "s1", name: "S1", botId: "bot-mocode", prompt: "", engine: "auto", dependsOn: [], maxRetries: 1 }],
        },
      ],
    });
    expect(() => resolveWorkflowForCaller("wf-b", chief.id, [wfGroup], [], "team-b", false)).toThrow(/not on team/);
    const resolved = resolveWorkflowForCaller("wf-b", chief.id, [wfGroup], [], "team-b", true);
    expect(resolved.workflow.id).toBe("wf-b");
    expect(resolved.group?.id).toBe("team-b");
  });

  it("restricts CompanionSessionManager to Global Assistant and performs SHA-256 hash-gated post-compaction memory sync", async () => {
    await ensureBotsHome();
    const chief = makeBot({ id: "bot-chief", name: "全局助理", isGlobalAssistant: true });
    const regular = makeBot({ id: "bot-regular", name: "Regular" });

    const chiefDir = botDataPath(chief.id);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(chiefDir, { recursive: true });
    await writeFile(join(chiefDir, "MEMORY.md"), "# User Prefs\n- Keep responses concise.\n", "utf8");
    const snap1 = await computeMemorySyncSnapshot(chiefDir);
    expect(snap1).not.toBeNull();

    const agentMetadata: Record<string, unknown> = {
      [LONG_SESSION_SYNC_METADATA]: {
        pendingMemorySync: false,
        lastSyncedMemoryHash: snap1!.hash,
        compactionCount: 0,
      },
    };

    const fakePaseo = {
      agents: {
        ref: () => ({
          refresh: async () => ({
            agent: {
              id: "main-agent-1",
              labels: { [GLOBAL_ASSISTANT_LABEL]: "true", [LONG_SESSION_ENABLED_LABEL]: "true" },
              metadata: agentMetadata,
            },
          }),
          setMetadata: async (patch: Record<string, unknown>) => {
            Object.assign(agentMetadata, patch);
          },
        }),
      },
    };

    const host = {
      paseo: fakePaseo,
      bot: async (id: string) => (id === chief.id ? chief : regular),
      values: async () => ({ bots: [chief, regular], groups: [] } as unknown as BotSettingsValues),
      chatOf: async () => null,
    } as unknown as BotsHost;

    const manager = new CompanionSessionManager(host, { globalAssistantOnly: true });

    // 1. Non-global assistant is immediately bypassed with zero overhead
    const regularRes = await manager.compileUserTurn({
      mainAgentId: "regular-agent-1",
      botId: regular.id,
      rawText: "帮我检查一下代码架构问题",
    });
    expect(regularRes.bypassed).toBe(true);
    expect(regularRes.fallbackReason).toBe("Companion restricted to global assistant");
    expect(await readShadowSession("regular-agent-1")).toBeNull();

    // 2. Normal turn on global assistant (pendingMemorySync: false) -> G2 short confirmation bypasses with zero <memory_sync>
    const normalRes = await manager.compileUserTurn({
      mainAgentId: "main-agent-1",
      botId: chief.id,
      rawText: "继续",
    });
    expect(normalRes.outgoingText).toBe("继续");
    expect(normalRes.outgoingText).not.toContain("<memory_sync");

    // 3. Compaction completed, MEMORY.md unchanged -> clears pendingMemorySync, zero tokens injected
    (agentMetadata[LONG_SESSION_SYNC_METADATA] as Record<string, unknown>).pendingMemorySync = true;
    const unchangedRes = await manager.compileUserTurn({
      mainAgentId: "main-agent-1",
      botId: chief.id,
      rawText: "继续",
    });
    expect(unchangedRes.outgoingText).toBe("继续");
    expect((agentMetadata[LONG_SESSION_SYNC_METADATA] as Record<string, unknown>).pendingMemorySync).toBe(false);

    // 4. Compaction completed, MEMORY.md changed -> injects <memory_sync> even on short G2 bypass turn!
    await writeFile(join(chiefDir, "MEMORY.md"), "# User Prefs\n- Keep responses concise.\n- Prefer 3-tier Chief of Staff.\n", "utf8");
    const snap2 = await computeMemorySyncSnapshot(chiefDir);
    expect(snap2!.hash).not.toBe(snap1!.hash);

    (agentMetadata[LONG_SESSION_SYNC_METADATA] as Record<string, unknown>).pendingMemorySync = true;
    const syncedRes = await manager.compileUserTurn({
      mainAgentId: "main-agent-1",
      botId: chief.id,
      rawText: "继续",
    });
    expect(syncedRes.outgoingText).toContain(`<memory_sync hash="${snap2!.hash.slice(0, 12)}">`);
    expect(syncedRes.outgoingText).toContain("Prefer 3-tier Chief of Staff.");
    expect(syncedRes.outgoingText).toContain("继续");
    expect((agentMetadata[LONG_SESSION_SYNC_METADATA] as Record<string, unknown>).pendingMemorySync).toBe(false);
    expect((agentMetadata[LONG_SESSION_SYNC_METADATA] as Record<string, unknown>).lastSyncedMemoryHash).toBe(snap2!.hash);
  });

  it("validates repository bots.json includes bot-chief with isGlobalAssistant: true", async () => {
    const botsJsonPath = resolve(__dirname, "../../paseo-bots-plugin-settings/bots.json");
    const raw = JSON.parse(await readFile(botsJsonPath, "utf8")) as { version: number; values: unknown };
    const parsed = botSettings.schema.parse(raw.values);
    const chief = parsed.bots.find((b) => b.id === "bot-chief");
    expect(chief).toBeDefined();
    expect(chief!.name).toBe("全局助理");
    expect(chief!.isGlobalAssistant).toBe(true);
    expect(chief!.baseTools).toEqual(["ask_question"]);
    expect(chief!.mcpServerIds).toEqual([]);
    expect(chief!.skillIds).toEqual([]);
  });

  it("systemPrompt auto-detects bot-chief and injects Global Assistant prompt plus full team roster", async () => {
    const chief = makeBot({ id: "bot-chief", name: "全局助理", isGlobalAssistant: true, contactBots: "allow" });
    const moadmin = makeBot({ id: "bot-moadmin", name: "moAdmin" });
    const groupA = makeGroup({
      id: "team-alpha",
      name: "Alpha Squad",
      cwd: "/tmp/alpha",
      leadId: "bot-moadmin",
      memberIds: ["bot-moadmin"],
    });
    const fakePaseo = {
      config: { get: async () => ({ config: {} }) },
    } as unknown as BotsHost["paseo"];

    const res = await systemPrompt(
      { bot: chief, local: true, syncAgy: false, syncClaude: false, message: "帮我派单" },
      EMPTY_LIBRARY,
      fakePaseo,
      { bots: [chief, moadmin], groups: [groupA] } as unknown as BotSettingsValues,
    );
    expect(res.systemPrompt).toContain("Global Personal Assistant (L1 Chief of Staff Router)");
    expect(res.systemPrompt).toContain("Global Teams Directory");
    expect(res.systemPrompt).toContain("Alpha Squad (id: team-alpha)");
    expect(res.systemPrompt).toContain("list_teams");
    expect(res.systemPrompt).not.toContain('You are the Chief of Staff of the "Alpha Squad" team');
  });

  it("registerBotSessionLifecycle gates lifecycle mounts on LIFECYCLE_MOUNT_LABEL, unifies OAuth, and sets PASEO_AGY_BOT_PROMPT_FILE", async () => {
    const chief = makeBot({ id: "bot-chief", name: "全局助理", isGlobalAssistant: true, apps: ["github"] });
    let capturedHandler: ((payload: any, context: any) => Promise<any>) | null = null;
    const fakeServer = {
      addHook(name: string, fn: (payload: any, context: any) => Promise<any>) {
        if (name === "agent.open.before") capturedHandler = fn;
        return () => {};
      },
    } as unknown as Parameters<typeof registerBotSessionLifecycle>[0];
    const fakeHost = {
      attach() {},
      bot: async (id: string) => (id === chief.id ? chief : null),
      library: async () => EMPTY_LIBRARY,
      values: async () => ({ bots: [chief], groups: [] }),
    } as unknown as Parameters<typeof registerBotSessionLifecycle>[1];
    const mountToolsSpy = vi.fn(async (botId: string, agentId: string) => ({
      type: "http" as const,
      url: `http://127.0.0.1:9999/bots/${botId}/${agentId}`,
      headers: { Authorization: "Bearer t" },
    }));
    const mountAppsSpy = vi.fn(async (botId: string) => ({
      type: "http" as const,
      url: `http://127.0.0.1:9999/mcp/${botId}`,
      headers: { Authorization: "Bearer a" },
    }));
    const fakeRelay = { mountTools: mountToolsSpy, mountApps: mountAppsSpy };
    let oauthServers: Record<string, any> = {};
    const fakeOAuthProxy = {
      servers: vi.fn(async () => oauthServers),
    };
    const fakeContext = { paseo: { config: { get: async () => ({ config: {} }) } } };

    registerBotSessionLifecycle(fakeServer, fakeHost, fakeRelay, fakeOAuthProxy as never);
    expect(capturedHandler).not.toBeNull();

    const agyDir = await mkdtemp(join(tmpdir(), "paseo-agy-lifecycle-"));
    const prevAgyDir = process.env.AGY_AGENTS_DIR;
    process.env.AGY_AGENTS_DIR = agyDir;
    try {
      // 1. Saved UI / routine chat WITHOUT LIFECYCLE_MOUNT_LABEL and no OAuth -> returns undefined (zero collision)
      const savedNoOAuth = await capturedHandler!(
        {
          request: {
            agentId: "ag-saved-1",
            purpose: "interactive",
            labels: { [BOT_LABEL]: chief.id },
            env: { PATH: "/usr/bin" },
            mcpServers: {},
          },
        },
        fakeContext,
      );
      expect(savedNoOAuth).toBeUndefined();
      expect(mountToolsSpy).not.toHaveBeenCalled();
      expect(mountAppsSpy).not.toHaveBeenCalled();

      // 2. Saved chat WITHOUT LIFECYCLE_MOUNT_LABEL WITH OAuth -> mounts ONLY OAuth, checks conflicts, no AGY env
      oauthServers = {
        fixture: { type: "http", url: "http://127.0.0.1:9999/mcp-oauth/proxy/fixture", headers: {} },
      };
      const savedWithOAuth = await capturedHandler!(
        {
          request: {
            agentId: "ag-saved-2",
            purpose: "interactive",
            labels: { [BOT_LABEL]: chief.id },
            env: { PATH: "/usr/bin" },
            mcpServers: { existing: { type: "http", url: "http://127.0.0.1:1/existing", headers: {} } },
          },
        },
        fakeContext,
      );
      expect(Object.keys(savedWithOAuth.mcpServers)).toEqual(["existing", "fixture"]);
      expect(savedWithOAuth.mcpServers[TOOLS_MCP_NAME]).toBeUndefined();
      expect(savedWithOAuth.mcpServers[APPS_MCP_NAME]).toBeUndefined();
      expect(savedWithOAuth.env.PASEO_AGY_BOT_AGENT).toBeUndefined();
      expect(savedWithOAuth.env.PASEO_AGY_BOT_PROMPT_FILE).toBeUndefined();
      await expect(
        capturedHandler!(
          {
            request: {
              agentId: "ag-saved-conflict",
              purpose: "interactive",
              labels: { [BOT_LABEL]: chief.id },
              env: {},
              mcpServers: { fixture: { type: "http", url: "http://127.0.0.1:1/conflict", headers: {} } },
            },
          },
          fakeContext,
        ),
      ).rejects.toThrow("conflicts with another plugin");

      // 3. CLI chat WITH LIFECYCLE_MOUNT_LABEL=true -> mounts tools + apps + OAuth + PASEO_AGY_BOT_PROMPT_FILE
      const mounted = await capturedHandler!(
        {
          request: {
            agentId: "ag-cli-1",
            purpose: "interactive",
            labels: { [BOT_LABEL]: chief.id, [LIFECYCLE_MOUNT_LABEL]: "true" },
            env: { PATH: "/usr/bin" },
            mcpServers: {},
          },
        },
        fakeContext,
      );
      expect(mounted.mcpServers[TOOLS_MCP_NAME].url).toContain("/bots/bot-chief/ag-cli-1");
      expect(mounted.mcpServers[APPS_MCP_NAME].url).toContain("/mcp/bot-chief");
      expect(mounted.mcpServers.fixture.url).toContain("/mcp-oauth/proxy/fixture");
      const expectedPromptPath = join(agyDir, "bot-chief.md");
      expect(mounted.env.PASEO_AGY_BOT_PROMPT_FILE).toBe(expectedPromptPath);
      expect(mounted.env.PASEO_AGY_BOT_AGENT).toBeUndefined();
      expect(existsSync(expectedPromptPath)).toBe(true);

      // 4. Preserves existing tools/apps/prompt file when already supplied; returns undefined when nothing changes
      oauthServers = {};
      const preservedNoDelta = await capturedHandler!(
        {
          request: {
            agentId: "ag-cli-2",
            purpose: "interactive",
            labels: { [BOT_LABEL]: chief.id, [LIFECYCLE_MOUNT_LABEL]: "true" },
            env: { PASEO_AGY_BOT_PROMPT_FILE: "/custom/prompt.md" },
            mcpServers: {
              [TOOLS_MCP_NAME]: { type: "http", url: "http://127.0.0.1:1/existing", headers: {} },
              [APPS_MCP_NAME]: { type: "http", url: "http://127.0.0.1:1/existing-apps", headers: {} },
            },
          },
        },
        fakeContext,
      );
      expect(preservedNoDelta).toBeUndefined();

      // 5. History purpose always skips lifecycle mounting
      const historyRes = await capturedHandler!(
        {
          request: {
            agentId: "ag-hist-1",
            purpose: "history",
            labels: { [BOT_LABEL]: chief.id, [LIFECYCLE_MOUNT_LABEL]: "true" },
            env: {},
            mcpServers: {},
          },
        },
        fakeContext,
      );
      expect(historyRes).toBeUndefined();
    } finally {
      if (prevAgyDir === undefined) delete process.env.AGY_AGENTS_DIR;
      else process.env.AGY_AGENTS_DIR = prevAgyDir;
      await rm(agyDir, { recursive: true, force: true });
    }
  });

  it("connectSchedulerHost halts on auth errors without 30s retry storm and backs off transient failures", async () => {
    expect(isAuthConnectionError(new Error("Password required"))).toBe(true);
    expect(isAuthConnectionError(new Error("WebSocket closed 4401 Unauthorized"))).toBe(true);
    expect(isAuthConnectionError(new Error("connect ECONNREFUSED"))).toBe(false);
    expect([0, 1, 2, 3, 4].map((i) => nextRetryDelayMs(i))).toEqual([30_000, 60_000, 120_000, 300_000, 300_000]);

    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const dummySettings = {
        read: async () => ({ status: "ready" as const, values: botSettings.schema.parse({}) }),
        subscribe: () => () => {},
      };

      // 1. Auth failure halts immediately after 1st warning and never schedules 30s retries
      const authHost = new BotsHost(dummySettings as never);
      let authAttempts = 0;
      const stopAuth = connectSchedulerHost(authHost, {
        initialDelayMs: 1_000,
        readStatusJson: async () => JSON.stringify({ listen: "127.0.0.1:1234", connectedDaemon: "reachable" }),
        createClient: (() => ({
          connect: async () => {
            authAttempts += 1;
            throw new Error("Password required");
          },
          close: async () => {},
        })) as never,
        createApi: (() => ({ dispose: async () => {} })) as never,
      });

      await vi.advanceTimersByTimeAsync(1_000);
      expect(authAttempts).toBe(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(authHost.bootstrapError).toContain("Password required");

      await vi.advanceTimersByTimeAsync(180_000);
      expect(authAttempts).toBe(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      await stopAuth();

      // 2. Transient errors retry with capped backoff (30s -> 60s -> 120s -> 300s) and stop when plugin API attaches
      const transientHost = new BotsHost(dummySettings as never);
      let transientAttempts = 0;
      const stopTransient = connectSchedulerHost(transientHost, {
        initialDelayMs: 1_000,
        readStatusJson: async () => JSON.stringify({ listen: "127.0.0.1:1234", connectedDaemon: "reachable" }),
        createClient: (() => ({
          connect: async () => {
            transientAttempts += 1;
            throw new Error("ECONNREFUSED");
          },
          close: async () => {},
        })) as never,
        createApi: (() => ({ dispose: async () => {} })) as never,
      });

      await vi.advanceTimersByTimeAsync(1_000);
      expect(transientAttempts).toBe(1);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(transientAttempts).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(transientAttempts).toBe(2);
      await vi.advanceTimersByTimeAsync(59_999);
      expect(transientAttempts).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(transientAttempts).toBe(3);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(transientAttempts).toBe(4);
      await vi.advanceTimersByTimeAsync(300_000);
      expect(transientAttempts).toBe(5);

      transientHost.attach({} as never);
      await vi.advanceTimersByTimeAsync(300_000);
      expect(transientAttempts).toBe(5);
      await stopTransient();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it("startBotChat auto-attaches global-assistant and paseo-long-session labels for bot-chief unless delegated", async () => {
    const chief = makeBot({ id: "bot-chief", name: "全局助理", isGlobalAssistant: true });
    const capturedLabels: Array<Record<string, string>> = [];
    const fakeApi = {
      providers: {
        snapshot: async () => ({
          entries: [{ provider: "agy", models: [{ id: "gemini-4-hydrogen", isDefault: true, isSelectable: true }] }],
        }),
      },
      projects: {
        list: async () => ({ projects: [{ projectId: "proj-1", projectRootPath: home }] }),
        rename: async () => undefined,
      },
      workspaces: {
        list: async () => ({
          entries: [{ id: "wks-1", projectId: "proj-1", projectRootPath: home, workspaceDirectory: home, title: chief.name, background: true }],
        }),
        ref: () => ({ id: "wks-1", current: () => null, refresh: async () => null, setTitle: async () => undefined, archive: async () => undefined }),
        open: async () => ({ id: "wks-1", current: () => null, refresh: async () => null, setTitle: async () => undefined, archive: async () => undefined }),
        create: async () => ({ id: "wks-1", current: () => null, refresh: async () => null, setTitle: async () => undefined, archive: async () => undefined }),
      },
      agents: {
        create: async (opts: { labels: Record<string, string> }) => {
          capturedLabels.push(opts.labels);
          return { id: `agent-${capturedLabels.length}` };
        },
      },
    } as unknown as Parameters<typeof startBotChat>[0];

    await startBotChat(fakeApi, {
      bot: chief,
      library: EMPTY_LIBRARY,
      placement: { path: home, projectRoot: home },
      prompt: "检查仓库",
      systemPrompt: "Prompt",
    });
    expect(capturedLabels[0]?.[GLOBAL_ASSISTANT_LABEL]).toBe("true");
    expect(capturedLabels[0]?.[LONG_SESSION_ENABLED_LABEL]).toBe("true");

    await startBotChat(fakeApi, {
      bot: chief,
      library: EMPTY_LIBRARY,
      placement: { path: home, projectRoot: home },
      prompt: "Delegated ping",
      systemPrompt: "Prompt",
      labels: { [ASKED_BY_LABEL]: "bot-moadmin" },
    });
    expect(capturedLabels[1]?.[GLOBAL_ASSISTANT_LABEL]).toBeUndefined();
    expect(capturedLabels[1]?.[LONG_SESSION_ENABLED_LABEL]).toBeUndefined();
  });
});
