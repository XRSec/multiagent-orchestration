import type { ToolFootprintDigest } from "./companion-intent";

// A bot's daily log and recent-work brief, after OpenMausBot's memory/log and
// recent-work.ts. The app writes one line per finished turn to
// memory/log/YYYY-MM-DD.md; the newest line from each chat of the last two days
// goes into the next chat's prompt.

const REPLY_MAX = 240;
const TITLE_MAX = 60;
const MAX_TOOLS = 6;
const BRIEF_HOURS = 48;
const BRIEF_LINES = 10;
const BRIEF_CHARS = 1_400;
const BRIEF_QUOTE_MAX = 160;

/** One line of whitespace-collapsed text, cut to `max` characters. */
export function foldText(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Hides common credential formats before text is written to disk. */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b(sk|ak|pk|rk)[-_][A-Za-z0-9_-]{16,}/g, "[redacted]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted]")
    .replace(/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "[redacted]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{20,}/g, "$1 [redacted]");
}

/** "mcp__bots__ask_bot" and "bots.ask_bot" read as "bots/ask_bot"; built-in tools keep their names. */
export function toolLabel(name: string): string {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
  return mcp ? `${mcp[1]}/${mcp[2]}` : name;
}

export interface TimelineItemLike {
  type: string;
  text?: unknown;
  name?: unknown;
  input?: unknown;
  output?: unknown;
  call?: unknown;
  params?: unknown;
  locations?: unknown;
  exitCode?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

const MUTATION_TOOLS = new Set([
  "write_file",
  "edit_file",
  "create_file",
  "delete_file",
  "apply_patch",
  "patch_file",
  "fs/write_text_file",
]);

const INSPECTION_TOOLS = new Set([
  "read_file",
  "view_file",
  "fs/read_text_file",
  "list_files",
  "directory_list",
  "search_files",
  "grep",
]);

const CMD_TOOLS = new Set([
  "run_command",
  "bash",
  "terminal",
  "exec",
  "terminal/run",
]);

/**
 * Deterministically extracts ToolFootprintDigest from timeline items of the latest turn.
 * Extracts mutatedFiles (<=12), inspectedFiles (<=8), commandOutcomes (<=5), errorHeadlines (<=2).
 */
export function extractToolFootprintDigest(items: readonly TimelineItemLike[]): ToolFootprintDigest {
  let start = items.length;
  while (start > 0 && items[start - 1]!.type !== "user_message") start--;
  const turn = items.slice(start);

  const mutatedFiles: string[] = [];
  const inspectedFiles: string[] = [];
  const commandOutcomes: Array<{ command: string; exitCode: number }> = [];
  const errorHeadlines: string[] = [];

  for (const item of turn) {
    const rawName =
      typeof item.name === "string"
        ? item.name
        : typeof (item as any)?.detail?.name === "string"
          ? (item as any).detail.name
          : "";
    const name = toolLabel(rawName).toLowerCase();

    const extractPath = (): string | null => {
      const anyItem = item as Record<string, any>;
      const input =
        anyItem.detail?.input ||
        anyItem.input ||
        anyItem.params ||
        anyItem.call?.input ||
        anyItem.call ||
        anyItem.args;
      const pathVal =
        input?.Path ||
        input?.path ||
        input?.filePath ||
        input?.file_path ||
        input?.file ||
        input?.TargetFile ||
        input?.AbsolutePath;
      if (typeof pathVal === "string" && pathVal.trim()) {
        return pathVal.trim();
      }
      const locations = anyItem.locations || anyItem.detail?.locations;
      if (Array.isArray(locations) && locations.length > 0) {
        const loc = locations[0];
        const p = typeof loc === "string" ? loc : loc?.path || loc?.uri;
        if (typeof p === "string" && p.trim()) return p.trim();
      }
      return null;
    };

    if (MUTATION_TOOLS.has(name) || [...MUTATION_TOOLS].some((t) => name.endsWith(t))) {
      const p = extractPath();
      if (p && !mutatedFiles.includes(p) && mutatedFiles.length < 12) {
        mutatedFiles.push(p);
      }
    } else if (INSPECTION_TOOLS.has(name) || [...INSPECTION_TOOLS].some((t) => name.endsWith(t))) {
      const p = extractPath();
      if (p && !mutatedFiles.includes(p) && !inspectedFiles.includes(p) && inspectedFiles.length < 8) {
        inspectedFiles.push(p);
      }
    }

    if (CMD_TOOLS.has(name) || [...CMD_TOOLS].some((t) => name.endsWith(t))) {
      const anyItem = item as Record<string, any>;
      const input =
        anyItem.detail?.input ||
        anyItem.input ||
        anyItem.params ||
        anyItem.call?.input ||
        anyItem.call ||
        anyItem.args;
      const cmdVal =
        input?.CommandLine ||
        input?.command ||
        input?.cmd ||
        anyItem.detail?.input?.CommandLine ||
        anyItem.detail?.input?.command ||
        (typeof anyItem.text === "string" ? anyItem.text : "");
      const cmdStr = typeof cmdVal === "string" ? cmdVal.trim() : "";

      let exitCode = 0;
      if (typeof anyItem.exitCode === "number") {
        exitCode = anyItem.exitCode;
      } else if (typeof anyItem.detail?.exitCode === "number") {
        exitCode = anyItem.detail.exitCode;
      } else if (typeof anyItem.output?.exitCode === "number") {
        exitCode = anyItem.output.exitCode;
      } else if (typeof anyItem.detail?.output?.exitCode === "number") {
        exitCode = anyItem.detail.output.exitCode;
      } else if (typeof anyItem.text === "string") {
        const exitMatch = /Command exited with code (\d+)/i.exec(anyItem.text);
        if (exitMatch) {
          exitCode = parseInt(exitMatch[1]!, 10);
        } else if (/exit code:?\s*(\d+)/i.test(anyItem.text)) {
          const m = /exit code:?\s*(\d+)/i.exec(anyItem.text);
          if (m) exitCode = parseInt(m[1]!, 10);
        }
      }

      if (cmdStr && commandOutcomes.length < 5) {
        commandOutcomes.push({
          command: cmdStr.length > 80 ? `${cmdStr.slice(0, 77)}…` : cmdStr,
          exitCode,
        });
      }
    }

    // Error headlines extraction
    const anyItem = item as Record<string, any>;
    const text =
      typeof anyItem.text === "string"
        ? anyItem.text
        : typeof anyItem.output === "string"
          ? anyItem.output
          : typeof anyItem.detail?.text === "string"
            ? anyItem.detail.text
            : typeof anyItem.detail?.output === "string"
              ? anyItem.detail.output
              : "";
    const isExplicitError =
      (anyItem.exitCode !== undefined && anyItem.exitCode !== 0) ||
      (anyItem.detail?.exitCode !== undefined && anyItem.detail?.exitCode !== 0) ||
      (anyItem.output?.exitCode !== undefined && anyItem.output?.exitCode !== 0) ||
      (anyItem.detail?.output?.exitCode !== undefined && anyItem.detail?.output?.exitCode !== 0);
    if (item.type === "tool_result" || isExplicitError || anyItem.error || anyItem.detail?.error) {
      if ((isExplicitError || /error|failed|exception|fatal/i.test(text)) && errorHeadlines.length < 2) {
        const lines = text
          .split("\n")
          .map((l: string) => l.trim())
          .filter(
            (l: string) =>
              l &&
              !l.startsWith("Command exited with code") &&
              !/^exit code:?\s*\d+/i.test(l)
          );
        const firstLine =
          lines.find((l: string) => /error|failed|exception|fatal/i.test(l)) ||
          lines[0];
        if (firstLine && !errorHeadlines.includes(firstLine)) {
          errorHeadlines.push(firstLine.slice(0, 160));
        }
      }
    }
  }

  return {
    mutatedFiles,
    inspectedFiles,
    commandOutcomes,
    errorHeadlines,
  };
}

/** The latest turn in a chat's timeline: the bot's last reply and the tools it used. */
export function lastTurn(items: readonly TimelineItemLike[]): { reply: string; tools: string[] } {
  let start = items.length;
  while (start > 0 && items[start - 1]!.type !== "user_message") start--;
  const turn = items.slice(start);
  const reply = [...turn].reverse().find((item) => item.type === "assistant_message" && String(item.text ?? "").trim());
  const tools: string[] = [];
  for (const item of turn) {
    if (item.type !== "tool_call") continue;
    const rawName =
      typeof item.name === "string"
        ? item.name
        : typeof (item as any)?.detail?.name === "string"
          ? (item as any).detail.name
          : "";
    if (!rawName) continue;
    const label = toolLabel(rawName);
    if (!tools.includes(label) && tools.length < MAX_TOOLS) tools.push(label);
  }
  return { reply: String(reply?.text ?? ""), tools };
}

/** The text of the most recent user_message in a chat's timeline. */
export function lastUserText(items: readonly TimelineItemLike[]): string {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]!.type === "user_message") return String(items[i]!.text ?? "");
  }
  return "";
}

