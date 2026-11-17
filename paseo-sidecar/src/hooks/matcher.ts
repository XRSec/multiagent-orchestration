import type { HookEventPayload } from "../types.js";

const SYNONYM_GROUPS: string[][] = [
  ["Bash", "terminal", "exec_command"],
  ["Edit", "Write", "apply_patch", "file_editor"],
];

const SYNONYM_MAP = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  for (const name of group) {
    SYNONYM_MAP.set(name.toLowerCase(), group);
  }
}

/**
 * Unwraps `sidecar_call_tool` invocations into `mcp__<server>__<tool>` when possible.
 */
export function unwrapToolName(
  toolName?: string,
  toolInput?: Record<string, unknown>
): string | undefined {
  if (!toolName) return undefined;

  if (toolName === "sidecar_call_tool" && toolInput) {
    const rawName =
      typeof toolInput.name === "string"
        ? toolInput.name
        : typeof toolInput.tool === "string"
          ? toolInput.tool
          : undefined;

    if (rawName) {
      if (rawName.startsWith("mcp__")) {
        return rawName;
      }
      const server =
        typeof toolInput.server === "string" ? toolInput.server : undefined;
      if (server) {
        return `mcp__${server}__${rawName}`;
      }
      const colonIdx = rawName.indexOf(":");
      if (colonIdx > 0) {
        return `mcp__${rawName.slice(0, colonIdx)}__${rawName.slice(colonIdx + 1)}`;
      }
      const slashIdx = rawName.indexOf("/");
      if (slashIdx > 0) {
        return `mcp__${rawName.slice(0, slashIdx)}__${rawName.slice(slashIdx + 1)}`;
      }
      return rawName;
    }
  }

  return toolName;
}

/**
 * Returns all normalized synonym candidates for a tool name.
 */
export function expandToolSynonyms(toolName: string): string[] {
  const group = SYNONYM_MAP.get(toolName.toLowerCase());
  if (!group) return [toolName];
  return Array.from(new Set([toolName, ...group]));
}

/**
 * Matches a hook's matcher pattern against a HookEventPayload.
 * Supports "*", regex ("/pattern/flags" or regex string), pipe-separated literals,
 * tool-name synonym normalization, and sidecar_call_tool unwrapping.
 */
export function matchHook(
  matcher: string | undefined,
  payload: Pick<HookEventPayload, "tool_name" | "tool_input" | "event_name">
): boolean {
  if (!matcher || matcher.trim() === "" || matcher.trim() === "*") {
    return true;
  }

  const effectiveTool = unwrapToolName(payload.tool_name, payload.tool_input);
  if (!effectiveTool) {
    return false;
  }

  const candidates = expandToolSynonyms(effectiveTool);
  const trimmed = matcher.trim();

  // Explicit /regex/flags syntax
  const regexLiteral = trimmed.match(/^\/(.+)\/([gimsuy]*)$/);
  if (regexLiteral) {
    try {
      const re = new RegExp(regexLiteral[1], regexLiteral[2]);
      return candidates.some((c) => re.test(c));
    } catch {
      return false;
    }
  }

  // Try as anchored regex (handles "Edit|Write", "mcp__.*__read", etc.)
  try {
    const re = new RegExp(`^(?:${trimmed})$`);
    if (candidates.some((c) => re.test(c))) {
      return true;
    }
  } catch {
    // Fallback to exact literal comparison
  }

  return candidates.some((c) => c === trimmed);
}
