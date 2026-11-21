#!/usr/bin/env node
// Purpose: Zero-token CLI automating Gemini Web across ego, prism, chrome, and playwright drivers.
// Context: Multi-agent CLI runtime supporting ask, new, fetch, status, wait, sessions, and export.
// Usage: node scripts/gemini-web/cli.mjs <command> [options]
// Prerequisites: Node.js >= 18, zero interactive TTY required.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EgoDriver } from "./lib/ego-driver.mjs";
import { PrismDriver } from "./lib/prism-driver.mjs";
import { PlaywrightDriver } from "./lib/playwright-driver.mjs";
import { ChromeDriver } from "./lib/chrome-driver.mjs";
import { exportReport } from "./lib/exporter.mjs";
import {
  getSession,
  saveSession,
  listSessions,
} from "./lib/sessions.mjs";

export const EXIT_CODES = {
  TERM_OK: 0,
  GENERAL_ERROR: 1,
  TERM_BLOCK: 2,
  TIMEOUT: 124,
};

/**
 * Print CLI help documentation.
 */
export function printHelp() {
  console.log(`
Usage:
  node scripts/gemini-web/cli.mjs <command> [options]

Commands:
  ask         Send a prompt to Gemini (new or continued session)
  new         Explicitly open a fresh Gemini chat
  fetch       Read and extract markdown from a conversation
  status      Check current session generation status
  wait        Silently poll until session generation completes
  sessions    List persisted local session records
  export      Convert session markdown to HTML + MD reports

Options:
  -p, --prompt <text>              Prompt message to send
  -s, --session <id|url>           Existing session ID or Gemini URL
  --backend <ego|prism|chrome|playwright>  Browser automation engine (default: ego)
  --profile <id|name>              Target browser profile
  -m, --model <name>               Target model name (fast, thinking, pro, argon, flash)
  --deep-research                  Enable Deep Research two-stage workflow
  -f, --file <path>                Attach local file (repeatable)
  --export-dir <dir>               Directory to export HTML + Markdown report
  --state-file <path>              Custom path for sessions.json
  --user-data-dir <dir>            Browser user data directory
  --cdp-url <url>                  CDP WebSocket or HTTP endpoint
  --port <port>                    CDP remote debugging port (default: 9222)
  --headless                       Run browser in headless mode
  --executable-path <path>         Custom browser executable binary path
  --timeout <seconds>              Timeout in seconds (default: 180s)
  --json                           Output structured JSON format
  -h, --help                       Show this help message
`.trim());
}

/**
 * Parse CLI argv into normalized options.
 * @param {string[]} argv
 * @returns {object}
 */
export function parseArgs(argv) {
  const args = {
    command: "", prompt: "", session: "", backend: "ego", profile: "",
    model: "", deepResearch: false, files: [], exportDir: "", stateFile: "",
    timeout: 180, json: false, help: false, input: "", title: "",
    userDataDir: "", cdpUrl: "", port: 9222, headless: false, executablePath: "",
  };

  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "--json") args.json = true;
    else if (a === "--deep-research") args.deepResearch = true;
    else if (a === "--headless") args.headless = true;
    else if (a === "-p" || a === "--prompt") args.prompt = argv[++i] || "";
    else if (a === "-s" || a === "--session") args.session = argv[++i] || "";
    else if (a === "--backend") args.backend = argv[++i] || "ego";
    else if (a === "--profile") args.profile = argv[++i] || "";
    else if (a === "-m" || a === "--model") args.model = argv[++i] || "";
    else if (a === "-f" || a === "--file") { const f = argv[++i]; if (f) args.files.push(f); }
    else if (a === "--export-dir") args.exportDir = argv[++i] || "";
    else if (a === "--state-file") args.stateFile = argv[++i] || "";
    else if (a === "--timeout") args.timeout = parseInt(argv[++i], 10) || 180;
    else if (a === "--input") args.input = argv[++i] || "";
    else if (a === "--title") args.title = argv[++i] || "";
    else if (a === "--user-data-dir") args.userDataDir = argv[++i] || "";
    else if (a === "--cdp-url") args.cdpUrl = argv[++i] || "";
    else if (a === "--port") args.port = parseInt(argv[++i], 10) || 9222;
    else if (a === "--executable-path") args.executablePath = argv[++i] || "";
    else if (!a.startsWith("-")) positional.push(a);
  }

  const validCommands = ["ask", "new", "fetch", "status", "wait", "sessions", "export"];
  args.command = (positional.length > 0 && validCommands.includes(positional[0])) ? positional[0] : (args.command || "ask");
  return args;
}

/**
 * Validate parsed arguments against system guardrails.
 * @param {object} args
 * @returns {string | null} Error message or null
 */
export function validateArgs(args) {
  const allowed = ["ego", "prism", "chrome", "playwright"];
  if (!allowed.includes(args.backend)) {
    return `Invalid backend '${args.backend}'. Allowed: ${allowed.join(", ")}`;
  }
  if ((args.command === "fetch" || args.command === "status" || args.command === "wait") && !args.session) {
    return `Command '${args.command}' requires --session <id|url>`;
  }
  if (args.command === "ask" && !args.prompt && args.files.length === 0) {
    return "Command 'ask' requires --prompt <text> or at least one --file <path>";
  }
  for (const f of args.files) {
    if (!fs.existsSync(path.resolve(f))) {
      return `File attachment not found: ${f}`;
    }
  }
  return null;
}

