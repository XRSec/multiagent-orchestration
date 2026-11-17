// Purpose: Extract high-signal agy session turns (user request, tool summary, subagent trace, reply) by date range.
// Context: Filters out raw tool stdout, thinking, and polling noise; stitches parent-child subagent traces and deduplicates root sessions.
// Usage: Imported by analyze-sessions.mjs (parseDateRange, loadSessionsInRange, formatDigestMarkdown).
// Prerequisites: Node.js >= 20, read access to ~/.gemini/antigravity/brain.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const POLLING_TOOLS = new Set(["read_board", "swarm_wait", "manage_task"]);
const SUBAGENT_TOOLS = new Set(["invoke_subagent", "send_message", "swarm"]);
const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const UUID_GLOBAL_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

export function defaultBrainDir() {
  return process.env.AGY_BRAIN_DIR || path.join(os.homedir(), ".gemini", "antigravity", "brain");
}

export function parseDateRange({ date, from, to, days }) {
  const now = new Date();
  if (date) {
    const start = parseLocalDayStart(date);
    return { start, end: new Date(start.getTime() + 86400000 - 1), label: date };
  }
  if (from || to) {
    const start = from ? parseLocalDayStart(from) : new Date(0);
    const endDay = to ? parseLocalDayStart(to) : parseLocalDayStart(formatLocalDate(now));
    const end = new Date(endDay.getTime() + 86400000 - 1);
    if (start > end) throw new Error(`Invalid range: from (${from}) > to (${to})`);
    return { start, end, label: `${from || "*"}..${to || "*"}` };
  }
  const n = Number.isFinite(days) && days > 0 ? days : 1;
  const end = new Date(parseLocalDayStart(formatLocalDate(now)).getTime() + 86400000 - 1);
  const start = new Date(end.getTime() - n * 86400000 + 1);
  return { start, end, label: `last-${n}d` };
}

function parseLocalDayStart(yyyyMmDd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
    throw new Error(`Invalid date format "${yyyyMmDd}", expected YYYY-MM-DD`);
  }
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function formatLocalDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function unquoteArg(val) {
  if (val === null || val === undefined) return "";
  if (typeof val !== "string") return String(val);
  const s = val.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  return s;
}

function pickArg(args, keys) {
  if (!args || typeof args !== "object") return "";
  for (const k of keys) {
    const val = unquoteArg(args[k]);
    if (val) return val;
  }
  return "";
}

function compactText(text, maxLen = 90) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function shortenPath(p) {
  const clean = unquoteArg(p);
  if (!clean) return "";
  if (clean.includes("SKILL.md")) {
    const parts = clean.split("/").filter(Boolean);
    return parts.slice(-2).join("/");
  }
  const parts = clean.split("/").filter(Boolean);
  return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : clean;
}

function extractSubagentMeta(name, args) {
  const target = pickArg(args, [
    "subagent",
    "subagent_name",
    "agent_name",
    "name",
    "conversation_id",
    "recipient",
    "Recipient",
    "TypeName",
    "action",
  ]);
  const role = pickArg(args, ["role", "Role"]);
  const task = pickArg(args, ["prompt", "message", "task", "instruction", "description", "content"]);
  const label = target && role && target !== role ? `${target}:${role}` : (target || role);
  const displayName = pickArg(args, ["subagent", "subagent_name", "agent_name", "name", "TypeName", "Role"]) || "subagent";
  return { label, task: compactText(task, 90), displayName, rawTarget: target };
}

function summarizeToolCall(tc) {
  const name = tc?.name || "unknown";
  const args = tc?.args || {};
  if (POLLING_TOOLS.has(name)) return null;
  if (name === "run_command") {
    const label = unquoteArg(args.toolSummary) || unquoteArg(args.CommandLine);
    return `run(${label.slice(0, 60)})`;
  }
  if (name === "read_file") return `read(${shortenPath(args.Path || args.path)})`;
  if (name === "edit_file" || name === "write_file") {
    return `${name.replace("_file", "")}(${shortenPath(args.Path || args.path)})`;
  }
  if (name === "invoke_subagent") {
    const meta = extractSubagentMeta(name, args);
    const parts = [meta.label, meta.task ? `"${meta.task}"` : ""].filter(Boolean);
    return `subagent(${parts.join(" | ")})`;
  }
  if (name === "search_web") return `search(${unquoteArg(args.query).slice(0, 50)})`;
  if (name === "call_mcp_tool") return `mcp(${unquoteArg(args.ServerName)}.${unquoteArg(args.ToolName)})`;
  if (name === "swarm") {
    const meta = extractSubagentMeta(name, args);
    const parts = [meta.label, meta.task ? `"${meta.task}"` : ""].filter(Boolean);
    return `swarm(${parts.join(" | ")})`;
  }
  if (name === "send_message") {
    const meta = extractSubagentMeta(name, args);
    const targetShort = meta.rawTarget ? meta.rawTarget.slice(0, 12) : meta.label;
    const parts = [targetShort, meta.task ? `"${meta.task}"` : ""].filter(Boolean);
    return `msg(${parts.join(" | ")})`;
  }
  return name;
}

