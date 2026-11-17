// Purpose: Unit and integration tests for agy-session-analyzer.
// Context: Verifies date filtering, high-signal turn extraction, subagent stitching, and pluggable 2-stage LLM pipeline.
// Usage: node --test tools/agy-session-analyzer/analyze-sessions.test.mjs
// Prerequisites: Node.js >= 20.

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  extractUserRequest,
  formatDigestMarkdown,
  loadSessionsInRange,
  parseDateRange,
} from "./lib/session-reader.mjs";

function makeFixtureBrain() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-brain-test-"));
  const logsDir = path.join(root, "sess-11112222", ".system_generated", "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const lines = [
    JSON.stringify({
      step_index: 0, type: "USER_INPUT", created_at: "2026-11-15T04:00:00Z",
      content: "<USER_REQUEST>\nCheck git status and fix test\n</USER_REQUEST>\n<ADDITIONAL_METADATA>noise</ADDITIONAL_METADATA>",
    }),
    JSON.stringify({
      step_index: 1, type: "PLANNER_RESPONSE", created_at: "2026-11-15T04:00:02Z",
      thinking: "secret internal chain of thought",
      tool_calls: [
        { name: "read_file", args: { Path: '"/Users/x/.gemini/skills/demo/SKILL.md"' } },
        { name: "read_board", args: { since: 0 } },
        { name: "run_command", args: { CommandLine: '"git status"', toolSummary: '"Git status check"' } },
      ],
    }),
    JSON.stringify({
      step_index: 2, type: "GENERIC", created_at: "2026-11-15T04:00:03Z",
      content: "HUGE_RAW_STDOUT_THAT_SHOULD_BE_IGNORED",
    }),
    JSON.stringify({
      step_index: 3, type: "PLANNER_RESPONSE", created_at: "2026-11-15T04:00:05Z",
      content: "All tests are now passing.",
    }),
    JSON.stringify({
      step_index: 4, type: "USER_INPUT", created_at: "2026-11-10T04:00:00Z",
      content: "<USER_REQUEST>\nOut of range turn\n</USER_REQUEST>",
    }),
  ];
  fs.writeFileSync(path.join(logsDir, "transcript.jsonl"), lines.join("\n"), "utf8");
  return root;
}

function makeParentChildFixtureBrain() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agy-brain-subagent-"));
  const parentId = "39f176b7-1111-4444-8888-aaaaaaaaaaaa";
  const childId = "018601f7-2222-4444-8888-bbbbbbbbbbbb";

  const parentLogs = path.join(root, parentId, ".system_generated", "logs");
  const childLogs = path.join(root, childId, ".system_generated", "logs");
  fs.mkdirSync(parentLogs, { recursive: true });
  fs.mkdirSync(childLogs, { recursive: true });

  const parentLines = [
    JSON.stringify({
      step_index: 0, type: "USER_INPUT", created_at: "2026-11-15T05:00:00Z",
      content: "<USER_REQUEST>\nBump version and fix CI errors\n</USER_REQUEST>",
    }),
    JSON.stringify({
      step_index: 1, type: "PLANNER_RESPONSE", created_at: "2026-11-15T05:00:02Z",
      tool_calls: [
        {
          name: "invoke_subagent",
          args: { subagent: "coder", prompt: "Run tsc and fix any TypeScript build errors in src/" },
        },
      ],
    }),
    JSON.stringify({
      step_index: 2, type: "GENERIC", created_at: "2026-11-15T05:00:03Z",
      content: `Created the following subagent: { "conversation_id": "${childId}" }`,
    }),
    JSON.stringify({
      step_index: 3, type: "PLANNER_RESPONSE", created_at: "2026-11-15T05:00:10Z",
      tool_calls: [
        {
          name: "send_message",
          args: { conversation_id: childId, message: "Also sync package-lock.json" },
        },
      ],
    }),
    JSON.stringify({
      step_index: 4, type: "PLANNER_RESPONSE", created_at: "2026-11-15T05:00:20Z",
      content: "Subagent finished syncing lockfile and fixing TS errors.",
    }),
  ];

  const childLines = [
    JSON.stringify({
      step_index: 0, type: "USER_INPUT", created_at: "2026-11-15T05:00:03Z",
      content: "Run tsc and fix any TypeScript build errors in src/",
    }),
    JSON.stringify({
      step_index: 1, type: "PLANNER_RESPONSE", created_at: "2026-11-15T05:00:04Z",
      tool_calls: [
        { name: "run_command", args: { CommandLine: '"pnpm tsc --noEmit"' } },
      ],
    }),
    JSON.stringify({
      step_index: 2, type: "ERROR_MESSAGE", created_at: "2026-11-15T05:00:05Z",
      error: "TS2345 chunk Buffer type",
    }),
    JSON.stringify({
      step_index: 3, type: "PLANNER_RESPONSE", created_at: "2026-11-15T05:00:08Z",
      tool_calls: [
        { name: "edit_file", args: { Path: '"/repo/src/index.ts"' } },
      ],
      content: "已完成 package-lock.json 同步并修复 2 处 TS 报错",
    }),
  ];

  fs.writeFileSync(path.join(parentLogs, "transcript.jsonl"), parentLines.join("\n"), "utf8");
  fs.writeFileSync(path.join(childLogs, "transcript.jsonl"), childLines.join("\n"), "utf8");
  return root;
}

