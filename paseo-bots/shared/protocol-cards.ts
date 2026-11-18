/**
 * Purpose: Fenced-code-safe parser for structured agent protocol XML blocks.
 * Context: Shared between chat stream UI renderers and workflow tests.
 * Usage: segmentProtocolBlocks(messageText) -> ProtocolSegment[]
 * Prerequisites: shared/workflows.ts (parseWorkerHandoff).
 */

import { extractWorkerHandoffBlock, parseWorkerHandoff, type ParsedWorkerHandoff } from "./workflows";

export type ProtocolTagKind = "task_brief" | "repair_brief" | "worker_handoff" | "worker_protocol" | "workspace_snapshot";
export type ProtocolBlockKind = ProtocolTagKind;

export type ProtocolSegment =
  | { kind: "text"; text: string }
  | {
      kind: "protocol";
      tag: ProtocolTagKind;
      raw: string;
      fields: Record<string, string>;
      handoff?: ParsedWorkerHandoff;
      protocolRules?: string;
    };

const OPEN_TAG_RE = /<(task_brief|repair_brief|worker_handoff|worker_protocol|workspace_snapshot)\b[^>]*>/i;

const PROTOCOL_BLOCK_RE =
  /(?:^[ \t]*[`~]{3,}[a-zA-Z0-9_-]*[ \t]*(?:\r?\n)?)?[ \t>]*(<(task_brief|repair_brief|worker_handoff|worker_protocol|workspace_snapshot)\b[^>]*>[\s\S]*?<\/\2\s*>)[ \t]*(?:\r?\n[ \t]*[`~]{3,}[ \t]*|[ \t]*[`~]{3,}[ \t]*)?/gim;

/** Detects template placeholder status values (e.g. `[PASS | PARTIAL`, `PASS | PARTIAL`). */
function isPlaceholderHandoff(rawOrBody: string): boolean {
  const statusLine = /^[ \t]*(?:[-*]\s*)?(?:\*\*)?STATUS(?:\*\*)?\s*:\s*(.*)$/im.exec(rawOrBody);
  if (!statusLine) return false;
  const val = statusLine[1]?.trim() ?? "";
  if (/\[\s*(?:PASS|PARTIAL|BLOCKED|FAILED)/i.test(val)) return true;
  if (/\|\s*(?:PASS|PARTIAL|BLOCKED|FAILED)/i.test(val)) return true;
  if (/(?:PASS|PARTIAL|BLOCKED|FAILED)\s*\|/i.test(val)) return true;
  if (/^\[.*\]$/.test(val)) return true;
  if (/<(?:PASS|PARTIAL|BLOCKED|FAILED)>/i.test(val)) return true;
  return false;
}

/** Finds all `<worker_protocol>...</worker_protocol>` ranges in the input text. */
function findWorkerProtocolRanges(input: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const regex = /<worker_protocol\b[^>]*>[\s\S]*?(?:<\/worker_protocol\s*>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(input)) !== null) {
    ranges.push({ start: m.index, end: m.index + m[0].length });
  }
  return ranges;
}

function isInsideRanges(start: number, end: number, ranges: { start: number; end: number }[]): boolean {
  return ranges.some((r) => (start >= r.start && start < r.end) || (end > r.start && end <= r.end));
}

/**
 * Extracts an unclosed `<task_brief>` (or `<repair_brief>`) block that contains structured brief keys.
 * Handles streaming responses or truncated user messages without closing tags.
 */
function extractUnclosedBrief(
  text: string,
  baseOffset: number,
  workerProtocolRanges: { start: number; end: number }[],
): {
  tag: ProtocolTagKind;
  raw: string;
  inner: string;
  startIndex: number;
  endIndex: number;
  fields: Record<string, string>;
} | null {
  const openRe = /<(task_brief|repair_brief)\b[^>]*>/gi;
  let m: RegExpExecArray | null;

  while ((m = openRe.exec(text)) !== null) {
    const matchStart = m.index;
    const tagLen = m[0].length;
    const contentStart = matchStart + tagLen;
    const tag = m[1]!.toLowerCase() as ProtocolTagKind;

    // Check if inside inline backticks
    let backticksBefore = 0;
    let p = matchStart - 1;
    while (p >= 0 && text[p] === "`") {
      backticksBefore++;
      p--;
    }
    if (backticksBefore === 1 || backticksBefore === 2) continue;

    // Check if inside worker protocol
    if (isInsideRanges(baseOffset + matchStart, baseOffset + contentStart, workerProtocolRanges)) {
      continue;
    }

    // Check if preceded by code fence opener on preceding line: e.g. "```xml\n<task_brief>"
    let blockStart = matchStart;
    const textBeforeTag = text.slice(0, matchStart);
    const fenceMatch = /(?:^|\n)[ \t]*([`~]{3,}[a-zA-Z0-9_-]*[ \t]*\r?\n)[ \t>]*$/.exec(textBeforeTag);
    if (fenceMatch) {
      blockStart = matchStart - fenceMatch[0].length + (fenceMatch[0].startsWith("\n") ? 1 : 0);
    }

    const remaining = text.slice(contentStart);
    const lineRe = /([^\r\n]*)(\r?\n|$)/g;
    let lineMatch: RegExpExecArray | null;
    let lastStructuredOffset = 0;
    let hasKeys = false;
    let emptyLineCount = 0;
    let activeKey: string | null = null;

    while ((lineMatch = lineRe.exec(remaining)) !== null) {
      if (lineMatch[0].length === 0 && lineMatch.index === remaining.length) {
        break;
      }
      const line = lineMatch[1]!;
      const lineEnd = lineMatch.index + lineMatch[0].length;

      // Check for code fence closure
      if (/^[ \t]*[`~]{3,}[ \t]*$/.test(line)) {
        if (hasKeys) {
          lastStructuredOffset = lineEnd;
        }
        break;
      }

      // Check for another XML tag opener
      if (
        /^[ \t]*<(?:task_brief|repair_brief|worker_protocol)\b/i.test(line) ||
        (/^[ \t]*<worker_handoff\b/i.test(line) && activeKey !== "UPSTREAM_CONTEXT")
      ) {
        break;
      }

      const keyMatch = /^[ \t]*(?:[-*]\s*)?(?:\*{1,2})?([A-Z][A-Z0-9_]{1,32})(?:\*{1,2})?\s*:\s*(.*)$/.exec(line);
      if (keyMatch) {
        hasKeys = true;
        activeKey = keyMatch[1]!.toUpperCase();
        emptyLineCount = 0;
        lastStructuredOffset = lineEnd;
      } else if (/^[ \t]*$/.test(line)) {
        if (hasKeys) {
          emptyLineCount++;
        }
      } else {
        const isIndented = /^[ \t]{2,}\S/.test(line) || /^[ \t]*>[ \t]?/.test(line);
        const isBullet = /^[ \t]*[-*]\s+/.test(line);

        if (hasKeys && emptyLineCount === 0 && (isIndented || isBullet || activeKey)) {
          lastStructuredOffset = lineEnd;
        } else {
          break;
        }
      }
    }

    if (!hasKeys) continue;

    const absLastOffset = contentStart + lastStructuredOffset;
    const raw = text.slice(blockStart, absLastOffset);
    const inner = text.slice(contentStart, absLastOffset).replace(/(?:\r?\n)?[ \t]*[`~]{3,}[ \t]*$/, "");
    const fields = parseBriefFields(inner);

    const hasStructuredKeys = Boolean(
      fields.WORKFLOW ||
      fields.STAGE_ID ||
      fields.OBJECTIVE ||
      fields.PREVIOUS_ERROR ||
      fields.DOD_CHECKLIST ||
      (fields.STAGE_NAME && (fields.WORKFLOW_INPUT || fields.OBJECTIVE))
    );

    if (hasStructuredKeys) {
      return {
        tag,
        raw,
        inner,
        startIndex: blockStart,
        endIndex: absLastOffset,
        fields,
      };
    }
  }

  return null;
}

/** Recursively parses a text chunk to extract any unclosed structured brief cards. */
function processTextChunk(
  chunk: string,
  baseOffset: number,
  workerProtocolRanges: { start: number; end: number }[],
): ProtocolSegment[] {
  if (!chunk.trim()) return [];
  const unclosed = extractUnclosedBrief(chunk, baseOffset, workerProtocolRanges);
  if (!unclosed) {
    return [{ kind: "text", text: chunk }];
  }

  const result: ProtocolSegment[] = [];
  const before = chunk.slice(0, unclosed.startIndex);
  if (before.trim()) {
    result.push({ kind: "text", text: before.trimEnd() });
  }

  result.push({
    kind: "protocol",
    tag: unclosed.tag,
    raw: unclosed.raw,
    fields: unclosed.fields,
  });

  const after = chunk.slice(unclosed.endIndex);
  if (after.trim()) {
    const nextOffset = baseOffset + unclosed.endIndex;
    result.push(...processTextChunk(after.trimStart(), nextOffset, workerProtocolRanges));
  }

  return result;
}

/**
 * Extracts key-value sections from `<task_brief>` / `<repair_brief>` bodies.
 * Recognizes `- KEY: value`, `**KEY**: value`, and `KEY: value` lines while preserving multi-line sections,
 * stripping optional markdown formatting or blockquote prefixes.
 * Ignores worker handoff keys (STATUS, SUMMARY, TOUCHED_FILES, VERIFICATION_PROOF, OPEN_ISSUES)
 * and prevents nested UPSTREAM_CONTEXT handoff blocks from leaking into outer brief fields.
 */
export function parseBriefFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let activeKey: string | null = null;
  const buffer: string[] = [];
  let inHandoff = false;

  const flush = () => {
    if (activeKey) {
      fields[activeKey] = buffer.join("\n").trim();
    }
    buffer.length = 0;
  };

  const HANDOFF_KEYS = new Set([
    "STATUS",
    "SUMMARY",
    "TOUCHED_FILES",
    "VERIFICATION_PROOF",
    "OPEN_ISSUES",
  ]);

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/^[ \t]*>[ \t]?/, "");

    // Track nested worker_handoff XML blocks (e.g. inside UPSTREAM_CONTEXT)
    if (/<worker_handoff\b/i.test(line)) {
      inHandoff = true;
    }

    const isHandoffClosure = /<\/worker_handoff\s*>/i.test(line);

    const m = /^[ \t]*(?:[-*]\s*)?(?:\*{1,2})?([A-Z][A-Z0-9_]{1,32})(?:\*{1,2})?\s*:\s*(.*)$/.exec(line);
    if (m) {
      const candidateKey = m[1]!.toUpperCase();
      const isHandoffOnlyKey = HANDOFF_KEYS.has(candidateKey);
      const isInnerContextKey =
        activeKey === "UPSTREAM_CONTEXT" &&
        (inHandoff || isHandoffOnlyKey || candidateKey === "DOD_CHECKLIST");

      if (!inHandoff && !isHandoffOnlyKey && !isInnerContextKey) {
        flush();
        activeKey = candidateKey;
        let val = m[2]?.trim() ?? "";
        if (val.startsWith("**") && val.endsWith("**") && val.length >= 4) {
          val = val.slice(2, -2).trim();
        }
        if (val) buffer.push(val);

        if (isHandoffClosure) {
          inHandoff = false;
        }
        continue;
      }
    }

    if (activeKey) {
      buffer.push(line);
    }

    if (isHandoffClosure) {
      inHandoff = false;
    }
  }
  flush();
  return fields;
}

function cleanBlockBody(text: string): string {
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length > 0 && nonEmpty.every((l) => /^[ \t]*>/.test(l))) {
    return lines.map((l) => l.replace(/^[ \t]*>[ \t]?/, "")).join("\n");
  }
  return text;
}

function buildProtocolSegment(tag: ProtocolTagKind, raw: string, inner: string): ProtocolSegment {
  const cleanedRaw = cleanBlockBody(raw);
  const cleanedInner = cleanBlockBody(inner);
  if (tag === "worker_handoff") {
    const normalizedRaw = cleanedRaw.replace(/<worker_handoff\b[^>]*>/i, "<worker_handoff>");
    const handoff = parseWorkerHandoff(normalizedRaw);
    return {
      kind: "protocol",
      tag,
      raw,
      handoff,
      fields: {
        STATUS: handoff.status,
        SUMMARY: handoff.summary,
        ...(handoff.touchedFiles ? { TOUCHED_FILES: handoff.touchedFiles } : {}),
        ...(handoff.verificationProof ? { VERIFICATION_PROOF: handoff.verificationProof } : {}),
        ...(handoff.dodChecklist ? { DOD_CHECKLIST: handoff.dodChecklist } : {}),
        ...(handoff.openIssues ? { OPEN_ISSUES: handoff.openIssues } : {}),
      },
    };
  }
  if (tag === "worker_protocol") {
    const rules = cleanedInner.trim();
    return {
      kind: "protocol",
      tag,
      raw,
      fields: {
        RULES: rules,
        CONTENT: rules,
      },
    };
  }
  return {
    kind: "protocol",
    tag,
    raw,
    fields: parseBriefFields(cleanedInner),
  };
}

/**
 * Splits message text into markdown/text segments and structured protocol card segments.
 * Correctly extracts `<worker_handoff>`, `<task_brief>`, `<repair_brief>`, and `<worker_protocol>` blocks
 * including indented, blockquoted, multiline, and markdown code fence-wrapped blocks.
 * Ignores placeholder status values, and handles unclosed briefs.
 */
export function segmentProtocolBlocks(input: string): ProtocolSegment[] {
  if (!OPEN_TAG_RE.test(input)) {
    return input ? [{ kind: "text", text: input }] : [];
  }

  const workerProtocolRanges = findWorkerProtocolRanges(input);
  const segments: ProtocolSegment[] = [];

  const addSeg = (seg: ProtocolSegment) => {
    if (seg.kind === "text") {
      const text = seg.text.trim();
      if (!text) return;
      const last = segments[segments.length - 1];
      if (last && last.kind === "text") {
        last.text += "\n" + text;
        return;
      }
      segments.push({ kind: "text", text });
      return;
    }
    segments.push(seg);
  };

  let lastIndex = 0;
  const regex = new RegExp(PROTOCOL_BLOCK_RE.source, "gim");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    const fullMatch = match[0];
    const rawXml = match[1]!;
    const tag = match[2]!.toLowerCase() as ProtocolTagKind;
    const matchStart = match.index;
    const matchEnd = matchStart + fullMatch.length;

    // Skip any block inside <worker_protocol>...</worker_protocol>
    if (tag !== "worker_protocol" && isInsideRanges(matchStart, matchEnd, workerProtocolRanges)) {
      continue;
    }

    // Skip any worker_handoff with placeholder template status like [PASS | PARTIAL
    if (tag === "worker_handoff" && isPlaceholderHandoff(rawXml)) {
      continue;
    }

    const before = input.slice(lastIndex, matchStart);
    if (before.trim()) {
      const beforeSegs = processTextChunk(before, lastIndex, workerProtocolRanges);
      for (const seg of beforeSegs) {
        addSeg(seg);
      }
    }

    if (tag === "worker_handoff") {
      const extracted = extractWorkerHandoffBlock(rawXml);
      if (!extracted || isPlaceholderHandoff(extracted.body)) {
        // Not a valid closed handoff block outside inline backticks or has placeholder status
        const textSegs = processTextChunk(fullMatch, matchStart, workerProtocolRanges);
        for (const seg of textSegs) {
          addSeg(seg);
        }
        lastIndex = matchEnd;
        continue;
      }
      if (extracted.startIndex > 0) {
        const proseBefore = rawXml.slice(0, extracted.startIndex);
        if (proseBefore.trim()) {
          const proseSegs = processTextChunk(proseBefore, matchStart, workerProtocolRanges);
          for (const seg of proseSegs) {
            addSeg(seg);
          }
        }
      }
      addSeg(buildProtocolSegment(tag, extracted.fullMatch, extracted.body));
      lastIndex = matchEnd;
      continue;
    }

    const openMatch = OPEN_TAG_RE.exec(rawXml);
    const closeRe = new RegExp(`</${tag}\\s*>`, "i");
    const closeMatch = closeRe.exec(rawXml);
    const inner =
      openMatch && closeMatch
        ? rawXml.slice(openMatch.index + openMatch[0].length, closeMatch.index)
        : rawXml;

    addSeg(buildProtocolSegment(tag, rawXml, inner));
    lastIndex = matchEnd;
  }

  const trailing = input.slice(lastIndex);
  if (trailing.trim()) {
    const trailingSegs = processTextChunk(trailing, lastIndex, workerProtocolRanges);
    for (const seg of trailingSegs) {
      addSeg(seg);
    }
  }

  const merged: ProtocolSegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (seg.kind === "protocol" && seg.tag === "worker_protocol" && merged.length > 0) {
      const prev = merged[merged.length - 1]!;
      if (prev.kind === "protocol" && (prev.tag === "task_brief" || prev.tag === "repair_brief")) {
        const rules = seg.fields.RULES || seg.fields.CONTENT || seg.raw || "";
        prev.protocolRules = prev.protocolRules ? `${prev.protocolRules}\n\n${rules}` : rules;
        continue;
      }
    }
    merged.push(seg);
  }

  return merged;
}

export interface ProtocolCardTimelineItem {
  type: "plugin";
  kind: "protocol-card";
  version: 1;
  data: { text: string; role: "user" | "assistant" };
}

/**
 * Fast-path probe to check whether text contains structured protocol XML tags.
 */
export function containsProtocolBlock(text: string): boolean {
  if (!text || !OPEN_TAG_RE.test(text)) return false;
  return segmentProtocolBlocks(text).some((s) => s.kind === "protocol");
}

const BRIEF_DISPATCH_START_RE =
  /^(?:[ \t]*[`~]{3,}[a-zA-Z0-9_-]*[ \t]*(?:\r?\n)?)?[ \t>]*<(task_brief|repair_brief)\b/i;

/**
 * Determines whether a user message represents an actual workflow/repair brief dispatch.
 * User brief dispatches:
 * 1. Must NOT contain top-level <worker_handoff> blocks (which belong to worker/assistant outputs or transcripts).
 * 2. Must start with <task_brief> or <repair_brief> (optionally preceded by markdown code fence/quotes).
 * 3. First segment must be a protocol block of kind "task_brief" or "repair_brief" (no leading prose).
 * 4. Must not contain surrounding conversation / memory-extraction prose (e.g. "User:", "Assistant:").
 */
export function isBriefDispatchMessage(text: string, segments?: ProtocolSegment[]): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Must start with <task_brief> or <repair_brief> (allowing markdown code fences or quotes)
  if (!BRIEF_DISPATCH_START_RE.test(trimmed)) {
    return false;
  }

  const segs = segments ?? segmentProtocolBlocks(trimmed);
  if (segs.length === 0) return false;

  // First segment must be a protocol block of tag task_brief or repair_brief (no leading prose)
  const first = segs[0]!;
  if (first.kind !== "protocol" || (first.tag !== "task_brief" && first.tag !== "repair_brief")) {
    return false;
  }

  // A genuine worker dispatch NEVER contains a top-level worker_handoff
  if (segs.some((s) => s.kind === "protocol" && s.tag === "worker_handoff")) {
    return false;
  }

  // Strict structural envelope validation:
  // A genuine worker brief dispatch consists exclusively of valid protocol blocks
  // (task_brief, repair_brief, worker_protocol, or workspace_snapshot) with zero non-empty outside text segments.
  if (segs.some((s) => s.kind === "text")) {
    return false;
  }

  const ALLOWED_DISPATCH_TAGS: Set<string> = new Set([
    "task_brief",
    "repair_brief",
    "worker_protocol",
    "workspace_snapshot",
  ]);
  for (const s of segs) {
    if (s.kind !== "protocol" || !ALLOWED_DISPATCH_TAGS.has(s.tag)) {
      return false;
    }
  }

  return true;
}

