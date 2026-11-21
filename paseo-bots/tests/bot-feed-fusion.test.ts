import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BOT_LABEL, type BotGroup } from "../shared/bot";
import {
  ROUTINE_LABEL,
  SESSION_ROLE_LABEL,
  TEAM_SESSION_LABEL,
  WORKFLOW_STAGE_LABEL,
  WORKFLOW_TASK_LABEL,
} from "../shared/chat";
import { ASKED_BY_LABEL } from "../shared/handoff";
import { formatCompanionIntentEnvelope, SHADOW_SESSION_LABEL } from "../shared/companion-intent";
import {
  BotFeedEntrySchema,
  BotFeedPointerSchema,
  distillTimelineToFeedEntries,
  feedChannelStorageKey,
  parseFeedJsonl,
  parseFeedPointerJsonl,
  type BotFeedEntry,
  type BotFeedPointer,
} from "../shared/feed-view";
import { botFeedReadRpc } from "../shared/rpc";
import { MEMORY_CURATION_LABEL } from "../server/memory-curator";
import { classifySource, feedChannelFilePath, feedIndexFilePath, readMergedBotFeed } from "../server/feed-bridge";
import { fakeHost, makeBot } from "./helpers";

interface MockTimelineItem {
  turnId?: string | null;
  timestamp?: string | null;
  item: Record<string, unknown>;
}

interface MockAgentRecord {
  id: string;
  title?: string | null;
  labels?: Record<string, string>;
  archivedAt?: string | null;
  updatedAt: string;
  createdAt?: string;
  entries: MockTimelineItem[];
}

function makeMockPaseo(agents: MockAgentRecord[]) {
  return {
    agents: {
      list: vi.fn(async (input?: { filter?: { labels?: Record<string, string> } }) => {
        const wanted = input?.filter?.labels ?? {};
        const matched = agents.filter((agent) =>
          Object.entries(wanted).every(([k, v]) => agent.labels?.[k] === v),
        );
        return {
          entries: matched.map((agent) => ({
            agent: {
              id: agent.id,
              title: agent.title ?? null,
              labels: agent.labels ?? {},
              archivedAt: agent.archivedAt ?? null,
              updatedAt: agent.updatedAt,
              createdAt: agent.createdAt ?? agent.updatedAt,
            },
          })),
          pageInfo: { hasMore: false, nextCursor: null },
        };
      }),
      ref: (agentId: string) => ({
        timeline: {
          refetch: vi.fn(async () => {
            const found = agents.find((a) => a.id === agentId);
            return {
              entries: found?.entries ?? [],
              error: null,
            };
          }),
        },
      }),
    },
  };
}