export function extractUserRequest(content) {
  if (!content || typeof content !== "string") return "";
  const match = content.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
  const text = match ? match[1] : content;
  return text
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, "")
    .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g, "")
    .trim();
}

function extractUuidsFromValue(val, selfSessionId) {
  if (!val) return [];
  const str = typeof val === "string" ? val : JSON.stringify(val);
  const matches = str.match(UUID_GLOBAL_RE) || [];
  const selfLower = (selfSessionId || "").toLowerCase();
  const seen = new Set();
  const out = [];
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (lower === selfLower || seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}

function attachChildLink(state, curTurn, toolEntry, childId, subagentName) {
  const idLower = childId.toLowerCase();
  state.referencedChildIds.add(idLower);
  if (subagentName && subagentName !== "subagent" && !state.childNames.has(idLower)) {
    state.childNames.set(idLower, subagentName);
  }
  const resolvedName = state.childNames.get(idLower) || subagentName || "subagent";
  if (toolEntry && !toolEntry.childIds.includes(idLower)) {
    toolEntry.childIds.push(idLower);
    toolEntry.subagentName = resolvedName;
  } else if (curTurn) {
    const lastSub = [...curTurn.tools].reverse().find((t) => t.isSubagent);
    if (lastSub && !lastSub.childIds.includes(idLower)) {
      lastSub.childIds.push(idLower);
      if (!lastSub.subagentName || lastSub.subagentName === "subagent") {
        lastSub.subagentName = resolvedName;
      }
    }
  }
}

function processStep(step, state, maxSnippet) {
  if (step.type === "USER_INPUT") {
    const req = extractUserRequest(step.content);
    if (!req) return;
    const turn = { user: req.slice(0, maxSnippet), tools: [], reply: "" };
    state.turns.push(turn);
    state.awaitingSubagentResponse = false;
    return;
  }
  const curTurn = state.turns[state.turns.length - 1];
  if (step.type === "PLANNER_RESPONSE") {
    state.awaitingSubagentResponse = false;
    for (const tc of step.tool_calls || []) {
      const name = tc?.name || "unknown";
      state.toolCounts[name] = (state.toolCounts[name] || 0) + 1;
      if (name === "read_file" && unquoteArg(tc?.args?.Path || tc?.args?.path).includes("SKILL.md")) {
        state.skillsRead.add(shortenPath(tc.args.Path || tc.args.path));
      }
      const brief = summarizeToolCall(tc);
      const isSubagent = SUBAGENT_TOOLS.has(name);
      let entry = null;
      if (brief && curTurn && curTurn.tools.length < 15) {
        const prev = curTurn.tools[curTurn.tools.length - 1];
        if (!prev || prev.brief !== brief || isSubagent) {
          entry = { brief, isSubagent, subagentName: "subagent", childIds: [] };
          curTurn.tools.push(entry);
        }
      }
      if (isSubagent) {
        state.awaitingSubagentResponse = true;
        const meta = extractSubagentMeta(name, tc?.args);
        const inlineUuids = [
          ...extractUuidsFromValue(tc?.args?.conversation_id, state.sessionId),
          ...extractUuidsFromValue(tc?.args?.recipient || tc?.args?.Recipient, state.sessionId),
          ...extractUuidsFromValue(tc?.result ?? tc?.response ?? tc?.output, state.sessionId),
        ];
        for (const uid of inlineUuids) {
          attachChildLink(state, curTurn, entry, uid, meta.displayName);
        }
        if (entry) entry.subagentName = meta.displayName;
      }
    }
    if (step.content && String(step.content).trim() && curTurn) {
      curTurn.reply = String(step.content).trim().slice(0, maxSnippet);
    }
  } else {
    if (step.type === "ERROR_MESSAGE" || step.status === "ERROR" || step.error) {
      state.errorCount++;
    }
    if (state.awaitingSubagentResponse) {
      const stepUuids = extractUuidsFromValue(
        step.content ?? step.output ?? step.result ?? step.tool_results ?? step,
        state.sessionId
      );
      for (const uid of stepUuids) {
        attachChildLink(state, curTurn, null, uid, null);
      }
    }
  }
}

export function summarizeSubagentSession(brainDir, childSessionId, subagentName = "subagent", visited = new Set()) {
  const idLower = childSessionId.toLowerCase();
  if (visited.has(idLower)) return null;
  visited.add(idLower);

  const logPath = path.join(brainDir, childSessionId, ".system_generated", "logs", "transcript.jsonl");
  if (!fs.existsSync(logPath)) return null;

  const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean);
  const toolCounts = {};
  const anomalies = [];
  let errorCount = 0;
  let lastReply = "";
  let lastToolBrief = "";
  let lastStepIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    let step;
    try { step = JSON.parse(lines[i]); } catch { continue; }
    const stepIdx = step.step_index ?? i;
    lastStepIdx = stepIdx;

    if (step.type === "PLANNER_RESPONSE") {
      for (const tc of step.tool_calls || []) {
        const name = tc?.name || "unknown";
        toolCounts[name] = (toolCounts[name] || 0) + 1;
        const brief = summarizeToolCall(tc);
        if (brief) lastToolBrief = brief;
        if (tc?.status === "ERROR" || tc?.error) {
          errorCount++;
          const errMsg = compactText(tc.error?.message || tc.error || "tool error", 80);
          anomalies.push(`[${stepIdx}] ${brief || name} -> status=ERR (${errMsg})`);
        }
      }
      if (step.content && String(step.content).trim()) {
        lastReply = compactText(step.content, 140);
      }
    } else if (step.type === "ERROR_MESSAGE" || step.status === "ERROR" || step.error) {
      errorCount++;
      const errMsg = compactText(
        step.error?.message || step.error || step.content || "error",
        80
      );
      anomalies.push(`[${stepIdx}] ${lastToolBrief || step.type} -> status=ERR (${errMsg})`);
    } else if (
      typeof step.content === "string" &&
      /\b(status=ERR|error TS\d+|ERR!|Command failed|Exit code [1-9])/i.test(step.content) &&
      lastToolBrief
    ) {
      const errLine = step.content
        .split("\n")
        .find((l) => /error|ERR!|failed|TS\d+/i.test(l)) || step.content;
      anomalies.push(`[${lastStepIdx}] ${lastToolBrief} -> status=ERR (${compactText(errLine, 80)})`);
    }
  }

  const toolsStr = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");

  return {
    id: childSessionId.slice(0, 8),
    fullId: childSessionId,
    name: subagentName || "subagent",
    toolsStr: toolsStr || "none",
    errorCount,
    anomalies: anomalies.slice(0, 3),
    outcome: lastReply || "no final reply",
  };
}

