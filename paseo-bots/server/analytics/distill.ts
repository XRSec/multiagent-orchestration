export interface RawToolEvent {
  name: string;
  args: Record<string, unknown>;
  status?: "OK" | "ERR";
  exitCode?: number | null;
  output?: string;
}

const WRITE_PAYLOAD_KEYS = new Set(["content", "Content", "new_str", "patch", "file_text", "Replacement", "Target"]);
const SCALAR_ARG_KEYS = [
  "path", "Path", "file_path", "pattern", "cmd", "CommandLine", "command",
  "url", "line_range", "query", "toolSummary",
  "TypeName", "Role", "subagent_type", "Recipient", "action",
];
const MAX_TELEMETRY_CHARS = 2500;

export function distillThought(raw: string | undefined | null): string {
  if (!raw) return "";
  const cleaned = raw.trim().replace(/\n{3,}/g, "\n\n");
  if (!cleaned) return "";
  if (cleaned.length <= 1200) return cleaned;
  const omitted = cleaned.length - 1100;
  return `${cleaned.slice(0, 600)}\n...[omitted ${omitted} chars]...\n${cleaned.slice(-500)}`;
}

function unquote(val: unknown): string {
  if (typeof val !== "string") return val == null ? "" : String(val);
  const s = val.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try {
      return String(JSON.parse(s));
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
}

export function sanitizeArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of SCALAR_ARG_KEYS) {
    if (!(key in args) || args[key] == null) continue;
    const val = unquote(args[key]).replace(/\s+/g, " ").slice(0, 120);
    if (val) parts.push(`${key}=${JSON.stringify(val)}`);
  }
  const promptVal = args.Prompt ?? args.description ?? args.Message;
  if (promptVal != null) {
    const p = unquote(promptVal).replace(/\s+/g, " ").slice(0, 100);
    if (p) parts.push(`prompt=${JSON.stringify(p)}`);
  }
  if (args.StartLine != null || args.EndLine != null) {
    parts.push(`line_range=${args.StartLine ?? ""}..${args.EndLine ?? ""}`);
  }
  for (const [key, rawVal] of Object.entries(args)) {
    if (!WRITE_PAYLOAD_KEYS.has(key) || rawVal == null) continue;
    const text = unquote(rawVal);
    const lines = text ? text.split("\n").length : 0;
    parts.push(`${key}=<len: ${text.length} chars, lines: ${lines}>`);
  }
  return parts.join(", ");
}

export function stripEnvelope(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/(?:Created At:[^\n]*\n|Completed At:[^\n]*\n)+/gim, "")
    .replace(/^Command exited with code \d+\.?\s*/im, "")
    .replace(/^Command output:\s*/im, "")
    .trim();
}

export function extractSubagentConversationId(raw: string): string | null {
  if (!raw) return null;
  const match = raw.match(/"conversationId"\s*:\s*"([a-f0-9-]+)"/i)
    ?? raw.match(/"conversation_id"\s*:\s*"([a-f0-9-]+)"/i)
    ?? raw.match(/\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/i);
  return match ? match[1] : null;
}

function stripCommandEnvelope(raw: string): { exitCode: number | null; body: string } {
  const codeMatch = raw.match(/Command exited with code (\d+)\.?/i);
  const exitCode = codeMatch ? Number(codeMatch[1]) : null;
  const body = stripEnvelope(raw);
  return { exitCode, body };
}

