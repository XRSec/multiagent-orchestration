import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BotsHost } from "../server/host";
import type { PluginServerContext } from "@getpaseo/plugin/server";

// Recovery reads real task files and a fake Paseo, so a restart is simulated by the file
// being older than the process rather than by mocking the task module.

let home = "";
const previousHome = process.env.PASEO_HOME;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "paseo-bots-recovery-"));
  process.env.PASEO_HOME = home;
});
afterAll(() => {
  if (previousHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = previousHome;
  rmSync(home, { recursive: true, force: true });
});

const REQUEST = "paseo-bots.handoff-request";
const REQUESTER = "group-chat";

interface FakeAgent {
  status?: string;
  pendingPermissions?: unknown[];
  archivedAt?: string | null;
  lastError?: string | null;
  labels?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

function fakePaseo(agents: Record<string, FakeAgent> = {}) {
  const append = vi.fn(async () => {});
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
              labels: { "paseo-bots.bot": "bot-mocode" },
              metadata: { [REQUEST]: { requesterBotId: "bot-moadmin", requesterAgentId: REQUESTER, notify: true } },
              ...agent,
            },
          };
        },
        send: vi.fn(async () => {}),
        timeline: { append, refetch: async () => ({ entries: [] }) },
      }),
    },
  };
  return { paseo, append };
}

function fakeHost(paseo: unknown) {
  const listeners: ((api: unknown) => void)[] = [];
  const host = {
    paseo,
    attach() {},
    onAttach(listener: (api: unknown) => void) {
      listeners.push(listener);
      return () => {};
    },
    chatOf: async () => ({ botId: "bot-mocode", title: null, routineId: null, labels: {} }),
    values: async () => ({ groups: [{ id: "team-1", leadId: "bot-moadmin", memberIds: ["bot-mocode"] }] }),
    requirePaseo: () => paseo,
    bots: async () => [],
    bot: async () => null,
  } as unknown as BotsHost;
  return { host, listeners };
}

function fakeServer() {
  const server = { addHook: () => () => {} } as unknown as PluginServerContext;
  return server;
}

/** A line that a previous process left open: the member never got its closing turn. */
async function openLine(taskId: string, handleId: string, status: "running" | "issued" = "running") {
  const { openTask, upsertMember, setCardAgent } = await import("../server/tasks");
  await openTask({ taskId, title: "Recovered line", acceptance: "All partners report." });
  await upsertMember(taskId, { engine: "paseo-bot", botId: "bot-mocode", handleId, status });
  await setCardAgent(taskId, REQUESTER);
  return handleId;
}

function memberOf(record: { members: { handleId?: string; status: string }[] } | null, handleId: string) {
  return record?.members.find((member) => member.handleId === handleId);
}

