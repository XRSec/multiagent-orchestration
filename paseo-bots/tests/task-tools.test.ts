import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BotsHost } from "../server/host";
import type { ToolCaller } from "../server/tools/mcp";

// Task files live under $PASEO_HOME/plugin-data, so every case gets a throwaway home.
let home = "";
const previousHome = process.env.PASEO_HOME;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "paseo-bots-task-tools-"));
  process.env.PASEO_HOME = home;
});
afterAll(() => {
  if (previousHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = previousHome;
  rmSync(home, { recursive: true, force: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});

interface Appended { agentId: string; id?: string; kind?: string; data?: unknown }

function fakePaseo(options: { chats?: Record<string, { botId: string }>; leadChat?: string | null; failAppend?: boolean } = {}) {
  const appended: Appended[] = [];
  const send = vi.fn(async () => {});
  const list = vi.fn(async () => ({
    entries: options.leadChat ? [{ agent: { id: options.leadChat } }] : [],
    pageInfo: { hasMore: false, nextCursor: null },
  }));
  const paseo = {
    agents: {
      list,
      ref: (id: string) => ({
        refresh: async () => ({ agent: { id, title: null, lastError: null, pendingPermissions: [], archivedAt: null, labels: {}, metadata: {}, status: "idle" } }),
        send,
        timeline: {
          append: async (input: { id?: string; kind?: string; data?: unknown }) => {
            if (options.failAppend) throw new Error("timeline append failed");
            appended.push({ agentId: id, ...input });
          },
          refetch: async () => ({ entries: appended.map((entry) => ({ id: entry.id, item: { type: "plugin", id: entry.id } })) }),
        },
      }),
    },
  };
  return { paseo, appended, send, list };
}

function fakeHost(paseo: unknown, groups = [{ id: "team-1", leadId: "bot-moadmin", memberIds: ["bot-mocode"] }]): BotsHost {
  return {
    paseo,
    attach() {},
    onAttach: () => () => {},
    chatOf: async (agentId: string) => ({ botId: agentId === "mo-code-chat" ? "bot-mocode" : "bot-moadmin", title: null, routineId: null, labels: {} }),
    values: async () => ({ groups }),
    requirePaseo: () => paseo,
    bots: async () => [],
    bot: async () => null,
  } as unknown as BotsHost;
}

function fakeCaller(host: BotsHost): ToolCaller {
  return { bot: { id: "bot-mocode", name: "moCode" }, agentId: "mo-code-chat", host, relay: {} } as unknown as ToolCaller;
}

describe("task line fanout", () => {
  it("refuses a dispatch past the fanout cap and frees a slot when a member finishes", async () => {
    const { openTask, reserveMemberSlot, upsertMember } = await import("../server/tasks");
    await openTask({ taskId: "task-cap", title: "Cap", acceptance: "three partners", budget: { fanout: 2 } });
    const first = await reserveMemberSlot("task-cap", { engine: "paseo-bot", handleId: "chat-a", status: "issued" });
    const second = await reserveMemberSlot("task-cap", { engine: "paseo-bot", handleId: "chat-b", status: "issued" });
    const refused = await reserveMemberSlot("task-cap", { engine: "paseo-bot", handleId: "chat-c", status: "issued" });
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    expect(refused).toMatchObject({ accepted: false, reason: "fanout", inFlight: 2, cap: 2 });
    await upsertMember("task-cap", { engine: "paseo-bot", handleId: "chat-a", status: "done" });
    expect((await reserveMemberSlot("task-cap", { engine: "paseo-bot", handleId: "chat-c", status: "issued" })).accepted).toBe(true);
  });

  it("lets two concurrent dispatches in but not three", async () => {
    const { openTask, reserveMemberSlot } = await import("../server/tasks");
    await openTask({ taskId: "task-race", title: "Race", budget: { fanout: 2 } });
    const results = await Promise.all(
      ["chat-1", "chat-2", "chat-3"].map((handleId) => reserveMemberSlot("task-race", { engine: "paseo-bot", handleId, status: "issued" })),
    );
    expect(results.filter((result) => result.accepted)).toHaveLength(2);
  });

  it("refuses to dispatch into a settled line", async () => {
    const { openTask, reserveMemberSlot, upsertMember, settleTask } = await import("../server/tasks");
    await openTask({ taskId: "task-closed", title: "Closed", acceptance: "done" });
    await upsertMember("task-closed", { engine: "paseo-bot", handleId: "chat-1", status: "done" });
    await settleTask("task-closed", { status: "done" });
    expect(await reserveMemberSlot("task-closed", { engine: "paseo-bot", handleId: "chat-2", status: "issued" }))
      .toMatchObject({ accepted: false, reason: "settled" });
  });

  it("will not settle a line while a native member is still open", async () => {
    const { openTask, upsertMember, evaluateTask } = await import("../server/tasks");
    await openTask({ taskId: "task-native", title: "Mixed", acceptance: "both engines" });
    await upsertMember("task-native", { engine: "native", status: "issued" });
    expect(await evaluateTask("task-native")).toMatchObject({ settled: false });
    await upsertMember("task-native", { engine: "native", status: "done" });
    expect((await evaluateTask("task-native")).record.status).toBe("done");
  });

  it("refuses a team the caller is not on, before anything is written", async () => {
    const { openTaskTool } = await import("../server/tools/tasks");
    const { readTask } = await import("../server/tasks");
    const caller = fakeCaller(fakeHost(fakePaseo().paseo));
    await expect(openTaskTool.run({ title: "Wrong team", group_id: "team-other" }, caller)).rejects.toThrow("not on team");
    expect(await readTask("task-x")).toBeNull();
  });

  it("never blocks a follow-up to a partner already counted", async () => {
    const { openTask, reserveMemberSlot } = await import("../server/tasks");
    await openTask({ taskId: "task-refresh", title: "Refresh", budget: { fanout: 1 } });
    await reserveMemberSlot("task-refresh", { engine: "paseo-bot", handleId: "chat-1", status: "running" });
    expect((await reserveMemberSlot("task-refresh", { engine: "paseo-bot", handleId: "chat-1", status: "running" })).accepted).toBe(true);
  });
});

describe("task line tools", () => {
  it("opens a line, hands back its id, and lists it without repeating itself", async () => {
    const { openTaskTool, listTasksTool } = await import("../server/tools/tasks");
    const { readTask } = await import("../server/tasks");
    const host = fakeHost(fakePaseo().paseo);
    const caller = fakeCaller(host);
    const opened = await openTaskTool.run({ title: "Ship the audit", acceptance: "report", fanout: 3 }, caller);
    const taskId = /task_id "([^"]+)"/.exec(opened)?.[1];
    expect(taskId).toMatch(/^task-[0-9a-f]{8}$/);
    expect(opened).toContain("partners 0/3 in flight");
    const again = await openTaskTool.run({ title: "Ship the audit", acceptance: "report", fanout: 3, task_id: taskId }, caller);
    expect(again).toContain(`Task ${taskId} is issued at version 1`);
    expect((await readTask(taskId!))?.members).toHaveLength(0);
    expect(await listTasksTool.run({}, caller)).toContain(`${taskId} [issued] partners 0/3`);
  });

  it("stays inside its listing budget when many lines exist", async () => {
    const { listTasksTool } = await import("../server/tools/tasks");
    const { openTask } = await import("../server/tasks");
    for (let index = 0; index < 25; index++) await openTask({ taskId: `task-bulk-${index}`, title: `Bulk ${index}` });
    const listed = await listTasksTool.run({ limit: 20 }, fakeCaller(fakeHost(fakePaseo().paseo)));
    expect(listed.length).toBeLessThanOrEqual(2000);
    expect(listed.split("\n").length).toBeLessThanOrEqual(20);
  });

  it("says so when there is nothing to list", async () => {
    const { listTasksTool } = await import("../server/tools/tasks");
    const empty = await listTasksTool.run({}, fakeCaller(fakeHost(fakePaseo().paseo)));
    expect(empty.length).toBeGreaterThan(0);
    const missing = await listTasksTool.run({ status: "retired" }, fakeCaller(fakeHost(fakePaseo().paseo)));
    expect(missing).toContain("No task line is retired");
  });
});

describe("group card routing", () => {
  it("sends the card to the lead's chat, not to the partner that did the work", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { settleAndPublish } = await import("../server/task-cards");
    const { paseo, appended } = fakePaseo({ leadChat: "mo-admin-chat" });
    const host = fakeHost(paseo);
    await openTask({ taskId: "task-route", title: "Route", acceptance: "one card" });
    await upsertMember("task-route", { engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-worker", status: "done" });
    expect(await settleAndPublish(host, "task-route", "mo-code-chat")).toEqual({ settled: true, published: true });
    expect(appended.filter((entry) => entry.kind === "task-card").map((entry) => entry.agentId)).toEqual(["mo-admin-chat"]);
    expect((await readTask("task-route"))?.cardAgentId).toBe("mo-admin-chat");
  });

  it("falls back to the requester when the lead has no chat", async () => {
    const { openTask, upsertMember } = await import("../server/tasks");
    const { settleAndPublish } = await import("../server/task-cards");
    const { paseo, appended } = fakePaseo({ leadChat: null });
    await openTask({ taskId: "task-fallback", title: "Fallback", acceptance: "one card" });
    await upsertMember("task-fallback", { engine: "paseo-bot", handleId: "chat-w", status: "done" });
    expect(await settleAndPublish(fakeHost(paseo), "task-fallback", "mo-code-chat")).toEqual({ settled: true, published: true });
    expect(appended.filter((entry) => entry.kind === "task-card").map((entry) => entry.agentId)).toEqual(["mo-code-chat"]);
  });

  it("refuses a replay from the recorded card id even after the timeline window moved", async () => {
    const { openTask, upsertMember, readTask, recordPublishedCard } = await import("../server/tasks");
    const { settleAndPublish } = await import("../server/task-cards");
    const { taskCardId } = await import("../shared/task-card");
    const { paseo, appended } = fakePaseo({ leadChat: "mo-admin-chat" });
    const host = fakeHost(paseo);
    await openTask({ taskId: "task-window", title: "Window", acceptance: "once" });
    await upsertMember("task-window", { engine: "paseo-bot", handleId: "chat-w", status: "done" });
    const settled = await readTask("task-window");
    await recordPublishedCard("task-window", taskCardId("task-window", (settled?.version ?? 0) + 1));
    // A host whose timeline shows nothing at all: the record, not the window, decides.
    const blind = { ...paseo, agents: { ...paseo.agents, ref: (id: string) => ({ ...paseo.agents.ref(id), timeline: { append: async () => {}, refetch: async () => ({ entries: [] }) } }) } };
    expect(await settleAndPublish(fakeHost(blind), "task-window", "mo-admin-chat")).toEqual({ settled: true, published: false });
    expect(appended.filter((entry) => entry.kind === "task-card")).toHaveLength(0);
  });
});
