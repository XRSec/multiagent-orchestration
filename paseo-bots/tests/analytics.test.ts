import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAnalytics } from "../server/analytics/runner";
import { listAnalyticsSessions } from "../server/analytics/sessions";
import { loadHarnessSessions, parseDateRange } from "../server/analytics/harnesses";
import { buildExecutionTelemetry, distillThought, distillToolTrace } from "../server/analytics/distill";

const tempDirs: string[] = [];

function mkTmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createMultiHarnessFixtures() {
  const agyDir = mkTmp("agy-");
  const agyLogs = path.join(agyDir, "agy-11112222", ".system_generated", "logs");
  fs.mkdirSync(agyLogs, { recursive: true });
  fs.writeFileSync(
    path.join(agyLogs, "transcript.jsonl"),
    [
      JSON.stringify({ type: "USER_INPUT", created_at: "2026-11-15T04:00:00Z", content: "<USER_REQUEST>\nFix bug\n</USER_REQUEST>" }),
      JSON.stringify({ type: "PLANNER_RESPONSE", created_at: "2026-11-15T04:00:01Z", thinking: "hidden", tool_calls: [{ name: "read_file", args: { Path: '"/x/my-skill/SKILL.md"' } }, { name: "read_board", args: {} }] }),
      JSON.stringify({ type: "GENERIC", created_at: "2026-11-15T04:00:02Z", content: "NOISY_STDOUT" }),
      JSON.stringify({ type: "PLANNER_RESPONSE", created_at: "2026-11-15T04:00:03Z", content: "Bug fixed." }),
    ].join("\n"),
    "utf8",
  );

  const claudeDir = mkTmp("claude-");
  const claudeProj = path.join(claudeDir, "proj-a");
  fs.mkdirSync(claudeProj, { recursive: true });
  fs.writeFileSync(
    path.join(claudeProj, "c-sess-1.jsonl"),
    [
      JSON.stringify({ timestamp: "2026-11-15T05:00:00Z", message: { role: "user", content: [{ type: "text", text: "Run tests" }] } }),
      JSON.stringify({ timestamp: "2026-11-15T05:00:02Z", message: { role: "assistant", content: [{ type: "tool_use", name: "Bash", input: { command: "pnpm test" } }, { type: "text", text: "All green." }] } }),
    ].join("\n"),
    "utf8",
  );

  const piDir = mkTmp("pi-");
  const piProj = path.join(piDir, "proj-b");
  fs.mkdirSync(piProj, { recursive: true });
  fs.writeFileSync(
    path.join(piProj, "pi-sess-1.jsonl"),
    [
      JSON.stringify({ type: "message", timestamp: "2026-11-15T06:00:00Z", message: { role: "user", content: [{ type: "text", text: "Check logs" }] } }),
      JSON.stringify({ type: "message", timestamp: "2026-11-15T06:00:02Z", message: { role: "assistant", content: [{ type: "thinking", thinking: "secret" }, { type: "toolCall", name: "read", arguments: { path: "/var/log/app.log" } }, { type: "text", text: "Logs look clean." }] } }),
    ].join("\n"),
    "utf8",
  );

  return { agyDir, claudeDir, piDir };
}

