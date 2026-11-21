#!/usr/bin/env node
// Purpose: Contract and unit test suite for Gemini Web CLI, drivers, sessions, and exporter.
// Context: Executed via `node --test` in local and CI regression verification pipelines.
// Usage: node --test scripts/gemini-web/gemini-web.test.mjs
// Prerequisites: Node.js >= 18, zero live browser dependency required.

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { parseArgs, validateArgs, createDriver, EXIT_CODES } from "./cli.mjs";
import {
  saveSession,
  getSession,
  listSessions,
} from "./lib/sessions.mjs";
import { generateEgoScript } from "./lib/ego-driver.mjs";
import { PrismDriver } from "./lib/prism-driver.mjs";
import {
  PlaywrightDriver,
  resolvePlaywright,
  resolveProfileDir as resolvePlaywrightProfileDir,
} from "./lib/playwright-driver.mjs";
import {
  ChromeDriver,
  resolveChromeBinary,
  resolveChromeProfileDir,
} from "./lib/chrome-driver.mjs";
import { buildSystemDirective, classifyStatus } from "./lib/gemini-dom.mjs";
import { buildExportPayload } from "./lib/exporter.mjs";

test("CLI Argument Parser - parses flags and subcommands correctly", () => {
  const parsed = parseArgs([
    "ask",
    "-p",
    "Analyze ETF yields",
    "-s",
    "gem-123",
    "--backend",
    "prism",
    "--profile",
    "Profile 1",
    "-m",
    "argon",
    "--deep-research",
    "-f",
    "docs/report.pdf",
    "-f",
    "docs/data.png",
    "--export-dir",
    "out/reports",
    "--timeout",
    "300",
    "--json",
  ]);

  assert.equal(parsed.command, "ask");
  assert.equal(parsed.prompt, "Analyze ETF yields");
  assert.equal(parsed.session, "gem-123");
  assert.equal(parsed.backend, "prism");
  assert.equal(parsed.profile, "Profile 1");
  assert.equal(parsed.model, "argon");
  assert.equal(parsed.deepResearch, true);
  assert.deepEqual(parsed.files, ["docs/report.pdf", "docs/data.png"]);
  assert.equal(parsed.exportDir, "out/reports");
  assert.equal(parsed.timeout, 300);
  assert.equal(parsed.json, true);
});

test("CLI Argument Parser - defaults and guardrail validations", () => {
  const defaultArgs = parseArgs([]);
  assert.equal(defaultArgs.command, "ask");
  assert.equal(defaultArgs.backend, "ego");
  assert.equal(defaultArgs.deepResearch, false);
  assert.deepEqual(defaultArgs.files, []);

  const invalidBackend = validateArgs({
    backend: "safari",
    command: "ask",
    prompt: "hello",
    files: [],
  });
  assert.match(invalidBackend, /Invalid backend 'safari'/);

  const missingSession = validateArgs({
    backend: "ego",
    command: "fetch",
    session: "",
    files: [],
  });
  assert.match(missingSession, /requires --session/);

  const missingPrompt = validateArgs({
    backend: "ego",
    command: "ask",
    prompt: "",
    files: [],
  });
  assert.match(missingPrompt, /requires --prompt/);
});

test("CLI Argument Parser & Validation - chrome and playwright backends", () => {
  const chromeArgs = parseArgs([
    "ask",
    "-p",
    "Query data",
    "--backend",
    "chrome",
    "--user-data-dir",
    "/tmp/chrome-profile",
    "--port",
    "9333",
    "--headless",
    "--executable-path",
    "/custom/chrome",
  ]);
  assert.equal(chromeArgs.backend, "chrome");
  assert.equal(chromeArgs.userDataDir, "/tmp/chrome-profile");
  assert.equal(chromeArgs.port, 9333);
  assert.equal(chromeArgs.headless, true);
  assert.equal(chromeArgs.executablePath, "/custom/chrome");
  assert.equal(validateArgs(chromeArgs), null);

  const pwArgs = parseArgs([
    "fetch",
    "-s",
    "https://gemini.google.com/app/test",
    "--backend",
    "playwright",
    "--cdp-url",
    "http://127.0.0.1:9222",
    "--profile",
    "P1",
  ]);
  assert.equal(pwArgs.backend, "playwright");
  assert.equal(pwArgs.cdpUrl, "http://127.0.0.1:9222");
  assert.equal(pwArgs.profile, "P1");
  assert.equal(validateArgs(pwArgs), null);

  const chromeDriver = createDriver(chromeArgs);
  assert.ok(chromeDriver instanceof ChromeDriver);

  const pwDriver = createDriver(pwArgs);
  assert.ok(pwDriver instanceof PlaywrightDriver);
});

