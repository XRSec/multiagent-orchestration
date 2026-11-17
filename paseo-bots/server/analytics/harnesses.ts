import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HarnessKind } from "../../shared/analytics";
import { buildExecutionTelemetry, extractSubagentConversationId, type RawToolEvent } from "./distill";

export interface SessionTurn {
  user: string;
  tools: string[];
  telemetry: string;
  reply: string;
}

export interface ExtractedSession {
  harness: "paseo" | "agy" | "claude" | "pi";
  sessionId: string;
  startTime: Date;
  endTime: Date;
  turns: SessionTurn[];
  toolCounts: Record<string, number>;
  skillsRead: string[];
  subagentsSpawned: string[];
  errorCount: number;
}

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export interface HarnessDirs {
  agyDir?: string;
  claudeDir?: string;
  piDir?: string;
}

export const POLLING_TOOLS = new Set(["read_board", "swarm_wait", "manage_task"]);

export function parseDateRange(opts: { date?: string; from?: string; to?: string; days?: number; hours?: number }): DateRange {
  const now = new Date();
  if (opts.hours && opts.hours > 0) {
    const label = opts.hours % 24 === 0 ? `last-${opts.hours / 24}d` : `last-${opts.hours}h`;
    return { start: new Date(now.getTime() - opts.hours * 3600_000), end: now, label };
  }
  if (opts.date) {
    const start = parseLocalDayStart(opts.date);
    return { start, end: new Date(start.getTime() + 86400000 - 1), label: opts.date };
  }
  if (opts.from || toValid(opts.to)) {
    const start = opts.from ? parseLocalDayStart(opts.from) : new Date(0);
    const endDay = opts.to ? parseLocalDayStart(opts.to) : parseLocalDayStart(formatLocalDate(now));
    const end = new Date(endDay.getTime() + 86400000 - 1);
    if (start > end) throw new Error(`Invalid range: from (${opts.from}) > to (${opts.to})`);
    return { start, end, label: `${opts.from || "*"}..${opts.to || "*"}` };
  }
  const n = opts.days && opts.days > 0 ? opts.days : 1;
  const end = new Date(parseLocalDayStart(formatLocalDate(now)).getTime() + 86400000 - 1);
  const start = new Date(end.getTime() - n * 86400000 + 1);
  return { start, end, label: `last-${n}d` };
}

function toValid(s?: string): boolean {
  return Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));
}

function parseLocalDayStart(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function formatLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function unquoteArg(val: unknown): string {
  if (typeof val !== "string") return "";
  const s = val.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try { return JSON.parse(s) as string; } catch { return s.slice(1, -1); }
  }
  return s;
}

function shortenPath(p: unknown): string {
  const clean = unquoteArg(p);
  if (!clean) return "";
  const parts = clean.split("/").filter(Boolean);
  if (clean.includes("SKILL.md")) return parts.slice(-2).join("/");
  return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : clean;
}

function summarizeTool(name: string, args: Record<string, unknown> = {}): string | null {
  if (POLLING_TOOLS.has(name)) return null;
  if (name === "run_command" || name === "Bash" || name === "bash") {
    const label = unquoteArg(args.toolSummary) || unquoteArg(args.CommandLine) || unquoteArg(args.command);
    return `run(${label.slice(0, 60)})`;
  }
  if (name === "read_file" || name === "Read" || name === "read") return `read(${shortenPath(args.Path ?? args.file_path ?? args.path)})`;
  if (name === "edit_file" || name === "Edit" || name === "edit" || name === "write_file" || name === "Write" || name === "write") {
    const op = name.toLowerCase().includes("write") ? "write" : "edit";
    return `${op}(${shortenPath(args.Path ?? args.file_path ?? args.path)})`;
  }
  if (name === "invoke_subagent" || name === "Agent" || name === "Task") {
    return `subagent(${unquoteArg(args.TypeName ?? args.subagent_type ?? "") || unquoteArg(args.Role ?? args.description ?? "")})`;
  }
  if (name === "search_web" || name === "WebSearch") return `search(${unquoteArg(args.query).slice(0, 50)})`;
  if (name === "call_mcp_tool") return `mcp(${unquoteArg(args.ServerName)}.${unquoteArg(args.ToolName)})`;
  if (name === "swarm") return `swarm(${unquoteArg(args.action)})`;
  return name;
}

export function pushToolSummary(turn: SessionTurn | undefined, name: string, args: Record<string, unknown>, counts: Record<string, number>, skills: Set<string>) {
  counts[name] = (counts[name] || 0) + 1;
  const p = unquoteArg(args.Path ?? args.file_path ?? args.path);
  if (p.includes("SKILL.md")) skills.add(shortenPath(p));
  const brief = summarizeTool(name, args);
  if (brief && turn && turn.tools.length < 15 && turn.tools[turn.tools.length - 1] !== brief) {
    turn.tools.push(brief);
  }
}

export function extractAgyUserText(content: unknown): string {
  if (typeof content !== "string") return "";
  const match = content.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
  const text = match ? match[1] : content;
  return text
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, "")
    .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g, "")
    .trim();
}