describe("multi-harness session analytics", () => {
  it("parses rolling hour windows ending now", () => {
    const before = Date.now();
    const r3 = parseDateRange({ hours: 3 });
    expect(r3.label).toBe("last-3h");
    expect(r3.end.getTime() - r3.start.getTime()).toBe(3 * 3600_000);
    expect(r3.end.getTime()).toBeGreaterThanOrEqual(before);
    expect(parseDateRange({ hours: 168, date: "2026-11-15" }).label).toBe("last-7d");
  });

  it("extracts user request, reply body, and compacted tools across agy, claude, and pi", () => {
    const dirs = createMultiHarnessFixtures();
    const range = parseDateRange({ date: "2026-11-15" });
    const sessions = loadHarnessSessions("all", range, 40, dirs);
    expect(sessions).toHaveLength(3);

    const agy = sessions.find((s) => s.harness === "agy")!;
    expect(agy.turns[0].user).toBe("Fix bug");
    expect(agy.turns[0].reply).toBe("Bug fixed.");
    expect(agy.turns[0].tools).toEqual(["read(my-skill/SKILL.md)"]);
    expect(agy.skillsRead).toEqual(["my-skill/SKILL.md"]);

    const claude = sessions.find((s) => s.harness === "claude")!;
    expect(claude.turns[0].user).toBe("Run tests");
    expect(claude.turns[0].tools).toEqual(["run(pnpm test)"]);
    expect(claude.turns[0].reply).toBe("All green.");

    const pi = sessions.find((s) => s.harness === "pi")!;
    expect(pi.turns[0].user).toBe("Check logs");
    expect(pi.turns[0].tools).toEqual(["read(/var/log/app.log)"]);
    expect(pi.turns[0].telemetry).toContain("<execution_telemetry>");
    expect(pi.turns[0].reply).toBe("Logs look clean.");
  });

  it("distills thought traces, write payloads, shell exit codes, and enforces 2500-char budget", () => {
    const longThought = `${"A".repeat(700)}\n\n\n${"B".repeat(700)}`;
    const thoughtOut = distillThought(longThought);
    expect(thoughtOut).toContain("...[omitted ");
    expect(thoughtOut.startsWith("A".repeat(20))).toBe(true);
    expect(thoughtOut.endsWith("B".repeat(20))).toBe(true);

    const traces = distillToolTrace([
      { name: "write_file", args: { Path: "/a/b.ts", Content: "line1\nline2\nline3" }, status: "OK", output: "ok" },
      { name: "run_command", args: { CommandLine: "pnpm test" }, exitCode: 1, output: "head noise\nFAIL src/a.test.ts:42" },
    ]);
    expect(traces[0]).toContain("Content=<len: 17 chars, lines: 3>");
    expect(traces[1]).toContain("status=ERR, meta={exit_code:1}");
    expect(traces[1]).toContain("FAIL src/a.test.ts:42");

    const huge = buildExecutionTelemetry("T".repeat(1500), [
      { name: "read_file", args: { Path: "/x/y.ts" }, output: "Z".repeat(3000) },
      { name: "bash", args: { command: "echo hi" }, output: "W".repeat(3000) },
    ]);
    expect(huge.length).toBeLessThanOrEqual(2500);
  });

  it("strips command envelope, preserves subagent args, and prioritizes ERR over OK in budget", () => {
    const [cmdLine] = distillToolTrace([
      {
        name: "run_command",
        args: { CommandLine: "ls" },
        output: "Created At: 2026-11-16T04:00:17+08:00\nCompleted At: 2026-11-16T04:00:18+08:00\nCommand exited with code 0.\n\nCommand output:\nfileA.ts\nfileB.ts",
      },
    ]);
    expect(cmdLine).not.toContain("Created At:");
    expect(cmdLine).toContain('preview="fileA.ts fileB.ts"');

    const [subLine] = distillToolTrace([
      { name: "invoke_subagent", args: { TypeName: "mogit", Role: "SCM", Prompt: "Check status" }, status: "ERR", output: "unknown agent" },
    ]);
    expect(subLine).toContain('TypeName="mogit"');
    expect(subLine).toContain('prompt="Check status"');

    const manyEvents = [
      ...Array.from({ length: 15 }, (_, i) => ({ name: "read_file", args: { Path: `/dir/file${i}.ts` }, status: "OK" as const, output: "X".repeat(250) })),
      { name: "run_command", args: { CommandLine: "agy --help" }, exitCode: 1, output: "ERR_ROOT_CAUSE_PRESERVED" },
    ];
    const block = buildExecutionTelemetry(undefined, manyEvents);
    expect(block.length).toBeLessThanOrEqual(2500);
    expect(block).toContain("ERR_ROOT_CAUSE_PRESERVED");
    expect(block).toContain("OK calls omitted)");
  });

  it("runs the fixed 2-bot pipeline: bot-cleaner cleans, bot-analyst analyzes", async () => {
    const dirs = createMultiHarnessFixtures();
    const calls: Array<{ botId: string; prompt: string }> = [];
    const askBot = async (botId: string, prompt: string) => {
      calls.push({ botId, prompt });
      return `reply:${botId}`;
    };
    const out = await runAnalytics({ harness: "all", date: "2026-11-15", days: 1, stage: "full", maxSessions: 40, maxChars: 36_000 }, dirs, { askBot });
    expect(calls.map((c) => c.botId)).toEqual(["bot-cleaner", "bot-analyst"]);
    expect(calls[0]!.prompt).toContain("<execution_telemetry>");
    expect(calls[1]!.prompt).toBe("reply:bot-cleaner");
    expect(out.sessionCount).toBe(3);
    expect(out.byHarness).toEqual({ agy: 1, claude: 1, pi: 1 });
    expect(out.cleaned).toBe("reply:bot-cleaner");
    expect(out.report).toBe("reply:bot-analyst");
  });

  it("lists Paseo (including archived) and local harness sessions sorted by updatedAt desc", async () => {
    const dirs = createMultiHarnessFixtures();
    const fakePaseo = {
      agents: {
        list: async ({ filter }: { filter: { includeArchived?: boolean } }) => ({
          entries: [
            {
              agent: {
                id: "ag-archived",
                shortId: "ag1",
                title: "Archived Paseo Chat",
                archivedAt: "2026-11-16T00:00:00Z",
                updatedAt: "2026-11-16T01:00:00Z",
                labels: { "paseo-bots.bot": "bot-mocode" },
              },
            },
            {
              agent: {
                id: "ag-active",
                shortId: "ag2",
                title: "Active Paseo Chat",
                archivedAt: null,
                updatedAt: "2026-11-15T05:30:00Z",
                labels: {},
              },
            },
          ].filter((e) => filter.includeArchived || !e.agent.archivedAt),
        }),
      },
    } as never;

    const all = await listAnalyticsSessions({ includeArchived: true, harness: "all" }, { paseo: fakePaseo }, dirs);
    expect(all.sessions.map((s) => s.id)).toEqual([
      "paseo:ag-archived",
      "harness:pi:pi-sess-1",
      "paseo:ag-active",
      "harness:claude:c-sess-1",
      "harness:agy:agy-11112222",
    ]);
    expect(all.sessions[0]).toMatchObject({ archived: true, botId: "bot-mocode", harness: "paseo", source: "paseo" });

    const activeOnly = await listAnalyticsSessions({ includeArchived: false, harness: "all" }, { paseo: fakePaseo }, dirs);
    expect(activeOnly.sessions.some((s) => s.id === "paseo:ag-archived")).toBe(false);
    expect(activeOnly.sessions.some((s) => s.id === "paseo:ag-active")).toBe(true);
  });

  it("runs analytics on explicitly selected Paseo and harness sessionIds", async () => {
    const dirs = createMultiHarnessFixtures();
    const fakePaseo = {
      agents: {
        ref: (agentId: string) => ({
          timeline: {
            refetch: async ({ direction }: { direction: string }) => {
              if (agentId !== "ag-archived" || direction !== "tail") {
                return { entries: [], hasOlder: false };
              }
              return {
                hasOlder: false,
                entries: [
                  { timestamp: "2026-11-16T00:00:00Z", item: { type: "user_message", text: "Deploy fix" } },
                  { timestamp: "2026-11-16T00:00:01Z", item: { type: "tool_call", name: "run_command", input: { CommandLine: "npm test" }, status: "ok", output: "ok" } },
                  { timestamp: "2026-11-16T00:00:02Z", item: { type: "assistant_message", text: "Deployed." } },
                ],
              };
            },
          },
        }),
      },
    } as never;

    const out = await runAnalytics(
      {
        harness: "all",
        days: 1,
        stage: "extract",
        maxSessions: 40,
        maxChars: 36_000,
        sessionIds: ["paseo:ag-archived", "harness:claude:c-sess-1"],
      },
      dirs,
      { paseo: fakePaseo },
    );

    expect(out.sessionCount).toBe(2);
    expect(out.byHarness).toEqual({ paseo: 1, claude: 1 });
    expect(out.digest).toContain("[PASEO] Session ag-archi");
    expect(out.digest).toContain("Deploy fix");
    expect(out.digest).toContain("Run tests");
  });
});