/**
 * Timeline transformer function for protocol-cards-user.
 * Intercepts ONLY genuine workflow/repair brief dispatches, returning undefined for all other user messages
 * (such as background memory-extraction prompts or user messages quoting briefs mid-message)
 * so Paseo renders the standard grey user bubble.
 */
export function transformUserProtocolCards(item: { text?: string | null }): { items: ProtocolCardTimelineItem[] } | undefined {
  if (!item.text) return undefined;
  const segments = segmentProtocolBlocks(item.text);
  if (!isBriefDispatchMessage(item.text, segments)) return undefined;
  return {
    items: [
      {
        type: "plugin",
        kind: "protocol-card",
        version: 1,
        data: { text: item.text, role: "user" },
      },
    ],
  };
}

/**
 * Timeline transformer function for protocol-cards-assistant.
 */
export function transformAssistantProtocolCards(item: { text?: string | null }): { items: ProtocolCardTimelineItem[] } | undefined {
  if (!item.text) return undefined;
  const segments = segmentProtocolBlocks(item.text);
  if (!segments.some((s) => s.kind === "protocol")) return undefined;
  return {
    items: [
      {
        type: "plugin",
        kind: "protocol-card",
        version: 1,
        data: { text: item.text, role: "assistant" },
      },
    ],
  };
}