/**
 * Instantiate appropriate driver based on backend.
 * @param {object} args
 * @returns {EgoDriver | PrismDriver | PlaywrightDriver | ChromeDriver}
 */
export function createDriver(args) {
  if (args.backend === "prism") {
    return new PrismDriver({ profile: args.profile });
  }
  if (args.backend === "playwright") {
    return new PlaywrightDriver({
      profile: args.profile,
      userDataDir: args.userDataDir,
      cdpUrl: args.cdpUrl,
      port: args.port,
      headless: args.headless,
      executablePath: args.executablePath,
    });
  }
  if (args.backend === "chrome") {
    return new ChromeDriver({
      profile: args.profile,
      userDataDir: args.userDataDir,
      cdpUrl: args.cdpUrl,
      port: args.port,
      headless: args.headless,
      executablePath: args.executablePath,
    });
  }
  return new EgoDriver({ profile: args.profile });
}

/**
 * Handle ask / new command execution.
 * @param {object} args
 * @returns {Promise<object>}
 */
async function handleAskCommand(args) {
  const driver = createDriver(args);
  let sessionUrl = "https://gemini.google.com/app";

  if (args.session) {
    const existing = getSession(args.session, args.stateFile);
    if (existing && existing.url) {
      sessionUrl = existing.url;
    } else if (args.session.startsWith("http")) {
      sessionUrl = args.session;
    }
  }

  const result = await driver.sendMessage({
    prompt: args.prompt,
    files: args.files,
    model: args.model,
    deepResearch: args.deepResearch,
    sessionUrl,
    timeoutMs: args.timeout * 1000,
  });

  const record = saveSession(
    {
      sessionId: args.session || undefined,
      url: result.url || sessionUrl,
      backend: args.backend,
      profile: args.profile || "default",
      model: args.model || "default",
      title: (args.prompt || "").slice(0, 40) || "Gemini Chat",
    },
    args.stateFile
  );

  result.sessionId = record.sessionId;
  return result;
}

/**
 * Handle fetch / status / wait commands.
 * @param {object} args
 * @returns {Promise<object>}
 */
async function handleQueryCommand(args) {
  const driver = createDriver(args);
  const existing = getSession(args.session, args.stateFile);
  const targetUrl = existing?.url || (args.session.startsWith("http") ? args.session : "");
  if (!targetUrl) {
    throw new Error(`Session '${args.session}' not found in registry and is not a valid URL`);
  }

  if (args.command === "status") {
    if (driver.getStatus) return driver.getStatus(targetUrl);
    return driver.fetchSession(targetUrl);
  }

  const result = await driver.fetchSession(targetUrl);
  result.sessionId = existing?.sessionId || args.session;
  return result;
}

/**
 * Handle export action.
 * @param {object} args
 * @param {string} markdown
 * @param {string} title
 */
function handleExport(args, markdown, title) {
  if (!args.exportDir) return null;
  return exportReport({
    markdown,
    title: title || args.title || "Gemini Report",
    outDir: args.exportDir,
  });
}

/**
 * Print session registry records.
 * @param {object[]} list
 * @param {boolean} isJson
 */
function printSessionsList(list, isJson) {
  if (isJson) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  console.log(`Found ${list.length} recorded session(s):`);
  for (const s of list) {
    console.log(`- [${s.sessionId}] ${s.title} (${s.backend}) -> ${s.url}`);
  }
}

/**
 * Format and print result payload to console.
 * @param {object} result
 * @param {boolean} isJson
 */
function outputResult(result, isJson) {
  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result?.markdown) {
    console.log(`\n=== Session: ${result.sessionId || "unknown"} (${result.status || "done"}) ===`);
    console.log(`URL: ${result.url || "N/A"}\n`);
    console.log(result.markdown);
  } else if (result) {
    console.log(JSON.stringify(result, null, 2));
  }
}

/**
 * Main execution entrypoint.
 * @param {string[]} argv
 * @returns {Promise<number>} Exit code
 */
export async function runCli(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return EXIT_CODES.TERM_OK;
  }

  const validationError = validateArgs(args);
  if (validationError) {
    console.error(`Error: ${validationError}`);
    return EXIT_CODES.TERM_BLOCK;
  }

  if (args.command === "sessions") {
    printSessionsList(listSessions(args.stateFile), args.json);
    return EXIT_CODES.TERM_OK;
  }

  try {
    let result = null;
    if (args.command === "ask" || args.command === "new") {
      result = await handleAskCommand(args);
    } else if (args.command === "fetch" || args.command === "status" || args.command === "wait") {
      result = await handleQueryCommand(args);
    } else if (args.command === "export") {
      const existing = getSession(args.session, args.stateFile);
      const markdown = args.input ? fs.readFileSync(path.resolve(args.input), "utf-8") : "";
      result = { ok: true, export: handleExport(args, markdown, existing?.title) };
    }

    if (args.exportDir && result?.markdown) {
      result.export = handleExport(args, result.markdown, result.title);
    }
    outputResult(result, args.json);
    return EXIT_CODES.TERM_OK;
  } catch (err) {
    console.error(`Execution failed: ${err.message}`);
    return EXIT_CODES.GENERAL_ERROR;
  }
}

/**
 * Determine if current script is CLI entry point.
 * @param {string} metaUrl
 * @returns {boolean}
 */
export function isCliEntry(metaUrl) {
  if (!process.argv[1]) return false;
  return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(metaUrl));
}

if (isCliEntry(import.meta.url)) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
