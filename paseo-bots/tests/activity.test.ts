import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { journalSummary, lastTurn, logLine, matchesAll, parseLog, parseSince, recentWork, redactSecrets, searchWords, snippet } from "../shared/activity";
import { lineDiff } from "../shared/diff";
import { newUuid } from "../shared/uuid";
import { fakeHost, makeBot } from "./helpers";
import { SESSION_ROLE_LABEL } from "../shared/chat";
import { ASKED_BY_LABEL } from "../shared/handoff";
import { WORKFLOW_STAGE_LABEL, WORKFLOW_TASK_LABEL } from "../server/workflow-runner";
import { MEMORY_CURATION_LABEL } from "../server/memory-curator";
import { WORKER_PROTOCOL_SUFFIX } from "../shared/workflows";

const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute);

describe("daily log lines", () => {
  it("takes the last reply and the tools of the latest turn", () => {
    const turn = lastTurn([
      { type: "user_message", text: "old" },
      { type: "assistant_message", text: "old answer" },
      { type: "user_message", text: "Check my inbox" },
      { type: "tool_call", name: "mcp__apps__COMPOSIO_SEARCH_TOOLS" },
      { type: "assistant_message", text: "Looking." },
      { type: "tool_call", name: "Read" },
      { type: "tool_call", name: "Read" },
      { type: "assistant_message", text: "Three new mails." },
    ]);
    expect(turn).toEqual({ reply: "Three new mails.", tools: ["apps/COMPOSIO_SEARCH_TOOLS", "Read"] });
  });

  it("writes one folded, redacted line per turn", () => {
    expect(logLine({ at: at(27, 9, 5), chat: 'Inbox "daily"', reply: "Sent it.\nKey sk-abcdefghijklmnopqrstuv is set.", tools: ["Read"] })).toBe(
      '- 09:05 · from chat "Inbox \'daily\'" · Sent it. Key [redacted] is set. [tools: Read]',
    );
    expect(logLine({ at: at(27, 9, 5), chat: "x", reply: "  ", tools: [] })).toBeNull();
    expect(logLine({ at: at(27, 9, 5), chat: "x", reply: "", tools: [], failure: "rate limited" })).toBe('- 09:05 · from chat "x" · (turn failed: rate limited)');
    expect(logLine({ at: at(27, 9, 5), chat: "x", reply: "a".repeat(400), tools: [] })!.length).toBeLessThan(300);
    expect(redactSecrets("Bearer abcdefghijklmnopqrstuvwxyz0123 and ghp_abcdefghijklmnopqrstuvwxyz")).toBe("Bearer [redacted] and [redacted]");
  });

  it("briefs the newest line from each chat of the last two days", () => {
    const today = parseLog(
      "2026-09-27",
      ['- 08:00 · from chat "Inbox" · First. [tools: Read]', '- 09:30 · from chat "Inbox" · Sent the three invoices.', '- 10:00 · from chat "Report" · (turn failed: boom)', "a note the bot wrote"].join("\n"),
    );
    const earlier = parseLog("2026-09-26", '- 17:40 · from chat "Report" · Drafted the report.\n');
    const old = parseLog("2026-09-24", '- 12:00 · from chat "Old" · Too old.\n');
    expect(today).toHaveLength(3);
    expect(recentWork([...old, ...earlier, ...today], at(27, 12))).toEqual(['- today 09:30 · "Inbox" · you said: "Sent the three invoices."', '- yesterday 17:40 · "Report" · you said: "Drafted the report."']);
  });
});

describe("the journal's diff", () => {
  it("shows changed lines with two lines of context", () => {
    const before = ["# Memory", "a", "b", "c", "d", "e", "f"].join("\n") + "\n";
    const after = ["# Memory", "a", "b", "C", "d", "e", "f", "g"].join("\n") + "\n";
    const { diff, added, removed } = lineDiff(before, after);
    expect({ added, removed }).toEqual({ added: 2, removed: 1 });
    expect(diff).toBe(["@@ -2,6 +2,7 @@", " a", " b", "-c", "+C", " d", " e", " f", "+g"].join("\n"));
    expect(lineDiff("", "one\ntwo\n")).toMatchObject({ diff: "@@ -0,0 +1,2 @@\n+one\n+two", added: 2, removed: 0 });
    expect(lineDiff("same\n", "same\n")).toEqual({ diff: "", added: 0, removed: 0 });
  });
});