test("Session Store - save, retrieve and list sessions", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-test-"));
  const stateFile = path.join(tmpDir, "sessions.json");

  try {
    const s1 = saveSession(
      {
        sessionId: "gem-test-1",
        url: "https://gemini.google.com/app/12345",
        backend: "chrome",
        model: "argon",
        title: "Test Chat 1",
      },
      stateFile
    );
    assert.equal(s1.sessionId, "gem-test-1");

    const s2 = saveSession(
      {
        sessionId: "gem-test-2",
        url: "https://gemini.google.com/app/67890",
        backend: "playwright",
        model: "thinking",
        title: "Test Chat 2",
      },
      stateFile
    );

    const fetchedById = getSession("gem-test-1", stateFile);
    assert.equal(fetchedById.title, "Test Chat 1");

    const fetchedByUrl = getSession("https://gemini.google.com/app/67890", stateFile);
    assert.equal(fetchedByUrl.sessionId, "gem-test-2");

    const all = listSessions(stateFile);
    assert.equal(all.length, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Persistent Profile Path Resolution - chrome and playwright", () => {
  const defaultPw = resolvePlaywrightProfileDir();
  assert.ok(defaultPw.includes(".paseo/gemini-web-profiles/playwright"));

  const customPw = resolvePlaywrightProfileDir("/var/custom", "worker-1");
  assert.equal(customPw, path.resolve("/var/custom/worker-1"));

  const tildePw = resolvePlaywrightProfileDir("~/my-pw", "sub");
  assert.equal(tildePw, path.join(os.homedir(), "my-pw/sub"));

  const defaultChrome = resolveChromeProfileDir();
  assert.ok(defaultChrome.includes(".paseo/gemini-web-profiles/chrome"));

  const customChrome = resolveChromeProfileDir("/var/chrome", "worker-2");
  assert.equal(customChrome, path.resolve("/var/chrome/worker-2"));

  const chromeBin = resolveChromeBinary();
  assert.ok(typeof chromeBin === "string" && chromeBin.length > 0);
});

test("Playwright Driver - dynamic resolution and contract", async () => {
  const pw = await resolvePlaywright();
  assert.ok(pw.chromium, "Must resolve chromium from Playwright installation");

  const driver = new PlaywrightDriver({
    userDataDir: "/tmp/pw-test",
    profile: "TestProfile",
    headless: true,
  });
  assert.equal(driver.headless, true);
  assert.equal(driver.userDataDir, path.join("/tmp/pw-test", "TestProfile"));
});

test("Ego Driver - script generation contract", () => {
  const script = generateEgoScript("ask", {
    sessionUrl: "https://gemini.google.com/app/test",
    prompt: "Investigate Solana consensus",
    model: "argon",
    deepResearch: true,
    files: ["test1.pdf", "test2.png"],
    timeoutMs: 60000,
  });

  assert.ok(script.includes("taskSpace("), "Script must use taskSpace");
  assert.ok(script.includes("https://gemini.google.com/app/test"), "Script must navigate to target URL");
  assert.ok(script.includes("Investigate Solana consensus"), "Script must inject prompt text");
  assert.ok(script.includes("DeepResearch: enabled"), "Script must include deep research directive");
  assert.ok(script.includes("test1.pdf"), "Script must include uploaded files");
  assert.ok(script.includes("start research|开始调研"), "Script must handle research outline confirmation");
  assert.ok(script.includes("stop|停止"), "Script must observe Stop button for completion");
  assert.ok(script.includes("task.finish({ keep: [] })"), "Script must close taskSpace cleanly");
});

test("Prism Driver - JSON-RPC HTTP contract against mock MCP server", async () => {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const auth = req.headers["authorization"];
      const json = JSON.parse(body);
      calls.push({ auth, method: json.method, params: json.params });

      let result = { content: [{ type: "text", text: "{}" }] };
      if (json.params?.name === "prism_list_profiles") {
        result = { content: [{ type: "text", text: JSON.stringify([{ id: "prof-001", name: "Default Profile" }]) }] };
      } else if (json.params?.name === "prism_create_task_session") {
        result = { content: [{ type: "text", text: JSON.stringify({ taskSessionId: "task-sess-999" }) }] };
      } else if (json.params?.name === "prism_get_markdown") {
        result = { content: [{ type: "text", text: "# Research Report Completed" }] };
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: json.id, result }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  const token = "mock-secret-token";

  try {
    const driver = new PrismDriver({ endpoint, token, profile: "Default Profile" });
    const res = await driver.fetchSession("https://gemini.google.com/app/mock");
    assert.equal(res.status, "done");
    assert.ok(res.markdown.includes("Research Report Completed"));

    const toolNames = calls.map((c) => c.params.name);
    assert.ok(toolNames.includes("prism_list_profiles"), "Must list profiles");
    assert.ok(toolNames.includes("prism_create_task_session"), "Must create task session");
    assert.ok(toolNames.includes("prism_open_page"), "Must open page");
    assert.ok(toolNames.includes("prism_get_markdown"), "Must extract markdown");
    assert.ok(toolNames.includes("prism_close_task_session"), "Must close task session");

    for (const c of calls) {
      assert.equal(c.auth, `Bearer ${token}`);
    }
  } finally {
    server.close();
  }
});

function decodeAllWsFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    const opcode = buffer[offset] & 0x0f;
    if (opcode === 0x08) {
      frames.push({ type: "close" });
      break;
    }
    let len = buffer[offset + 1] & 0x7f;
    let headerSize = 2;
    if (len === 126) {
      len = buffer.readUInt16BE(offset + 2);
      headerSize += 2;
    }
    const mask = buffer.slice(offset + headerSize, offset + headerSize + 4);
    headerSize += 4;
    const payload = Buffer.alloc(len);
    for (let i = 0; i < len; i++) {
      payload[i] = buffer[offset + headerSize + i] ^ mask[i % 4];
    }
    frames.push({ type: "text", payload: payload.toString("utf-8") });
    offset += headerSize + len;
  }
  return frames;
}

