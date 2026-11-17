import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Task files live under $PASEO_HOME/plugin-data, so each run gets a throwaway home.
let home = "";
const previousHome = process.env.PASEO_HOME;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "paseo-bots-tasks-"));
  process.env.PASEO_HOME = home;
});
afterAll(() => {
  if (previousHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = previousHome;
  rmSync(home, { recursive: true, force: true });
});

const taskFolder = () => join(home, "plugin-data", "paseo-bots", "tasks");
const member = (handleId: string, status: "running" | "done" = "running", extra: Record<string, unknown> = {}) => ({ engine: "paseo-bot" as const, botId: "bot-mocode", handleId, status, ...extra });

describe("task lines on disk", () => {
  it("keeps one file per task, bumps the version and dedupes members", async () => {
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const first = await openTask({ taskId: "task-a", title: "Audit and prototype" });
    expect(first.version).toBe(1);
    expect(first.status).toBe("issued");
    expect(first.settledAt).toBeNull();
    const withMember = await upsertMember("task-a", member("chat-1"));
    expect(withMember.version).toBe(2);
    const again = await upsertMember("task-a", member("chat-1", "done"));
    expect(again.version).toBe(3);
    expect(again.members).toHaveLength(1);
    expect(again.members[0]!.status).toBe("done");
    const merged = await openTask({ taskId: "task-a", title: "Audit, prototype and review" });
    expect(merged.version).toBe(4);
    expect(merged.title).toBe("Audit, prototype and review");
    expect(readdirSync(taskFolder()).filter((name) => name.startsWith("task-a"))).toEqual(["task-a.json"]);
    expect((await readTask("task-a"))?.version).toBe(4);
  });

  it("settles once and never overwrites the terminal state", async () => {
    const { openTask, settleTask } = await import("../server/tasks");
    await openTask({ taskId: "task-b", title: "Two settlers" });
    const [one, two] = await Promise.all([settleTask("task-b", { status: "done" }), settleTask("task-b", { status: "blocked" })]);
    const settled = [one, two].filter((result) => result.settled);
    expect(settled).toHaveLength(1);
    const winner = settled[0]!;
    const loser = [one, two].find((result) => !result.settled)!;
    expect(loser.record.settledAt).toBe(winner.record.settledAt);
    expect(loser.record.status).toBe(winner.record.status);
    expect(winner.record.version).toBe(2);
  });

  it("restores the version and members after a restart", async () => {
    const before = await import("../server/tasks");
    await before.openTask({ taskId: "task-c", title: "Restart" });
    await before.upsertMember("task-c", { engine: "native", botId: "bot-mo", handleId: "child-1", status: "done" });
    vi.resetModules();
    const after = await import("../server/tasks");
    const restored = await after.readTask("task-c");
    expect(restored?.version).toBe(2);
    expect(restored?.members.map((entry) => entry.handleId)).toEqual(["child-1"]);
    expect(await after.readTask("task-c")).toEqual(restored);
  });

  it("refuses a write that would move the version backwards", async () => {
    const { openTask, upsertMember } = await import("../server/tasks");
    await openTask({ taskId: "task-d", title: "Version gate" });
    await upsertMember("task-d", member("chat-9"));
    await expect(upsertMember("task-d", member("chat-9", "done"), { expectedVersion: 1 })).rejects.toThrow(/version 1 would move it backwards/);
    expect((await (await import("../server/tasks")).readTask("task-d"))?.version).toBe(2);
  });

  it("prunes only settled files outside the window", async () => {
    const { openTask, settleTask, pruneSettled, readTask, taskFile, PRUNE_SETTLED_MS } = await import("../server/tasks");
    await openTask({ taskId: "task-old", title: "Old" });
    await settleTask("task-old", { status: "done" });
    // A fresh settlement stays: the floor is what keeps a published card readable.
    expect(await pruneSettled(0)).toBe(0);
    const aged = await readTask("task-old");
    writeFileSync(taskFile("task-old"), JSON.stringify({ ...aged, settledAt: new Date(Date.now() - PRUNE_SETTLED_MS - 1000).toISOString() }));
    expect(await pruneSettled(0)).toBe(1);
    expect(await readTask("task-old")).toBeNull();
    await openTask({ taskId: "task-live", title: "Live" });
    expect((await readTask("task-live"))?.status).toBe("issued");
  });

  it("writes no timeline entry and publishes no card", async () => {
    const append = vi.fn(async () => {});
    const send = vi.fn(async () => {});
    const { openTask, upsertMember, settleTask } = await import("../server/tasks");
    await openTask({ taskId: "task-e", title: "Silent" });
    await upsertMember("task-e", member("chat-e"));
    await settleTask("task-e", { status: "done" });
    expect(append).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it("reads a pre-split blocked member as blocked_dead without rewriting the file", async () => {
    const { taskFile, readTask } = await import("../server/tasks");
    const path = taskFile("task-legacy");
    mkdirSync(dirname(path), { recursive: true });
    const raw = JSON.stringify({
      taskId: "task-legacy",
      title: "Legacy",
      status: "running",
      version: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      settledAt: null,
      members: [{ engine: "paseo-bot", handleId: "chat-old", status: "blocked", updatedAt: "2026-01-01T00:00:00.000Z" }],
    });
    writeFileSync(path, raw);
    expect((await readTask("task-legacy"))?.members[0]!.status).toBe("blocked_dead");
    expect(readFileSync(path, "utf8")).toBe(raw);
  });

  it("counts a permission wait as a slot and a dead member as a free one", async () => {
    const { openTask, upsertMember, reserveMemberSlot } = await import("../server/tasks");
    await openTask({ taskId: "task-hold", title: "Holding", budget: { fanout: 1 } });
    await upsertMember("task-hold", { engine: "paseo-bot", handleId: "chat-hold", status: "blocked_permission" });
    expect(await reserveMemberSlot("task-hold", { engine: "paseo-bot", handleId: "chat-next", status: "issued" })).toMatchObject({ accepted: false, reason: "fanout", inFlight: 1, cap: 1 });
    await openTask({ taskId: "task-free", title: "Free", budget: { fanout: 1 } });
    await upsertMember("task-free", { engine: "paseo-bot", handleId: "chat-dead", status: "blocked_dead" });
    expect((await reserveMemberSlot("task-free", { engine: "paseo-bot", handleId: "chat-next", status: "issued" })).accepted).toBe(true);
  });

});