describe("search helpers", () => {
  it("matches every content word and marks them", () => {
    expect(searchWords("What did we decide about the Q3 invoices?")).toEqual(["decide", "q3", "invoices"]);
    expect(matchesAll("Invoices for Q3 are late", ["q3", "invoices"])).toBe(true);
    expect(matchesAll("Invoices are late", ["q3", "invoices"])).toBe(false);
    expect(snippet("The Q3 invoices went out.", ["q3", "invoices"])).toBe("The [Q3] [invoices] went out.");
  });

  it("reads time ranges", () => {
    const now = at(27, 12);
    expect(parseSince("24h", now)).toEqual(at(26, 12));
    expect(parseSince("today", now)).toEqual(at(27, 0));
    expect(parseSince("yesterday", now)).toEqual(at(26, 0));
    expect(parseSince("2w", now)).toEqual(at(13, 12));
    expect(parseSince("2026-09-01", now)).toEqual(at(1, 0));
    expect(() => parseSince("last tuesday", now)).toThrow("Couldn't read");
  });

  it("words journal rows the way the person reads them", () => {
    const row = { file: "MEMORY.md", actor: "bot" as const, via: "chat" as const, chat: { title: "x" }, kind: "edited" as const, added: 2, removed: 0 };
    expect(journalSummary(row, "Scout")).toBe("Scout added 2 lines to MEMORY.md");
    expect(journalSummary({ ...row, actor: "you", file: "clients.md", kind: "deleted" }, "Scout")).toBe("You deleted the clients topic");
    expect(journalSummary({ ...row, added: 3, removed: 1 }, "Scout")).toBe("Scout rewrote 3 lines in MEMORY.md");
  });
});