export function formatSubagentTraceXml(trace) {
  if (!trace) return "";
  const anomalyStr = trace.anomalies.length ? trace.anomalies.join(" ; ") : "none";
  return [
    `<subagent_trace id="${trace.id}" name="${trace.name}">`,
    `  - Tools: ${trace.toolsStr} | Errors: ${trace.errorCount}`,
    `  - Anomalies: ${anomalyStr}`,
    `  - Outcome: "${trace.outcome.replace(/"/g, "'")}"`,
    `</subagent_trace>`,
  ].join("\n");
}

export function parseSessionFile(filePath, sessionId, range, maxSnippet = 600) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const state = {
    sessionId,
    startTime: null,
    endTime: null,
    matchedSteps: 0,
    turns: [],
    toolCounts: {},
    skillsRead: new Set(),
    errorCount: 0,
    referencedChildIds: new Set(),
    childNames: new Map(),
    awaitingSubagentResponse: false,
  };
  for (const line of lines) {
    let step;
    try { step = JSON.parse(line); } catch { continue; }
    const ts = step.created_at ? new Date(step.created_at) : null;
    if (!ts || Number.isNaN(ts.getTime()) || ts < range.start || ts > range.end) continue;
    state.matchedSteps++;
    if (!state.startTime || ts < state.startTime) state.startTime = ts;
    if (!state.endTime || ts > state.endTime) state.endTime = ts;
    processStep(step, state, maxSnippet);
  }
  if (state.matchedSteps === 0 || state.turns.length === 0) return null;
  return {
    sessionId: state.sessionId,
    startTime: state.startTime,
    endTime: state.endTime,
    matchedSteps: state.matchedSteps,
    turns: state.turns,
    toolCounts: state.toolCounts,
    skillsRead: [...state.skillsRead],
    errorCount: state.errorCount,
    referencedChildIds: [...state.referencedChildIds],
    subagentTraces: {},
  };
}