const INLINE_THINKING_RE = /<thinking>[\s\S]*?<\/thinking>/gi;

/**
 * Extracts the visible assistant prose body from the latest turn.
 * Takes only `item.type === "assistant_message"` items (strictly excluding tool_call,
 * tool_result, reasoning, thinking, plugin), strips any inline <thinking> blocks,
 * and joins non-empty prose chunks with `\n\n`.
 */
export function turnVisibleAssistantBody(items: readonly TimelineItemLike[]): string {
  let start = items.length;
  while (start > 0 && items[start - 1]!.type !== "user_message") start--;
  const turn = items.slice(start);

  const chunks: string[] = [];
  for (const item of turn) {
    if (item.type !== "assistant_message") continue;
    const raw = typeof item.text === "string" ? item.text : String(item.text ?? "");
    const stripped = raw.replace(INLINE_THINKING_RE, "").trim();
    if (stripped) {
      chunks.push(stripped);
    }
  }

  return chunks.join("\n\n");
}

const MEMORY_SIGNAL_RE = /(?:记住|别再|不要再|记到\s*memory\s*[:：]|我希望(?:以后|每次|你)?|\bremember\b|\bi\s+prefer\b|\balways\b|\bnever\b|\bdon't\b|\bsave\s+in\s+memory\s*:)/i;

/** Whether a user message carries a durable preference, correction, or explicit remember signal. */
export function hasMemorySignal(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 4000) return false;
  return MEMORY_SIGNAL_RE.test(trimmed);
}