function sanitizeOutput(ev: RawToolEvent): { status: "OK" | "ERR"; meta: string; preview: string } {
  const name = ev.name.toLowerCase();
  const rawOut = ev.output || "";
  const status: "OK" | "ERR" = ev.status ?? (ev.exitCode && ev.exitCode !== 0 ? "ERR" : "OK");

  if (/(invoke_subagent|subagent|^agent$|^task$)/i.test(name)) {
    const subagentId = extractSubagentConversationId(rawOut);
    const body = stripEnvelope(rawOut);
    const metaParts = [`chars:${body.length}`];
    if (subagentId) metaParts.push(`subagent_id:${subagentId}`);
    const preview = subagentId ? `subagent_session_id: ${subagentId}` : body.slice(0, 200);
    return { status, meta: `{${metaParts.join(",")}}`, preview: oneLine(preview) };
  }

  const out = stripEnvelope(rawOut);

  if (/(^|_)(read|cat|view)(_file)?$/.test(name)) {
    const lines = out ? out.split("\n").length : 0;
    const bytes = Buffer.byteLength(out, "utf8");
    const preview = out.length <= 250 ? out : `${out.slice(0, 150)} ... ${out.slice(-100)}`;
    return { status, meta: `{lines:${lines},bytes:${bytes}}`, preview: oneLine(preview) };
  }

  if (/(grep|glob|find|ripgrep)/.test(name)) {
    const nonEmpty = out ? out.split("\n").filter((l) => l.trim()) : [];
    const matches = nonEmpty.slice(0, 3);
    return { status, meta: `{matches:${nonEmpty.length}}`, preview: oneLine(matches.join(" | ")) };
  }

  if (/(bash|exec|run_command)/.test(name)) {
    const { exitCode: parsedCode, body } = stripCommandEnvelope(rawOut);
    const code = ev.exitCode ?? parsedCode ?? (status === "ERR" ? 1 : 0);
    const resolvedStatus: "OK" | "ERR" = code === 0 && status === "OK" ? "OK" : "ERR";
    const snippet = resolvedStatus === "OK" ? body.slice(0, 200) : body.slice(-350);
    return { status: resolvedStatus, meta: `{exit_code:${code}}`, preview: oneLine(snippet) };
  }

  if (/(fetch|search|mcp)/.test(name)) {
    const stripped = out
      .replace(/<[^>]+>/g, " ")
      .replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, "<base64>")
      .trim();
    return { status, meta: `{chars:${out.length}}`, preview: oneLine(stripped.slice(0, 250)) };
  }

  return { status, meta: `{chars:${out.length}}`, preview: oneLine(out.slice(0, 200)) };
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").replace(/"/g, '\\"').trim();
}

export function distillToolTrace(events: RawToolEvent[]): string[] {
  return events.map((ev, idx) => {
    const argsStr = sanitizeArgs(ev.args);
    const { status, meta, preview } = sanitizeOutput(ev);
    return `[${idx + 1}] ${ev.name}(${argsStr}) -> status=${status}, meta=${meta}, preview="${preview}"`;
  });
}

export function buildExecutionTelemetry(thought: string | undefined, events: RawToolEvent[]): string {
  const thoughtStr = distillThought(thought);
  const traceLines = distillToolTrace(events);
  if (!thoughtStr && traceLines.length === 0) return "";

  const errLines = traceLines.filter((l) => l.includes("-> status=ERR"));
  const okLines = traceLines.filter((l) => !l.includes("-> status=ERR"));

  const thoughtSection = thoughtStr ? `<thought_trace>\n${thoughtStr}\n</thought_trace>\n` : "";
  const header = `<execution_telemetry>\n${thoughtSection}<tool_trace>\n`;
  const footer = `\n</tool_trace>\n</execution_telemetry>`;
  let budget = MAX_TELEMETRY_CHARS - header.length - footer.length;

  const kept: string[] = [];
  for (const errLine of errLines) {
    kept.push(errLine);
    budget -= errLine.length + 1;
  }

  let omittedOk = 0;
  for (const okLine of okLines) {
    if (budget - (okLine.length + 1) >= 40) {
      kept.push(okLine);
      budget -= okLine.length + 1;
    } else {
      omittedOk++;
    }
  }
  if (omittedOk > 0) kept.push(`...(+${omittedOk} OK calls omitted)`);

  return `${header}${kept.join("\n")}${footer}`;
}
