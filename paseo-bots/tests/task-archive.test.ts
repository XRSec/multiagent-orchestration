import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BotsHost } from "../server/host";
import type { PluginServerContext } from "@getpaseo/plugin/server";

let home = "";
const previousHome = process.env.PASEO_HOME;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "paseo-bots-archive-"));
  process.env.PASEO_HOME = home;
});
afterAll(() => {
  if (previousHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = previousHome;
  rmSync(home, { recursive: true, force: true });
});

const REQUEST = "paseo-bots.handoff-request";

function fakePaseo(agents: Record<string, { status?: string; pendingPermissions?: unknown[]; archivedAt?: string | null; lastError?: string | null }> = {}) {
  const appended: { id?: string; kind?: string; data?: unknown }[] = [];
  const raw: unknown[] = [];
  const append = vi.fn(async (input: { id?: string; kind?: string; data?: unknown }) => {
    appended.push(input);
  });
  const send = vi.fn(async () => {});
  const paseo = {
    agents: {
      ref: (id: string) => ({
        refresh: async () => {
          const agent = agents[id];
          if (!agent) return null;
          return {
            agent: {
              id,
              title: null,
              lastError: null,
              pendingPermissions: [],
              archivedAt: null,
              status: "idle",
              labels: { "paseo-bots.bot": "bot-mocode", "paseo-bots.asked-by": "bot-moadmin" },
              metadata: { [REQUEST]: { requesterBotId: "bot-moadmin", requesterAgentId: "group-chat", notify: true } },
              ...agent,
            },
          };
        },
        send,
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
  return { paseo, appended, send, raw };
}

function fakeHost(paseo: unknown): BotsHost {
  return {
    paseo,
    attach() {},
    onAttach: () => () => {},
    chatOf: async (agentId: string) => ({ botId: agentId === "group-chat" ? "bot-moadmin" : "bot-mocode", title: null, routineId: null, labels: {} }),
    values: async () => ({ groups: [{ id: "team-1", leadId: "bot-moadmin", memberIds: ["bot-mocode"] }] }),
    requirePaseo: () => paseo,
    bots: async () => [],
    bot: async () => null,
  } as unknown as BotsHost;
}

function fakeServer() {
  const hooks = new Map<string, (event: unknown, context: { paseo: unknown }) => Promise<void>>();
  const server = {
    addHook: (name: string, handler: (event: unknown, context: { paseo: unknown }) => Promise<void>) => {
      hooks.set(name, handler);
      return () => {};
    },
  } as unknown as PluginServerContext;
  return { server, hooks };
}

const groupCards = (appended: { kind?: string; data?: unknown }[]) => appended.filter((entry) => entry.kind === "task-card");
const receipts = (appended: { id?: string; kind?: string }[]) => appended.filter((entry) => entry.kind === "task-member");

describe("member archive write-back", () => {
  it("marks the member dead, writes one receipt on the task line, and settles nothing yet", async () => {
    const { openTask, upsertMember, readTask, reserveMemberSlot } = await import("../server/tasks");
    const { registerTaskTurns } = await import("../server/task-turns");
    const { paseo, appended, send } = fakePaseo({ "chat-lost": {} });
    const host = fakeHost(paseo);
    const { server, hooks } = fakeServer();
    await openTask({ taskId: "task-lost", title: "Partner died", budget: { fanout: 1 } });
    await upsertMember("task-lost", { engine: "paseo-bot", handleId: "chat-lost", status: "running" });
    const stop = registerTaskTurns(server, host);
    await hooks.get("agent.archive.after")!({ agent: { id: "chat-lost" }, archivedAt: "2026-11-10T00:00:00.000Z" }, { paseo });
    stop();
    const record = await readTask("task-lost");
    expect(record?.members[0]!.status).toBe("blocked_dead");
    expect(receipts(appended).map((entry) => entry.id)).toEqual(["task-member:task-lost:chat-lost"]);
    expect(groupCards(appended)).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
    // The dead member no longer occupies the only slot.
    expect((await reserveMemberSlot("task-lost", { engine: "paseo-bot", handleId: "chat-next", status: "issued" })).accepted).toBe(true);
  });

  it("writes the receipt once when the same archive arrives twice", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { registerTaskTurns } = await import("../server/task-turns");
    const { paseo, appended } = fakePaseo({ "chat-twice": {} });
    const host = fakeHost(paseo);
    const { server, hooks } = fakeServer();
    await openTask({ taskId: "task-twice", title: "Twice" });
    await upsertMember("task-twice", { engine: "paseo-bot", handleId: "chat-twice", status: "running" });
    const stop = registerTaskTurns(server, host);
    for (let index = 0; index < 2; index += 1) {
      await hooks.get("agent.archive.after")!({ agent: { id: "chat-twice" }, archivedAt: "2026-11-10T00:00:00.000Z" }, { paseo });
    }
    stop();
    expect(await readTask("task-twice")).toBeTruthy();
    expect(receipts(appended)).toHaveLength(1);
  });

  it("says nothing when the archived agent belongs to no task line", async () => {
    const { registerTaskTurns } = await import("../server/task-turns");
    const { paseo, appended } = fakePaseo({ "chat-stranger": {} });
    const host = fakeHost(paseo);
    const { server, hooks } = fakeServer();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const stop = registerTaskTurns(server, host);
    await hooks.get("agent.archive.after")!({ agent: { id: "chat-stranger" }, archivedAt: "2026-11-10T00:00:00.000Z" }, { paseo });
    stop();
    expect(appended).toHaveLength(0);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("settles the line as blocked and publishes exactly one group card", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { registerTaskTurns } = await import("../server/task-turns");
    const { paseo, appended } = fakePaseo({ "chat-gone": {} });
    const host = fakeHost(paseo);
    const { server, hooks } = fakeServer();
    await openTask({ taskId: "task-gone", title: "Gone", acceptance: "a receipt" });
    await upsertMember("task-gone", { engine: "paseo-bot", handleId: "chat-gone", status: "running" });
    const stop = registerTaskTurns(server, host);
    await hooks.get("agent.archive.after")!({ agent: { id: "chat-gone" }, archivedAt: "2026-11-10T00:00:00.000Z" }, { paseo });
    stop();
    expect((await readTask("task-gone"))?.status).toBe("blocked");
    const cards = groupCards(appended);
    expect(cards).toHaveLength(1);
    expect((cards[0]!.data as { status?: string }).status).toBe("blocked");
    expect(receipts(appended)).toHaveLength(1);
  });

  it("leaves a settled line and its members untouched", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { settleAndPublish } = await import("../server/task-cards");
    const { registerTaskTurns } = await import("../server/task-turns");
    const { paseo, appended } = fakePaseo({ "chat-closed": {} });
    const host = fakeHost(paseo);
    const { server, hooks } = fakeServer();
    await openTask({ taskId: "task-closed", title: "Closed", acceptance: "done" });
    await upsertMember("task-closed", { engine: "paseo-bot", handleId: "chat-closed", status: "done" });
    await settleAndPublish(host, "task-closed", "group-chat");
    const before = appended.length;
    const stop = registerTaskTurns(server, host);
    await hooks.get("agent.archive.after")!({ agent: { id: "chat-closed" }, archivedAt: "2026-11-10T00:00:00.000Z" }, { paseo });
    stop();
    expect((await readTask("task-closed"))?.members[0]!.status).toBe("done");
    expect(appended.length).toBe(before);
  });
  it("treats an archive after a finished turn as closure, not death", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { registerTaskTurns } = await import("../server/task-turns");
    const { paseo, appended } = fakePaseo({ "chat-closed-ok": { status: "idle" } });
    const host = fakeHost(paseo);
    const { server, hooks } = fakeServer();
    await openTask({ taskId: "task-closed-ok", title: "Closed after finishing", acceptance: "signed off" });
    await upsertMember("task-closed-ok", { engine: "paseo-bot", handleId: "chat-closed-ok", status: "done" });
    const stop = registerTaskTurns(server, host);
    await hooks.get("agent.archive.after")!({ agent: { id: "chat-closed-ok" }, archivedAt: "2026-11-10T00:00:00.000Z" }, { paseo });
    stop();
    expect((await readTask("task-closed-ok"))?.members[0]!.status).toBe("done");
    expect(receipts(appended)).toHaveLength(0);
    const cards = groupCards(appended);
    expect(cards).toHaveLength(1);
    expect((cards[0]!.data as { status?: string }).status).toBe("done");
  });

  it("kills a member archived while it waited for approval", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { registerTaskTurns } = await import("../server/task-turns");
    const { paseo, appended } = fakePaseo({ "chat-wait": { status: "idle", pendingPermissions: [{}] } });
    const host = fakeHost(paseo);
    const { server, hooks } = fakeServer();
    await openTask({ taskId: "task-wait", title: "Waiting when closed", acceptance: "approved" });
    await upsertMember("task-wait", { engine: "paseo-bot", handleId: "chat-wait", status: "blocked_permission" });
    const stop = registerTaskTurns(server, host);
    await hooks.get("agent.archive.after")!({ agent: { id: "chat-wait" }, archivedAt: "2026-11-10T00:00:00.000Z" }, { paseo });
    stop();
    expect((await readTask("task-wait"))?.members[0]!.status).toBe("blocked_dead");
    expect(receipts(appended)).toHaveLength(1);
    expect((groupCards(appended)[0]!.data as { status?: string }).status).toBe("blocked");
  });

  it("kills a member archived before it ever ran", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { registerTaskTurns } = await import("../server/task-turns");
    const { paseo, appended } = fakePaseo({ "chat-issued": { status: "initializing" } });
    const host = fakeHost(paseo);
    const { server, hooks } = fakeServer();
    await openTask({ taskId: "task-issued", title: "Never started" });
    await upsertMember("task-issued", { engine: "paseo-bot", handleId: "chat-issued", status: "issued" });
    const stop = registerTaskTurns(server, host);
    await hooks.get("agent.archive.after")!({ agent: { id: "chat-issued" }, archivedAt: "2026-11-10T00:00:00.000Z" }, { paseo });
    stop();
    expect((await readTask("task-issued"))?.members[0]!.status).toBe("blocked_dead");
    expect(receipts(appended)).toHaveLength(1);
    expect(groupCards(appended)).toHaveLength(0);
  });

  it("treats an archived chat carrying an error as dead even when the member looks done", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { registerTaskTurns } = await import("../server/task-turns");
    const { paseo, appended } = fakePaseo({ "chat-error": { status: "idle", lastError: "connection reset" } });
    const host = fakeHost(paseo);
    const { server, hooks } = fakeServer();
    await openTask({ taskId: "task-error", title: "Answered badly", acceptance: "checked" });
    await upsertMember("task-error", { engine: "paseo-bot", handleId: "chat-error", status: "done" });
    const stop = registerTaskTurns(server, host);
    await hooks.get("agent.archive.after")!({ agent: { id: "chat-error" }, archivedAt: "2026-11-10T00:00:00.000Z" }, { paseo });
    stop();
    expect((await readTask("task-error"))?.members[0]!.status).toBe("blocked_dead");
    expect(receipts(appended)).toHaveLength(1);
    expect((groupCards(appended)[0]!.data as { status?: string }).status).toBe("blocked");
  });

});
