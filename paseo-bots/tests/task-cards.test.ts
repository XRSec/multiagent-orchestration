import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { BotsHost } from "../server/host";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { taskFile } from "../server/tasks";
import type { PaseoApi } from "../server/paseo";

// Task files and card queues live under $PASEO_HOME/plugin-data, so each run is isolated.
let home = "";
const previousHome = process.env.PASEO_HOME;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "paseo-bots-cards-"));
  process.env.PASEO_HOME = home;
});
afterAll(() => {
  if (previousHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = previousHome;
  rmSync(home, { recursive: true, force: true });
});

interface FakeAgent {
  status?: string;
  pendingPermissions?: unknown[];
  archivedAt?: string | null;
  labels?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

function fakePaseo(agents: Record<string, FakeAgent> = {}) {
  const appended: { id?: string; kind?: string; data?: unknown }[] = [];
  const raw: unknown[] = [];
  const send = vi.fn(async () => {});
  const append = vi.fn(async (input: { id?: string; kind?: string; data?: unknown }) => {
    appended.push(input);
  });
  const paseo = {
    agents: {
      ref: (id: string) => ({
        refresh: async () =>
          agents[id]
            ? { agent: { id, title: null, lastError: null, pendingPermissions: [], archivedAt: null, labels: {}, metadata: {}, status: "idle", ...agents[id] } }
            : null,
        send,
        waitForFinish: async () => ({ status: "idle", final: null, error: null, lastMessage: null }),
        timeline: {
          append,
          refetch: async () => ({
            entries: [
              ...appended.map((entry) => ({ type: "plugin", pluginId: "paseo-bots", kind: entry.kind, version: 1, data: entry.data })),
              ...raw,
            ],
          }),
        },
      }),
    },
  };
  return { paseo, append, send, appended, raw };
}

/** A host whose only team is moAdmin's, and whose requester chat belongs to moAdmin. */
function fakeTeamHost(paseo: unknown): BotsHost {
  return {
    paseo,
    attach() {},
    onAttach: () => () => {},
    chatOf: async () => ({ botId: "bot-moadmin", title: null, routineId: null, labels: {} }),
    values: async () => ({ groups: [{ id: "team-1", leadId: "bot-moadmin", memberIds: ["bot-mocode"] }] }),
    requirePaseo: () => paseo,
    bots: async () => [],
    bot: async () => null,
  } as unknown as BotsHost;
}

const groupCards = (appended: { id?: string; kind?: string; data?: unknown }[]) => appended.filter((entry) => entry.kind === "task-card");

describe("task line cards", () => {
  it("publishes exactly one group card for a closed task and starts no turn", async () => {
    const { openTask, upsertMember } = await import("../server/tasks");
    const { settleAndPublish } = await import("../server/task-cards");
    const { paseo, send, appended } = fakePaseo();
    const host = fakeTeamHost(paseo);
    await openTask({ taskId: "task-loop", title: "Ship the audit", acceptance: "report and prototype" });
    await upsertMember("task-loop", { engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-1", status: "done" });
    expect(await settleAndPublish(host, "task-loop", "group-chat")).toEqual({ settled: true, published: true });
    const cards = groupCards(appended);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.id).toBe("task-card:task-loop:3");
    expect(appended.every((entry) => entry.id !== undefined && entry.id.startsWith("task-card:"))).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("lets only the settling caller publish when two evaluate at once", async () => {
    const { openTask, upsertMember } = await import("../server/tasks");
    const { settleAndPublish } = await import("../server/task-cards");
    const { paseo, appended } = fakePaseo();
    const host = fakeTeamHost(paseo);
    await openTask({ taskId: "task-both", title: "Two settlers", acceptance: "one card" });
    await upsertMember("task-both", { engine: "paseo-bot", handleId: "chat-2", status: "done" });
    const results = await Promise.all([settleAndPublish(host, "task-both", "group-chat"), settleAndPublish(host, "task-both", "group-chat")]);
    expect(results.filter((result) => result.published)).toHaveLength(1);
    expect(groupCards(appended)).toHaveLength(1);
  });

  it("does not republish a card whose id is already on the timeline after a restart", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { settleAndPublish, queueTaskCard, flushTaskCards } = await import("../server/task-cards");
    const { taskCardOf } = await import("../shared/task-card");
    const { paseo, appended } = fakePaseo();
    const host = fakeTeamHost(paseo);
    await openTask({ taskId: "task-replay", title: "Replay", acceptance: "once" });
    await upsertMember("task-replay", { engine: "paseo-bot", handleId: "chat-3", status: "done" });
    await settleAndPublish(host, "task-replay", "group-chat");
    // A stale queue entry survives the crash that already appended the card.
    await queueTaskCard(taskCardOf((await readTask("task-replay"))!), "group-chat");
    vi.resetModules();
    const restarted = await import("../server/task-cards");
    expect(await restarted.flushTaskCards(host)).toBe(0);
    expect(groupCards(appended)).toHaveLength(1);
  });

  it("writes a finished turn back and settles a dead member as blocked", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { registerTaskTurns } = await import("../server/task-turns");
    const { paseo, appended } = fakePaseo({
      "chat-dead": {
        archivedAt: "2026-01-01T00:00:00.000Z",
        labels: { "paseo-bots.bot": "bot-mocode", "paseo-bots.asked-by": "bot-moadmin" },
        metadata: { "paseo-bots.handoff-request": { requesterBotId: "bot-moadmin", requesterAgentId: "group-chat", notify: true } },
      },
    });
    const host = fakeTeamHost(paseo);
    const hooks: { name: string; handler: (event: { agent: { id: string } }, context: { paseo: unknown }) => Promise<void> }[] = [];
    const server = { addHook: (name: string, handler: (typeof hooks)[number]["handler"]) => { hooks.push({ name, handler }); return () => {}; } } as unknown as PluginServerContext;
    const fireTurn = async (id: string) => {
      for (const entry of hooks) if (entry.name === "agent.turn.after") await entry.handler({ agent: { id } }, { paseo });
    };
    await openTask({ taskId: "task-dead", title: "Dead end", acceptance: "a receipt" });
    await upsertMember("task-dead", { engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-dead", status: "running" });
    const stop = registerTaskTurns(server, host);
    await fireTurn("chat-dead");
    stop();
    const record = await readTask("task-dead");
    expect(record?.members[0]!.status).toBe("blocked_dead");
    expect(record?.status).toBe("blocked");
    expect(record?.settledAt).not.toBeNull();
    const card = groupCards(appended)[0] as { data?: { status?: string } };
    expect(card.data?.status).toBe("blocked");
    expect(groupCards(appended).some((entry) => (entry.data as { status?: string }).status === "done")).toBe(false);
  });

  it("keeps a task open while the acceptance is missing", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { settleAndPublish } = await import("../server/task-cards");
    const { paseo, appended } = fakePaseo();
    const host = fakeTeamHost(paseo);
    await openTask({ taskId: "task-na", title: "No acceptance" });
    await upsertMember("task-na", { engine: "paseo-bot", handleId: "chat-4", status: "done" });
    expect(await settleAndPublish(host, "task-na", "group-chat")).toEqual({ settled: false, published: false });
    expect((await readTask("task-na"))?.settledAt).toBeNull();
    expect(groupCards(appended)).toHaveLength(0);
  });

  it("keeps the card readable on its own after the task file is pruned", async () => {
    const { TaskCardSchema, taskCardOf } = await import("../shared/task-card");
    const { readTask, PRUNE_SETTLED_MS } = await import("../server/tasks");
    const { settleAndPublish } = await import("../server/task-cards");
    const { paseo, appended } = fakePaseo();
    const host = fakeTeamHost(paseo);
    const record = {
      taskId: "task-self",
      title: "Self contained",
      status: "done" as const,
      version: 3,
      settledAt: "2026-11-10T00:00:00.000Z",
      acceptance: "the report",
      members: [{ engine: "paseo-bot" as const, status: "done" }],
    };
    const card = taskCardOf(record);
    expect(TaskCardSchema.safeParse(card).success).toBe(true);
    expect(card.summary.length).toBeLessThanOrEqual(800);
    expect(card.summary).not.toMatch(/tasks\/|\.json|pluginDataPath|\/Users\//);
    expect(PRUNE_SETTLED_MS).toBe(7 * 24 * 60 * 60 * 1000);
    // The prune floor keeps a freshly settled file, and an aged one is removed.
    const { openTask, upsertMember, pruneSettled } = await import("../server/tasks");
    await openTask({ taskId: "task-fresh", title: "Fresh", acceptance: "x" });
    await upsertMember("task-fresh", { engine: "paseo-bot", handleId: "chat-fresh", status: "done" });
    await settleAndPublish(host, "task-fresh", "group-chat");
    expect(await pruneSettled(0)).toBe(0);
    const aged = join(dirname(taskFile("task-aged")), "task-aged.json");
    mkdirSync(dirname(aged), { recursive: true });
    writeFileSync(aged, JSON.stringify({ ...record, taskId: "task-aged", settledAt: new Date(Date.now() - PRUNE_SETTLED_MS - 1000).toISOString() }));
    expect(await pruneSettled(0)).toBe(1);
    expect(await readTask("task-aged")).toBeNull();
    const published = groupCards(appended)[0] as { data?: { title?: string; summary?: string } };
    expect(published.data?.title).toBe("Fresh");
    expect(published.data?.summary).toContain("done");
  });
  it("holds a line while a partner waits for approval and publishes nothing", async () => {
    const { openTask, upsertMember } = await import("../server/tasks");
    const { settleAndPublish } = await import("../server/task-cards");
    const { paseo, appended } = fakePaseo();
    const host = fakeTeamHost(paseo);
    await openTask({ taskId: "task-hold", title: "Waiting", acceptance: "approved" });
    await upsertMember("task-hold", { engine: "paseo-bot", handleId: "chat-w", status: "done" });
    await upsertMember("task-hold", { engine: "paseo-bot", handleId: "chat-p", status: "blocked_permission" });
    expect(await settleAndPublish(host, "task-hold", "group-chat")).toEqual({ settled: false, published: false });
    expect(groupCards(appended)).toHaveLength(0);
  });

  it("settles a line whose partner died as blocked", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { settleAndPublish } = await import("../server/task-cards");
    const { paseo, appended } = fakePaseo();
    const host = fakeTeamHost(paseo);
    await openTask({ taskId: "task-gone", title: "Gone", acceptance: "a receipt" });
    await upsertMember("task-gone", { engine: "paseo-bot", handleId: "chat-gone", status: "blocked_dead" });
    expect(await settleAndPublish(host, "task-gone", "group-chat")).toEqual({ settled: true, published: true });
    expect((await readTask("task-gone"))?.status).toBe("blocked");
    expect((groupCards(appended)[0]!.data as { status?: string }).status).toBe("blocked");
  });

  it("walks from a permission wait to done with a single card", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { registerTaskTurns } = await import("../server/task-turns");
    const agent: FakeAgent = {
      status: "idle",
      pendingPermissions: [{}],
      labels: { "paseo-bots.bot": "bot-mocode", "paseo-bots.asked-by": "bot-moadmin" },
      metadata: { "paseo-bots.handoff-request": { requesterBotId: "bot-moadmin", requesterAgentId: "group-chat", notify: true } },
    };
    const { paseo, appended } = fakePaseo({ "chat-6": agent });
    const host = fakeTeamHost(paseo);
    const hooks: { name: string; handler: (event: { agent: { id: string } }, context: { paseo: unknown }) => Promise<void> }[] = [];
    const server = { addHook: (name: string, handler: (typeof hooks)[number]["handler"]) => { hooks.push({ name, handler }); return () => {}; } } as unknown as PluginServerContext;
    const fireTurn = async (id: string) => {
      for (const entry of hooks) if (entry.name === "agent.turn.after") await entry.handler({ agent: { id } }, { paseo });
    };
    await openTask({ taskId: "task-6", title: "Approve, then finish", acceptance: "approved" });
    await upsertMember("task-6", { engine: "paseo-bot", handleId: "chat-6", status: "running" });
    const stop = registerTaskTurns(server, host);
    await fireTurn("chat-6");
    expect((await readTask("task-6"))?.members[0]!.status).toBe("blocked_permission");
    expect(groupCards(appended)).toHaveLength(0);
    agent.pendingPermissions = [];
    agent.status = "running";
    await fireTurn("chat-6");
    expect(groupCards(appended)).toHaveLength(0);
    agent.status = "idle";
    await fireTurn("chat-6");
    stop();
    expect((await readTask("task-6"))?.status).toBe("done");
    const cards = groupCards(appended);
    expect(cards).toHaveLength(1);
    expect((cards[0]!.data as { status?: string }).status).toBe("done");
  });

  describe("timeline window lookup", () => {
    const asPaseo = (fake: unknown) => fake as unknown as PaseoApi;
    const plugin = (kind: string, data: unknown) => ({ type: "plugin", pluginId: "paseo-bots", kind, version: 1, data });

    it("finds a real-shape card by taskId and version", async () => {
      const { openTask, upsertMember, readTask } = await import("../server/tasks");
      const { settleAndPublish, publishTaskCard } = await import("../server/task-cards");
      const { taskCardOf } = await import("../shared/task-card");
      const { paseo, appended } = fakePaseo();
      await openTask({ taskId: "task-window", title: "Window", acceptance: "once" });
      await upsertMember("task-window", { engine: "paseo-bot", handleId: "chat-w", status: "done" });
      await settleAndPublish(fakeTeamHost(paseo), "task-window", "group-chat");
      const before = appended.length;
      expect(await publishTaskCard(asPaseo(paseo), "group-chat", taskCardOf((await readTask("task-window"))!))).toBe("exists");
      expect(appended.length).toBe(before);
    });

    it("appends when the same taskId is only on a different version", async () => {
      const { openTask, upsertMember, readTask } = await import("../server/tasks");
      const { settleAndPublish, publishTaskCard } = await import("../server/task-cards");
      const { taskCardOf } = await import("../shared/task-card");
      const { paseo } = fakePaseo();
      await openTask({ taskId: "task-version", title: "Version", acceptance: "twice" });
      await upsertMember("task-version", { engine: "paseo-bot", handleId: "chat-v", status: "done" });
      await settleAndPublish(fakeTeamHost(paseo), "task-version", "group-chat");
      const current = taskCardOf((await readTask("task-version"))!);
      expect(await publishTaskCard(asPaseo(paseo), "group-chat", { ...current, version: current.version + 1 })).toBe("appended");
    });

    it("does not read a task-member entry as a published card", async () => {
      const { publishTaskCard } = await import("../server/task-cards");
      const { paseo, raw, appended } = fakePaseo();
      raw.push(plugin("task-member", { taskId: "task-kind", handleId: "chat-k", status: "blocked_dead", at: "2026-01-01T00:00:00.000Z" }));
      const card = { taskId: "task-kind", title: "Kind", status: "done" as const, summary: "0 done", memberCount: 0, engines: [], settledAt: null, version: 1 };
      expect(await publishTaskCard(asPaseo(paseo), "group-chat", card)).toBe("appended");
      expect(appended).toHaveLength(1);
    });

    it("ignores malformed entries instead of throwing", async () => {
      const { publishTaskCard } = await import("../server/task-cards");
      const { paseo, raw, appended } = fakePaseo();
      raw.push({ type: "plugin", pluginId: "paseo-bots", kind: "task-card", version: 1 });
      raw.push({ item: null });
      raw.push(null);
      const card = { taskId: "task-broken", title: "Broken", status: "done" as const, summary: "0 done", memberCount: 0, engines: [], settledAt: null, version: 1 };
      expect(await publishTaskCard(asPaseo(paseo), "group-chat", card)).toBe("appended");
      expect(appended).toHaveLength(1);
    });

    it("finds a real-shape receipt by taskId and handleId", async () => {
      const { publishMemberReceipt } = await import("../server/task-cards");
      const { paseo, appended } = fakePaseo();
      const receipt = { taskId: "task-receipt", handleId: "chat-r", status: "blocked_dead" as const, at: "2026-01-01T00:00:00.000Z" };
      expect(await publishMemberReceipt(asPaseo(paseo), "group-chat", receipt)).toBe("appended");
      expect(await publishMemberReceipt(asPaseo(paseo), "group-chat", receipt)).toBe("exists");
      expect(appended).toHaveLength(1);
    });
  });

});
