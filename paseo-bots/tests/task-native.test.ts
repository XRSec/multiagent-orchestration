import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { BotsHost } from "../server/host";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { taskFile } from "../server/tasks";

let home = "";
const previousHome = process.env.PASEO_HOME;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "paseo-bots-native-"));
  process.env.PASEO_HOME = home;
});
afterAll(() => {
  if (previousHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = previousHome;
  rmSync(home, { recursive: true, force: true });
});

const REQUEST = "paseo-bots.handoff-request";
/** The SDK shape: arguments live in `detail.input`, and only when `detail.type` is `unknown`. */
const subagent = (typeName: string) => ({
  type: "tool_call",
  callId: `call-${typeName}`,
  name: "invoke_subagent",
  status: "completed",
  error: null,
  detail: { type: "unknown", input: { TypeName: typeName, Role: "reviewer", Prompt: "look" }, output: {} },
});

function fakePaseo(items: unknown[], patch: { status?: string; lastError?: string | null } = {}) {
  const appended: { id?: string; kind?: string; data?: unknown }[] = [];
  const append = vi.fn(async (input: { id?: string; kind?: string; data?: unknown }) => {
    appended.push(input);
  });
  const send = vi.fn(async () => {});
  const paseo = {
    agents: {
      ref: (id: string) => ({
        refresh: async () => ({
          agent: {
            id,
            title: null,
            lastError: null,
            pendingPermissions: [],
            archivedAt: null,
            status: "idle",
            labels: { "paseo-bots.bot": "bot-mocode", "paseo-bots.asked-by": "bot-moadmin" },
            metadata: { [REQUEST]: { requesterBotId: "bot-moadmin", requesterAgentId: "group-chat", notify: true } },
            ...patch,
          },
        }),
        send,
        timeline: {
          append,
          refetch: async () => ({ entries: items.map((item) => ({ item })) }),
        },
      }),
    },
  };
  return { paseo, appended, send };
}

function fakeHost(paseo: unknown): BotsHost {
  const host = {
    paseo,
    attach() {},
    onAttach: () => () => {},
    chatOf: async () => ({ botId: "bot-mocode", title: null, routineId: null, labels: {} }),
    values: async () => ({ groups: [{ id: "team-1", leadId: "bot-moadmin", memberIds: ["bot-mocode"] }] }),
    requirePaseo: () => paseo,
    bots: async () => [{ id: "bot-mocode", name: "moCode" }, { id: "mogit", name: "moGit" }],
    bot: async () => null,
  } as unknown as BotsHost;
  return host;
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

const cards = (appended: { kind?: string; data?: unknown }[]) => appended.filter((entry) => entry.kind === "task-card");

async function seed(taskId: string, members: Parameters<typeof import("../server/tasks").upsertMember>[1][], acceptance: string | undefined = "checked") {
  const { openTask, upsertMember } = await import("../server/tasks");
  await openTask({ taskId, title: taskId, ...(acceptance ? { acceptance } : {}) });
  for (const member of members) await upsertMember(taskId, member);
}

async function fireTurn(items: unknown[], patch: { status?: string; lastError?: string | null } = {}, options: { registerFirst?: string } = {}) {
  const { registerTaskTurns } = await import("../server/task-turns");
  const { paseo, appended } = fakePaseo(items, patch);
  const host = fakeHost(paseo);
  const { server, hooks } = fakeServer();
  const stop = registerTaskTurns(server, host);
  await hooks.get("agent.turn.after")!({ agent: { id: "chat-parent" } }, { paseo });
  if (!options.registerFirst) stop();
  return { paseo, appended, stop };
}

describe("native members written back from the parent turn", () => {
  it("records the child as done and settles in the same turn", async () => {
    await seed("task-native", [{ engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-parent", status: "running" }]);
    const { appended } = await fireTurn([{ type: "user_message" }, subagent("bot-mocode")]);
    const { readTask } = await import("../server/tasks");
    const record = await readTask("task-native");
    expect(record?.members.filter((member) => member.engine === "native")).toEqual([expect.objectContaining({ botId: "bot-mocode", status: "done" })]);
    expect(record?.status).toBe("done");
    expect(cards(appended)).toHaveLength(1);
    expect((cards(appended)[0]!.data as { status?: string }).status).toBe("done");
  });

  it("merges two children of one bot into one member", async () => {
    await seed("task-twice", [{ engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-parent", status: "running" }]);
    await fireTurn([{ type: "user_message" }, subagent("bot-mocode"), subagent("moCode")]);
    const { readTask } = await import("../server/tasks");
    expect((await readTask("task-twice"))?.members.filter((member) => member.engine === "native")).toHaveLength(1);
  });

  it("fails the child when the turn carried an error and settles blocked", async () => {
    await seed("task-boom", [{ engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-parent", status: "running" }]);
    const { appended } = await fireTurn([{ type: "user_message" }, subagent("bot-mocode")], { lastError: "child crashed" });
    const { readTask } = await import("../server/tasks");
    const record = await readTask("task-boom");
    expect(record?.members.find((member) => member.engine === "native")?.status).toBe("failed");
    expect(record?.status).toBe("blocked");
    expect((cards(appended)[0]!.data as { status?: string }).status).toBe("blocked");
  });

  it("invents nothing when the turn called no subagent", async () => {
    await seed("task-quiet", [{ engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-parent", status: "running" }]);
    await fireTurn([{ type: "user_message" }, { type: "tool_call", name: "read_file", input: {} }]);
    const { readTask } = await import("../server/tasks");
    expect((await readTask("task-quiet"))?.members.some((member) => member.engine === "native")).toBe(false);
  });

  it("waits for a live partner before settling and then publishes one card", async () => {
    await seed("task-mixed", [{ engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-parent", status: "running" }]);
    const first = await fireTurn([{ type: "user_message" }, subagent("bot-mocode")], { status: "running" });
    const { readTask } = await import("../server/tasks");
    expect((await readTask("task-mixed"))?.settledAt).toBeNull();
    expect(cards(first.appended)).toHaveLength(0);
    first.stop();
    const second = await fireTurn([{ type: "user_message" }, subagent("bot-mocode")]);
    expect((await readTask("task-mixed"))?.status).toBe("done");
    expect(cards(second.appended)).toHaveLength(1);
  });

  it("keeps refusing to settle a native member that nobody closed", async () => {
    const { settleAndPublish } = await import("../server/task-cards");
    const { readTask } = await import("../server/tasks");
    const path = taskFile("task-wedge");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({
      taskId: "task-wedge",
      title: "Wedged",
      status: "running",
      acceptance: "never",
      version: 2,
      createdAt: "2026-11-10T00:00:00.000Z",
      updatedAt: "2026-11-10T00:00:00.000Z",
      settledAt: null,
      members: [
        { engine: "native", botId: "bot-mocode", status: "issued", updatedAt: "2026-11-10T00:00:00.000Z" },
        { engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-parent", status: "done", updatedAt: "2026-11-10T00:00:00.000Z" },
      ],
    }));
    const { paseo, appended } = fakePaseo([]);
    const host = fakeHost(paseo);
    expect(await settleAndPublish(host, "task-wedge", "group-chat")).toEqual({ settled: false, published: false });
    expect((await readTask("task-wedge"))?.settledAt).toBeNull();
    expect(cards(appended)).toHaveLength(0);
  });

  it("leaves a settled line alone when a later turn calls a subagent", async () => {
    await seed("task-done", [{ engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-parent", status: "done" }]);
    const { settleAndPublish } = await import("../server/task-cards");
    const probe = fakePaseo([]);
    await settleAndPublish(fakeHost(probe.paseo), "task-done", "group-chat");
    const before = probe.appended.length;
    await fireTurn([{ type: "user_message" }, subagent("bot-mocode")]);
    const { readTask } = await import("../server/tasks");
    const record = await readTask("task-done");
    expect(record?.members.some((member) => member.engine === "native")).toBe(false);
    expect(record?.status).toBe("done");
    expect(probe.appended.length).toBe(before);
  });
  it("reads the child bot from detail.input, not from the entry top level", async () => {
    await seed("task-mogit", [{ engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-parent", status: "running" }]);
    await fireTurn([{ type: "user_message" }, subagent("mogit")]);
    const { readTask } = await import("../server/tasks");
    expect((await readTask("task-mogit"))?.members.find((member) => member.engine === "native")).toEqual(
      expect.objectContaining({ botId: "mogit", status: "done" }),
    );
  });

  it("attributes a rendered detail to the parent bot without throwing", async () => {
    await seed("task-shell", [{ engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-parent", status: "running" }]);
    await fireTurn([{ type: "user_message" }, { type: "tool_call", callId: "call-1", name: "invoke_subagent", status: "completed", error: null, detail: { type: "shell", command: "ls" } }]);
    const { readTask } = await import("../server/tasks");
    expect((await readTask("task-shell"))?.members.find((member) => member.engine === "native")).toEqual(
      expect.objectContaining({ botId: "bot-mocode", status: "done" }),
    );
  });

  it("ignores a top-level input, because the SDK never puts one there", async () => {
    await seed("task-legacy-shape", [{ engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-parent", status: "running" }]);
    await fireTurn([{ type: "user_message" }, { type: "tool_call", name: "invoke_subagent", input: { TypeName: "mogit" } }]);
    const { readTask } = await import("../server/tasks");
    expect((await readTask("task-legacy-shape"))?.members.find((member) => member.engine === "native")?.botId).toBe("bot-mocode");
  });

  it("falls back to the parent bot for an unknown TypeName or a non-object input", async () => {
    await seed("task-odd", [{ engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-parent", status: "running" }]);
    await fireTurn([
      { type: "user_message" },
      { type: "tool_call", callId: "call-a", name: "invoke_subagent", status: "completed", error: null, detail: { type: "unknown", input: { TypeName: "nobody" }, output: {} } },
      { type: "tool_call", callId: "call-b", name: "invoke_subagent", status: "completed", error: null, detail: { type: "unknown", input: "not an object", output: {} } },
      { type: "tool_call", callId: "call-c", name: "invoke_subagent", status: "completed", error: null },
    ]);
    const { readTask } = await import("../server/tasks");
    const natives = (await readTask("task-odd"))?.members.filter((member) => member.engine === "native") ?? [];
    expect(natives).toHaveLength(1);
    expect(natives[0]?.botId).toBe("bot-mocode");
  });

  it("keeps two different child bots apart in one turn", async () => {
    await seed("task-pair", [{ engine: "paseo-bot", botId: "bot-mocode", handleId: "chat-parent", status: "running" }]);
    await fireTurn([{ type: "user_message" }, subagent("bot-mocode"), subagent("mogit")]);
    const { readTask } = await import("../server/tasks");
    const natives = (await readTask("task-pair"))?.members.filter((member) => member.engine === "native") ?? [];
    expect(natives.map((member) => member.botId).sort()).toEqual(["bot-mocode", "mogit"]);
    expect(natives.every((member) => member.status === "done")).toBe(true);
  });

});