const pad = (value: number) => String(value).padStart(2, "0");

/** YYYY-MM-DD in the host's time zone. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * One daily-log line: "- 09:05 · from chat "Title" · reply [tools: a, b]".
 * Null for a turn that finished without saying anything.
 */
export function logLine(input: { at: Date; chat: string; reply: string; tools: readonly string[]; failure?: string | null }): string | null {
  const reply = foldText(redactSecrets(input.reply), REPLY_MAX);
  const failure = input.failure ? `(turn failed: ${foldText(input.failure, 120)})` : "";
  if (!reply && !failure) return null;
  const tools = input.tools.length ? `[tools: ${input.tools.join(", ")}]` : "";
  const text = [reply, tools, failure].filter(Boolean).join(" ");
  return `- ${localTime(input.at)} · from chat "${foldText(input.chat.replace(/"/g, "'"), TITLE_MAX)}" · ${text}`;
}

export interface LogEntry {
  /** Local date and time of the turn. */
  at: Date;
  chat: string;
  text: string;
}

const LOG_LINE = /^- (\d{2}):(\d{2}) · from chat "([^"]*)" · (.*)$/;

/** The lines of one day's log file (YYYY-MM-DD.md); lines the bot wrote in another shape are skipped. */
export function parseLog(day: string, text: string): LogEntry[] {
  const [year, month, date] = day.split("-").map(Number);
  const entries: LogEntry[] = [];
  for (const line of text.split("\n")) {
    const match = LOG_LINE.exec(line.trim());
    if (!match || !year || !month || !date) continue;
    entries.push({ at: new Date(year, month - 1, date, Number(match[1]), Number(match[2])), chat: match[3]!, text: match[4]! });
  }
  return entries;
}

function dayLabel(at: Date, now: Date): string {
  const today = localDay(now);
  const yesterday = localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const day = localDay(at);
  return day === today ? "today" : day === yesterday ? "yesterday" : day;
}

/**
 * OpenMausBot's recent-work brief: the newest thing the bot said in each chat
 * over the last two days, newest first, within 10 lines and 1,400 characters.
 */
export function recentWork(entries: readonly LogEntry[], now: Date): string[] {
  const since = now.getTime() - BRIEF_HOURS * 3_600_000;
  const newest = new Map<string, LogEntry>();
  for (const entry of entries) {
    if (entry.at.getTime() < since || entry.text.startsWith("(turn failed")) continue;
    const seen = newest.get(entry.chat);
    if (!seen || seen.at <= entry.at) newest.set(entry.chat, entry);
  }
  const lines: string[] = [];
  let length = 0;
  for (const entry of [...newest.values()].sort((a, b) => b.at.getTime() - a.at.getTime())) {
    const said = foldText(entry.text.replace(/\s*\[tools: [^\]]*\]/, ""), BRIEF_QUOTE_MAX);
    const line = `- ${whenLabel(entry.at, now)} · "${entry.chat}" · you said: "${said}"`;
    if (lines.length >= BRIEF_LINES || length + line.length > BRIEF_CHARS) break;
    lines.push(line);
    length += line.length + 1;
  }
  return lines;
}