describe("memory journal, daily log and search_chats", () => {
  let home: string;
  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "paseo-bots-activity-"));
    process.env.PASEO_HOME = home;
  });
  afterAll(async () => {
    delete process.env.PASEO_HOME;
    await rm(home, { recursive: true, force: true });
  });

  it("refuses duplicate topic creation and stale saves or deletes inside the write queue", async () => {
    const { MemoryJournal } = await import("../server/journal");
    const { readMemory } = await import("../server/memory");
    const journal = new MemoryJournal();
    await journal.write("bot-cas", "topic.md", "original", "app", null);
    await expect(journal.write("bot-cas", "topic.md", "replacement", "app", null)).rejects.toThrow("already exists");
    const first = await readMemory("bot-cas", "topic.md");
    const [saved, stale] = await Promise.allSettled([
      journal.write("bot-cas", "topic.md", "newer", "app", first.revision),
      journal.write("bot-cas", "topic.md", "older", "app", first.revision),
    ]);
    expect(saved.status).toBe("fulfilled");
    expect(stale.status).toBe("rejected");
    await expect(journal.write("bot-cas", "topic.md", null, "app", first.revision)).rejects.toThrow("changed since");
    expect((await readMemory("bot-cas", "topic.md")).text).toBe("newer");
    expect(await readMemory("bot-cas", "missing.md")).toEqual({ text: "", revision: null });
  });

  it("journals the bot's edits during a turn, the person's edits, and undoes them", async () => {
    const { MemoryJournal } = await import("../server/journal");
    const { memoryFilePath } = await import("../server/memory");
    const journal = new MemoryJournal();
    const main = memoryFilePath("bot-j", "MEMORY.md");
    await mkdir(join(main, ".."), { recursive: true });
    await writeFile(main, "# Memory\n- likes tea\n");

    await journal.begin("bot-j");
    await writeFile(main, "# Memory\n- likes tea\n- works Mon-Fri\n");
    await mkdir(join(main, "..", "memory"), { recursive: true });
    await writeFile(memoryFilePath("bot-j", "clients.md"), "# Clients\n");
    await journal.end("bot-j", { id: "chat-1", title: "Setup" });

    let entries = await journal.list("bot-j");
    expect(entries.map((entry) => [entry.file, entry.actor, entry.kind, entry.added, entry.removed])).toEqual([
      ["clients.md", "bot", "created", 1, 0],
      ["MEMORY.md", "bot", "edited", 1, 0],
    ]);
    expect(entries[1]!.chat).toEqual({ id: "chat-1", title: "Setup" });

    // Changed outside the app between turns.
    await writeFile(main, "# Memory\n");
    await journal.begin("bot-j");
    entries = await journal.list("bot-j");
    expect(entries[0]).toMatchObject({ file: "MEMORY.md", actor: "you", via: "disk", removed: 2 });

    await journal.undo("bot-j", entries[0]!.id);
    expect(await readFile(main, "utf8")).toBe("# Memory\n- likes tea\n- works Mon-Fri\n");
    const created = (await journal.list("bot-j")).find((entry) => entry.kind === "created")!;
    await journal.undo("bot-j", created.id);
    await expect(readFile(memoryFilePath("bot-j", "clients.md"), "utf8")).rejects.toThrow();

    await journal.write("bot-j", "MEMORY.md", "# Memory\n- edited in the app\n");
    const latest = (await journal.list("bot-j"))[0]!;
    expect(latest).toMatchObject({ actor: "you", via: "app", kind: "edited" });
    expect((await journal.list("bot-j")).filter((entry) => entry.via === "undo")).toHaveLength(2);
  });

  it("logs finished turns of bot chats and searches chats and memory", async () => {
    const { turnEnded } = await import("../server/activity");
    const { MemoryJournal } = await import("../server/journal");
    const { listLogDays, recentLogEntries } = await import("../server/memory");
    const { searchChats } = await import("../server/tools/chats");
    const host = fakeHost([makeBot({ id: "bot-s", name: "Scout" })]);
    host.chatOf = async (agentId: string) => (agentId === "other-agent" ? null : { botId: "bot-s", title: "Invoices", routineId: null, labels: {} });
    const scheduler = { finished: async () => {} };
    const journal = new MemoryJournal();
    const agent = { id: newUuid(), workspaceId: null, parentAgentId: null, provider: "claude", cwd: "/", title: null };

    // Since Paseo 0.13 the hook's own `timeline` is always empty; the turn is read back from the chat.
    const items = [
      { type: "user_message", text: "Send the Q3 invoices" },
      { type: "tool_call", name: "mcp__apps__GMAIL_SEND", callId: "1", status: "completed", detail: { type: "unknown", input: null, output: null }, error: null },
      { type: "assistant_message", text: "Sent the three Q3 invoices to Acme." },
    ];
    const refetched: unknown[] = [];
    host.attach({
      agents: {
        ref: (id: string) => ({
          timeline: {
            refetch: async (options: unknown) => {
              refetched.push({ id, options });
              return { entries: items.map((item) => ({ item, timestamp: new Date().toISOString() })) };
            },
          },
        }),
      },
    } as never);
    const timeline = [] as never;
    await turnEnded(host, journal, scheduler, { agent, turnId: "t1", outcome: { kind: "completed" }, timeline });
    await turnEnded(host, journal, scheduler, { agent: { ...agent, id: "other-agent" }, turnId: "t2", outcome: { kind: "completed" }, timeline });
    await turnEnded(host, journal, scheduler, { agent, turnId: "t3", outcome: { kind: "canceled", reason: "stopped" }, timeline });
    expect(refetched).toEqual([
      { id: agent.id, options: { direction: "tail", projection: "projected", limit: 80 } },
      { id: agent.id, options: { direction: "tail", projection: "projected", limit: 80 } },
    ]);
    expect((await listLogDays("bot-s")).days).toEqual([{ day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), lines: 1 }]);
    const [entry] = await recentLogEntries("bot-s", 1);
    expect(entry).toMatchObject({ chat: "Invoices", text: "Sent the three Q3 invoices to Acme. [tools: apps/GMAIL_SEND]" });

    const current = newUuid();
    const past = { id: newUuid(), title: "Invoices", updatedAt: new Date().toISOString() };
    const entries = [
      { item: { type: "user_message", text: "Send the Q3 invoices" }, timestamp: new Date(Date.now() - 60_000).toISOString() },
      { item: { type: "assistant_message", text: "Sent the three Q3 invoices to Acme." }, timestamp: new Date().toISOString() },
    ];
    const listed: unknown[] = [];
    host.attach({
      agents: {
        list: async (options: unknown) => {
          listed.push(options);
          return { entries: [{ agent: { id: current, title: "Now", updatedAt: new Date().toISOString() } }, { agent: past }] };
        },
        ref: (id: string) => ({ timeline: { refetch: async () => ({ entries: id === past.id ? entries : [{ item: { type: "user_message", text: "q3 invoices again" }, timestamp: new Date().toISOString() }] }) } }),
      },
    } as never);
    const caller = { bot: makeBot({ id: "bot-s" }), agentId: current, host, relay: null as never };
    const found = await searchChats.run({ query: "q3 invoices" }, caller);
    expect(listed[0]).toMatchObject({ filter: { labels: { "paseo-bots.bot": "bot-s" }, includeArchived: true } });
    expect(found).toContain("Memory:\n- [memory/log/");
    expect(found).toContain(`chat "Invoices" (id: ${past.id}) · you] Sent the three [Q3] [invoices] to Acme.`);
    expect(found).toContain("· the user] Send the [Q3] [invoices]");
    expect(found).not.toContain("again");
    expect(await searchChats.run({ query: "unicorns" }, caller)).toBe("Nothing matched.");
    await expect(searchChats.run({}, caller)).rejects.toThrow("Give a few words");
  });

  it("detects memory signals and triggers fallback curation only when memory was untouched", async () => {
    const { hasMemorySignal } = await import("../shared/activity");
    const { turnEnded } = await import("../server/activity");
    const { MemoryJournal } = await import("../server/journal");

    expect(hasMemorySignal("记住以后用中文回复")).toBe(true);
    expect(hasMemorySignal("Please remember I prefer concise diffs")).toBe(true);
    expect(hasMemorySignal("What is the weather today?")).toBe(false);

    const host = fakeHost([makeBot({ id: "bot-m", name: "Memo" })]);
    host.chatOf = async () => ({ botId: "bot-m", title: "Prefs", routineId: null, labels: {} });
    const scheduler = { finished: async () => {} };
    const journal = new MemoryJournal();
    await journal.begin("bot-m");

    const curated: string[] = [];
    const curator = {
      isCurationAgent: (id: string) => id === "curation-agent",
      curateTurnFallback: async (input: { agentId: string; userText: string }) => {
        curated.push(input.agentId);
        return true;
      },
    };

    const timeline = [
      { type: "user_message", text: "记住以后代码注释都用英文" },
      { type: "assistant_message", text: "好的，我记住了。" },
    ] as never;

    // Untouched memory + strong signal -> triggers fallback curation.
    await turnEnded(host, journal, scheduler, { agent: { id: "user-agent", workspaceId: null, parentAgentId: null, provider: "claude", cwd: "/", title: null }, turnId: "t1", outcome: { kind: "completed" }, timeline }, curator);
    expect(curated).toEqual(["user-agent"]);

    // Curation agent itself -> skipped to prevent loops.
    await turnEnded(host, journal, scheduler, { agent: { id: "curation-agent", workspaceId: null, parentAgentId: null, provider: "claude", cwd: "/", title: null }, turnId: "t2", outcome: { kind: "completed" }, timeline }, curator);
    expect(curated).toEqual(["user-agent"]);

    // Memory already edited in the turn -> skipped.
    await journal.write("bot-m", "MEMORY.md", "- Use English comments\n");
    await journal.begin("bot-m");
    await journal.write("bot-m", "MEMORY.md", "- Use English comments\n- Keep concise\n");
    // Simulate bot editing memory during turn by restoring seen snapshot before end:
    await turnEnded(host, { end: async () => true } as never, scheduler, { agent: { id: "user-agent-2", workspaceId: null, parentAgentId: null, provider: "claude", cwd: "/", title: null }, turnId: "t3", outcome: { kind: "completed" }, timeline }, curator);
    expect(curated).toEqual(["user-agent"]);
  });

  it("prevents machine-dispatched chats (workflow tasks, stages, worker roles, handoffs, routines, brief messages) from triggering curateTurnFallback", async () => {
    const { turnEnded } = await import("../server/activity");
    const { MemoryJournal } = await import("../server/journal");

    const host = fakeHost([makeBot({ id: "bot-w", name: "Worker" })]);
    let currentLabels: Record<string, string> = {};
    let currentRoutineId: string | null = null;
    host.chatOf = async () => ({
      botId: "bot-w",
      title: "Worker Chat",
      routineId: currentRoutineId,
      labels: currentLabels,
    });
    const scheduler = { finished: async () => {} };
    const journal = new MemoryJournal();
    await journal.begin("bot-w");

    const curated: string[] = [];
    const curator = {
      isCurationAgent: () => false,
      curateTurnFallback: async (input: { agentId: string }) => {
        curated.push(input.agentId);
        return true;
      },
    };

    const makeAgent = (id: string) => ({
      id,
      workspaceId: null,
      parentAgentId: null,
      provider: "claude",
      cwd: "/",
      title: null,
    });

    // 1. Workflow task label
    currentLabels = { [WORKFLOW_TASK_LABEL]: "task-123" };
    currentRoutineId = null;
    await turnEnded(
      host,
      journal,
      scheduler,
      {
        agent: makeAgent("wf-task-agent"),
        outcome: { kind: "completed" },
        timeline: [
          { type: "user_message", text: "Please remember this instruction" },
          { type: "assistant_message", text: "Done" },
        ],
      },
      curator,
    );
    expect(curated).toEqual([]);

    // 2. Workflow stage label
    currentLabels = { [WORKFLOW_STAGE_LABEL]: "stage-456" };
    await turnEnded(
      host,
      journal,
      scheduler,
      {
        agent: makeAgent("wf-stage-agent"),
        outcome: { kind: "completed" },
        timeline: [
          { type: "user_message", text: "Never do this again" },
          { type: "assistant_message", text: "Done" },
        ],
      },
      curator,
    );
    expect(curated).toEqual([]);

    // 3. Worker session role ("worker")
    currentLabels = { [SESSION_ROLE_LABEL]: "worker" };
    await turnEnded(
      host,
      journal,
      scheduler,
      {
        agent: makeAgent("worker-agent"),
        outcome: { kind: "completed" },
        timeline: [
          { type: "user_message", text: "Always verify tests" },
          { type: "assistant_message", text: "Done" },
        ],
      },
      curator,
    );
    expect(curated).toEqual([]);

    // 4. Dispatched-worker session role ("dispatched-worker")
    currentLabels = { [SESSION_ROLE_LABEL]: "dispatched-worker" };
    await turnEnded(
      host,
      journal,
      scheduler,
      {
        agent: makeAgent("dispatched-worker-agent"),
        outcome: { kind: "completed" },
        timeline: [
          { type: "user_message", text: "Remember to check diff" },
          { type: "assistant_message", text: "Done" },
        ],
      },
      curator,
    );
    expect(curated).toEqual([]);

    // 5. Inter-bot handoff (asked-by label)
    currentLabels = { [ASKED_BY_LABEL]: "bot-requester" };
    await turnEnded(
      host,
      journal,
      scheduler,
      {
        agent: makeAgent("handoff-agent"),
        outcome: { kind: "completed" },
        timeline: [
          { type: "user_message", text: "Remember to follow up" },
          { type: "assistant_message", text: "Done" },
        ],
      },
      curator,
    );
    expect(curated).toEqual([]);

    // 6. Routine chat
    currentLabels = {};
    currentRoutineId = "routine-789";
    await turnEnded(
      host,
      journal,
      scheduler,
      {
        agent: makeAgent("routine-agent"),
        outcome: { kind: "completed" },
        timeline: [
          { type: "user_message", text: "Remember to run nightly" },
          { type: "assistant_message", text: "Done" },
        ],
      },
      curator,
    );
    expect(curated).toEqual([]);

    // 7. Workflow brief dispatch with <worker_protocol> containing "Never fake passing tests"
    currentLabels = {};
    currentRoutineId = null;
    const briefPrompt = [
      "<task_brief>",
      "- WORKFLOW: CI Workflow",
      "- STAGE_ID: stage-1",
      "- SPECIFICATION: Run verification",
      "</task_brief>",
      "",
      WORKER_PROTOCOL_SUFFIX,
    ].join("\n");
    await turnEnded(
      host,
      journal,
      scheduler,
      {
        agent: makeAgent("brief-dispatch-agent"),
        outcome: { kind: "completed" },
        timeline: [
          { type: "user_message", text: briefPrompt },
          { type: "assistant_message", text: "Stage complete" },
        ],
      },
      curator,
    );
    expect(curated).toEqual([]);
  });

  it("prevents background memory curation chats from triggering fallback (even after restart) and auto-archives them on turn completion", async () => {
    const { turnEnded } = await import("../server/activity");
    const { MemoryJournal } = await import("../server/journal");

    const host = fakeHost([makeBot({ id: "bot-curator", name: "CuratorBot" })]);
    const archivedAgentIds: string[] = [];
    host.attach({
      agents: {
        ref: (id: string) => ({
          archive: vi.fn(async () => {
            archivedAgentIds.push(id);
          }),
        }),
      },
    } as never);

    host.chatOf = async () => ({
      botId: "bot-curator",
      title: "CuratorBot · Memory check",
      routineId: null,
      labels: { [MEMORY_CURATION_LABEL]: "true" },
    });
    const scheduler = { finished: async () => {} };
    const journal = new MemoryJournal();
    await journal.begin("bot-curator");

    const curated: string[] = [];
    // Simulate server restart: ownedAgents set in curator is EMPTY, isCurationAgent returns false
    const curator = {
      isCurationAgent: (_id: string) => false,
      curateTurnFallback: async (input: { agentId: string }) => {
        curated.push(input.agentId);
        return true;
      },
    };

    const curationTimeline = [
      {
        type: "user_message",
        text: 'In a recent turn of "Chat", the user expressed something worth remembering... Never store secrets.\nUser: 记住以后用中文回复',
      },
      { type: "assistant_message", text: "Updated memory." },
    ];

    await turnEnded(
      host,
      journal,
      scheduler,
      {
        agent: {
          id: "restarted-curation-agent",
          workspaceId: null,
          parentAgentId: null,
          provider: "claude",
          cwd: "/",
          title: "CuratorBot · Memory check",
        },
        outcome: { kind: "completed" },
        timeline: curationTimeline,
      },
      curator,
    );

    // Must NOT trigger curateTurnFallback
    expect(curated).toEqual([]);
    // Must auto-archive to avoid cluttering the sidebar
    expect(archivedAgentIds).toContain("restarted-curation-agent");
  });

  it("allows real human DM/group turns saying '记住以后用中文回复' to trigger curateTurnFallback", async () => {
    const { turnEnded } = await import("../server/activity");
    const { MemoryJournal } = await import("../server/journal");

    const host = fakeHost([makeBot({ id: "bot-h", name: "HumanBot" })]);
    host.chatOf = async () => ({
      botId: "bot-h",
      title: "Human DM Chat",
      routineId: null,
      labels: { [SESSION_ROLE_LABEL]: "dm" },
    });
    const scheduler = { finished: async () => {} };
    const journal = new MemoryJournal();
    await journal.begin("bot-h");

    const curated: any[] = [];
    const curator = {
      isCurationAgent: () => false,
      curateTurnFallback: async (input: any) => {
        curated.push(input);
        return true;
      },
    };

    const humanTimeline = [
      { type: "user_message", text: "记住以后用中文回复" },
      { type: "assistant_message", text: "好的，我记住了。" },
    ];

    await turnEnded(
      host,
      journal,
      scheduler,
      {
        agent: {
          id: "human-agent-1",
          workspaceId: null,
          parentAgentId: null,
          provider: "claude",
          cwd: "/",
          title: "Human DM Chat",
        },
        outcome: { kind: "completed" },
        timeline: humanTimeline,
      },
      curator,
    );

    expect(curated).toHaveLength(1);
    expect(curated[0]).toMatchObject({
      botId: "bot-h",
      agentId: "human-agent-1",
      chatTitle: "Human DM Chat",
      userText: "记住以后用中文回复",
      reply: "好的，我记住了。",
    });
  });
});