describe("recovering an interrupted task line", () => {
  it("closes a running member whose agent is alive and clean, then settles the line", async () => {
    const { recoverInterrupted } = await import("../server/task-turns");
    const { readTask } = await import("../server/tasks");
    const { paseo } = fakePaseo({ "chat-alive": { status: "idle" } });
    const { host } = fakeHost(paseo);
    const handleId = await openLine("recover-done", "chat-alive");

    await recoverInterrupted(host, paseo as never);

    const record = await readTask("recover-done");
    expect(memberOf(record, handleId)?.status).toBe("done");
    expect(record?.settledAt).not.toBeNull();
    expect(record?.status).toBe("done");
  });

  it("marks a running member dead when its agent no longer exists", async () => {
    const { recoverInterrupted } = await import("../server/task-turns");
    const { readTask } = await import("../server/tasks");
    const { paseo } = fakePaseo({});
    const { host } = fakeHost(paseo);
    const handleId = await openLine("recover-lost", "chat-vanished");

    await recoverInterrupted(host, paseo as never);

    const record = await readTask("recover-lost");
    expect(memberOf(record, handleId)?.status).toBe("blocked_dead");
    expect(record?.status).toBe("blocked");
  });

  it("leaves a member alone while its agent is still running", async () => {
    const { recoverInterrupted } = await import("../server/task-turns");
    const { readTask } = await import("../server/tasks");
    const { paseo } = fakePaseo({ "chat-busy": { status: "running" } });
    const { host } = fakeHost(paseo);
    const handleId = await openLine("recover-busy", "chat-busy");

    await recoverInterrupted(host, paseo as never);

    const record = await readTask("recover-busy");
    expect(memberOf(record, handleId)?.status).toBe("running");
    expect(record?.settledAt).toBeNull();
  });

  it("kills a parked member only once its agent is gone", async () => {
    const { recoverInterrupted } = await import("../server/task-turns");
    const { readTask, upsertMember } = await import("../server/tasks");
    const { paseo } = fakePaseo({});
    const { host } = fakeHost(paseo);
    const handleId = await openLine("recover-parked", "chat-authorized-away");
    await upsertMember("recover-parked", { engine: "paseo-bot", botId: "bot-mocode", handleId, status: "blocked_permission" });

    await recoverInterrupted(host, paseo as never);

    const record = await readTask("recover-parked");
    expect(memberOf(record, handleId)?.status).toBe("blocked_dead");
    expect(record?.status).toBe("blocked");
  });

  it("keeps a parked member whose agent can still be approved", async () => {
    const { recoverInterrupted } = await import("../server/task-turns");
    const { readTask, upsertMember } = await import("../server/tasks");
    const { paseo } = fakePaseo({ "chat-waiting": { status: "idle", pendingPermissions: [{}] } });
    const { host } = fakeHost(paseo);
    const handleId = await openLine("recover-waiting", "chat-waiting");
    await upsertMember("recover-waiting", { engine: "paseo-bot", botId: "bot-mocode", handleId, status: "blocked_permission" });

    await recoverInterrupted(host, paseo as never);

    const record = await readTask("recover-waiting");
    expect(memberOf(record, handleId)?.status).toBe("blocked_permission");
    expect(record?.settledAt).toBeNull();
  });

  it("marks a running member dead when its agent is archived", async () => {
    const { recoverInterrupted } = await import("../server/task-turns");
    const { readTask } = await import("../server/tasks");
    const { paseo } = fakePaseo({ "chat-archived": { archivedAt: "2024-01-01T00:00:00.000Z" } });
    const { host } = fakeHost(paseo);
    const handleId = await openLine("recover-archived", "chat-archived");

    await recoverInterrupted(host, paseo as never);

    expect(memberOf(await readTask("recover-archived"), handleId)?.status).toBe("blocked_dead");
  });

  it("marks a running member failed when its agent carries a last error", async () => {
    const { recoverInterrupted } = await import("../server/task-turns");
    const { readTask } = await import("../server/tasks");
    const { paseo } = fakePaseo({ "chat-broken": { lastError: "the model refused the turn" } });
    const { host } = fakeHost(paseo);
    const handleId = await openLine("recover-failed", "chat-broken");

    await recoverInterrupted(host, paseo as never);

    const record = await readTask("recover-failed");
    expect(memberOf(record, handleId)?.status).toBe("failed");
    expect(record?.status).toBe("blocked");
  });

  it("leaves a settled line and its members exactly as they are", async () => {
    const { recoverInterrupted } = await import("../server/task-turns");
    const { openTask, upsertMember, readTask } = await import("../server/tasks");
    const { paseo } = fakePaseo({});
    const { host } = fakeHost(paseo);
    await openTask({ taskId: "recover-settled", title: "Closed already", acceptance: "Done." });
    await upsertMember("recover-settled", { engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-open", status: "running" });
    const before = await readTask("recover-settled");
    // A settled line is a closed fact; the member below it may look open and must stay untouched.
    const { settleTask } = await import("../server/tasks");
    await settleTask("recover-settled", { status: "done" });
    const settled = await readTask("recover-settled");

    await recoverInterrupted(host, paseo as never);

    const after = await readTask("recover-settled");
    expect(after).toEqual(settled);
    expect(after?.settledAt).toBe(settled?.settledAt);
    expect(memberOf(after, "chat-open")?.status).toBe(memberOf(before, "chat-open")?.status);
    expect(after?.version).toBe(settled?.version);
  });

  it("runs once per process, so two attaches do not double the writes", async () => {
    const { registerTaskTurns } = await import("../server/task-turns");
    const { readTask } = await import("../server/tasks");
    const { paseo } = fakePaseo({});
    const { host, listeners } = fakeHost(paseo);
    const handleId = await openLine("recover-once", "chat-once");
    const dispose = registerTaskTurns(fakeServer(), host);
    expect(listeners).toHaveLength(1);

    // Both attaches happen before the first recovery has finished its first await on purpose.
    listeners[0]!(paseo);
    listeners[0]!(paseo);
    const settled = await waitForSettled("recover-once");
    await new Promise((resolve) => setTimeout(resolve, 60));
    const after = await readTask("recover-once");
    dispose();

    // 1 open + 1 running + 1 recovered member + 1 settle. A second run would add one more.
    expect(after?.version).toBe(4);
    expect(after?.version).toBe(settled.version);
    expect(memberOf(after, handleId)?.status).toBe("blocked_dead");
  });
});

/** Recovery is fire-and-forget on attach, so the test waits for the settled fact. */
async function waitForSettled(taskId: string) {
  const { readTask } = await import("../server/tasks");
  for (let attempt = 0; attempt < 100; attempt++) {
    const record = await readTask(taskId);
    if (record?.settledAt) return record;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`The task line "${taskId}" was never settled by recovery.`);
}