test("extractUserRequest strips metadata tags", () => {
  const out = extractUserRequest("<USER_REQUEST>\nHello\n</USER_REQUEST><ADDITIONAL_METADATA>x</ADDITIONAL_METADATA>");
  assert.equal(out, "Hello");
});

test("loadSessionsInRange extracts user, reply, and non-polling tool summaries", () => {
  const root = makeFixtureBrain();
  try {
    const range = parseDateRange({ date: "2026-11-15" });
    const sessions = loadSessionsInRange(root, range);
    assert.equal(sessions.length, 1);
    const s = sessions[0];
    assert.equal(s.turns.length, 1);
    assert.equal(s.turns[0].user, "Check git status and fix test");
    assert.equal(s.turns[0].reply, "All tests are now passing.");
    assert.deepEqual(
      s.turns[0].tools.map((t) => t.brief),
      ["read(demo/SKILL.md)", "run(Git status check)"]
    );
    assert.deepEqual(s.skillsRead, ["demo/SKILL.md"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("loadSessionsInRange stitches subagent traces and deduplicates child sessions", () => {
  const root = makeParentChildFixtureBrain();
  try {
    const range = parseDateRange({ date: "2026-11-15" });
    const sessions = loadSessionsInRange(root, range);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].sessionId, "39f176b7-1111-4444-8888-aaaaaaaaaaaa");

    const digest = formatDigestMarkdown(sessions, range);
    assert.match(digest, /## \[AGY\] Session 39f176b7/);
    assert.match(digest, /subagent\(coder \| "Run tsc and fix any TypeScript build errors in src\/"\)/);
    assert.match(digest, /msg\(018601f7-222 \| "Also sync package-lock\.json"\)/);
    assert.match(digest, /<subagent_trace id="018601f7" name="coder">/);
    assert.match(digest, /Tools: run_command:1, edit_file:1 \| Errors: 1/);
    assert.match(digest, /Anomalies: \[2\] run\(pnpm tsc --noEmit\) -> status=ERR \(TS2345 chunk Buffer type\)/);
    assert.match(digest, /Outcome: "已完成 package-lock\.json 同步并修复 2 处 TS 报错"/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CLI full 2-stage pipeline works against mock OpenAI server", async () => {
  const root = makeFixtureBrain();
  const seenModels = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const parsed = JSON.parse(body);
      seenModels.push(parsed.model);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: `ok:${parsed.model}` } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const cliPath = path.resolve("tools/agy-session-analyzer/analyze-sessions.mjs");
    const res = spawnSync(process.execPath, [
      cliPath,
      "--brain-dir", root,
      "--date", "2026-11-15",
      "--stage", "full",
      "--base-url", `http://127.0.0.1:${port}`,
      "--clean-model", "cheap-mini",
      "--analyze-model", "smart-pro",
    ], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(seenModels, ["cheap-mini", "smart-pro"]);
    assert.match(res.stdout, /ok:smart-pro/);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
