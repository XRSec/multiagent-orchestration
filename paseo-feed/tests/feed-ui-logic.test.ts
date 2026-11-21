/**
 * Purpose: Unit tests for pure UI state, filtering, pagination, formatting, and jump helpers.
 * Context: Executed directly via `node --test tests/feed-ui-logic.test.ts`.
 * Usage: Validates client/feed-helpers.ts without React Native or host runtime mocks.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  channelInitial,
  createInitialPaginationState,
  filterChannelsByCategory,
  filterFeedEntries,
  formatRelativeTimestamp,
  isEntryAppendedAtBottom,
  isPreviewOnlyEntry,
  markAgentArchived,
  mergeFeedEntry,
  partitionChannels,
  prependOlderEntries,
  resolveComposerNotice,
  resolveHeaderChatAgentId,
  resolveInitialChannel,
  resolvePaginationFromPage,
  resolveTaskJumpTarget,
  resolveWorkflowStageLabel,
  selectSidebarChannels,
  shouldTriggerLoadOlder,
  summarizeSidebarActivity,
  truncatePreview,
} from "../client/feed-helpers.ts";
import type { FeedChannel, FeedEntry } from "../shared/protocol.ts";

function makeChannel(overrides: Partial<FeedChannel> = {}): FeedChannel {
  return {
    kind: "bot",
    id: "bot-alpha",
    name: "Alpha",
    subtitle: "General assistant",
    pinned: false,
    archived: false,
    entryCount: 0,
    lastActivityAt: null,
    lastPreview: "",
    activeAgentId: null,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<FeedEntry> = {}): FeedEntry {
  return {
    id: "entry-1",
    channelKind: "bot",
    channelId: "bot-alpha",
    botId: "bot-alpha",
    botName: "Alpha",
    teamId: null,
    agentId: "agent-1",
    agentTitle: "Investigate feed bug",
    archived: false,
    turnId: "turn-1",
    timestamp: "2026-11-20T10:00:00.000Z",
    command: "Check status",
    reply: "All checks green.",
    status: "completed",
    errorMessage: null,
    toolsCount: 2,
    source: "dm",
    ...overrides,
  };
}

describe("partitionChannels", () => {
  it("separates globalAssistant without duplicating it in pinnedBots and sorts buckets by activity", () => {
    const channels: FeedChannel[] = [
      makeChannel({
        id: "bot-global",
        name: "Global Assistant",
        pinned: true,
        isGlobalAssistant: true,
        lastActivityAt: "2026-11-20T08:00:00.000Z",
      }),
      makeChannel({
        id: "bot-pin-old",
        name: "Pinned Old",
        pinned: true,
        lastActivityAt: "2026-11-20T07:00:00.000Z",
      }),
      makeChannel({
        id: "bot-pin-new",
        name: "Pinned New",
        pinned: true,
        lastActivityAt: "2026-11-20T12:00:00.000Z",
      }),
      makeChannel({
        id: "bot-other-active",
        name: "Active Bot",
        activeAgentId: "agent-live",
        entryCount: 3,
      }),
      makeChannel({
        id: "bot-other-idle",
        name: "Idle Bot",
        entryCount: 10,
      }),
      makeChannel({
        kind: "team",
        id: "team-core",
        name: "Core Team",
        lastActivityAt: "2026-11-20T09:00:00.000Z",
      }),
    ];

    const res = partitionChannels(channels);
    assert.equal(res.globalAssistant?.id, "bot-global");
    assert.deepEqual(
      res.pinnedBots.map((c) => c.id),
      ["bot-pin-new", "bot-pin-old"],
    );
    assert.deepEqual(
      res.otherBots.map((c) => c.id),
      ["bot-other-active", "bot-other-idle"],
    );
    assert.deepEqual(
      res.teams.map((c) => c.id),
      ["team-core"],
    );
    assert.equal(res.totalMatched, 6);
  });

  it("filters case-insensitively across name, subtitle, id, and lastPreview", () => {
    const channels: FeedChannel[] = [
      makeChannel({ id: "bot-ops", name: "Ops", subtitle: "Infra", lastPreview: "Deploy OK" }),
      makeChannel({ kind: "team", id: "team-design", name: "Design", subtitle: "UI polish" }),
    ];

    const byPreview = partitionChannels(channels, "deploy");
    assert.equal(byPreview.totalMatched, 1);
    assert.equal(byPreview.otherBots[0]?.id, "bot-ops");

    const bySubtitle = partitionChannels(channels, "  POLISH ");
    assert.equal(bySubtitle.totalMatched, 1);
    assert.equal(bySubtitle.teams[0]?.id, "team-design");

    const none = partitionChannels(channels, "nonexistent");
    assert.equal(none.totalMatched, 0);
  });
});

describe("filterChannelsByCategory", () => {
  const channels: FeedChannel[] = [
    makeChannel({
      id: "bot-mocode",
      name: "moCode",
      pinned: true,
      lastActivityAt: "2026-11-20T15:00:00.000Z",
    }),
    makeChannel({
      kind: "team",
      id: "team-dev",
      name: "Dev Team",
      lastActivityAt: "2026-11-20T16:00:00.000Z",
    }),
    makeChannel({
      id: "bot-chief",
      name: "全局助理",
      pinned: true,
      isGlobalAssistant: true,
      lastActivityAt: "2026-11-20T08:00:00.000Z",
    }),
    makeChannel({
      id: "bot-moci",
      name: "MoCI",
      pinned: false,
      lastActivityAt: "2026-11-20T11:00:00.000Z",
    }),
  ];

  it("pins globalAssistant first in 'all' category regardless of newer bot/team timestamps", () => {
    assert.deepEqual(
      filterChannelsByCategory(channels, "all").map((c) => c.id),
      ["bot-chief", "bot-mocode", "bot-moci", "team-dev"],
    );
  });

  it("isolates assistant, bots, and teams categories cleanly and respects search queries", () => {
    assert.deepEqual(
      filterChannelsByCategory(channels, "assistant").map((c) => c.id),
      ["bot-chief"],
    );
    assert.deepEqual(
      filterChannelsByCategory(channels, "bots").map((c) => c.id),
      ["bot-mocode", "bot-moci"],
    );
    assert.deepEqual(
      filterChannelsByCategory(channels, "teams").map((c) => c.id),
      ["team-dev"],
    );
    assert.deepEqual(
      filterChannelsByCategory(channels, "bots", "moci").map((c) => c.id),
      ["bot-moci"],
    );
    assert.deepEqual(filterChannelsByCategory(channels, "assistant", "moci"), []);
  });

  it("supports bot-chief fallback when isGlobalAssistant flag is omitted", () => {
    const legacyChannels: FeedChannel[] = [
      makeChannel({ id: "bot-other", name: "Other", pinned: true }),
      makeChannel({ id: "bot-chief", name: "Chief", pinned: true }),
    ];
    assert.deepEqual(
      filterChannelsByCategory(legacyChannels, "assistant").map((c) => c.id),
      ["bot-chief"],
    );
    assert.deepEqual(
      filterChannelsByCategory(legacyChannels, "bots").map((c) => c.id),
      ["bot-other"],
    );
    assert.deepEqual(
      filterChannelsByCategory(legacyChannels, "all").map((c) => c.id),
      ["bot-chief", "bot-other"],
    );
  });
});

describe("summarizeSidebarActivity", () => {
  it("aggregates active agent dots and total entry counts across non-archived channels", () => {
    const channels: FeedChannel[] = [
      makeChannel({ id: "bot-chief", activeAgentId: "ag-1", entryCount: 12 }),
      makeChannel({ kind: "team", id: "team-1", activeAgentId: null, entryCount: 8 }),
      makeChannel({ id: "bot-arch", archived: true, activeAgentId: "ag-old", entryCount: 100 }),
    ];

    assert.deepEqual(summarizeSidebarActivity(channels), {
      hasActive: true,
      activeChannelCount: 1,
      totalEntryCount: 20,
    });
    assert.deepEqual(summarizeSidebarActivity([]), {
      hasActive: false,
      activeChannelCount: 0,
      totalEntryCount: 0,
    });
  });
});

describe("selectSidebarChannels", () => {
  it("prioritizes globalAssistant -> pinnedBots -> teams -> otherBots, excludes archived, and caps at maxItems", () => {
    const channels: FeedChannel[] = [
      makeChannel({ id: "b1", name: "Other1", lastActivityAt: "2026-11-20T12:00:00.000Z" }),
      makeChannel({ id: "b2", name: "Other2", lastActivityAt: "2026-11-20T11:00:00.000Z" }),
      makeChannel({ id: "b3", name: "Other3", lastActivityAt: "2026-11-20T10:00:00.000Z" }),
      makeChannel({ id: "b4", name: "Other4", lastActivityAt: "2026-11-20T09:00:00.000Z" }),
      makeChannel({ id: "b5", name: "Other5", lastActivityAt: "2026-11-20T08:00:00.000Z" }),
      makeChannel({ id: "b-arch", name: "Archived", archived: true, pinned: true }),
      makeChannel({ kind: "team", id: "t1", name: "Team1", lastActivityAt: "2026-11-20T06:00:00.000Z" }),
      makeChannel({ id: "p1", name: "Pinned1", pinned: true, lastActivityAt: "2026-11-20T05:00:00.000Z" }),
      makeChannel({ id: "ga", name: "Global", isGlobalAssistant: true, pinned: true }),
      makeChannel({ kind: "team", id: "t2", name: "Team2", lastActivityAt: "2026-11-20T07:00:00.000Z" }),
    ];

    const top8 = selectSidebarChannels(channels);
    assert.deepEqual(
      top8.map((c) => c.id),
      ["ga", "p1", "t2", "t1", "b1", "b2", "b3", "b4"],
    );
    assert.deepEqual(selectSidebarChannels(channels, 0), []);
    assert.equal(selectSidebarChannels(channels, 3).length, 3);
  });
});

describe("filterFeedEntries", () => {
  it("keeps all sources when humanOnly=false and only dm+team when humanOnly=true", () => {
    const entries: FeedEntry[] = [
      makeEntry({ id: "e-dm", source: "dm" }),
      makeEntry({ id: "e-team", source: "team" }),
      makeEntry({ id: "e-routine", source: "routine" }),
      makeEntry({ id: "e-delegated", source: "delegated" }),
      makeEntry({ id: "e-workflow", source: "workflow" }),
    ];

    assert.deepEqual(
      filterFeedEntries(entries, false).map((e) => e.id),
      ["e-dm", "e-team", "e-routine", "e-delegated", "e-workflow"],
    );
    assert.deepEqual(
      filterFeedEntries(entries, true).map((e) => e.id),
      ["e-dm", "e-team"],
    );
  });
});

describe("prependOlderEntries & pagination helpers", () => {
  it("merges older entries in ascending chronological order, deduplicating by id and preferring existing", () => {
    const e3 = makeEntry({
      id: "e3",
      timestamp: "2026-11-20T12:00:00.000Z",
      reply: "live-3",
    });
    const e4 = makeEntry({
      id: "e4",
      timestamp: "2026-11-20T13:00:00.000Z",
      reply: "live-4",
    });
    const e1 = makeEntry({
      id: "e1",
      timestamp: "2026-11-20T10:00:00.000Z",
      reply: "older-1",
    });
    const e2 = makeEntry({
      id: "e2",
      timestamp: "2026-11-20T11:00:00.000Z",
      reply: "older-2",
    });
    const e3Stale = makeEntry({
      id: "e3",
      timestamp: "2026-11-20T12:00:00.000Z",
      reply: "stale-3",
    });

    const merged = prependOlderEntries([e3, e4], [e2, e3Stale, e1]);
    assert.deepEqual(
      merged.map((e) => `${e.id}:${e.reply}`),
      ["e1:older-1", "e2:older-2", "e3:live-3", "e4:live-4"],
    );
    assert.deepEqual(
      prependOlderEntries([e3], []).map((e) => e.id),
      ["e3"],
    );
    assert.deepEqual(
      prependOlderEntries([], [e2, e1]).map((e) => e.id),
      ["e1", "e2"],
    );
  });

  it("normalizes hasOlder/nextCursor pagination state and enforces scroll triggers safely", () => {
    assert.deepEqual(createInitialPaginationState(), {
      hasOlder: false,
      nextCursor: null,
      totalPointers: 0,
      loadingOlder: false,
    });

    const pageWithOlder = resolvePaginationFromPage({
      entries: [makeEntry({ id: "e2" })],
      hasOlder: true,
      nextCursor: "cursor-20",
      totalPointers: 42,
    });
    assert.deepEqual(pageWithOlder, {
      hasOlder: true,
      nextCursor: "cursor-20",
      totalPointers: 42,
      loadingOlder: false,
    });
    assert.equal(shouldTriggerLoadOlder(pageWithOlder, 59), true);
    assert.equal(shouldTriggerLoadOlder(pageWithOlder, 60), false);
    assert.equal(shouldTriggerLoadOlder({ ...pageWithOlder, loadingOlder: true }, 10), false);

    const clampedNullCursor = resolvePaginationFromPage({
      entries: [makeEntry()],
      hasOlder: true,
      nextCursor: null,
      totalPointers: 1,
    });
    assert.equal(clampedNullCursor.hasOlder, false);
    assert.equal(shouldTriggerLoadOlder(clampedNullCursor, 0), false);

    const endPage = resolvePaginationFromPage(
      { entries: [], hasOlder: false, nextCursor: null },
      18,
    );
    assert.deepEqual(endPage, {
      hasOlder: false,
      nextCursor: null,
      totalPointers: 18,
      loadingOlder: false,
    });
  });

  it("detects only new bottom-appended entries for auto-scroll", () => {
    const e1 = makeEntry({ id: "e1", timestamp: "2026-11-20T10:00:00.000Z" });
    const e2 = makeEntry({ id: "e2", timestamp: "2026-11-20T11:00:00.000Z" });
    const e0 = makeEntry({ id: "e0", timestamp: "2026-11-20T09:00:00.000Z" });

    assert.equal(isEntryAppendedAtBottom([e1], [e1, e2], "e2"), true);
    assert.equal(isEntryAppendedAtBottom([e1, e2], [e1, e2], "e2"), false);
    assert.equal(isEntryAppendedAtBottom([e1, e2], [e0, e1, e2], "e0"), false);
    assert.equal(isEntryAppendedAtBottom([], [], "e1"), false);
  });
});

describe("isPreviewOnlyEntry", () => {
  it("returns true only when hydrated is explicitly false", () => {
    assert.equal(isPreviewOnlyEntry({ ...makeEntry(), hydrated: false }), true);
    assert.equal(isPreviewOnlyEntry({ ...makeEntry(), hydrated: true }), false);
    assert.equal(isPreviewOnlyEntry(makeEntry()), false);
  });
});

describe("formatRelativeTimestamp", () => {
  it("returns empty string for missing or invalid dates", () => {
    assert.equal(formatRelativeTimestamp(null), "");
    assert.equal(formatRelativeTimestamp(undefined), "");
    assert.equal(formatRelativeTimestamp("not-a-date"), "");
  });

  it("formats recent timestamps as 刚刚, same-day as HH:mm, and older days as MM-DD HH:mm", () => {
    const now = new Date(2026, 10, 20, 14, 30, 0).getTime();
    const thirtySecsAgo = new Date(now - 30_000).toISOString();
    assert.equal(formatRelativeTimestamp(thirtySecsAgo, now), "刚刚");

    const earlierToday = new Date(2026, 10, 20, 9, 5, 0).toISOString();
    assert.equal(formatRelativeTimestamp(earlierToday, now), "09:05");

    const yesterday = new Date(2026, 10, 19, 21, 8, 0).toISOString();
    assert.equal(formatRelativeTimestamp(yesterday, now), "11-19 21:08");
  });
});

describe("resolveTaskJumpTarget", () => {
  it("includes trimmed serverId when hostId is provided and omits it otherwise", () => {
    assert.deepEqual(resolveTaskJumpTarget({ agentId: "ag-42" }, "host-1"), {
      agentId: "ag-42",
      serverId: "host-1",
    });
    assert.deepEqual(resolveTaskJumpTarget({ agentId: "ag-42" }), {
      agentId: "ag-42",
    });
    assert.deepEqual(resolveTaskJumpTarget({ agentId: "ag-42" }, "   "), {
      agentId: "ag-42",
    });
  });
});

describe("truncatePreview", () => {
  it("normalizes whitespace and truncates cleanly", () => {
    assert.equal(truncatePreview("  hello \n\t world  ", 20), "hello world");
    assert.equal(truncatePreview("abcdefghij", 6), "abcde…");
    assert.equal(truncatePreview("abc", 1), "…");
    assert.equal(truncatePreview("abc", 0), "");
  });
});

describe("entry state and initial channel helpers", () => {
  it("merges entries chronologically and marks archived agent entries", () => {
    const e1 = makeEntry({ id: "e1", agentId: "a1", timestamp: "2026-11-20T10:00:00.000Z" });
    const e2 = makeEntry({ id: "e2", agentId: "a2", timestamp: "2026-11-20T12:00:00.000Z" });
    const e1Updated = makeEntry({
      id: "e1",
      agentId: "a1",
      timestamp: "2026-11-20T10:00:00.000Z",
      reply: "Updated reply",
    });

    const merged = mergeFeedEntry([e2, e1], e1Updated);
    assert.deepEqual(
      merged.map((e) => `${e.id}:${e.reply}`),
      ["e1:Updated reply", "e2:All checks green."],
    );

    const archived = markAgentArchived(merged, "a1");
    assert.equal(archived[0]?.archived, true);
    assert.equal(archived[1]?.archived, false);
  });

  it("resolves initial channel from params or falls back to globalAssistant or bot-chief", () => {
    const channels = [
      makeChannel({ id: "b1", name: "Bot 1" }),
      makeChannel({ id: "ga", name: "Assistant", isGlobalAssistant: true }),
      makeChannel({ kind: "team", id: "t1", name: "Team 1" }),
    ];

    assert.equal(
      resolveInitialChannel(channels, { channelKind: "team", channelId: "t1" })?.id,
      "t1",
    );
    assert.equal(resolveInitialChannel(channels, {})?.id, "ga");
    assert.equal(
      resolveInitialChannel(
        [makeChannel({ id: "b1" }), makeChannel({ id: "bot-chief" })],
        {},
      )?.id,
      "bot-chief",
    );
    assert.equal(resolveInitialChannel([], {}), null);
    assert.equal(channelInitial(" alpha "), "A");
    assert.equal(channelInitial("  "), "#");
  });
});

describe("Wave 5 workflow & composer UI helpers", () => {
  it("resolves workflow stage pill label preferring stageName over stageId", () => {
    assert.equal(
      resolveWorkflowStageLabel({ workflowStageName: "QA Gate", workflowStageId: "moci-verify" }),
      "QA Gate",
    );
    assert.equal(
      resolveWorkflowStageLabel({ workflowStageName: "  ", workflowStageId: "moci-verify" }),
      "moci-verify",
    );
    assert.equal(resolveWorkflowStageLabel({}), null);
  });

  it("resolves header chat agentId in priority order created -> channel.active -> latest entry", () => {
    const chActive = makeChannel({ activeAgentId: "ag-active" });
    const chIdle = makeChannel({ activeAgentId: null });
    const list = [makeEntry({ id: "e1", agentId: "ag-1" }), makeEntry({ id: "e2", agentId: "ag-2" })];

    assert.equal(resolveHeaderChatAgentId(chActive, list, "ag-created"), "ag-created");
    assert.equal(resolveHeaderChatAgentId(chActive, list, null), "ag-active");
    assert.equal(resolveHeaderChatAgentId(chIdle, list, null), "ag-2");
    assert.equal(resolveHeaderChatAgentId(chIdle, [], null), null);
    assert.equal(resolveHeaderChatAgentId(null, [], null), null);
  });

  it("maps send results to composer notices across created, sent, no_active_chat, and error", () => {
    assert.deepEqual(
      resolveComposerNotice({ ok: true, agentId: "ag-new", reason: "created" }),
      {
        message: "已自动创建新会话并发送",
        tone: "success",
        actionAgentId: "ag-new",
        actionLabel: "打开会话 ↗",
      },
    );
    assert.equal(resolveComposerNotice({ ok: true, agentId: "ag-1", reason: "sent" }), null);

    assert.deepEqual(
      resolveComposerNotice({
        ok: false,
        agentId: null,
        reason: "no_active_chat",
        lastArchivedAgentId: "ag-arch",
      }),
      {
        message: "当前频道暂无活跃会话，无法直接投递指令。",
        tone: "warning",
        actionAgentId: "ag-arch",
        actionLabel: "查看最近任务 ↗",
      },
    );

    assert.deepEqual(
      resolveComposerNotice({
        ok: false,
        agentId: null,
        reason: "error",
        error: "timeout",
      }),
      {
        message: "timeout",
        tone: "error",
      },
    );
  });
});