describe("Continuous Feed fusion (paseo-bots)", () => {
  const tempDirs: string[] = [];
  const originalFeedDir = process.env.PASEO_FEED_DATA_DIR;

  afterEach(() => {
    if (originalFeedDir === undefined) {
      delete process.env.PASEO_FEED_DATA_DIR;
    } else {
      process.env.PASEO_FEED_DATA_DIR = originalFeedDir;
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function setupTempFeedDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "paseo-bots-feed-test-"));
    tempDirs.push(dir);
    process.env.PASEO_FEED_DATA_DIR = dir;
    return dir;
  }

  it("sanitizes storage keys consistently for bot and team channels", () => {
    expect(feedChannelStorageKey("bot", "bot-mocode")).toBe("bot__bot-mocode");
    expect(feedChannelStorageKey("team", "team/alpha:1")).toBe("team__team_alpha_1");
  });

  it("parses JSONL entries tolerantly, skipping blank and corrupt lines", () => {
    const validOne: BotFeedEntry = {
      id: "agent-1:turn-1",
      channelKind: "bot",
      channelId: "bot-1",
      botId: "bot-1",
      botName: "Inbox",
      teamId: null,
      agentId: "agent-1",
      agentTitle: "Check inbox",
      archived: false,
      turnId: "turn-1",
      timestamp: "2026-11-20T09:00:00.000Z",
      command: "Summarize unread mail",
      reply: "You have 3 urgent emails.",
      status: "completed",
      errorMessage: null,
      toolsCount: 2,
      source: "dm",
    };

    const raw = [
      "",
      "   ",
      JSON.stringify(validOne),
      "{corrupt json",
      JSON.stringify({ id: "missing-fields" }),
      JSON.stringify({
        id: "team:team-1:agent-2:turn:turn-1",
        channelKind: "team",
        channelId: "team-1",
        botId: "bot-2",
        agentId: "agent-2",
        turnId: "turn-1",
        timestamp: "2026-11-20T09:05:00.000Z",
        status: "failed",
        errorMessage: "Quota exceeded",
      }),
      JSON.stringify({
        id: "bot:bot-1:agent-3:idx:0:abcdef123456",
        channelKind: "bot",
        channelId: "bot-1",
        botId: "bot-1",
        botName: "Inbox",
        teamId: null,
        agentId: "agent-3",
        agentTitle: "Null turn id",
        archived: false,
        turnId: null,
        timestamp: "2026-11-20T09:06:00.000Z",
        command: "Ping",
        reply: "Pong",
        status: "completed",
        errorMessage: null,
        toolsCount: 0,
        source: "dm",
      }),
    ].join("\r\n");

    const parsed = parseFeedJsonl(raw);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual(validOne);
    expect(parsed[1]).toMatchObject({
      id: "team:team-1:agent-2:turn:turn-1",
      botName: "bot-2",
      agentTitle: "Untitled chat",
      status: "failed",
      errorMessage: "Quota exceeded",
      source: "team",
      toolsCount: 0,
    });
    expect(parsed[2]).toMatchObject({
      id: "bot:bot-1:agent-3:idx:0:abcdef123456",
      turnId: null,
      command: "Ping",
      reply: "Pong",
    });
  });

  it("distills timelines into clean feed entries, unwrapping companion envelopes and excluding clutter", () => {
    const wrappedUser = formatCompanionIntentEnvelope({
      rawUserText: "Fix the failing CI check",
      turnIndex: 2,
      distilledIntent: "Resolve CI failure on main",
      compiledPrompt: "Inspect CI logs and fix the test failure.",
    });

    const entries = distillTimelineToFeedEntries({
      channelKind: "bot",
      channelId: "bot-mocode",
      botId: "bot-mocode",
      botName: "moCode",
      teamId: null,
      agentId: "agent-ci",
      agentTitle: "CI Repair",
      archived: false,
      source: "dm",
      entries: [
        {
          turnId: "t1",
          timestamp: "2026-11-20T10:00:00.000Z",
          item: { type: "user_message", text: wrappedUser },
        },
        {
          turnId: "t1",
          timestamp: "2026-11-20T10:00:05.000Z",
          item: { type: "reasoning", text: "internal reasoning should never appear" },
        },
        {
          turnId: "t1",
          timestamp: "2026-11-20T10:00:06.000Z",
          item: { type: "tool_call", name: "read_file", input: { Path: "package.json" } },
        },
        {
          turnId: "t1",
          timestamp: "2026-11-20T10:00:07.000Z",
          item: { type: "tool_result", output: "ok" },
        },
        {
          turnId: "t1",
          timestamp: "2026-11-20T10:00:08.000Z",
          item: { type: "plugin", kind: "companion-card" },
        },
        {
          turnId: "t1",
          timestamp: "2026-11-20T10:00:10.000Z",
          item: {
            type: "assistant_message",
            text: "<thinking>hidden scratchpad</thinking>\nFixed the test assertion in **ci.test.ts**.",
          },
        },
        {
          turnId: "t2",
          timestamp: "2026-11-20T10:05:00.000Z",
          item: { type: "user_message", text: "Run deployment script" },
        },
        {
          turnId: "t2",
          timestamp: "2026-11-20T10:05:05.000Z",
          item: { type: "error", text: "Deploy script exited 1" },
        },
      ],
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: "bot:bot-mocode:agent-ci:turn:t1",
      command: "Fix the failing CI check",
      reply: "Fixed the test assertion in **ci.test.ts**.",
      toolsCount: 1,
      status: "completed",
      errorMessage: null,
      source: "dm",
    });
    expect(entries[0]!.reply).not.toContain("hidden scratchpad");
    expect(entries[0]!.reply).not.toContain("internal reasoning");
    expect(entries[1]).toMatchObject({
      id: "bot:bot-mocode:agent-ci:turn:t2",
      command: "Run deployment script",
      status: "failed",
      errorMessage: "Deploy script exited 1",
    });
  });

  it("classifies brief dispatches as delegated source", () => {
    const brief = `<task_brief>\nTASK_ID: t-1\nTITLE: Test\nOBJECTIVE: Check\n</task_brief>`;
    const entries = distillTimelineToFeedEntries({
      channelKind: "bot",
      channelId: "bot-mocode",
      botId: "bot-mocode",
      botName: "moCode",
      teamId: null,
      agentId: "agent-brief",
      agentTitle: "Brief",
      archived: false,
      source: "dm",
      entries: [
        { turnId: "t1", timestamp: "2026-11-20T10:00:00.000Z", item: { type: "user_message", text: brief } },
        { turnId: "t1", timestamp: "2026-11-20T10:00:10.000Z", item: { type: "assistant_message", text: "Done." } },
      ],
    });
    expect(entries[0]?.source).toBe("delegated");
  });

  it("merges disk JSONL with live/archived Paseo agents, filters shadow/curation, and applies humanOnly & limit", async () => {
    const dir = setupTempFeedDir();
    const bot = makeBot({ id: "bot-scout", name: "Scout" });
    const host = fakeHost([bot]);

    const filePath = feedChannelFilePath("bot", "bot-scout", dir);
    mkdirSync(join(dir, "channels"), { recursive: true });
    const persistedOld: BotFeedEntry = {
      id: "bot:bot-scout:agent-live:turn:t1",
      channelKind: "bot",
      channelId: "bot-scout",
      botId: "bot-scout",
      botName: "Scout",
      teamId: null,
      agentId: "agent-live",
      agentTitle: "Morning Research",
      archived: false,
      turnId: "t1",
      timestamp: "2026-11-20T08:00:00.000Z",
      command: "Check news",
      reply: "Persisted morning digest",
      status: "completed",
      errorMessage: null,
      toolsCount: 3,
      source: "dm",
    };
    const persistedRoutine: BotFeedEntry = {
      ...persistedOld,
      id: "bot:bot-scout:agent-routine:turn:t1",
      agentId: "agent-routine",
      timestamp: "2026-11-20T08:30:00.000Z",
      command: "Run routine",
      reply: "Routine done",
      source: "routine",
    };
    writeFileSync(filePath, `${JSON.stringify(persistedOld)}\n${JSON.stringify(persistedRoutine)}\n`, "utf8");

    const mockPaseo = makeMockPaseo([
      {
        id: "agent-live",
        title: "Morning Research",
        labels: { [BOT_LABEL]: "bot-scout" },
        updatedAt: "2026-11-20T09:00:00.000Z",
        entries: [
          { turnId: "t1", timestamp: "2026-11-20T08:00:00.000Z", item: { type: "user_message", text: "Check news" } },
          { turnId: "t1", timestamp: "2026-11-20T08:00:10.000Z", item: { type: "assistant_message", text: "Backfilled copy" } },
          { turnId: "t2", timestamp: "2026-11-20T09:00:00.000Z", item: { type: "user_message", text: "Dig deeper" } },
          { turnId: "t2", timestamp: "2026-11-20T09:00:10.000Z", item: { type: "assistant_message", text: "Deep dive complete." } },
        ],
      },
      {
        id: "agent-archived",
        title: "Old Task",
        labels: { [BOT_LABEL]: "bot-scout" },
        archivedAt: "2026-11-20T09:30:00.000Z",
        updatedAt: "2026-11-20T09:20:00.000Z",
        entries: [
          { turnId: "t1", timestamp: "2026-11-20T09:20:00.000Z", item: { type: "user_message", text: "Archive check" } },
          { turnId: "t1", timestamp: "2026-11-20T09:20:05.000Z", item: { type: "assistant_message", text: "Archived reply." } },
        ],
      },
      {
        id: "agent-shadow",
        title: "Shadow",
        labels: { [BOT_LABEL]: "bot-scout", [SHADOW_SESSION_LABEL]: "true" },
        updatedAt: "2026-11-20T09:40:00.000Z",
        entries: [
          { turnId: "t1", timestamp: "2026-11-20T09:40:00.000Z", item: { type: "user_message", text: "Shadow input" } },
          { turnId: "t1", timestamp: "2026-11-20T09:40:05.000Z", item: { type: "assistant_message", text: "Shadow output" } },
        ],
      },
      {
        id: "agent-curation",
        title: "Curator",
        labels: { [BOT_LABEL]: "bot-scout", [MEMORY_CURATION_LABEL]: "true" },
        updatedAt: "2026-11-20T09:50:00.000Z",
        entries: [
          { turnId: "t1", timestamp: "2026-11-20T09:50:00.000Z", item: { type: "user_message", text: "Curate" } },
          { turnId: "t1", timestamp: "2026-11-20T09:50:05.000Z", item: { type: "assistant_message", text: "Curated" } },
        ],
      },
    ]);
    void mockPaseo;
    host.attach(mockPaseo as never);

    const allResult = await readMergedBotFeed(host, {
      channelKind: "bot",
      channelId: "bot-scout",
      humanOnly: false,
    });
    expect(allResult.entries.map((e) => e.id)).toEqual([
      "bot:bot-scout:agent-live:turn:t1",
      "bot:bot-scout:agent-routine:turn:t1",
      "bot:bot-scout:agent-live:turn:t2",
      "bot:bot-scout:agent-archived:turn:t1",
    ]);
    // Persisted entry is preserved on dedup while archived agent entry carries archived: true
    expect(allResult.entries[0]?.reply).toBe("Persisted morning digest");
    expect(allResult.entries[3]?.archived).toBe(true);
    expect(allResult.hasOlder).toBe(false);
    expect(allResult.nextCursor).toBeNull();

    const humanResult = await readMergedBotFeed(host, {
      channelKind: "bot",
      channelId: "bot-scout",
      humanOnly: true,
    });
    expect(humanResult.entries.map((e) => e.id)).toEqual([
      "bot:bot-scout:agent-live:turn:t1",
      "bot:bot-scout:agent-live:turn:t2",
      "bot:bot-scout:agent-archived:turn:t1",
    ]);

    const limited = await readMergedBotFeed(host, {
      channelKind: "bot",
      channelId: "bot-scout",
      humanOnly: true,
      limit: 2,
    });
    expect(limited.entries.map((e) => e.id)).toEqual([
      "bot:bot-scout:agent-live:turn:t2",
      "bot:bot-scout:agent-archived:turn:t1",
    ]);
    expect(limited.hasOlder).toBe(true);
    expect(limited.nextCursor).toBe("2026-11-20T09:00:10.000Z|bot:bot-scout:agent-live:turn:t2");
    expect(limited.totalPointers).toBe(3);

    const olderPage = await readMergedBotFeed(host, {
      channelKind: "bot",
      channelId: "bot-scout",
      humanOnly: true,
      limit: 2,
      beforeCursor: limited.nextCursor!,
    });
    expect(olderPage.entries.map((e) => e.id)).toEqual(["bot:bot-scout:agent-live:turn:t1"]);
    expect(olderPage.hasOlder).toBe(false);
    expect(olderPage.nextCursor).toBeNull();
  });

  it("aggregates team channels across lead and members while respecting humanOnly", async () => {
    setupTempFeedDir();
    const lead = makeBot({ id: "bot-lead", name: "moAdmin" });
    const coder = makeBot({ id: "bot-coder", name: "moCode" });
    const group: BotGroup = {
      id: "team-core",
      name: "Core Squad",
      logo: null,
      leadId: "bot-lead",
      memberIds: ["bot-coder"],
      instructions: "",
      cwd: null,
      mounts: [],
      createdAt: "2026-11-20T00:00:00.000Z",
      updatedAt: "2026-11-20T00:00:00.000Z",
    };
    const values = { bots: [lead, coder], groups: [group], history: [] };
    const host = fakeHost([lead, coder]);
    vi.spyOn(host, "values").mockResolvedValue(values as never);

    const mockPaseo = makeMockPaseo([
      {
        id: "agent-team-lead",
        title: "Release Plan",
        labels: {
          [BOT_LABEL]: "bot-lead",
          [TEAM_SESSION_LABEL]: "team-core",
          [SESSION_ROLE_LABEL]: "team-lead",
        },
        updatedAt: "2026-11-20T11:00:00.000Z",
        entries: [
          { turnId: "t1", timestamp: "2026-11-20T11:00:00.000Z", item: { type: "user_message", text: "Plan release" } },
          { turnId: "t1", timestamp: "2026-11-20T11:00:10.000Z", item: { type: "assistant_message", text: "Dispatching moCode." } },
        ],
      },
      {
        id: "agent-delegated-coder",
        title: "Implement Patch",
        labels: {
          [BOT_LABEL]: "bot-coder",
          [TEAM_SESSION_LABEL]: "team-core",
          [SESSION_ROLE_LABEL]: "dispatched-worker",
        },
        updatedAt: "2026-11-20T11:02:00.000Z",
        entries: [
          { turnId: "t1", timestamp: "2026-11-20T11:02:00.000Z", item: { type: "user_message", text: "Implement fix" } },
          { turnId: "t1", timestamp: "2026-11-20T11:02:20.000Z", item: { type: "assistant_message", text: "Patch landed." } },
        ],
      },
    ]);
    host.attach(mockPaseo as never);

    const allTeam = await readMergedBotFeed(host, {
      channelKind: "team",
      channelId: "team-core",
      humanOnly: false,
    });
    expect(allTeam.entries.map((e) => ({ id: e.id, botName: e.botName, source: e.source }))).toEqual([
      { id: "team:team-core:agent-team-lead:turn:t1", botName: "moAdmin", source: "team" },
      { id: "team:team-core:agent-delegated-coder:turn:t1", botName: "moCode", source: "delegated" },
    ]);

    const humanTeam = await readMergedBotFeed(host, {
      channelKind: "team",
      channelId: "team-core",
      humanOnly: true,
    });
    expect(humanTeam.entries.map((e) => e.id)).toEqual(["team:team-core:agent-team-lead:turn:t1"]);
  });

  it("parses pointer index.jsonl tolerantly, supports 3-page cursor pagination, selective hydration, and preview fallback", async () => {
    const dir = setupTempFeedDir();
    const botA = makeBot({ id: "bot-a", name: "Alpha" });
    const botB = makeBot({ id: "bot-b", name: "Beta" });
    const group: BotGroup = {
      id: "team-1",
      name: "Squad 1",
      logo: null,
      leadId: "bot-a",
      memberIds: ["bot-b"],
      instructions: "",
      cwd: null,
      mounts: [],
      createdAt: "2026-11-20T00:00:00.000Z",
      updatedAt: "2026-11-20T00:00:00.000Z",
    };

    const makePointer = (idx: number, patch: Partial<BotFeedPointer> = {}): BotFeedPointer => ({
      id: `ptr-${idx}`,
      agentId: `agent-${idx}`,
      turnId: `turn-${idx}`,
      turnIndex: 0,
      botId: "bot-a",
      botName: "Alpha",
      teamIds: ["team-1"],
      agentTitle: `Task ${idx}`,
      archived: false,
      timestamp: `2026-11-20T0${idx}:00:00.000Z`,
      status: "completed",
      errorMessage: null,
      toolsCount: idx,
      source: "dm",
      commandPreview: `Cmd preview ${idx}`,
      replyPreview: `Reply preview ${idx}`,
      ...patch,
    });

    const pointers: BotFeedPointer[] = [
      makePointer(1),
      makePointer(2),
      makePointer(3, { source: "routine", commandPreview: "Routine cmd", replyPreview: "Routine reply" }),
      makePointer(4),
      makePointer(5, { botId: "bot-b", botName: "Beta", teamIds: ["team-1"], source: "team" }),
      makePointer(6, { botId: "bot-other", botName: "Other", teamIds: ["team-other"] }),
    ];

    const rawIndex = [
      "",
      "{corrupt line",
      JSON.stringify({ id: "missing-agent" }),
      ...pointers.map((p) => JSON.stringify(p)),
    ].join("\n");

    const parsedPointers = parseFeedPointerJsonl(rawIndex);
    expect(parsedPointers).toHaveLength(6);
    expect(BotFeedPointerSchema.parse(parsedPointers[0])).toEqual(pointers[0]);

    writeFileSync(feedIndexFilePath(dir), rawIndex, "utf8");

    const host = fakeHost([botA, botB]);
    vi.spyOn(host, "values").mockResolvedValue({ bots: [botA, botB], groups: [group], history: [] } as never);

    const hydratedAgentCalls: string[] = [];
    const mockAgents: MockAgentRecord[] = [
      {
        id: "agent-1",
        labels: { [BOT_LABEL]: "bot-a" },
        updatedAt: "2026-11-20T01:00:00.000Z",
        entries: [
          { turnId: "turn-1", timestamp: "2026-11-20T01:00:00.000Z", item: { type: "user_message", text: "Full cmd 1" } },
          { turnId: "turn-1", timestamp: "2026-11-20T01:00:05.000Z", item: { type: "assistant_message", text: "Full reply 1" } },
        ],
      },
      {
        id: "agent-2",
        labels: { [BOT_LABEL]: "bot-a" },
        updatedAt: "2026-11-20T02:00:00.000Z",
        entries: [
          { turnId: "turn-2", timestamp: "2026-11-20T02:00:00.000Z", item: { type: "user_message", text: "Full cmd 2" } },
          { turnId: "turn-2", timestamp: "2026-11-20T02:00:05.000Z", item: { type: "assistant_message", text: "Full reply 2" } },
        ],
      },
      {
        id: "agent-4",
        labels: { [BOT_LABEL]: "bot-a" },
        updatedAt: "2026-11-20T04:00:00.000Z",
        entries: [
          { turnId: "turn-4", timestamp: "2026-11-20T04:00:00.000Z", item: { type: "user_message", text: "Full cmd 4" } },
          { turnId: "turn-4", timestamp: "2026-11-20T04:00:05.000Z", item: { type: "assistant_message", text: "Full reply 4" } },
        ],
      },
      {
        id: "agent-5",
        labels: { [BOT_LABEL]: "bot-b", [TEAM_SESSION_LABEL]: "team-1", [SESSION_ROLE_LABEL]: "team-direct-specialist" },
        updatedAt: "2026-11-20T05:00:00.000Z",
        entries: [
          { turnId: "turn-5", timestamp: "2026-11-20T05:00:00.000Z", item: { type: "user_message", text: "Full cmd 5" } },
          { turnId: "turn-5", timestamp: "2026-11-20T05:00:05.000Z", item: { type: "assistant_message", text: "Full reply 5" } },
        ],
      },
    ];
    const baseMock = makeMockPaseo(mockAgents);
    const trackingPaseo = {
      agents: {
        list: baseMock.agents.list,
        ref: (agentId: string) => ({
          timeline: {
            refetch: vi.fn(async () => {
              hydratedAgentCalls.push(agentId);
              return baseMock.agents.ref(agentId).timeline.refetch();
            }),
          },
        }),
      },
    };
    host.attach(trackingPaseo as never);

    // Team channel humanOnly=true has pointers 1, 2, 4, 5 (excludes routine ptr-3 and other team ptr-6)
    const page1 = await readMergedBotFeed(host, {
      channelKind: "team",
      channelId: "team-1",
      limit: 2,
      humanOnly: true,
    });
    expect(page1.entries.map((e) => e.id)).toEqual(["ptr-4", "ptr-5"]);
    expect(page1.entries.map((e) => e.reply)).toEqual(["Full reply 4", "Full reply 5"]);
    expect(page1.entries.every((e) => e.hydrated === true)).toBe(true);
    expect(page1.hasOlder).toBe(true);
    expect(page1.totalPointers).toBe(4);
    expect(page1.nextCursor).toBe("2026-11-20T04:00:00.000Z|ptr-4");
    // Selective hydration: ONLY agent-4 and agent-5 were fetched!
    expect(hydratedAgentCalls.sort()).toEqual(["agent-4", "agent-5"]);

    hydratedAgentCalls.length = 0;
    const page2 = await readMergedBotFeed(host, {
      channelKind: "team",
      channelId: "team-1",
      limit: 1,
      beforeCursor: page1.nextCursor!,
      humanOnly: true,
    });
    expect(page2.entries.map((e) => e.id)).toEqual(["ptr-2"]);
    expect(page2.entries[0]?.reply).toBe("Full reply 2");
    expect(page2.hasOlder).toBe(true);
    expect(hydratedAgentCalls).toEqual(["agent-2"]);

    hydratedAgentCalls.length = 0;
    const page3 = await readMergedBotFeed(host, {
      channelKind: "team",
      channelId: "team-1",
      limit: 1,
      beforeCursor: page2.nextCursor!,
      humanOnly: true,
    });
    expect(page3.entries.map((e) => e.id)).toEqual(["ptr-1"]);
    expect(page3.entries[0]?.reply).toBe("Full reply 1");
    expect(page3.hasOlder).toBe(false);
    expect(page3.nextCursor).toBeNull();
    expect(hydratedAgentCalls).toEqual(["agent-1"]);

    // Bot channel filters strictly by botId ("bot-a" excludes "bot-b" and "bot-other")
    const botAChannel = await readMergedBotFeed(host, {
      channelKind: "bot",
      channelId: "bot-a",
      humanOnly: false,
      limit: 10,
    });
    expect(botAChannel.entries.map((e) => e.id)).toEqual(["ptr-1", "ptr-2", "ptr-3", "ptr-4"]);

    // Preview-only fallback when host.paseo is disconnected
    const offlineHost = fakeHost([botA, botB]);
    const offlineRes = await readMergedBotFeed(offlineHost, {
      channelKind: "team",
      channelId: "team-1",
      limit: 2,
      humanOnly: true,
    });
    expect(offlineRes.entries.map((e) => ({ id: e.id, command: e.command, reply: e.reply, hydrated: e.hydrated }))).toEqual([
      { id: "ptr-4", command: "Cmd preview 4", reply: "Reply preview 4", hydrated: false },
      { id: "ptr-5", command: "Cmd preview 5", reply: "Reply preview 5", hydrated: false },
    ]);
  });

  it("merges legacy channels/*.jsonl entries alongside index.jsonl without duplicating shared IDs", async () => {
    const dir = setupTempFeedDir();
    const botA = makeBot({ id: "bot-a", name: "Alpha" });
    const group: BotGroup = {
      id: "team-1",
      name: "Squad 1",
      logo: null,
      leadId: "bot-a",
      memberIds: [],
      instructions: "",
      cwd: null,
      mounts: [],
      createdAt: "2026-11-20T00:00:00.000Z",
      updatedAt: "2026-11-20T00:00:00.000Z",
    };

    const legacyOnlyBot: BotFeedEntry = {
      id: "legacy-bot-0",
      channelKind: "bot",
      channelId: "bot-a",
      botId: "bot-a",
      botName: "Alpha",
      teamId: null,
      agentId: "agent-legacy-0",
      agentTitle: "Pre-Wave-3 Bot Chat",
      archived: false,
      turnId: "turn-legacy-0",
      timestamp: "2026-11-20T00:30:00.000Z",
      command: "Legacy prompt",
      reply: "Legacy reply preserved",
      status: "completed",
      errorMessage: null,
      toolsCount: 1,
      source: "dm",
    };
    const sharedLegacyCopy: BotFeedEntry = {
      ...legacyOnlyBot,
      id: "shared-1",
      agentId: "agent-shared-1",
      turnId: "turn-shared-1",
      timestamp: "2026-11-20T01:00:00.000Z",
      command: "Old command copy",
      reply: "Old reply copy",
    };
    mkdirSync(join(dir, "channels"), { recursive: true });
    writeFileSync(
      feedChannelFilePath("bot", "bot-a", dir),
      `${JSON.stringify(legacyOnlyBot)}\n${JSON.stringify(sharedLegacyCopy)}\n`,
      "utf8",
    );

    const legacyOnlyTeam: BotFeedEntry = {
      ...legacyOnlyBot,
      id: "legacy-team-0",
      channelKind: "team",
      channelId: "team-1",
      teamId: null,
      agentId: "agent-team-legacy",
      turnId: "turn-team-legacy",
      timestamp: "2026-11-20T00:45:00.000Z",
      command: "Legacy team prompt",
      reply: "Legacy team reply",
      source: "team",
    };
    writeFileSync(feedChannelFilePath("team", "team-1", dir), `${JSON.stringify(legacyOnlyTeam)}\n`, "utf8");

    const indexPointers: BotFeedPointer[] = [
      {
        id: "shared-1",
        agentId: "agent-shared-1",
        turnId: "turn-shared-1",
        turnIndex: 0,
        botId: "bot-a",
        botName: "Alpha",
        teamIds: ["team-1"],
        agentTitle: "Shared Task",
        archived: false,
        timestamp: "2026-11-20T01:00:00.000Z",
        status: "completed",
        errorMessage: null,
        toolsCount: 0,
        source: "dm",
        commandPreview: "Shared preview",
        replyPreview: "Shared reply preview",
      },
      {
        id: "idx-2",
        agentId: "agent-idx-2",
        turnId: "turn-idx-2",
        turnIndex: 0,
        botId: "bot-a",
        botName: "Alpha",
        teamIds: ["team-1"],
        agentTitle: "New Indexed Task",
        archived: false,
        timestamp: "2026-11-20T02:00:00.000Z",
        status: "completed",
        errorMessage: null,
        toolsCount: 0,
        source: "dm",
        commandPreview: "New cmd",
        replyPreview: "New reply",
      },
    ];
    writeFileSync(feedIndexFilePath(dir), indexPointers.map((p) => JSON.stringify(p)).join("\n"), "utf8");

    const host = fakeHost([botA]);
    vi.spyOn(host, "values").mockResolvedValue({ bots: [botA], groups: [group], history: [] } as never);
    const hydratedAgents: string[] = [];
    const baseMock = makeMockPaseo([
      {
        id: "agent-shared-1",
        labels: { [BOT_LABEL]: "bot-a" },
        updatedAt: "2026-11-20T01:00:00.000Z",
        entries: [
          { turnId: "turn-shared-1", timestamp: "2026-11-20T01:00:00.000Z", item: { type: "user_message", text: "Shared live cmd" } },
          { turnId: "turn-shared-1", timestamp: "2026-11-20T01:00:05.000Z", item: { type: "assistant_message", text: "Shared live reply" } },
        ],
      },
      {
        id: "agent-idx-2",
        labels: { [BOT_LABEL]: "bot-a" },
        updatedAt: "2026-11-20T02:00:00.000Z",
        entries: [
          { turnId: "turn-idx-2", timestamp: "2026-11-20T02:00:00.000Z", item: { type: "user_message", text: "Indexed live cmd" } },
          { turnId: "turn-idx-2", timestamp: "2026-11-20T02:00:05.000Z", item: { type: "assistant_message", text: "Indexed live reply" } },
        ],
      },
    ]);
    host.attach({
      agents: {
        list: baseMock.agents.list,
        ref: (agentId: string) => ({
          timeline: {
            refetch: vi.fn(async () => {
              hydratedAgents.push(agentId);
              return baseMock.agents.ref(agentId).timeline.refetch();
            }),
          },
        }),
      },
    } as never);

    const botMerged = await readMergedBotFeed(host, {
      channelKind: "bot",
      channelId: "bot-a",
      humanOnly: true,
    });
    expect(botMerged.entries.map((e) => e.id)).toEqual(["legacy-bot-0", "shared-1", "idx-2"]);
    expect(botMerged.entries[0]).toMatchObject({ reply: "Legacy reply preserved", hydrated: true });
    expect(botMerged.entries[1]).toMatchObject({ reply: "Shared live reply", hydrated: true });
    expect(botMerged.entries[2]).toMatchObject({ reply: "Indexed live reply", hydrated: true });
    expect(botMerged.totalPointers).toBe(3);
    expect(hydratedAgents.sort()).toEqual(["agent-idx-2", "agent-shared-1"]);

    const teamMerged = await readMergedBotFeed(host, {
      channelKind: "team",
      channelId: "team-1",
      humanOnly: true,
    });
    expect(teamMerged.entries.map((e) => e.id)).toEqual(["legacy-team-0", "shared-1", "idx-2"]);
    expect(teamMerged.entries[0]?.teamId).toBe("team-1");
  });

  it("fails soft when disk file is absent and host.paseo is disconnected", async () => {
    setupTempFeedDir();
    const host = fakeHost([makeBot({ id: "bot-empty", name: "Empty" })]);
    const result = await readMergedBotFeed(host, {
      channelKind: "bot",
      channelId: "bot-empty",
    });
    expect(result).toEqual({
      entries: [],
      hasOlder: false,
      nextCursor: null,
      totalPointers: 0,
    });
  });

  it("validates botFeedReadRpc input and output contracts", () => {
    expect(botFeedReadRpc.name).toBe("bot-feed.read");
    const parsedInput = botFeedReadRpc.input.parse({
      channelKind: "team",
      channelId: "team-1",
      limit: 20,
      beforeCursor: "2026-11-20T00:00:00.000Z|a1:t1",
      humanOnly: true,
    });
    expect(parsedInput.channelKind).toBe("team");
    expect(parsedInput.beforeCursor).toBe("2026-11-20T00:00:00.000Z|a1:t1");

    const sampleEntry = BotFeedEntrySchema.parse({
      id: "a1:t1",
      channelKind: "bot",
      channelId: "bot-1",
      botId: "bot-1",
      botName: "Scout",
      teamId: null,
      agentId: "a1",
      agentTitle: "Research",
      archived: false,
      turnId: "t1",
      timestamp: "2026-11-20T00:00:00.000Z",
      command: "Hi",
      reply: "Hello",
      status: "completed",
      errorMessage: null,
      toolsCount: 0,
      source: "dm",
      hydrated: true,
    });
    const parsedOutput = botFeedReadRpc.output.parse({
      entries: [sampleEntry],
      hasOlder: true,
      nextCursor: "2026-11-20T00:00:00.000Z|a1:t1",
      totalPointers: 12,
    });
    expect(parsedOutput.entries).toHaveLength(1);
    expect(parsedOutput.hasOlder).toBe(true);
    expect(parsedOutput.totalPointers).toBe(12);
  });

  it("classifies workflow labels ahead of delegated while preserving routine and delegated rules", () => {
    expect(
      classifySource(
        {
          [WORKFLOW_TASK_LABEL]: "wf-100",
          [ASKED_BY_LABEL]: "bot-moadmin",
          [SESSION_ROLE_LABEL]: "dispatched-worker",
        },
        "bot",
      ),
    ).toBe("workflow");

    expect(classifySource({ [WORKFLOW_STAGE_LABEL]: "stage-impl" }, "team")).toBe("workflow");
    expect(classifySource({ "paseo-bots.workflow-task": "wf-legacy" }, "bot")).toBe("workflow");
    expect(classifySource({ "paseo-bots.workflow-stage": "stage-legacy" }, "bot")).toBe("workflow");

    expect(
      classifySource({ [ROUTINE_LABEL]: "rt-1", [WORKFLOW_TASK_LABEL]: "wf-100" }, "bot"),
    ).toBe("routine");

    expect(classifySource({ [ASKED_BY_LABEL]: "bot-moadmin" }, "bot")).toBe("delegated");
    expect(classifySource({ [SESSION_ROLE_LABEL]: "worker" }, "team")).toBe("delegated");
    expect(classifySource({ [SESSION_ROLE_LABEL]: "dispatched-worker" }, "team")).toBe("delegated");
  });

  it("preserves source='workflow' and workflow metadata through JSONL parsing, distillation, and readMergedBotFeed", async () => {
    const dir = setupTempFeedDir();
    const bot = makeBot({ id: "bot-mocode", name: "moCode" });
    const group: BotGroup = {
      id: "team-wf",
      name: "Workflow Squad",
      logo: null,
      leadId: "bot-moadmin",
      memberIds: ["bot-mocode"],
      instructions: "",
      cwd: null,
      mounts: [],
      createdAt: "2026-11-20T00:00:00.000Z",
      updatedAt: "2026-11-20T00:00:00.000Z",
    };

    const wfEntry: BotFeedEntry = {
      id: "bot:bot-mocode:agent-wf-legacy:turn:t0",
      channelKind: "bot",
      channelId: "bot-mocode",
      botId: "bot-mocode",
      botName: "moCode",
      teamId: "team-wf",
      agentId: "agent-wf-legacy",
      agentTitle: "[Flow] Stage 0",
      archived: false,
      turnId: "t0",
      timestamp: "2026-11-20T12:00:00.000Z",
      command: "Run stage 0",
      reply: "Stage 0 finished",
      status: "completed",
      errorMessage: null,
      toolsCount: 1,
      source: "workflow",
      workflowTaskId: "wf-task-0",
      workflowId: "wf-flow",
      workflowStageId: "stage-0",
      workflowStageName: "Stage 0",
    };
    const parsedEntries = parseFeedJsonl(`${JSON.stringify(wfEntry)}\n`);
    expect(parsedEntries).toEqual([wfEntry]);
    expect(BotFeedEntrySchema.parse(wfEntry)).toEqual(wfEntry);

    const wfPointer: BotFeedPointer = {
      id: "ptr-wf-1",
      agentId: "agent-wf-1",
      turnId: "turn-wf-1",
      turnIndex: 0,
      botId: "bot-mocode",
      botName: "moCode",
      teamIds: ["team-wf"],
      agentTitle: "[Build Pipeline] Implement API",
      archived: false,
      timestamp: "2026-11-20T12:05:00.000Z",
      status: "completed",
      errorMessage: null,
      toolsCount: 2,
      source: "workflow",
      commandPreview: "Implement API",
      replyPreview: "API implemented",
      workflowTaskId: "wf-task-1",
      workflowId: "wf-build",
      workflowStageId: "stage-impl",
      workflowStageName: "Implement API",
    };
    const parsedPointers = parseFeedPointerJsonl(`${JSON.stringify(wfPointer)}\n`);
    expect(parsedPointers).toEqual([wfPointer]);
    expect(BotFeedPointerSchema.parse(wfPointer)).toEqual(wfPointer);

    // Distillation must keep source='workflow' even when user message is a <task_brief>
    const stageBrief = [
      "<task_brief>",
      "- WORKFLOW: Build Pipeline",
      "- STAGE_ID: stage-impl",
      "- STAGE_NAME: Implement API",
      "- SPECIFICATION:",
      "Write endpoint",
      "</task_brief>",
    ].join("\n");
    const distilled = distillTimelineToFeedEntries({
      channelKind: "bot",
      channelId: "bot-mocode",
      botId: "bot-mocode",
      botName: "moCode",
      teamId: "team-wf",
      agentId: "agent-wf-1",
      agentTitle: "[Build Pipeline] Implement API",
      archived: false,
      source: "workflow",
      workflowTaskId: "wf-task-1",
      workflowId: "wf-build",
      entries: [
        { turnId: "turn-wf-1", timestamp: "2026-11-20T12:05:00.000Z", item: { type: "user_message", text: stageBrief } },
        { turnId: "turn-wf-1", timestamp: "2026-11-20T12:05:10.000Z", item: { type: "assistant_message", text: "Done API." } },
      ],
    });
    expect(distilled[0]).toMatchObject({
      source: "workflow",
      workflowTaskId: "wf-task-1",
      workflowId: "wf-build",
      workflowStageId: "stage-impl",
      workflowStageName: "Implement API",
    });

    // Write persisted pointer and add a live synthetic workflow stage agent + DM agent
    writeFileSync(feedIndexFilePath(dir), `${JSON.stringify(wfPointer)}\n`, "utf8");

    const host = fakeHost([bot]);
    vi.spyOn(host, "values").mockResolvedValue({ bots: [bot], groups: [group], history: [] } as never);

    // Offline preview fallback preserves workflow source & metadata
    const offline = await readMergedBotFeed(host, {
      channelKind: "bot",
      channelId: "bot-mocode",
      humanOnly: false,
    });
    expect(offline.entries).toHaveLength(1);
    expect(offline.entries[0]).toMatchObject({
      id: "ptr-wf-1",
      source: "workflow",
      hydrated: false,
      workflowTaskId: "wf-task-1",
      workflowId: "wf-build",
      workflowStageId: "stage-impl",
      workflowStageName: "Implement API",
    });

    const mockPaseo = makeMockPaseo([
      {
        id: "agent-wf-1",
        title: "[Build Pipeline] Implement API",
        labels: {
          [BOT_LABEL]: "bot-mocode",
          [WORKFLOW_TASK_LABEL]: "wf-task-1",
          [WORKFLOW_STAGE_LABEL]: "stage-impl",
          "paseo-bots:workflow-id": "wf-build",
          "paseo-bots:workflow-stage-name": "Implement API",
          [ASKED_BY_LABEL]: "bot-moadmin",
        },
        updatedAt: "2026-11-20T12:05:10.000Z",
        entries: [
          { turnId: "turn-wf-1", timestamp: "2026-11-20T12:05:00.000Z", item: { type: "user_message", text: stageBrief } },
          { turnId: "turn-wf-1", timestamp: "2026-11-20T12:05:10.000Z", item: { type: "assistant_message", text: "Hydrated API reply." } },
        ],
      },
      {
        id: "agent-wf-2",
        title: "[Build Pipeline] Verify API",
        labels: {
          [BOT_LABEL]: "bot-mocode",
          [WORKFLOW_TASK_LABEL]: "wf-task-2",
          [WORKFLOW_STAGE_LABEL]: "stage-verify",
          "paseo-bots:workflow-id": "wf-build",
          "paseo-bots:workflow-stage-name": "Verify API",
          [ASKED_BY_LABEL]: "bot-moadmin",
        },
        updatedAt: "2026-11-20T12:10:00.000Z",
        entries: [
          { turnId: "turn-wf-2", timestamp: "2026-11-20T12:10:00.000Z", item: { type: "user_message", text: "Verify endpoints" } },
          { turnId: "turn-wf-2", timestamp: "2026-11-20T12:10:05.000Z", item: { type: "assistant_message", text: "All tests pass." } },
        ],
      },
      {
        id: "agent-dm-1",
        title: "Human DM",
        labels: { [BOT_LABEL]: "bot-mocode" },
        updatedAt: "2026-11-20T12:15:00.000Z",
        entries: [
          { turnId: "turn-dm-1", timestamp: "2026-11-20T12:15:00.000Z", item: { type: "user_message", text: "Status?" } },
          { turnId: "turn-dm-1", timestamp: "2026-11-20T12:15:05.000Z", item: { type: "assistant_message", text: "Ready." } },
        ],
      },
    ]);
    host.attach(mockPaseo as never);

    const allFeed = await readMergedBotFeed(host, {
      channelKind: "bot",
      channelId: "bot-mocode",
      humanOnly: false,
    });
    expect(allFeed.entries.map((e) => ({ id: e.id, source: e.source }))).toEqual([
      { id: "ptr-wf-1", source: "workflow" },
      { id: "bot:bot-mocode:agent-wf-2:turn:turn-wf-2", source: "workflow" },
      { id: "bot:bot-mocode:agent-dm-1:turn:turn-dm-1", source: "dm" },
    ]);
    expect(allFeed.entries[0]).toMatchObject({
      reply: "Hydrated API reply.",
      hydrated: true,
      workflowTaskId: "wf-task-1",
      workflowId: "wf-build",
      workflowStageId: "stage-impl",
      workflowStageName: "Implement API",
    });
    expect(allFeed.entries[1]).toMatchObject({
      source: "workflow",
      workflowTaskId: "wf-task-2",
      workflowId: "wf-build",
      workflowStageId: "stage-verify",
      workflowStageName: "Verify API",
    });

    const humanOnlyFeed = await readMergedBotFeed(host, {
      channelKind: "bot",
      channelId: "bot-mocode",
      humanOnly: true,
    });
    expect(humanOnlyFeed.entries.map((e) => e.id)).toEqual(["bot:bot-mocode:agent-dm-1:turn:turn-dm-1"]);
  });
});
