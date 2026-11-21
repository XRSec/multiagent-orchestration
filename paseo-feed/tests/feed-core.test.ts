/**
 * Purpose: Comprehensive unit and integration test suite for paseo-feed server/shared modules.
 * Context: Validates protocol contracts, extractor, single index.jsonl pointer store, LRU hydrator, sync, and RPCs.
 * Usage: node --test tests/feed-core.test.ts
 * Prerequisites: Node 22+, dependencies installed, PASEO_BOTS_SETTINGS_PATH / PASEO_FEED_DATA_DIR isolated per test.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import contribute from "../index.server.ts";
import {
  buildEntryFromPointer,
  buildPointerFromTurn,
  distillVisibleReply,
  extractTurnsFromTimeline,
  extractWorkflowMeta,
  inferFeedSource,
  previewSnippet,
  shouldIgnoreAgent,
  unwrapCompanionCommand,
} from "../server/extractor.ts";
import { FeedHydrator, hydratePointers } from "../server/hydrator.ts";
import type { PaseoApi } from "../server/paseo.ts";
import {
  findRosterBot,
  findRosterGroup,
  groupsContainingBot,
  loadRoster,
  resolveChannelLeadBot,
  resolveGroupBotIds,
} from "../server/roster.ts";
import {
  getChannelSummary,
  indexFilePath,
  LEGACY_CHANNELS_MIGRATION_MARKER,
  markAgentArchived,
  migrateLegacyChannelsToIndex,
  readAllPointers,
  readChannelPointers,
  resolveFeedDataDir,
  upsertPointers,
} from "../server/store.ts";
import {
  handleArchiveAfter,
  handleTurnAfter,
  listChannelsWithStats,
  sendToFeedChannel,
  syncChannelFromPaseo,
} from "../server/sync.ts";
import {
  ASKED_BY_LABEL,
  BOT_LABEL,
  channelStorageKey,
  FeedChannelSchema,
  feedChannelsRpc,
  FeedEntrySchema,
  feedEntriesRpc,
  FeedPointerSchema,
  feedSendRpc,
  FeedSourceSchema,
  feedSyncRpc,
  FeedUpdateEventSchema,
  feedUpdatesSub,
  GLOBAL_ASSISTANT_LABEL,
  LIFECYCLE_MOUNT_LABEL,
  LONG_SESSION_ENABLED_LABEL,
  MEMORY_CURATION_LABEL,
  ROUTINE_LABEL,
  SESSION_ROLE_LABEL,
  SHADOW_SESSION_LABEL,
  TEAM_SESSION_LABEL,
  WORKFLOW_ID_LABEL,
  WORKFLOW_STAGE_ID_LABEL,
  WORKFLOW_STAGE_LABEL,
  WORKFLOW_TASK_LABEL,
  type FeedEntry,
  type FeedPointer,
  type FeedUpdateEvent,
} from "../shared/protocol.ts";

interface MockAgentRecord {
  id: string;
  title?: string | null;
  labels?: Record<string, string>;
  archivedAt?: string | null;
  updatedAt?: string;
  timeline?: Array<Record<string, unknown>>;
  timelineError?: string;
  throwOnRefetch?: Error;
  sendError?: Error;
}

interface CreateMockPaseoOptions {
  createAgent?: (input: Record<string, unknown>) => unknown | Promise<unknown>;
}

function createMockPaseo(initialAgents: MockAgentRecord[] = [], options?: CreateMockPaseoOptions) {
  const agents = new Map(initialAgents.map((a) => [a.id, a]));
  const sentMessages: Array<{ agentId: string; text: string }> = [];
  const refetchCalls: Array<{ agentId: string; options: unknown }> = [];
  const createCalls: Array<Record<string, unknown>> = [];

  const agentsApi: Record<string, unknown> = {
    async list(opts?: { filter?: { labels?: Record<string, string>; includeArchived?: boolean } }) {
      const reqLabels = opts?.filter?.labels;
      const includeArchived = opts?.filter?.includeArchived ?? true;
      const list = [...agents.values()].filter((a) => {
        if (!includeArchived && a.archivedAt) return false;
        if (reqLabels) {
          for (const [k, v] of Object.entries(reqLabels)) {
            if (a.labels?.[k] !== v) return false;
          }
        }
        return true;
      });
      list.sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0));
      return {
        entries: list.map((a) => ({
          agent: {
            id: a.id,
            title: a.title ?? null,
            labels: a.labels ?? {},
            archivedAt: a.archivedAt ?? null,
            updatedAt: a.updatedAt ?? "2026-11-20T00:00:00.000Z",
          },
        })),
      };
    },
    ref(id: string) {
      return {
        id,
        get archivedAt() {
          return agents.get(id)?.archivedAt ?? null;
        },
        current() {
          const a = agents.get(id);
          return a
            ? {
                id: a.id,
                title: a.title ?? null,
                labels: a.labels ?? {},
                archivedAt: a.archivedAt ?? null,
                updatedAt: a.updatedAt ?? "2026-11-20T00:00:00.000Z",
              }
            : null;
        },
        async refresh() {
          const a = agents.get(id);
          return a
            ? {
                agent: {
                  id: a.id,
                  title: a.title ?? null,
                  labels: a.labels ?? {},
                  archivedAt: a.archivedAt ?? null,
                  updatedAt: a.updatedAt ?? "2026-11-20T00:00:00.000Z",
                },
              }
            : null;
        },
        async send(text: string) {
          const a = agents.get(id);
          if (a?.sendError) throw a.sendError;
          sentMessages.push({ agentId: id, text });
        },
        timeline: {
          async refetch(opts?: unknown) {
            refetchCalls.push({ agentId: id, options: opts });
            const a = agents.get(id);
            if (a?.throwOnRefetch) throw a.throwOnRefetch;
            if (a?.timelineError) return { entries: [], error: a.timelineError };
            return {
              entries: a?.timeline ?? [],
              error: null,
              ...(a
                ? {
                    agent: {
                      id: a.id,
                      archivedAt: a.archivedAt ?? null,
                      labels: a.labels ?? {},
                    },
                  }
                : {}),
            };
          },
        },
      };
    },
  };

  if (options?.createAgent) {
    agentsApi.create = async (input: Record<string, unknown>) => {
      createCalls.push(input);
      return options.createAgent!(input);
    };
  }

  const api = { agents: agentsApi };

  return { paseo: api as unknown as PaseoApi, agents, sentMessages, refetchCalls, createCalls };
}

let tempDir = "";
let prevSettingsEnv: string | undefined;
let prevDataEnv: string | undefined;

beforeEach(() => {
  prevSettingsEnv = process.env.PASEO_BOTS_SETTINGS_PATH;
  prevDataEnv = process.env.PASEO_FEED_DATA_DIR;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-feed-test-"));
  process.env.PASEO_BOTS_SETTINGS_PATH = path.join(tempDir, "bots.json");
  process.env.PASEO_FEED_DATA_DIR = path.join(tempDir, "feed-data");
});

afterEach(() => {
  if (prevSettingsEnv === undefined) delete process.env.PASEO_BOTS_SETTINGS_PATH;
  else process.env.PASEO_BOTS_SETTINGS_PATH = prevSettingsEnv;
  if (prevDataEnv === undefined) delete process.env.PASEO_FEED_DATA_DIR;
  else process.env.PASEO_FEED_DATA_DIR = prevDataEnv;
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("protocol.ts", () => {
  it("exports expected labels, FeedPointerSchema, FeedEntrySchema, and cursor RPC schemas", () => {
    assert.equal(BOT_LABEL, "paseo-bots.bot");
    assert.equal(TEAM_SESSION_LABEL, "paseo-bots.team-session");
    assert.equal(SESSION_ROLE_LABEL, "paseo-bots.session-role");
    assert.equal(ROUTINE_LABEL, "paseo-bots.routine");
    assert.equal(SHADOW_SESSION_LABEL, "paseo-bots.shadow-session");
    assert.equal(MEMORY_CURATION_LABEL, "paseo-bots.memory-curation");
    assert.equal(ASKED_BY_LABEL, "paseo-bots.asked-by");
    assert.equal(WORKFLOW_TASK_LABEL, "paseo-bots:workflow-task");
    assert.equal(WORKFLOW_ID_LABEL, "paseo-bots:workflow-task");
    assert.equal(WORKFLOW_STAGE_LABEL, "paseo-bots:workflow-stage");
    assert.equal(WORKFLOW_STAGE_ID_LABEL, "paseo-bots:workflow-stage");
    assert.equal(LIFECYCLE_MOUNT_LABEL, "paseo-bots.lifecycle-mount");
    assert.equal(GLOBAL_ASSISTANT_LABEL, "paseo-bots.global-assistant");
    assert.equal(LONG_SESSION_ENABLED_LABEL, "paseo-long-session.enabled");
    assert.equal(FeedSourceSchema.parse("workflow"), "workflow");

    assert.equal(channelStorageKey("bot", "bot/a:b?c"), "bot__bot_a_b_c");
    assert.equal(channelStorageKey("team", "team-alpha_1.0"), "team__team-alpha_1.0");

    const ch = FeedChannelSchema.parse({
      kind: "bot",
      id: "bot-chief",
      name: "Chief",
      subtitle: "Global assistant",
      pinned: true,
      archived: false,
      isGlobalAssistant: true,
      entryCount: 1,
      lastActivityAt: "2026-11-20T00:00:00.000Z",
      lastPreview: "Ready",
      activeAgentId: "ag-1",
    });
    assert.equal(ch.isGlobalAssistant, true);

    const pointer = FeedPointerSchema.parse({
      id: "ag-1:turn:t1",
      agentId: "ag-1",
      turnId: "t1",
      turnIndex: 0,
      botId: "bot-code",
      botName: "moCode",
      teamIds: ["team-1"],
      agentTitle: "Implement WP-A",
      archived: false,
      timestamp: "2026-11-20T00:00:00.000Z",
      status: "completed",
      errorMessage: null,
      toolsCount: 3,
      source: "team",
      commandPreview: "Build feed",
      replyPreview: "Done",
    });
    assert.equal(pointer.teamIds[0], "team-1");

    const entry = FeedEntrySchema.parse({
      id: "ag-1:turn:t1",
      channelKind: "team",
      channelId: "team-1",
      botId: "bot-code",
      botName: "moCode",
      teamId: "team-1",
      agentId: "ag-1",
      agentTitle: "Implement WP-A",
      archived: false,
      turnId: "t1",
      timestamp: "2026-11-20T00:00:00.000Z",
      command: "Build feed",
      reply: "Done",
      hydrated: true,
      status: "completed",
      errorMessage: null,
      toolsCount: 3,
      source: "team",
    });
    assert.equal(entry.hydrated, true);

    const rpcInput = feedEntriesRpc.input.parse({
      channelKind: "bot",
      channelId: "bot-code",
      limit: 20,
      beforeCursor: "2026-11-20T00:00:00.000Z|ag-1:turn:t1",
      humanOnly: true,
      sync: false,
    });
    assert.equal(rpcInput.beforeCursor, "2026-11-20T00:00:00.000Z|ag-1:turn:t1");

    const rpcOutput = feedEntriesRpc.output.parse({
      channel: ch,
      entries: [entry],
      hasOlder: true,
      nextCursor: "2026-11-20T00:00:00.000Z|ag-1:turn:t1",
      totalPointers: 5,
      syncedAgents: 1,
    });
    assert.equal(rpcOutput.hasOlder, true);
    assert.equal(rpcOutput.totalPointers, 5);

    const ev = FeedUpdateEventSchema.parse({ kind: "entry_added", channelKind: "team", channelId: "team-1", entry });
    assert.equal(ev.kind, "entry_added");
    assert.equal(feedChannelsRpc.name, "feed.channels");
    assert.equal(feedEntriesRpc.name, "feed.entries");
    assert.equal(feedSyncRpc.name, "feed.sync");
    assert.equal(feedSendRpc.name, "feed.send");
    assert.equal(feedUpdatesSub.name, "feed.updates");

    const wfPointer = FeedPointerSchema.parse({
      ...pointer,
      source: "workflow",
      workflowTaskId: "wf-task-1",
      workflowId: "wf-release",
      workflowStageId: "stage-qa",
      workflowStageName: "QA Gate",
    });
    assert.equal(wfPointer.source, "workflow");
    assert.equal(wfPointer.workflowStageName, "QA Gate");

    const wfEntry = FeedEntrySchema.parse({
      ...entry,
      source: "workflow",
      workflowTaskId: "wf-task-1",
      workflowId: "wf-release",
      workflowStageId: "stage-qa",
      workflowStageName: "QA Gate",
    });
    assert.equal(wfEntry.workflowId, "wf-release");

    assert.equal(
      feedSendRpc.output.parse({ ok: true, agentId: "ag-created", reason: "created" }).reason,
      "created",
    );
    assert.equal(
      feedSendRpc.output.parse({ ok: true, reason: "created" }).agentId,
      undefined,
    );
  });
});

describe("roster.ts", () => {
  it("fails soft on missing or malformed bots.json", () => {
    assert.deepEqual(loadRoster(), { bots: [], groups: [] });
    fs.writeFileSync(process.env.PASEO_BOTS_SETTINGS_PATH!, "{bad json", "utf8");
    assert.deepEqual(loadRoster(), { bots: [], groups: [] });
  });

  it("parses bots, teams, pinned/archived flags, and isGlobalAssistant", () => {
    fs.writeFileSync(
      process.env.PASEO_BOTS_SETTINGS_PATH!,
      JSON.stringify({
        version: 4,
        values: {
          bots: [
            { id: "bot-chief", name: "全局助理", title: "Global Assistant", pinned: true, archived: false },
            {
              id: "bot-a",
              name: "Bot A",
              description: "Helper A",
              isGlobalAssistant: true,
              longSessionEnabled: true,
              cwd: "/repo/app",
              provider: "agy",
              model: "gemini-4-hydrogen",
              engine: "paseo-bot",
              pinned: false,
              archived: false,
            },
            { id: "bot-b", name: "Bot B", title: "Worker B", pinned: true, archived: true },
          ],
          groups: [
            {
              id: "team-1",
              name: "Core",
              leadId: "bot-a",
              memberIds: ["bot-a", "bot-b"],
              cwd: "/repo/team",
              instructions: "Run tests cleanly.",
              pinned: true,
            },
            {
              id: "team-fallback",
              name: "Fallback Team",
              leadId: "bot-missing",
              memberIds: ["bot-b"],
            },
            {
              id: "team-empty",
              name: "Empty Team",
              leadId: null,
              memberIds: [],
            },
          ],
        },
      }),
      "utf8",
    );

    const roster = loadRoster();
    assert.equal(roster.bots.length, 3);
    assert.equal(findRosterBot(roster, "bot-chief")?.isGlobalAssistant, true);
    assert.equal(findRosterBot(roster, "bot-chief")?.cwd, undefined);
    const botA = findRosterBot(roster, "bot-a");
    assert.equal(botA?.isGlobalAssistant, true);
    assert.equal(botA?.longSessionEnabled, true);
    assert.equal(botA?.cwd, "/repo/app");
    assert.equal(botA?.provider, "agy");
    assert.equal(botA?.model, "gemini-4-hydrogen");
    assert.equal(botA?.engine, "paseo-bot");
    assert.equal(findRosterBot(roster, "bot-b")?.archived, true);

    const group = findRosterGroup(roster, "team-1");
    assert.ok(group);
    assert.equal(group.pinned, true);
    assert.equal(group.archived, false);
    assert.equal(group.cwd, "/repo/team");
    assert.equal(groupsContainingBot(roster, "bot-b").length, 2);
    assert.deepEqual(resolveGroupBotIds(group), ["bot-a", "bot-b"]);

    assert.equal(resolveChannelLeadBot(roster, "bot", "bot-a")?.bot.id, "bot-a");
    assert.equal(resolveChannelLeadBot(roster, "bot", "bot-missing"), null);
    const teamLead = resolveChannelLeadBot(roster, "team", "team-1");
    assert.equal(teamLead?.bot.id, "bot-a");
    assert.equal(teamLead?.group?.id, "team-1");
    assert.equal(resolveChannelLeadBot(roster, "team", "team-fallback")?.bot.id, "bot-b");
    assert.equal(resolveChannelLeadBot(roster, "team", "team-empty"), null);
    assert.equal(resolveChannelLeadBot(roster, "team", "team-missing"), null);
  });
});

describe("extractor.ts", () => {
  it("unwraps companion intent envelopes, truncates previews <= 120 chars, and strips noise", () => {
    const tailWrapped = `Check repo status\n\n<companion_intent version="1">\nTURN: 2\nDISTILLED_INTENT: Check status\nCOMPILED_PROMPT:\nRun git status\n</companion_intent>`;
    assert.equal(unwrapCompanionCommand(tailWrapped), "Check repo status");

    const commentWrapped = `<!-- COMPANION_INTENT v2 -->\nRAW_USER_MESSAGE: Fix build error\nDISTILLED_INTENT: Fix ts build\nCOMPILED_PROMPT: Run tsc`;
    assert.equal(unwrapCompanionCommand(commentWrapped), "Fix build error");

    const rawReply = [
      "<thinking>internal chain of thought</thinking>",
      "Completed check.",
      "<worker_handoff>",
      "STATUS: PASS",
      "SUMMARY: Built backend modules and tests.",
      "TOUCHED_FILES: a.ts, b.ts",
      "VERIFICATION_PROOF: very noisy multi-line log output",
      "</worker_handoff>",
    ].join("\n\n");

    const distilled = distillVisibleReply(rawReply);
    assert.ok(!distilled.includes("internal chain of thought"));
    assert.ok(!distilled.includes("very noisy multi-line log output"));
    assert.ok(distilled.includes("[PASS] Built backend modules and tests."));

    const longText = `Line one   with spaces\n\n${"x".repeat(200)}`;
    const snippet = previewSnippet(longText, 120);
    assert.equal(snippet.length, 120);
    assert.ok(snippet.endsWith("..."));
    assert.ok(!snippet.includes("\n"));
  });

  it("classifies ignored agents and feed sources accurately", () => {
    assert.equal(shouldIgnoreAgent({ [SHADOW_SESSION_LABEL]: "true" }), true);
    assert.equal(shouldIgnoreAgent({ [MEMORY_CURATION_LABEL]: "true" }), true);
    assert.equal(shouldIgnoreAgent({ [BOT_LABEL]: "bot-a" }), false);

    assert.equal(inferFeedSource({ [ROUTINE_LABEL]: "rt-1", [ASKED_BY_LABEL]: "bot-a" }), "routine");
    assert.equal(
      inferFeedSource({ [ROUTINE_LABEL]: "rt-1", [WORKFLOW_TASK_LABEL]: "wf-1" }),
      "routine",
    );
    assert.equal(
      inferFeedSource({ [WORKFLOW_TASK_LABEL]: "wf-1", [ASKED_BY_LABEL]: "bot-a", [TEAM_SESSION_LABEL]: "t1" }),
      "workflow",
    );
    assert.equal(inferFeedSource({ [WORKFLOW_STAGE_LABEL]: "st-1" }), "workflow");
    assert.equal(inferFeedSource({ "paseo-bots.workflow-task": "wf-dot" }), "workflow");
    assert.equal(inferFeedSource({ "paseo-bots.workflow-stage": "st-dot" }), "workflow");
    assert.equal(inferFeedSource({ [ASKED_BY_LABEL]: "bot-a", [TEAM_SESSION_LABEL]: "t1" }), "delegated");
    assert.equal(inferFeedSource({ [SESSION_ROLE_LABEL]: "worker" }), "delegated");
    assert.equal(inferFeedSource({ [SESSION_ROLE_LABEL]: "dispatched-worker" }), "delegated");
    assert.equal(inferFeedSource({ [TEAM_SESSION_LABEL]: "t1" }), "team");
    assert.equal(inferFeedSource({ [SESSION_ROLE_LABEL]: "team-lead" }), "team");
    assert.equal(inferFeedSource({}, ["team-1"]), "team");
    assert.equal(inferFeedSource({ [BOT_LABEL]: "bot-a" }), "dm");

    assert.deepEqual(
      extractWorkflowMeta({
        [WORKFLOW_TASK_LABEL]: "task-99",
        "paseo-bots:workflow-name": "Release Flow",
        [WORKFLOW_STAGE_LABEL]: "stage-2",
        "paseo-bots:workflow-stage-name": "QA Audit",
      }),
      {
        workflowTaskId: "task-99",
        workflowId: "Release Flow",
        workflowStageId: "stage-2",
        workflowStageName: "QA Audit",
      },
    );
    assert.deepEqual(
      extractWorkflowMeta({
        "paseo-bots.workflow-task": "task-fallback",
        "paseo-bots.workflow-stage": "stage-dot",
        "paseo-bots.workflow-stage-name": "Dot Stage",
      }),
      {
        workflowTaskId: "task-fallback",
        workflowId: "task-fallback",
        workflowStageId: "stage-dot",
        workflowStageName: "Dot Stage",
      },
    );
    assert.deepEqual(extractWorkflowMeta({ [BOT_LABEL]: "bot-a" }), {});
  });

  it("extracts TurnDescriptor[] deterministically and builds compact FeedPointer + FeedEntry", () => {
    const longReply = `# Detailed Report\n\n${"detail-".repeat(40)}`;
    const timeline = [
      { turnId: "t1", timestamp: "2026-11-20T10:00:00.000Z", item: { type: "user_message", text: "First cmd" } },
      { turnId: "t1", timestamp: "2026-11-20T10:00:01.000Z", item: { type: "reasoning", text: "hidden" } },
      { turnId: "t1", timestamp: "2026-11-20T10:00:02.000Z", item: { type: "tool_call", name: "read_file" } },
      { turnId: "t1", timestamp: "2026-11-20T10:00:03.000Z", item: { type: "tool_result", output: "ok" } },
      { turnId: "t1", timestamp: "2026-11-20T10:00:04.000Z", item: { type: "assistant_message", text: `<thought>x</thought>${longReply}` } },
      { turnId: "t2", timestamp: "2026-11-20T10:01:00.000Z", item: { type: "user_message", text: "Second cmd" } },
      { turnId: "t2", timestamp: "2026-11-20T10:01:02.000Z", item: { type: "tool_call", name: "run_command" } },
      { turnId: "t2", timestamp: "2026-11-20T10:01:03.000Z", item: { type: "tool_call", name: "edit_file" } },
      { turnId: "t2", timestamp: "2026-11-20T10:01:05.000Z", item: { type: "error", message: "Permission denied" } },
    ];

    const turns = extractTurnsFromTimeline(timeline);
    assert.equal(turns.length, 2);
    assert.equal(turns[0]?.turnIndex, 0);
    assert.equal(turns[0]?.command, "First cmd");
    assert.equal(turns[0]?.reply, longReply);
    assert.equal(turns[0]?.replyPreview.length, 120);
    assert.equal(turns[0]?.toolsCount, 1);
    assert.equal(turns[0]?.status, "completed");

    assert.equal(turns[1]?.turnIndex, 1);
    assert.equal(turns[1]?.command, "Second cmd");
    assert.equal(turns[1]?.toolsCount, 2);
    assert.equal(turns[1]?.status, "failed");
    assert.equal(turns[1]?.errorMessage, "Permission denied");

    const single = extractTurnsFromTimeline(timeline, { targetTurnId: "t1" });
    assert.equal(single.length, 1);
    assert.equal(single[0]?.turnId, "t1");

    const pointer = buildPointerFromTurn(turns[0]!, {
      agentId: "ag-1",
      botId: "bot-a",
      botName: "Bot A",
      teamIds: ["team-1", "team-1"],
      agentTitle: "Task 1",
      archived: false,
      source: "dm",
    });
    assert.equal(pointer.id, "ag-1:turn:t1");
    assert.deepEqual(pointer.teamIds, ["team-1"]);
    assert.equal(pointer.replyPreview.length, 120);
    assert.ok(!JSON.stringify(pointer).includes(longReply));

    const teamEntry = buildEntryFromPointer(pointer, "team", "team-1", {
      command: turns[0]!.command,
      reply: turns[0]!.reply,
      hydrated: true,
    });
    assert.equal(teamEntry.channelKind, "team");
    assert.equal(teamEntry.channelId, "team-1");
    assert.equal(teamEntry.teamId, "team-1");
    assert.equal(teamEntry.hydrated, true);

    const wfPointer = buildPointerFromTurn(turns[0]!, {
      agentId: "ag-wf",
      botId: "bot-a",
      botName: "Bot A",
      teamIds: [],
      agentTitle: "Workflow Stage",
      archived: false,
      source: "workflow",
      workflowTaskId: "task-1",
      workflowId: "wf-main",
      workflowStageId: "stage-1",
      workflowStageName: "Code Impl",
    });
    assert.equal(wfPointer.source, "workflow");
    assert.equal(wfPointer.workflowTaskId, "task-1");
    assert.equal(wfPointer.workflowId, "wf-main");
    assert.equal(wfPointer.workflowStageId, "stage-1");
    assert.equal(wfPointer.workflowStageName, "Code Impl");

    const wfEntry = buildEntryFromPointer(wfPointer, "bot", "bot-a", {
      command: "Run stage",
      reply: "Stage done",
      hydrated: true,
    });
    assert.equal(wfEntry.source, "workflow");
    assert.equal(wfEntry.workflowTaskId, "task-1");
    assert.equal(wfEntry.workflowId, "wf-main");
    assert.equal(wfEntry.workflowStageId, "stage-1");
    assert.equal(wfEntry.workflowStageName, "Code Impl");
  });
});

describe("store.ts", () => {
  function samplePointer(overrides: Partial<FeedPointer>): FeedPointer {
    return {
      id: "ag-1:turn:t1",
      agentId: "ag-1",
      turnId: "t1",
      turnIndex: 0,
      botId: "bot-a",
      botName: "Bot A",
      teamIds: ["team-1"],
      agentTitle: "Chat 1",
      archived: false,
      timestamp: "2026-11-20T10:00:00.000Z",
      status: "completed",
      errorMessage: null,
      toolsCount: 0,
      source: "dm",
      commandPreview: "Hello",
      replyPreview: "Hi there",
      ...overrides,
    };
  }

  it("stores 1 shared pointer in index.jsonl serving both bot and team channels without duplication", () => {
    const p1 = samplePointer({
      id: "ag-1:turn:t1",
      timestamp: "2026-11-20T10:01:00.000Z",
      source: "dm",
      replyPreview: "DM done",
      teamIds: ["team-1"],
    });
    const p2 = samplePointer({
      id: "ag-1:turn:t2",
      turnId: "t2",
      turnIndex: 1,
      timestamp: "2026-11-20T10:02:00.000Z",
      source: "routine",
      replyPreview: "Routine done",
      teamIds: ["team-1"],
    });

    const firstSave = upsertPointers([p2, p1]);
    assert.equal(firstSave.added, 2);
    assert.equal(firstSave.updated, 0);

    const dupSave = upsertPointers([p1]);
    assert.equal(dupSave.added, 0);
    assert.equal(dupSave.updated, 0);

    assert.equal(fs.existsSync(indexFilePath()), true);
    assert.equal(fs.existsSync(path.join(resolveFeedDataDir(), "channels")), false);

    // Inject malformed line to confirm resilient parsing
    fs.appendFileSync(indexFilePath(), "{corrupted json\n", "utf8");

    const storedAll = readAllPointers();
    assert.equal(storedAll.length, 2);

    const botPage = readChannelPointers("bot", "bot-a");
    const teamPage = readChannelPointers("team", "team-1");
    assert.deepEqual(botPage.pointers.map((p) => p.id), ["ag-1:turn:t1", "ag-1:turn:t2"]);
    assert.deepEqual(teamPage.pointers.map((p) => p.id), ["ag-1:turn:t1", "ag-1:turn:t2"]);

    const humanPage = readChannelPointers("bot", "bot-a", { humanOnly: true });
    assert.deepEqual(humanPage.pointers.map((p) => p.id), ["ag-1:turn:t1"]);
    assert.equal(humanPage.totalPointers, 1);

    const summary = getChannelSummary("bot", "bot-a");
    assert.equal(summary.entryCount, 2);
    assert.equal(summary.lastActivityAt, "2026-11-20T10:02:00.000Z");
    assert.equal(summary.lastPreview, "Routine done");

    const archivedCount = markAgentArchived("ag-1");
    assert.equal(archivedCount, 2);
    assert.equal(readChannelPointers("team", "team-1").pointers[0]?.archived, true);
    assert.equal(readChannelPointers("bot", "bot-a").pointers[0]?.archived, true);
  });

  it("paginates backwards cleanly with beforeCursor, hasOlder, and nextCursor even on identical timestamps", () => {
    const pointers = [
      samplePointer({ id: "p1", turnId: "t1", timestamp: "2026-11-20T10:01:00.000Z" }),
      samplePointer({ id: "p2", turnId: "t2", timestamp: "2026-11-20T10:02:00.000Z" }),
      samplePointer({ id: "p3", turnId: "t3", timestamp: "2026-11-20T10:02:00.000Z" }),
      samplePointer({ id: "p4", turnId: "t4", timestamp: "2026-11-20T10:03:00.000Z" }),
      samplePointer({ id: "p5", turnId: "t5", timestamp: "2026-11-20T10:04:00.000Z" }),
    ];
    upsertPointers(pointers);

    const page1 = readChannelPointers("bot", "bot-a", { limit: 2 });
    assert.equal(page1.totalPointers, 5);
    assert.equal(page1.hasOlder, true);
    assert.deepEqual(page1.pointers.map((p) => p.id), ["p4", "p5"]);
    assert.equal(page1.nextCursor, "2026-11-20T10:03:00.000Z|p4");

    const page2 = readChannelPointers("bot", "bot-a", { limit: 2, beforeCursor: page1.nextCursor! });
    assert.equal(page2.totalPointers, 5);
    assert.equal(page2.hasOlder, true);
    assert.deepEqual(page2.pointers.map((p) => p.id), ["p2", "p3"]);
    assert.equal(page2.nextCursor, "2026-11-20T10:02:00.000Z|p2");

    const page3 = readChannelPointers("bot", "bot-a", { limit: 2, beforeCursor: page2.nextCursor! });
    assert.equal(page3.totalPointers, 5);
    assert.equal(page3.hasOlder, false);
    assert.equal(page3.nextCursor, null);
    assert.deepEqual(page3.pointers.map((p) => p.id), ["p1"]);
  });

  it("migrates legacy channels/*.jsonl once with ID deduplication, teamIds merging, <= 120 char previews, and leaves legacy files intact", () => {
    const dir = resolveFeedDataDir();
    const channelsDir = path.join(dir, "channels");
    fs.mkdirSync(channelsDir, { recursive: true });

    const longCommand = `Deploy  multi-line\n\ncommand ${"x".repeat(150)}`;
    const longReply = `Completed   verification\nstep ${"y".repeat(150)}`;

    const botEntry: FeedEntry = {
      id: "ag-leg-1:turn:tl1",
      channelKind: "bot",
      channelId: "bot-moadmin",
      botId: "bot-moadmin",
      botName: "moAdmin",
      teamId: null,
      agentId: "ag-leg-1",
      agentTitle: "Legacy task",
      archived: false,
      turnId: "tl1",
      timestamp: "2026-11-18T08:00:00.000Z",
      command: longCommand,
      reply: longReply,
      status: "completed",
      errorMessage: null,
      toolsCount: 4,
      source: "dm",
    };

    const teamEntry: FeedEntry = {
      ...botEntry,
      channelKind: "team",
      channelId: "team-alpha",
      teamId: "team-alpha",
      archived: true,
    };

    const botFile = path.join(channelsDir, "bot__bot-moadmin.jsonl");
    const teamFile = path.join(channelsDir, "team__team-alpha.jsonl");
    const botRawContent = `${JSON.stringify(botEntry)}\n{broken json line\n{"id":"missing-fields"}\n`;
    const teamRawContent = `${JSON.stringify(teamEntry)}\n`;
    fs.writeFileSync(botFile, botRawContent, "utf8");
    fs.writeFileSync(teamFile, teamRawContent, "utf8");

    const firstRun = migrateLegacyChannelsToIndex();
    assert.deepEqual(firstRun, { migratedCount: 1, scannedFiles: 2, skipped: false });

    const all = readAllPointers();
    assert.equal(all.length, 1);
    const migrated = all[0]!;
    assert.equal(migrated.id, "ag-leg-1:turn:tl1");
    assert.equal(migrated.turnIndex, 0);
    assert.deepEqual(migrated.teamIds, ["team-alpha"]);
    assert.equal(migrated.archived, true);
    assert.equal(migrated.toolsCount, 4);
    assert.ok(migrated.commandPreview.length <= 120);
    assert.ok(migrated.commandPreview.endsWith("..."));
    assert.ok(!migrated.commandPreview.includes("\n"));
    assert.ok(migrated.replyPreview.length <= 120);
    assert.ok(migrated.replyPreview.endsWith("..."));
    assert.ok(!migrated.replyPreview.includes("\n"));

    assert.equal(readChannelPointers("bot", "bot-moadmin").totalPointers, 1);
    assert.equal(readChannelPointers("team", "team-alpha").totalPointers, 1);

    // Original legacy files remain intact on disk
    assert.equal(fs.readFileSync(botFile, "utf8"), botRawContent);
    assert.equal(fs.readFileSync(teamFile, "utf8"), teamRawContent);

    const markerPath = path.join(dir, LEGACY_CHANNELS_MIGRATION_MARKER);
    assert.equal(fs.existsSync(markerPath), true);
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as {
      migratedAt: string;
      scannedFiles: number;
      migratedCount: number;
    };
    assert.equal(marker.scannedFiles, 2);
    assert.equal(marker.migratedCount, 1);
    assert.ok(Date.parse(marker.migratedAt) > 0);

    const secondRun = migrateLegacyChannelsToIndex();
    assert.deepEqual(secondRun, { migratedCount: 0, scannedFiles: 0, skipped: true });
  });

  it("preserves existing index.jsonl pointer fields without downgrading while unioning teamIds", () => {
    const emptyRun = migrateLegacyChannelsToIndex();
    assert.deepEqual(emptyRun, { migratedCount: 0, scannedFiles: 0, skipped: false });

    const existing = samplePointer({
      id: "ag-existing:turn:te1",
      agentId: "ag-existing",
      turnId: "te1",
      turnIndex: 3,
      botId: "bot-moadmin",
      botName: "moAdmin",
      teamIds: ["team-core"],
      commandPreview: "Fresh command",
      replyPreview: "Fresh reply",
      status: "completed",
      errorMessage: null,
      toolsCount: 5,
      source: "dm",
    });
    upsertPointers([existing]);

    // Normal upsert also preserves existing teamIds while unioning new ones
    const normalUpdate = upsertPointers([
      samplePointer({
        ...existing,
        teamIds: ["team-beta"],
      }),
    ]);
    assert.equal(normalUpdate.updated, 1);
    assert.deepEqual(readAllPointers()[0]?.teamIds, ["team-core", "team-beta"]);

    const dir = resolveFeedDataDir();
    const channelsDir = path.join(dir, "channels");
    fs.mkdirSync(channelsDir, { recursive: true });

    const legacySameId: FeedEntry = {
      id: "ag-existing:turn:te1",
      channelKind: "team",
      channelId: "team-alpha",
      botId: "bot-moadmin",
      botName: "Old Name",
      teamId: "team-alpha",
      agentId: "ag-existing",
      agentTitle: "Old Title",
      archived: true,
      turnId: "te1",
      timestamp: "2026-11-18T00:00:00.000Z",
      command: "Stale legacy command",
      reply: "Stale legacy reply",
      status: "failed",
      errorMessage: "legacy error",
      toolsCount: 1,
      source: "routine",
    };
    const legacyNewId: FeedEntry = {
      ...legacySameId,
      id: "ag-new-leg:turn:tn1",
      agentId: "ag-new-leg",
      turnId: "tn1",
      status: "completed",
      errorMessage: null,
      command: "New legacy cmd",
      reply: "New legacy reply",
    };

    fs.writeFileSync(
      path.join(channelsDir, "team__team-alpha.jsonl"),
      `${JSON.stringify(legacySameId)}\n${JSON.stringify(legacyNewId)}\n`,
      "utf8",
    );

    const mig = migrateLegacyChannelsToIndex();
    assert.deepEqual(mig, { migratedCount: 2, scannedFiles: 1, skipped: false });

    const all = readAllPointers();
    assert.equal(all.length, 2);
    const preserved = all.find((p) => p.id === "ag-existing:turn:te1")!;
    assert.equal(preserved.turnIndex, 3);
    assert.equal(preserved.commandPreview, "Fresh command");
    assert.equal(preserved.replyPreview, "Fresh reply");
    assert.equal(preserved.status, "completed");
    assert.equal(preserved.errorMessage, null);
    assert.equal(preserved.toolsCount, 5);
    assert.equal(preserved.archived, false);
    assert.deepEqual(preserved.teamIds, ["team-core", "team-beta", "team-alpha"]);

    const secondRun = migrateLegacyChannelsToIndex();
    assert.deepEqual(secondRun, { migratedCount: 0, scannedFiles: 0, skipped: true });
  });

  it("preserves workflow metadata across upsertPointers merges and excludes workflow from humanOnly", () => {
    const pWf = samplePointer({
      id: "ag-wf:turn:tw1",
      agentId: "ag-wf",
      turnId: "tw1",
      source: "workflow",
      workflowTaskId: "wf-t1",
      workflowId: "wf-closed-loop",
      workflowStageId: "mocode-impl",
      workflowStageName: "Implementation",
    });
    const pDm = samplePointer({
      id: "ag-dm:turn:td1",
      agentId: "ag-dm",
      turnId: "td1",
      source: "dm",
    });
    upsertPointers([pWf, pDm]);

    // Overwrite without workflow metadata (preserveExisting=false) retains prior workflow fields
    upsertPointers([
      samplePointer({
        id: "ag-wf:turn:tw1",
        agentId: "ag-wf",
        turnId: "tw1",
        source: "workflow",
        replyPreview: "Updated preview",
      }),
    ]);

    // PreserveExisting=true backfills missing workflow fields without overwriting existing ones
    upsertPointers(
      [
        samplePointer({
          id: "ag-dm:turn:td1",
          agentId: "ag-dm",
          turnId: "td1",
          workflowTaskId: "late-task",
          workflowStageName: "Late Stage",
        }),
      ],
      undefined,
      { preserveExisting: true },
    );

    const storedWf = readAllPointers().find((p) => p.id === "ag-wf:turn:tw1");
    assert.equal(storedWf?.replyPreview, "Updated preview");
    assert.equal(storedWf?.workflowTaskId, "wf-t1");
    assert.equal(storedWf?.workflowId, "wf-closed-loop");
    assert.equal(storedWf?.workflowStageId, "mocode-impl");
    assert.equal(storedWf?.workflowStageName, "Implementation");

    const storedDm = readAllPointers().find((p) => p.id === "ag-dm:turn:td1");
    assert.equal(storedDm?.workflowTaskId, "late-task");
    assert.equal(storedDm?.workflowStageName, "Late Stage");

    const humanPage = readChannelPointers("bot", "bot-a", { humanOnly: true });
    assert.deepEqual(humanPage.pointers.map((p) => p.id), ["ag-dm:turn:td1"]);
  });
});

describe("hydrator.ts", () => {
  it("fetches only requested page agents, respects archived cache vs active TTL, and evicts via LRU", async () => {
    const fullMarkdown = `# Full Architecture Notes\n\n${"Paragraph content with rich details. ".repeat(10)}`.trim();
    const { paseo, refetchCalls } = createMockPaseo([
      {
        id: "ag-old",
        archivedAt: "2026-11-18T00:00:00.000Z",
        timeline: [
          { turnId: "to1", timestamp: "2026-11-18T00:00:00.000Z", item: { type: "user_message", text: "Old cmd" } },
          { turnId: "to1", timestamp: "2026-11-18T00:00:05.000Z", item: { type: "assistant_message", text: fullMarkdown } },
        ],
      },
      {
        id: "ag-mid",
        archivedAt: "2026-11-19T00:00:00.000Z",
        timeline: [
          { turnId: "tm1", timestamp: "2026-11-19T00:00:00.000Z", item: { type: "user_message", text: "Mid cmd" } },
          { turnId: "tm1", timestamp: "2026-11-19T00:00:05.000Z", item: { type: "assistant_message", text: "Mid full reply" } },
        ],
      },
      {
        id: "ag-new",
        timeline: [
          { turnId: "tn1", timestamp: "2026-11-20T00:00:00.000Z", item: { type: "user_message", text: "New cmd" } },
          { turnId: "tn1", timestamp: "2026-11-20T00:00:05.000Z", item: { type: "assistant_message", text: fullMarkdown } },
        ],
      },
    ]);

    const pointers: FeedPointer[] = [
      {
        id: "ag-old:turn:to1",
        agentId: "ag-old",
        turnId: "to1",
        turnIndex: 0,
        botId: "bot-a",
        botName: "Bot A",
        teamIds: ["team-1"],
        agentTitle: "Old",
        archived: true,
        timestamp: "2026-11-18T00:00:05.000Z",
        status: "completed",
        errorMessage: null,
        toolsCount: 0,
        source: "dm",
        commandPreview: "Old cmd",
        replyPreview: previewSnippet(fullMarkdown, 120),
      },
      {
        id: "ag-mid:turn:tm1",
        agentId: "ag-mid",
        turnId: "tm1",
        turnIndex: 0,
        botId: "bot-a",
        botName: "Bot A",
        teamIds: ["team-1"],
        agentTitle: "Mid",
        archived: true,
        timestamp: "2026-11-19T00:00:05.000Z",
        status: "completed",
        errorMessage: null,
        toolsCount: 0,
        source: "dm",
        commandPreview: "Mid cmd",
        replyPreview: "Mid full reply",
      },
      {
        id: "ag-new:turn:tn1",
        agentId: "ag-new",
        turnId: "tn1",
        turnIndex: 0,
        botId: "bot-a",
        botName: "Bot A",
        teamIds: ["team-1"],
        agentTitle: "New",
        archived: false,
        timestamp: "2026-11-20T00:00:05.000Z",
        status: "completed",
        errorMessage: null,
        toolsCount: 0,
        source: "dm",
        commandPreview: "New cmd",
        replyPreview: previewSnippet(fullMarkdown, 120),
      },
    ];

    let fakeNow = 1_000_000;
    const hydrator = new FeedHydrator({ maxEntries: 2, activeTtlMs: 15_000, now: () => fakeNow });

    // Hydrate only the tail page ([ag-new]) -> ag-old and ag-mid must NOT be refetched
    const page1 = await hydrator.hydratePointers(paseo, "bot", "bot-a", [pointers[2]!]);
    assert.equal(refetchCalls.length, 1);
    assert.equal(refetchCalls[0]?.agentId, "ag-new");
    assert.deepEqual(refetchCalls[0]?.options, {
      direction: "tail",
      projection: "projected",
      limit: 40,
      wholeTurns: true,
    });
    assert.equal(page1[0]?.hydrated, true);
    assert.equal(page1[0]?.reply, fullMarkdown);

    // Hydrate archived ag-old once
    await hydrator.hydratePointers(paseo, "bot", "bot-a", [pointers[0]!]);
    assert.equal(refetchCalls.length, 2);

    // Advance clock past 15s TTL: archived ag-old remains cached (0 extra refetches), active ag-new refetches
    fakeNow += 20_000;
    await hydrator.hydratePointers(paseo, "bot", "bot-a", [pointers[0]!]);
    assert.equal(refetchCalls.length, 2);

    await hydrator.hydratePointers(paseo, "bot", "bot-a", [pointers[2]!]);
    assert.equal(refetchCalls.length, 3);

    // Adding ag-mid (3rd entry) evicts oldest LRU entry (ag-old) since maxEntries=2
    await hydrator.hydratePointers(paseo, "bot", "bot-a", [pointers[1]!]);
    assert.equal(hydrator.size, 2);
    assert.equal(refetchCalls.length, 4);

    // Now ag-old was evicted and must be refetched again
    await hydrator.hydratePointers(paseo, "bot", "bot-a", [pointers[0]!]);
    assert.equal(refetchCalls.length, 5);
  });

  it("falls back to preview with hydrated=false on missing/deleted/errored agents and supports null turnId matching", async () => {
    const { paseo, agents } = createMockPaseo([
      {
        id: "ag-no-turnid",
        timeline: [
          { timestamp: "2026-11-20T09:00:00.000Z", item: { type: "user_message", text: "Null turnId cmd" } },
          { timestamp: "2026-11-20T09:00:02.000Z", item: { type: "assistant_message", text: "Full reply without turnId" } },
        ],
      },
      {
        id: "ag-error",
        timelineError: "Backend offline",
      },
    ]);

    const pointers: FeedPointer[] = [
      {
        id: "ag-no-turnid:idx:0:abc",
        agentId: "ag-no-turnid",
        turnId: null,
        turnIndex: 0,
        botId: "bot-a",
        botName: "Bot A",
        teamIds: [],
        agentTitle: "NoTurn",
        archived: false,
        timestamp: "2026-11-20T09:00:02.000Z",
        status: "completed",
        errorMessage: null,
        toolsCount: 0,
        source: "dm",
        commandPreview: "Null turnId cmd",
        replyPreview: "Full reply...",
      },
      {
        id: "ag-deleted:turn:td1",
        agentId: "ag-deleted",
        turnId: "td1",
        turnIndex: 0,
        botId: "bot-a",
        botName: "Bot A",
        teamIds: [],
        agentTitle: "Deleted",
        archived: true,
        timestamp: "2026-11-20T09:01:00.000Z",
        status: "completed",
        errorMessage: null,
        toolsCount: 0,
        source: "dm",
        commandPreview: "Deleted cmd preview",
        replyPreview: "Deleted reply preview",
      },
      {
        id: "ag-error:turn:te1",
        agentId: "ag-error",
        turnId: "te1",
        turnIndex: 0,
        botId: "bot-a",
        botName: "Bot A",
        teamIds: [],
        agentTitle: "Errored",
        archived: false,
        timestamp: "2026-11-20T09:02:00.000Z",
        status: "completed",
        errorMessage: null,
        toolsCount: 0,
        source: "dm",
        commandPreview: "Error cmd preview",
        replyPreview: "Error reply preview",
      },
    ];

    assert.equal(agents.has("ag-deleted"), false);
    const entries = await hydratePointers(paseo, "bot", "bot-a", pointers);
    assert.equal(entries.length, 3);

    assert.equal(entries[0]?.hydrated, true);
    assert.equal(entries[0]?.reply, "Full reply without turnId");

    assert.equal(entries[1]?.hydrated, false);
    assert.equal(entries[1]?.command, "Deleted cmd preview");
    assert.equal(entries[1]?.reply, "Deleted reply preview");

    assert.equal(entries[2]?.hydrated, false);
    assert.equal(entries[2]?.command, "Error cmd preview");
    assert.equal(entries[2]?.reply, "Error reply preview");
  });

  it("retains and backfills workflow metadata across hydrated and preview-only entries", async () => {
    const { paseo } = createMockPaseo([
      {
        id: "ag-wf-live",
        labels: {
          [BOT_LABEL]: "bot-a",
          [WORKFLOW_TASK_LABEL]: "task-live",
          "paseo-bots:workflow-name": "wf-main",
          [WORKFLOW_STAGE_LABEL]: "stage-verify",
          "paseo-bots:workflow-stage-name": "Verify Gate",
        },
        timeline: [
          { turnId: "tw1", timestamp: "2026-11-20T09:00:00.000Z", item: { type: "user_message", text: "Verify" } },
          { turnId: "tw1", timestamp: "2026-11-20T09:00:02.000Z", item: { type: "assistant_message", text: "Verified" } },
        ],
      },
    ]);

    const pointers: FeedPointer[] = [
      {
        id: "ag-wf-live:turn:tw1",
        agentId: "ag-wf-live",
        turnId: "tw1",
        turnIndex: 0,
        botId: "bot-a",
        botName: "Bot A",
        teamIds: [],
        agentTitle: "Workflow",
        archived: false,
        timestamp: "2026-11-20T09:00:02.000Z",
        status: "completed",
        errorMessage: null,
        toolsCount: 0,
        source: "workflow",
        commandPreview: "Verify",
        replyPreview: "Verified",
      },
      {
        id: "ag-wf-gone:turn:tw2",
        agentId: "ag-wf-gone",
        turnId: "tw2",
        turnIndex: 0,
        botId: "bot-a",
        botName: "Bot A",
        teamIds: [],
        agentTitle: "Workflow Gone",
        archived: true,
        timestamp: "2026-11-20T09:01:00.000Z",
        status: "completed",
        errorMessage: null,
        toolsCount: 0,
        source: "workflow",
        workflowTaskId: "task-gone",
        workflowId: "wf-gone",
        workflowStageId: "stage-old",
        workflowStageName: "Archived Stage",
        commandPreview: "Gone cmd",
        replyPreview: "Gone reply",
      },
    ];

    const entries = await hydratePointers(paseo, "bot", "bot-a", pointers);
    assert.equal(entries[0]?.hydrated, true);
    assert.equal(entries[0]?.source, "workflow");
    assert.equal(entries[0]?.workflowTaskId, "task-live");
    assert.equal(entries[0]?.workflowId, "wf-main");
    assert.equal(entries[0]?.workflowStageId, "stage-verify");
    assert.equal(entries[0]?.workflowStageName, "Verify Gate");

    assert.equal(entries[1]?.hydrated, false);
    assert.equal(entries[1]?.source, "workflow");
    assert.equal(entries[1]?.workflowTaskId, "task-gone");
    assert.equal(entries[1]?.workflowId, "wf-gone");
    assert.equal(entries[1]?.workflowStageId, "stage-old");
    assert.equal(entries[1]?.workflowStageName, "Archived Stage");
  });
});

describe("sync.ts & index.server.ts", () => {
  beforeEach(() => {
    fs.writeFileSync(
      process.env.PASEO_BOTS_SETTINGS_PATH!,
      JSON.stringify({
        version: 4,
        values: {
          bots: [
            { id: "bot-chief", name: "Chief", title: "Global", pinned: false, archived: false },
            { id: "bot-pin", name: "Pinned Bot", title: "Pinned", pinned: true, archived: false },
            { id: "bot-reg", name: "Regular Bot", title: "Regular", pinned: false, archived: false },
            { id: "bot-arch", name: "Archived Bot", title: "Old", pinned: false, archived: true },
          ],
          groups: [
            { id: "team-core", name: "Core Team", leadId: "bot-pin", memberIds: ["bot-pin", "bot-reg"], pinned: true, archived: false },
          ],
        },
      }),
      "utf8",
    );
  });

  it("handles turn.after single-pointer storage, live hydrated broadcasts, archive.after, sync backfill, and feed.send", async () => {
    const longWorkReply = `Working on it cleanly. ${"Step details here. ".repeat(12)}`.trim();
    const { paseo, sentMessages } = createMockPaseo([
      {
        id: "ag-shadow",
        labels: { [BOT_LABEL]: "bot-pin", [SHADOW_SESSION_LABEL]: "true" },
        updatedAt: "2026-11-20T12:00:00.000Z",
        timeline: [{ turnId: "ts1", timestamp: "2026-11-20T12:00:00.000Z", item: { type: "user_message", text: "shadow" } }],
      },
      {
        id: "ag-routine",
        labels: { [BOT_LABEL]: "bot-pin", [ROUTINE_LABEL]: "rt-daily" },
        updatedAt: "2026-11-20T11:30:00.000Z",
        timeline: [
          { turnId: "tr1", timestamp: "2026-11-20T11:30:00.000Z", item: { type: "user_message", text: "Daily digest" } },
          { turnId: "tr1", timestamp: "2026-11-20T11:30:05.000Z", item: { type: "assistant_message", text: "Digest ready" } },
        ],
      },
      {
        id: "ag-human",
        title: "Build WP-A",
        labels: { [BOT_LABEL]: "bot-pin" },
        updatedAt: "2026-11-20T11:00:00.000Z",
        timeline: [
          { turnId: "th1", timestamp: "2026-11-20T11:00:00.000Z", item: { type: "user_message", text: "Start work" } },
          { turnId: "th1", timestamp: "2026-11-20T11:00:04.000Z", item: { type: "assistant_message", text: longWorkReply } },
        ],
      },
      {
        id: "ag-archived-reg",
        title: "Old Reg",
        labels: { [BOT_LABEL]: "bot-reg" },
        archivedAt: "2026-11-19T00:00:00.000Z",
        updatedAt: "2026-11-19T00:00:00.000Z",
        timeline: [
          { turnId: "ta1", timestamp: "2026-11-19T00:00:00.000Z", item: { type: "user_message", text: "Legacy task" } },
          { turnId: "ta1", timestamp: "2026-11-19T00:00:05.000Z", item: { type: "assistant_message", text: "Legacy done" } },
        ],
      },
    ]);

    const events: FeedUpdateEvent[] = [];
    const broadcast = (ev: FeedUpdateEvent) => events.push(ev);

    // Shadow session is ignored
    const shadowRes = await handleTurnAfter(
      { agent: { id: "ag-shadow", workspaceId: null, parentAgentId: null, provider: "agy", cwd: ".", title: null, background: true, metadata: {} }, turnId: "ts1", outcome: { kind: "completed" } },
      { paseo },
      broadcast,
    );
    assert.equal(shadowRes.length, 0);

    // Human turn writes 1 compact pointer in index.jsonl and emits 2 hydrated live events (bot + team)
    const humanRes = await handleTurnAfter(
      { agent: { id: "ag-human", workspaceId: null, parentAgentId: null, provider: "agy", cwd: ".", title: "Build WP-A", background: false, metadata: {} }, turnId: "th1", outcome: { kind: "completed" } },
      { paseo },
      broadcast,
    );
    assert.equal(humanRes.length, 2);
    assert.equal(readAllPointers().length, 1);
    assert.ok(readAllPointers()[0]!.replyPreview.length <= 120);

    const addedEvents = events.filter((e) => e.kind === "entry_added");
    assert.equal(addedEvents.length, 2);
    assert.equal(addedEvents[0]?.entry?.hydrated, true);
    assert.equal(addedEvents[0]?.entry?.reply, longWorkReply);

    // Backfill sync for bot-pin and team-core writes unique pointers only
    const syncedBot = await syncChannelFromPaseo(paseo, "bot", "bot-pin");
    assert.equal(syncedBot.syncedAgents, 2);
    assert.equal(syncedBot.addedEntries, 1);
    const syncedTeam = await syncChannelFromPaseo(paseo, "team", "team-core");
    assert.equal(syncedTeam.syncedAgents, 3);
    assert.equal(syncedTeam.addedEntries, 1); // Only ag-archived-reg wasn't synced yet
    const idempotentSync = await syncChannelFromPaseo(paseo, "team", "team-core");
    assert.equal(idempotentSync.addedEntries, 0);

    // Channel ordering: bot-chief first, then pinned, then regular; archived excluded by default
    const channels = await listChannelsWithStats(paseo);
    assert.deepEqual(
      channels.map((c) => `${c.kind}:${c.id}`),
      ["bot:bot-chief", "bot:bot-pin", "team:team-core", "bot:bot-reg"],
    );
    assert.equal(channels.find((c) => c.id === "bot-pin")?.activeAgentId, "ag-human");

    const allWithArchived = await listChannelsWithStats(paseo, { includeArchived: true });
    assert.ok(allWithArchived.some((c) => c.id === "bot-arch"));

    // sendToFeedChannel picks ag-human (not shadow, not routine)
    const sent = await sendToFeedChannel(paseo, "team", "team-core", "Continue WP-A");
    assert.deepEqual(sent, { ok: true, agentId: "ag-human", reason: "sent" });
    assert.deepEqual(sentMessages, [{ agentId: "ag-human", text: "Continue WP-A" }]);

    // bot-reg only has an archived human chat
    const noActive = await sendToFeedChannel(paseo, "bot", "bot-reg", "Ping");
    assert.equal(noActive.ok, false);
    assert.equal(noActive.reason, "no_active_chat");
    assert.equal(noActive.lastArchivedAgentId, "ag-archived-reg");

    const missing = await sendToFeedChannel(paseo, "bot", "bot-missing", "Ping");
    assert.equal(missing.reason, "channel_not_found");

    // Archive hook marks pointer archived once in index.jsonl and broadcasts
    const archivedEntries = handleArchiveAfter(
      { agent: { id: "ag-human", workspaceId: null, parentAgentId: null, provider: "agy", cwd: ".", title: "Build WP-A", background: false, metadata: {} }, archivedAt: "2026-11-20T12:05:00.000Z" },
      broadcast,
    );
    assert.equal(archivedEntries, 1);
    assert.ok(events.some((e) => e.kind === "agent_archived" && e.agentId === "ag-human"));
  });

  it("registers RPCs with cursor pagination, on-demand hydration, caching, subscription, and cleanup", async () => {
    const fullReply1 = `Archived reply full prose. ${"Details ".repeat(25)}`.trim();
    const fullReply2 = `Live reply full prose. ${"More details ".repeat(25)}`.trim();
    const { paseo, agents, sentMessages, refetchCalls } = createMockPaseo([
      {
        id: "ag-old-arch",
        title: "Old thread",
        labels: { [BOT_LABEL]: "bot-pin" },
        archivedAt: "2026-11-19T14:00:00.000Z",
        updatedAt: "2026-11-19T14:00:00.000Z",
        timeline: [
          { turnId: "ta1", timestamp: "2026-11-19T14:00:00.000Z", item: { type: "user_message", text: "Old check" } },
          { turnId: "ta1", timestamp: "2026-11-19T14:00:02.000Z", item: { type: "assistant_message", text: fullReply1 } },
        ],
      },
      {
        id: "ag-live",
        title: "Live thread",
        labels: { [BOT_LABEL]: "bot-pin" },
        updatedAt: "2026-11-20T14:00:00.000Z",
        timeline: [
          { turnId: "tl1", timestamp: "2026-11-20T14:00:00.000Z", item: { type: "user_message", text: "Check feed" } },
          { turnId: "tl1", timestamp: "2026-11-20T14:00:02.000Z", item: { type: "assistant_message", text: fullReply2 } },
        ],
      },
    ]);

    const rpcs = new Map<string, (input: unknown, ctx: unknown) => unknown>();
    const hooks = new Map<string, (payload: unknown, ctx: unknown) => Promise<void>>();
    let subReturnValue: unknown = "unset";

    const fakeServer = {
      registerSettings() {
        throw new Error("unexpected");
      },
      registerProvider() {},
      registerUsageSource() {},
      handle(contract: { name: string }, handler: (input: unknown, ctx: unknown) => unknown) {
        rpcs.set(contract.name, handler);
      },
      addHook(name: string, handler: (payload: unknown, ctx: unknown) => Promise<void>) {
        hooks.set(name, handler);
        return () => {
          hooks.delete(name);
        };
      },
      on() {
        return () => {};
      },
      before() {
        return () => {};
      },
    } as unknown as PluginServerContext;

    const cleanup = contribute(fakeServer);
    assert.equal(typeof cleanup, "function");

    const subHandler = rpcs.get("feed.updates")!;
    assert.ok(subHandler);
    const ac = new AbortController();
    const pushed: FeedUpdateEvent[] = [];
    subReturnValue = subHandler(
      { channelKind: "bot", channelId: "bot-pin" },
      {
        paseo,
        signal: ac.signal,
        async push(ev: FeedUpdateEvent) {
          pushed.push(ev);
        },
      },
    );
    // Subscription handler MUST return synchronously (undefined, not a Promise)
    assert.equal(subReturnValue, undefined);

    // Sync first so both pointers exist, then clear refetch counter to inspect page-level hydration
    const syncRes = (await rpcs.get("feed.sync")!(
      { channelKind: "team", channelId: "team-core" },
      { paseo },
    )) as { syncedAgents: number; addedEntries: number };
    assert.equal(syncRes.syncedAgents, 2);
    assert.equal(syncRes.addedEntries, 2);
    refetchCalls.length = 0;

    // Fetch newest page (limit: 1) -> hydrates ONLY ag-live
    const page1 = (await rpcs.get("feed.entries")!(
      { channelKind: "bot", channelId: "bot-pin", limit: 1 },
      { paseo },
    )) as {
      entries: FeedEntry[];
      hasOlder: boolean;
      nextCursor: string | null;
      totalPointers: number;
      syncedAgents: number;
      channel: { id: string } | null;
    };
    assert.equal(page1.totalPointers, 2);
    assert.equal(page1.hasOlder, true);
    assert.ok(page1.nextCursor);
    assert.equal(page1.entries.length, 1);
    assert.equal(page1.entries[0]?.agentId, "ag-live");
    assert.equal(page1.entries[0]?.hydrated, true);
    assert.equal(page1.entries[0]?.reply, fullReply2);
    assert.deepEqual(refetchCalls.map((c) => c.agentId), ["ag-live"]);

    // Fetch older page via beforeCursor -> hydrates ag-old-arch once
    const page2 = (await rpcs.get("feed.entries")!(
      { channelKind: "bot", channelId: "bot-pin", limit: 1, beforeCursor: page1.nextCursor! },
      { paseo },
    )) as typeof page1;
    assert.equal(page2.hasOlder, false);
    assert.equal(page2.nextCursor, null);
    assert.equal(page2.entries[0]?.agentId, "ag-old-arch");
    assert.equal(page2.entries[0]?.hydrated, true);
    assert.equal(page2.entries[0]?.reply, fullReply1);
    assert.deepEqual(refetchCalls.map((c) => c.agentId), ["ag-live", "ag-old-arch"]);

    // Repeat older page -> archived agent served from LRU cache (0 extra refetches)
    await rpcs.get("feed.entries")!(
      { channelKind: "bot", channelId: "bot-pin", limit: 1, beforeCursor: page1.nextCursor! },
      { paseo },
    );
    assert.equal(refetchCalls.length, 2);

    // Sync bot-pin directly -> emits synced event to the bot-pin subscriber
    await rpcs.get("feed.sync")!(
      { channelKind: "bot", channelId: "bot-pin" },
      { paseo },
    );

    // Append a new turn tl2 on ag-live and trigger turn.after -> invalidates cache & pushes entry_added
    agents.get("ag-live")!.timeline!.push(
      { turnId: "tl2", timestamp: "2026-11-20T14:05:00.000Z", item: { type: "user_message", text: "Second check" } },
      { turnId: "tl2", timestamp: "2026-11-20T14:05:02.000Z", item: { type: "assistant_message", text: "Second reply" } },
    );
    await hooks.get("agent.turn.after")!(
      {
        agent: { id: "ag-live", workspaceId: null, parentAgentId: null, provider: "agy", cwd: ".", title: "Live thread", background: false, metadata: {} },
        turnId: "tl2",
        outcome: { kind: "completed" },
      },
      { paseo, signal: new AbortController().signal },
    );

    const channelsRes = (await rpcs.get("feed.channels")!(
      { includeArchived: false },
      { paseo },
    )) as { channels: unknown[] };
    assert.equal(channelsRes.channels.length, 4);

    const sendRes = (await rpcs.get("feed.send")!(
      { channelKind: "bot", channelId: "bot-pin", text: "Hello via RPC" },
      { paseo },
    )) as { ok: boolean; agentId: string | null };
    assert.equal(sendRes.ok, true);
    assert.equal(sentMessages.length, 1);

    await Promise.resolve();
    assert.ok(pushed.some((ev) => ev.kind === "synced" && ev.channelId === "bot-pin"));
    assert.ok(pushed.some((ev) => ev.kind === "entry_added" && ev.channelId === "bot-pin" && ev.entry?.turnId === "tl2" && ev.entry?.hydrated === true));
    assert.ok(!pushed.some((ev) => ev.channelId === "team-core"));

    ac.abort();
    cleanup?.();
    assert.equal(hooks.size, 0);
  });

  it("runs idempotent legacy channel migration on plugin load and syncs paseo-plugin.json branding", () => {
    const manifestPath = new URL("../paseo-plugin.json", import.meta.url);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { id: string; name: string };
    assert.equal(manifest.id, "paseo-feed");
    assert.equal(manifest.name, "Feed (助理)");

    const dir = resolveFeedDataDir();
    const channelsDir = path.join(dir, "channels");
    fs.mkdirSync(channelsDir, { recursive: true });
    const legacyEntry: FeedEntry = {
      id: "ag-boot:turn:tb1",
      channelKind: "bot",
      channelId: "bot-pin",
      botId: "bot-pin",
      botName: "Pinned Bot",
      teamId: null,
      agentId: "ag-boot",
      agentTitle: "Boot migration",
      archived: false,
      turnId: "tb1",
      timestamp: "2026-11-18T12:00:00.000Z",
      command: "Check boot migration",
      reply: "Boot migration complete",
      status: "completed",
      errorMessage: null,
      toolsCount: 2,
      source: "dm",
    };
    fs.writeFileSync(path.join(channelsDir, "bot__bot-pin.jsonl"), `${JSON.stringify(legacyEntry)}\n`, "utf8");

    const fakeServer = {
      handle() {},
      addHook() {
        return () => {};
      },
      on() {
        return () => {};
      },
      before() {
        return () => {};
      },
    } as unknown as PluginServerContext;

    const cleanup = contribute(fakeServer);
    cleanup?.();

    const pointers = readAllPointers();
    assert.equal(pointers.length, 1);
    assert.equal(pointers[0]?.id, "ag-boot:turn:tb1");
    assert.equal(fs.existsSync(path.join(dir, LEGACY_CHANNELS_MIGRATION_MARKER)), true);
    assert.deepEqual(migrateLegacyChannelsToIndex(), { migratedCount: 0, scannedFiles: 0, skipped: true });
  });

  it("syncs workflow turns with metadata and cold-starts DM/team sessions in sendToFeedChannel", async () => {
    fs.writeFileSync(
      process.env.PASEO_BOTS_SETTINGS_PATH!,
      JSON.stringify({
        version: 4,
        values: {
          bots: [
            {
              id: "bot-chief",
              name: "全局助理",
              isGlobalAssistant: true,
              longSessionEnabled: true,
              cwd: "/workspace/chief",
              provider: "agy",
              model: "gemini-4-hydrogen",
              engine: "paseo-bot",
            },
            {
              id: "bot-member",
              name: "Member Bot",
              cwd: "/workspace/member",
              provider: "agy",
              model: "gemini-3.8-flash",
            },
          ],
          groups: [
            {
              id: "team-lead-ok",
              name: "Core Team",
              leadId: "bot-chief",
              memberIds: ["bot-chief", "bot-member"],
              cwd: "/workspace/team-core",
            },
            {
              id: "team-member-fallback",
              name: "Fallback Team",
              leadId: "bot-deleted",
              memberIds: ["bot-member"],
            },
          ],
        },
      }),
      "utf8",
    );

    // 1. Workflow turn sync + handleTurnAfter + excluding workflow agent from active human chat
    const { paseo: wfPaseo, createCalls: wfCreateCalls } = createMockPaseo(
      [
        {
          id: "ag-wf-1",
          title: "Workflow Stage",
          labels: {
            [BOT_LABEL]: "bot-chief",
            [WORKFLOW_TASK_LABEL]: "wf-t1",
            "paseo-bots:workflow-name": "wf-closed",
            [WORKFLOW_STAGE_LABEL]: "stage-impl",
            "paseo-bots:workflow-stage-name": "Implementation",
          },
          updatedAt: "2026-11-20T15:00:00.000Z",
          timeline: [
            { turnId: "twf1", timestamp: "2026-11-20T15:00:00.000Z", item: { type: "user_message", text: "Run stage" } },
            { turnId: "twf1", timestamp: "2026-11-20T15:00:03.000Z", item: { type: "assistant_message", text: "Stage ok" } },
          ],
        },
      ],
      {
        createAgent: (input) => ({
          id: "ag-dm-cold",
          input,
        }),
      },
    );

    const events: FeedUpdateEvent[] = [];
    const liveEntries = await handleTurnAfter(
      {
        agent: {
          id: "ag-wf-1",
          workspaceId: null,
          parentAgentId: null,
          provider: "agy",
          cwd: ".",
          title: "Workflow Stage",
          background: true,
          metadata: {},
        },
        turnId: "twf1",
        outcome: { kind: "completed" },
      },
      { paseo: wfPaseo },
      (ev) => events.push(ev),
    );
    assert.equal(liveEntries[0]?.source, "workflow");
    assert.equal(liveEntries[0]?.workflowTaskId, "wf-t1");
    assert.equal(liveEntries[0]?.workflowId, "wf-closed");
    assert.equal(liveEntries[0]?.workflowStageId, "stage-impl");
    assert.equal(liveEntries[0]?.workflowStageName, "Implementation");

    // syncChannelFromPaseo also preserves workflow fields
    await syncChannelFromPaseo(wfPaseo, "bot", "bot-chief");
    const stored = readAllPointers().find((p) => p.agentId === "ag-wf-1");
    assert.equal(stored?.source, "workflow");
    assert.equal(stored?.workflowStageName, "Implementation");

    // DM cold-start skips ag-wf-1 and creates a new session with proper labels & config
    const dmRes = await sendToFeedChannel(wfPaseo, "bot", "bot-chief", "Start morning review");
    assert.deepEqual(dmRes, { ok: true, agentId: "ag-dm-cold", reason: "created" });
    assert.equal(wfCreateCalls.length, 1);
    assert.equal(wfCreateCalls[0]?.cwd, "/workspace/chief");
    assert.equal(wfCreateCalls[0]?.title, "[全局助理]");
    assert.equal(wfCreateCalls[0]?.prompt, "Start morning review");
    assert.deepEqual(wfCreateCalls[0]?.labels, {
      [BOT_LABEL]: "bot-chief",
      [LIFECYCLE_MOUNT_LABEL]: "true",
      [GLOBAL_ASSISTANT_LABEL]: "true",
      [LONG_SESSION_ENABLED_LABEL]: "true",
    });
    assert.deepEqual(wfCreateCalls[0]?.config, {
      provider: "agy/gemini-4-hydrogen",
      engine: "paseo-bot",
    });

    // 2. Team cold-start with leadId (uses group.cwd + team-lead role + { agent: { id } } shape)
    const { paseo: teamPaseo, createCalls: teamCreateCalls } = createMockPaseo([], {
      createAgent: () => ({ agent: { id: "ag-team-cold" } }),
    });
    const teamRes = await sendToFeedChannel(teamPaseo, "team", "team-lead-ok", "Coordinate release");
    assert.deepEqual(teamRes, { ok: true, agentId: "ag-team-cold", reason: "created" });
    assert.equal(teamCreateCalls[0]?.cwd, "/workspace/team-core");
    assert.equal(teamCreateCalls[0]?.title, "[Core Team] 全局助理");
    assert.deepEqual(teamCreateCalls[0]?.labels, {
      [BOT_LABEL]: "bot-chief",
      [LIFECYCLE_MOUNT_LABEL]: "true",
      [GLOBAL_ASSISTANT_LABEL]: "true",
      [LONG_SESSION_ENABLED_LABEL]: "true",
      [TEAM_SESSION_LABEL]: "team-lead-ok",
      [SESSION_ROLE_LABEL]: "team-lead",
    });

    // 3. Team member fallback uses team-direct-specialist role & bot.cwd
    const memberRes = await sendToFeedChannel(teamPaseo, "team", "team-member-fallback", "Assist");
    assert.equal(memberRes.ok, true);
    assert.equal(teamCreateCalls[1]?.cwd, "/workspace/member");
    assert.equal(teamCreateCalls[1]?.title, "[Fallback Team] Member Bot");
    assert.deepEqual(teamCreateCalls[1]?.labels, {
      [BOT_LABEL]: "bot-member",
      [LIFECYCLE_MOUNT_LABEL]: "true",
      [TEAM_SESSION_LABEL]: "team-member-fallback",
      [SESSION_ROLE_LABEL]: "team-direct-specialist",
    });

    // 4. Error handling when create rejects or returns no id
    const { paseo: failPaseo } = createMockPaseo([], {
      createAgent: async () => {
        throw new Error("daemon offline");
      },
    });
    const errRes = await sendToFeedChannel(failPaseo, "bot", "bot-chief", "Ping");
    assert.equal(errRes.ok, false);
    assert.equal(errRes.reason, "error");
    assert.equal(errRes.error, "daemon offline");

    const { paseo: emptyIdPaseo } = createMockPaseo([], {
      createAgent: async () => ({}),
    });
    const missingIdRes = await sendToFeedChannel(emptyIdPaseo, "bot", "bot-chief", "Ping");
    assert.equal(missingIdRes.ok, false);
    assert.equal(missingIdRes.reason, "error");
    assert.ok(missingIdRes.error?.includes("agentId"));
  });
});
