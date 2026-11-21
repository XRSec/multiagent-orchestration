#!/usr/bin/env node
// Purpose: Dispatch real tasks to Paseo's live bot-chief Global Assistant via official Paseo CLI and collect Feed telemetry.
// Context: Sanctioned CLI automation wrapper inspecting Paseo agent logs, delegated children, and paseo-feed JSONL storage.
// Usage: node scripts/paseo-chief-dispatch.mjs --mode <status|send> [--prompt <text>] [--new-chat] [--wait] [--timeout-ms <ms>]
// Prerequisites: Running Paseo daemon with paseo-bots, paseo-feed, paseo-long-session, and agy-acp enabled.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAC_PASEO_CLI = "/Applications/Paseo.app/Contents/Resources/bin/paseo";
const CHIEF_ID = "bot-chief";
const BOT_LABEL = "paseo-bots.bot";
const ACTIVE_PLUGINS = ["agy-acp", "paseo-bots", "paseo-feed", "paseo-long-session"];

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  let mode = "status", prompt = "", newChat = false, wait = false, timeoutMs = 180_000;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === "--mode" && i + 1 < args.length) mode = args[++i];
    else if (token === "--prompt" && i + 1 < args.length) prompt = args[++i];
    else if (token === "--new-chat") newChat = true;
    else if (token === "--wait") wait = true;
    else if (token === "--timeout-ms" && i + 1 < args.length) timeoutMs = Number.parseInt(args[++i], 10);
    else return { error: `Unknown or incomplete argument: ${token}`, exitCode: 2 };
  }
  if (!["status", "send"].includes(mode)) return { error: `Invalid --mode "${mode}".`, exitCode: 2 };
  if (mode === "send" && !prompt.trim()) return { error: "Missing --prompt for --mode send.", exitCode: 2 };
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000) return { error: "Invalid --timeout-ms.", exitCode: 2 };
  return { mode, prompt, newChat, wait, timeoutMs };
}

async function runPaseo(args, timeoutMs = 30_000) {
  const bins = [process.env.PASEO_CLI_PATH, "paseo", MAC_PASEO_CLI].filter(Boolean);
  let lastError;
  for (const bin of bins) {
    try {
      return await execFileAsync(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 });
    } catch (err) {
      lastError = err;
      if (err?.code === "ENOENT") continue;
      if (err?.killed || err?.signal === "SIGTERM") {
        const timeoutErr = new Error(`Timed out after ${timeoutMs}ms: paseo ${args[0]}`);
        timeoutErr.exitCode = 124;
        throw timeoutErr;
      }
      throw err;
    }
  }
  throw lastError || new Error("Paseo CLI executable not found.");
}

async function runPaseoJson(args, timeoutMs = 30_000) {
  const { stdout } = await runPaseo(args, timeoutMs);
  return JSON.parse(stdout.trim());
}

function isHumanChiefAgent(agent) {
  const labels = agent?.labels || {};
  return (
    labels[BOT_LABEL] === CHIEF_ID &&
    labels["paseo-bots.shadow-session"] !== "true" &&
    labels["paseo-bots.memory-curation"] !== "true" &&
    !labels["paseo-bots.asked-by"] &&
    !labels["paseo-bots.routine"]
  );
}

async function listAgents(includeArchived = true) {
  const list = await runPaseoJson(["ls", ...(includeArchived ? ["--all"] : []), "--json"]);
  return Array.isArray(list) ? list : [];
}

async function readFeedSnapshot() {
  const dataDir = process.env.PASEO_FEED_DATA_DIR || join(homedir(), ".paseo", "plugin-data", "paseo-feed");
  const indexPath = join(dataDir, "index.jsonl");
  const indexExists = existsSync(indexPath);
  let pointers = [];
  if (indexExists) {
    try {
      const raw = await readFile(indexPath, "utf8");
      pointers = raw.split("\n").map((l) => l.trim()).filter(Boolean).flatMap((l) => {
        try { return [JSON.parse(l)]; } catch { return []; }
      });
    } catch { pointers = []; }
  }
  let legacyChannelFiles = [];
  try {
    legacyChannelFiles = (await readdir(join(dataDir, "channels"))).filter((f) => f.endsWith(".jsonl")).sort();
  } catch { legacyChannelFiles = []; }
  const chiefPointers = pointers.filter((p) => p?.botId === CHIEF_ID);
  const teamPointerCount = pointers.filter((p) => Array.isArray(p?.teamIds) && p.teamIds.length > 0).length;
  return {
    dataDir, indexPath, indexExists,
    totalPointers: pointers.length,
    chiefPointerCount: chiefPointers.length,
    teamPointerCount,
    latestChiefPointer: chiefPointers[chiefPointers.length - 1] || null,
    legacyChannelFiles,
  };
}

async function readPluginLogSummary(pluginId) {
  const fmt = (e) => `${e?.timestamp || ""} [${e?.stream || "out"}] ${String(e?.message || "").trim()}`.slice(0, 240);
  const isErr = (e) => !/DeprecationWarning/.test(String(e?.message || "")) && /\b(error|err|fatal|exception|unhandled|failed)\b/i.test(String(e?.message || ""));
  try {
    const raw = await runPaseoJson(["plugin", "logs", pluginId, "--json"], 15_000);
    const list = Array.isArray(raw) ? raw : [];
    const errorLogs = list.filter(isErr).slice(-5).map(fmt);
    return { totalLogLines: list.length, recentLogs: list.slice(-5).map(fmt), ...(errorLogs.length ? { errorLogs } : {}) };
  } catch (err) {
    return { totalLogLines: 0, recentLogs: [], logReadError: err?.message || String(err) };
  }
}