// ---------------------------------------------------------------- search

const STOP_WORDS = new Set("a an and are about as at be by did do does for from how i in is it me my of on or our that the this to was we were what when where which who why with you your".split(" "));

/** The content words of a search: lowercase, without filler words. Every one must match. */
export function searchWords(query: string): string[] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}._@-]*/gu) ?? [];
  return [...new Set(words.filter((word) => !STOP_WORDS.has(word)))];
}

export function matchesAll(text: string, words: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return words.every((word) => lower.includes(word));
}

/** About `max` characters around the first match, with the matched words in [brackets]. */
export function snippet(text: string, words: readonly string[], max = 240): string {
  const line = text.replace(/\s+/g, " ").trim();
  const lower = line.toLowerCase();
  const first = words.length ? Math.min(...words.map((word) => lower.indexOf(word)).filter((index) => index >= 0)) : 0;
  const start = Number.isFinite(first) ? Math.max(0, first - Math.floor(max / 3)) : 0;
  let cut = line.slice(start, start + max);
  if (start > 0) cut = `…${cut}`;
  if (start + max < line.length) cut = `${cut}…`;
  if (words.length === 0) return cut;
  const pattern = new RegExp(`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return cut.replace(pattern, "[$1]");
}

/** "24h", "3d", "2w", "today", "yesterday" or a date (YYYY-MM-DD) as the moment it starts. */
export function parseSince(text: string, now: Date): Date {
  const value = text.trim().toLowerCase();
  const midnight = (back: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  if (value === "today") return midnight(0);
  if (value === "yesterday") return midnight(1);
  const span = /^(\d+)\s*(h|d|w)$/.exec(value);
  if (span) return new Date(now.getTime() - Number(span[1]) * { h: 3_600_000, d: 86_400_000, w: 604_800_000 }[span[2] as "h" | "d" | "w"]);
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (date) return new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]));
  throw new Error(`Couldn't read "${text}" as a time. Use 24h, 3d, 2w, today, yesterday or a date like 2026-09-01.`);
}

/** "today 09:05", "yesterday 17:40" or "2026-09-20 08:00". */
export function whenLabel(at: Date, now: Date): string {
  return `${dayLabel(at, now)} ${localTime(at)}`;
}

// ---------------------------------------------------------------- journal wording

interface JournalRowLike {
  file: string;
  actor: "bot" | "you";
  via: "chat" | "app" | "disk" | "undo";
  chat: { title: string } | null;
  kind: "created" | "edited" | "deleted";
  added: number;
  removed: number;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** "Scout added 2 lines to MEMORY.md", "You deleted the clients topic" (OpenMausBot's journalSummary). */
export function journalSummary(row: JournalRowLike, botName: string): string {
  const who = row.actor === "bot" ? botName : "You";
  const target = row.file === "MEMORY.md" ? "MEMORY.md" : `the ${row.file.replace(/\.md$/, "")} topic`;
  if (row.kind === "created") return `${who} created ${target}${row.added ? ` with ${plural(row.added, "line")}` : ""}`;
  if (row.kind === "deleted") return `${who} deleted ${target}`;
  if (row.added && !row.removed) return `${who} added ${plural(row.added, "line")} to ${target}`;
  if (row.removed && !row.added) return `${who} removed ${plural(row.removed, "line")} from ${target}`;
  return `${who} rewrote ${plural(Math.max(row.added, row.removed), "line")} in ${target}`;
}

/** Where a change came from. */
export function journalSource(row: JournalRowLike): string {
  if (row.via === "undo") return "undo";
  if (row.via === "disk") return "changed outside the app";
  if (row.chat) return `from chat "${row.chat.title}"`;
  return "in the bot's settings";
}

/** "Today", "Yesterday" or "Sat, Sep 26" for a log day (YYYY-MM-DD). */
export function dayName(day: string, now: Date): string {
  const [year, month, date] = day.split("-").map(Number);
  const at = new Date(year!, month! - 1, date!);
  const label = dayLabel(at, now);
  if (label === "today") return "Today";
  if (label === "yesterday") return "Yesterday";
  return at.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", ...(at.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}