function encodeWsServerFrame(text) {
  const payload = Buffer.from(text, "utf-8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  }
  return Buffer.concat([header, payload]);
}

test("Chrome Driver - CDP JSON-RPC and DOM.setFileInputFiles payload contracts", async () => {
  const cdpCalls = [];
  const server = http.createServer((req, res) => {
    const port = server.address().port;
    if (req.url === "/json/version") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ Browser: "Chrome/Mock" }));
    } else if (req.url === "/json/list") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([{ type: "page", webSocketDebuggerUrl: `ws://127.0.0.1:${port}/cdp` }]));
    }
  });

  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    const digest = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${digest}\r\n\r\n`
    );
    socket.on("data", (data) => {
      const frames = decodeAllWsFrames(data);
      for (const frame of frames) {
        if (frame.type === "close") {
          socket.end();
          return;
        }
        const msg = JSON.parse(frame.payload);
        cdpCalls.push(msg);

        let result = {};
        if (msg.method === "DOM.getDocument") {
          result = { root: { nodeId: 1 } };
        } else if (msg.method === "DOM.querySelector") {
          result = { nodeId: 42 };
        } else if (msg.method === "DOM.setFileInputFiles") {
          result = {};
        } else if (msg.method === "Runtime.evaluate") {
          if (msg.params?.expression && msg.params.expression.includes("extractPageDataInBrowser")) {
            result = {
              result: {
                type: "object",
                value: {
                  url: "https://gemini.google.com/app",
                  status: "done",
                  markdown: "# Chrome Web Automation Succeeded",
                  citations: [{ index: 1, title: "Google", url: "https://google.com" }],
                  isGenerating: false,
                  hasOutlineButton: false,
                },
              },
            };
          } else {
            result = { result: { value: false } };
          }
        }
        socket.write(encodeWsServerFrame(JSON.stringify({ id: msg.id, result })));
      }
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const driver = new ChromeDriver({
      port,
      cdpUrl: `ws://127.0.0.1:${port}/cdp`,
      skipDelay: true,
    });

    const res = await driver.sendMessage({
      prompt: "Research AI agents",
      files: ["package.json"],
      sessionUrl: "https://gemini.google.com/app",
      timeoutMs: 10000,
    });

    assert.equal(res.status, "done");
    assert.equal(res.backend, "chrome");
    assert.ok(res.markdown.includes("Chrome Web Automation Succeeded"));

    const setFilesCall = cdpCalls.find((c) => c.method === "DOM.setFileInputFiles");
    assert.ok(setFilesCall, "Must execute DOM.setFileInputFiles");
    assert.equal(setFilesCall.params.nodeId, 42);
    assert.ok(setFilesCall.params.files[0].endsWith("package.json"));
  } finally {
    server.close();
  }
});

test("Gemini DOM & System Directives - helpers work as expected", () => {
  const directive = buildSystemDirective("gemini-4-argon", true);
  assert.equal(directive, "[System Directives: Model: gemini-4-argon | DeepResearch: enabled]\n\n");

  assert.equal(classifyStatus({ isGenerating: false, isOutlineWaiting: true, hasContent: false }), "outline_waiting");
  assert.equal(classifyStatus({ isGenerating: true, isOutlineWaiting: false, hasContent: true }), "generating");
  assert.equal(classifyStatus({ isGenerating: false, isOutlineWaiting: false, hasContent: true }), "done");
});

test("Exporter Payload - buildExportPayload formats properly", () => {
  const payload = buildExportPayload({
    markdown: "# My Report",
    title: "Test Title",
    citations: [{ index: 1, title: "Source 1", url: "https://example.com" }],
  });

  assert.equal(payload.title, "Test Title");
  assert.equal(payload.content, "# My Report");
  assert.equal(payload.citations.length, 1);
  assert.ok(payload.exportedAt);
});