function extractTurnTelemetry(logsPayload) {
  const items = Array.isArray(logsPayload?.items) ? logsPayload.items : [];
  let start = items.length;
  while (start > 0 && items[start - 1]?.type !== "user_message") start--;
  const latestTurn = items.slice(start);
  return {
    toolCalls: latestTurn.filter((i) => i.type === "tool_call").map((i) => ({ name: i.name || i.detail?.name || "unknown" })),
    reply: latestTurn.filter((i) => i.type === "assistant_message" && typeof i.text === "string").map((i) => i.text.trim()).filter(Boolean).join("\n\n"),
  };
}

async function createOrReuseChiefChat(opts) {
  const homeDir = process.env.PASEO_HOME || join(homedir(), ".paseo");
  const chiefDir = join(homeDir, "plugin-data", "paseo-bots", "shared", "Bots", CHIEF_ID);
  await mkdir(chiefDir, { recursive: true });

  if (!opts.newChat) {
    const active = (await listAgents(false)).find(isHumanChiefAgent);
    if (active?.id) {
      await runPaseo(["send", active.id, opts.prompt]);
      return { agentId: active.id, dispatchPath: "paseo-send" };
    }
  }
  const created = await runPaseoJson([
    "run", "--provider", "agy/gemini-4-hydrogen", "--mode", "full-access", "--cwd", chiefDir,
    "--label", `${BOT_LABEL}=${CHIEF_ID}`, "--label", "paseo-bots.global-assistant=true",
    "--label", "paseo-bots.lifecycle-mount=true", "--label", "paseo-long-session.enabled=true",
    "--title", opts.prompt.slice(0, 80), "--json", "--no-wait", opts.prompt,
  ]);
  const agentId = created?.agentId || created?.id || created?.Id || created?.agent?.id || null;
  if (!agentId) throw new Error(`Unexpected \`paseo run --json\` payload: ${JSON.stringify(created)}`);
  return { agentId, dispatchPath: "paseo-run" };
}

async function collectDispatchTelemetry(agentId, dispatchPath) {
  await new Promise((r) => setTimeout(r, 1500));
  const [inspect, logs, allAgents, feed] = await Promise.all([
    runPaseoJson(["inspect", agentId, "--json"]),
    runPaseoJson(["logs", agentId, "--tail", "60", "--json"]),
    listAgents(true),
    readFeedSnapshot(),
  ]);
  const selfAgent = allAgents.find((a) => a.id === agentId) || null;
  const delegatedChildren = allAgents
    .filter((a) => a.id !== agentId && a.labels?.["paseo-bots.asked-in"] === agentId)
    .map((a) => ({
      id: a.id, botId: a.labels?.[BOT_LABEL] || null, title: a.name,
      status: a.status, tierDepth: a.labels?.["paseo-bots.tier-depth"] || null,
    }));
  const { toolCalls, reply } = extractTurnTelemetry(logs);
  return {
    ok: true, agentId, dispatchPath,
    status: inspect?.Status || selfAgent?.status || "unknown",
    labels: selfAgent?.labels || {}, pendingPermissions: inspect?.PendingPermissions || [],
    toolCalls, delegatedChildren, reply,
    indexExists: feed.indexExists,
    totalPointers: feed.totalPointers,
    chiefPointerCount: feed.chiefPointerCount,
    teamPointerCount: feed.teamPointerCount,
    latestChiefPointer: feed.latestChiefPointer,
    legacyChannelFiles: feed.legacyChannelFiles,
  };
}

async function handleStatus() {
  const [pluginsRaw, allActive, feed, logEntries] = await Promise.all([
    runPaseoJson(["plugin", "ls", "--json"]),
    listAgents(false),
    readFeedSnapshot(),
    Promise.all(ACTIVE_PLUGINS.map(async (id) => [id, await readPluginLogSummary(id)])),
  ]);
  const logsById = Object.fromEntries(logEntries);
  const plugins = (Array.isArray(pluginsRaw) ? pluginsRaw : []).map((p) => {
    const id = p.id || p.pluginId;
    return { id, status: p.status, enabled: p.enabled, error: p.error || null };
  });
  const corePluginHealth = ACTIVE_PLUGINS.map((id) => {
    const p = plugins.find((x) => x.id === id) || { id, status: "missing", enabled: false, error: "Not registered" };
    return { ...p, ...logsById[id] };
  });
  const activeChiefAgents = allActive.filter(isHumanChiefAgent).map((a) => ({
    id: a.id, name: a.name, status: a.status, labels: a.labels,
  }));
  console.log(JSON.stringify({ ok: true, corePluginHealth, plugins, activeChiefAgents, feed }, null, 2));
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log("Usage: node scripts/paseo-chief-dispatch.mjs --mode <status|send> [--prompt <text>] [--new-chat] [--wait] [--timeout-ms <ms>]");
    process.exit(0);
  }
  if (opts.error) { console.error(opts.error); process.exit(opts.exitCode || 2); }
  if (opts.mode === "status") { await handleStatus(); return; }
  const { agentId, dispatchPath } = await createOrReuseChiefChat(opts);
  if (!opts.wait) { console.log(JSON.stringify({ ok: true, agentId, dispatchPath, waited: false }, null, 2)); return; }
  await runPaseo(["wait", agentId], opts.timeoutMs);
  console.log(JSON.stringify(await collectDispatchTelemetry(agentId, dispatchPath), null, 2));
}

main().catch((err) => {
  console.error("[paseo-chief-dispatch] Error:", err?.message || err);
  process.exit(err?.exitCode || 1);
});