export interface TurnAcc {
  turn: SessionTurn;
  thought: string;
  events: RawToolEvent[];
  pendingIdx: number;
}

export function finalizeTurns(accs: TurnAcc[]): SessionTurn[] {
  return accs.map((a) => ({
    ...a.turn,
    telemetry: buildExecutionTelemetry(a.thought, a.events),
  }));
}

function parseAgyFile(filePath: string, sessionId: string, range: DateRange, maxSnippet = 600): ExtractedSession | null {
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const accs: TurnAcc[] = [];
  const counts: Record<string, number> = {};
  const skills = new Set<string>();
  const subagentsSpawned = new Set<string>();
  let startTime: Date | null = null;
  let endTime: Date | null = null;
  let errorCount = 0;

  for (const line of lines) {
    let step: Record<string, any>;
    try { step = JSON.parse(line); } catch { continue; }
    const ts = step.created_at ? new Date(step.created_at) : null;
    if (!ts || Number.isNaN(ts.getTime()) || ts < range.start || ts > range.end) continue;
    if (!startTime || ts < startTime) startTime = ts;
    if (!endTime || ts > endTime) endTime = ts;

    if (step.type === "USER_INPUT") {
      const user = extractAgyUserText(step.content);
      if (user) accs.push({ turn: { user: user.slice(0, maxSnippet), tools: [], telemetry: "", reply: "" }, thought: "", events: [], pendingIdx: 0 });
    } else if (step.type === "PLANNER_RESPONSE") {
      const cur = accs[accs.length - 1];
      if (!cur) continue;
      if (typeof step.thinking === "string" && step.thinking.trim()) cur.thought = step.thinking;
      cur.pendingIdx = cur.events.length;
      for (const tc of step.tool_calls || []) {
        const name = tc?.name || "unknown";
        const args = (tc?.args || {}) as Record<string, unknown>;
        pushToolSummary(cur.turn, name, args, counts, skills);
        if (!POLLING_TOOLS.has(name)) cur.events.push({ name, args });
      }
      if (step.content && String(step.content).trim()) cur.turn.reply = String(step.content).trim().slice(0, 1000);
    } else if (step.type === "GENERIC" || step.type === "ERROR_MESSAGE") {
      const cur = accs[accs.length - 1];
      const isErr = step.type === "ERROR_MESSAGE" || step.status === "ERROR" || Boolean(step.error);
      if (isErr) errorCount++;
      if (cur && cur.pendingIdx < cur.events.length) {
        const target = cur.events[cur.pendingIdx++];
        if (target) {
          target.output = String(step.error || step.content || "");
          target.status = isErr ? "ERR" : "OK";
          if (target.name === "invoke_subagent" || target.name === "Agent" || target.name === "Task") {
            const subId = extractSubagentConversationId(target.output);
            if (subId) subagentsSpawned.add(subId);
          }
        }
      }
    }
  }
  if (!startTime || !endTime || accs.length === 0) return null;
  if (/^(?:# Multi-Harness Session Digest|## \[(?:AGY|CLAUDE|PI)\] Session )/.test(accs[0]!.turn.user)) return null;
  return { harness: "agy", sessionId, startTime, endTime, turns: finalizeTurns(accs), toolCounts: counts, skillsRead: [...skills], subagentsSpawned: [...subagentsSpawned], errorCount };
}

function extractTextBlocks(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join("\n");
}

function parseClaudeOrPiFile(filePath: string, harness: "claude" | "pi", range: DateRange, maxSnippet = 600): ExtractedSession | null {
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const accs: TurnAcc[] = [];
  const counts: Record<string, number> = {};
  const skills = new Set<string>();
  const byCallId = new Map<string, RawToolEvent>();
  let startTime: Date | null = null;
  let endTime: Date | null = null;
  let errorCount = 0;

  for (const line of lines) {
    let row: Record<string, any>;
    try { row = JSON.parse(line); } catch { continue; }
    const ts = row.timestamp ? new Date(row.timestamp) : null;
    if (!ts || Number.isNaN(ts.getTime()) || ts < range.start || ts > range.end) continue;
    const msg = row.message;
    if (!msg) continue;
    if (!startTime || ts < startTime) startTime = ts;
    if (!endTime || ts > endTime) endTime = ts;

    if (msg.role === "user") {
      if (Array.isArray(msg.content)) {
        for (const b of msg.content) {
          if (b?.type === "tool_result") {
            if (b.is_error) errorCount++;
            const ev = byCallId.get(b.tool_use_id);
            if (ev) {
              ev.status = b.is_error ? "ERR" : "OK";
              ev.output = typeof b.content === "string" ? b.content : extractTextBlocks(b.content);
            }
          }
        }
      }
      const text = extractTextBlocks(msg.content);
      if (text) accs.push({ turn: { user: text.slice(0, maxSnippet), tools: [], telemetry: "", reply: "" }, thought: "", events: [], pendingIdx: 0 });
    } else if (msg.role === "assistant") {
      const cur = accs[accs.length - 1];
      if (!cur) continue;
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block?.type === "thinking" && typeof block.thinking === "string") cur.thought = block.thinking;
          if (block?.type === "tool_use" || block?.type === "toolCall") {
            const name = block.name || "unknown";
            const args = (block.input || block.arguments || {}) as Record<string, unknown>;
            pushToolSummary(cur.turn, name, args, counts, skills);
            const ev: RawToolEvent = { name, args };
            cur.events.push(ev);
            if (block.id) byCallId.set(String(block.id), ev);
          }
        }
      }
      const reply = extractTextBlocks(msg.content);
      if (reply) cur.turn.reply = reply.slice(0, 1000);
    } else if (msg.role === "toolResult") {
      if (row.isError) errorCount++;
      const ev = byCallId.get(String(msg.toolCallId || row.toolCallId || ""));
      if (ev) {
        ev.status = row.isError ? "ERR" : "OK";
        ev.output = extractTextBlocks(msg.content);
      }
    }
  }
  if (!startTime || !endTime || accs.length === 0) return null;
  if (/^(?:# Multi-Harness Session Digest|## \[(?:AGY|CLAUDE|PI)\] Session )/.test(accs[0]!.turn.user)) return null;
  return { harness, sessionId: path.basename(filePath, ".jsonl"), startTime, endTime, turns: finalizeTurns(accs), toolCounts: counts, skillsRead: [...skills], subagentsSpawned: [], errorCount };
}

function walkJsonl(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsonl(full, out);
    else if (entry.name.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

export function loadHarnessSessions(harness: HarnessKind, range: DateRange, maxSessions = 40, dirs: HarnessDirs = {}): ExtractedSession[] {
  const home = os.homedir();
  const sessions: ExtractedSession[] = [];
  if (harness === "all" || harness === "agy") {
    const agyDir = dirs.agyDir ?? process.env.AGY_BRAIN_DIR ?? path.join(home, ".gemini", "antigravity", "brain");
    if (fs.existsSync(agyDir)) {
      for (const d of fs.readdirSync(agyDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
        const log = path.join(agyDir, d.name, ".system_generated", "logs", "transcript.jsonl");
        if (fs.existsSync(log)) {
          const s = parseAgyFile(log, d.name, range);
          if (s) sessions.push(s);
        }
      }
    }
  }
  if (harness === "all" || harness === "claude") {
    for (const file of walkJsonl(dirs.claudeDir ?? path.join(home, ".claude", "projects"))) {
      const s = parseClaudeOrPiFile(file, "claude", range);
      if (s) sessions.push(s);
    }
  }
  if (harness === "all" || harness === "pi") {
    for (const file of walkJsonl(dirs.piDir ?? path.join(home, ".pi", "agent", "sessions"))) {
      const s = parseClaudeOrPiFile(file, "pi", range);
      if (s) sessions.push(s);
    }
  }
  sessions.sort((a, b) => b.endTime.getTime() - a.endTime.getTime());
  return sessions.slice(0, maxSessions);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

export function formatSessionBlock(s: ExtractedSession, maxChars = 6000): string {
  const tools = Object.entries(s.toolCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(", ");
  const totalCalls = Object.values(s.toolCounts).reduce((acc, c) => acc + c, 0);
  const durationStr = formatDuration(s.endTime.getTime() - s.startTime.getTime());
  const lines = [
    `## [${s.harness.toUpperCase()}] Session ${s.sessionId.slice(0, 8)} (${s.startTime.toISOString()} -> ${s.endTime.toISOString()} | Duration: ${durationStr} | Total Calls: ${totalCalls})`,
    `- Tools (${totalCalls}): ${tools || "none"} | Errors: ${s.errorCount}`,
  ];
  if (s.subagentsSpawned && s.subagentsSpawned.length) {
    lines.push(`- Subagents Spawned: ${s.subagentsSpawned.map((id) => id.slice(0, 8)).join(", ")} (full: ${s.subagentsSpawned.join(", ")})`);
  }
  if (s.skillsRead.length) lines.push(`- Skills Used: ${s.skillsRead.join(", ")}`);
  s.turns.forEach((t, idx) => {
    lines.push(`### Turn ${idx + 1}`);
    lines.push(`- **User**: ${t.user}`);
    if (t.telemetry) lines.push(t.telemetry);
    else if (t.tools.length) lines.push(`- **Tools**: ${t.tools.join(" -> ")}`);
    if (t.reply) lines.push(`- **Reply**: ${t.reply}`);
  });
  const block = lines.join("\n");
  return block.length > maxChars ? `${block.slice(0, maxChars)}\n... [truncated]` : block;
}

export function formatDigest(sessions: ExtractedSession[], range: DateRange, maxTotalChars = 36000): string {
  const header = `# Multi-Harness Session Digest (${range.label})\nSessions: ${sessions.length}\n`;
  const parts = [header];
  let total = header.length;
  for (const s of sessions) {
    const block = formatSessionBlock(s);
    if (total + block.length + 2 > maxTotalChars) {
      parts.push(`... [${sessions.length - parts.length + 1} more sessions omitted due to budget]`);
      break;
    }
    parts.push(block);
    total += block.length + 2;
  }
  return parts.join("\n\n");
}