export function loadSessionsInRange(brainDir, range, { maxSessions = 50 } = {}) {
  if (!fs.existsSync(brainDir)) throw new Error(`Brain directory not found: ${brainDir}`);
  const dirs = fs.readdirSync(brainDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  const dirByLower = new Map(dirs.map((d) => [d.name.toLowerCase(), d.name]));
  const allSessions = [];
  const referencedChildIds = new Set();

  for (const dir of dirs) {
    const logPath = path.join(brainDir, dir.name, ".system_generated", "logs", "transcript.jsonl");
    if (!fs.existsSync(logPath)) continue;
    const summary = parseSessionFile(logPath, dir.name, range);
    if (!summary) continue;
    for (const childId of summary.referencedChildIds) {
      referencedChildIds.add(childId.toLowerCase());
    }
    allSessions.push(summary);
  }

  // Deduplicate: exclude child subagent sessions from top-level root sessions
  const rootSessions = allSessions.filter((s) => !referencedChildIds.has(s.sessionId.toLowerCase()));

  // Stitch inline subagent traces onto root sessions
  for (const s of rootSessions) {
    for (const turn of s.turns) {
      for (const tool of turn.tools) {
        for (const childLower of tool.childIds || []) {
          if (!s.subagentTraces[childLower]) {
            const actualDirName = dirByLower.get(childLower) || childLower;
            const trace = summarizeSubagentSession(brainDir, actualDirName, tool.subagentName);
            if (trace) s.subagentTraces[childLower] = trace;
          }
        }
      }
    }
  }

  rootSessions.sort((a, b) => b.endTime - a.endTime);
  return rootSessions.slice(0, maxSessions);
}

export function formatSingleSession(s, maxChars = 3500) {
  const tools = Object.entries(s.toolCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  const lines = [
    `## [AGY] Session ${s.sessionId.slice(0, 8)} (${s.startTime.toISOString()} -> ${s.endTime.toISOString()})`,
    `- Tools: ${tools || "none"} | Errors: ${s.errorCount}`,
  ];
  if (s.skillsRead.length) lines.push(`- Skills Used: ${s.skillsRead.join(", ")}`);
  s.turns.forEach((t, idx) => {
    lines.push(`### Turn ${idx + 1}`);
    lines.push(`- **User**: ${t.user}`);
    if (t.tools.length) {
      const toolBriefs = t.tools.map((item) => (typeof item === "string" ? item : item.brief));
      lines.push(`- **Tools**: ${toolBriefs.join(" -> ")}`);
      for (const item of t.tools) {
        if (typeof item === "object" && item.childIds?.length) {
          for (const cid of item.childIds) {
            const trace = s.subagentTraces?.[cid];
            if (trace) lines.push(formatSubagentTraceXml(trace));
          }
        }
      }
    }
    if (t.reply) lines.push(`- **Reply**: ${t.reply}`);
  });
  const block = lines.join("\n");
  return block.length > maxChars ? `${block.slice(0, maxChars)}\n... [truncated]` : block;
}

export function formatDigestMarkdown(sessions, range, { maxCharsPerSession = 3500, maxTotalChars = 36000 } = {}) {
  const header = `# AGY Session Digest (${range.label})\nSessions: ${sessions.length}\n`;
  const parts = [header];
  let totalLen = header.length;
  for (const s of sessions) {
    const block = formatSingleSession(s, maxCharsPerSession);
    if (totalLen + block.length + 2 > maxTotalChars) {
      parts.push(`... [${sessions.length - parts.length + 1} more sessions omitted due to budget]`);
      break;
    }
    parts.push(block);
    totalLen += block.length + 2;
  }
  return parts.join("\n\n");
}
