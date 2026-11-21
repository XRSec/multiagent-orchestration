/**
 * Purpose: Shared envelope format, parsing, and data contracts for Dual-Session Companion Intent Compiler & Reply Distiller (Morph B+).
 * Context: Used by server companion session engine and client UI streams / composers.
 * Usage: formatCompanionIntentEnvelope, parseCompanionIntentEnvelope, shouldBypassCompanionIntent, classifyCompanionBypass, applyClosedWorldGuard, applyConstraintOps.
 */

import { z } from "zod";
import { isBriefDispatchMessage } from "./protocol-cards";

export const SHADOW_SESSION_LABEL = "paseo-bots:shadow-session";
export const SHADOW_FOR_LABEL = "paseo-bots:shadow-for";

// ---------------------------------------------------------------- Morph B+ Structured Ledger Schemas

export const RootGoalSchema = z.object({
  summary: z.string(),
  verbatimAnchor: z.string(),
  turnSeq: z.number(),
});
export type RootGoal = z.infer<typeof RootGoalSchema>;

export const ShadowConstraintSchema = z.object({
  id: z.string(),
  rule: z.string(),
  strength: z.enum(["MUST", "MUST_NOT", "PREFER"]),
  verbatimEvidence: z.string(),
  validFromTurn: z.number(),
});
export type ShadowConstraint = z.infer<typeof ShadowConstraintSchema>;

export const RevokedConstraintSchema = z.object({
  id: z.string(),
  rule: z.string(),
  revokedAtTurn: z.number(),
  reason: z.string(),
});
export type RevokedConstraint = z.infer<typeof RevokedConstraintSchema>;

export const CommandOutcomeSchema = z.object({
  command: z.string(),
  exitCode: z.number(),
});
export type CommandOutcome = z.infer<typeof CommandOutcomeSchema>;

export const WorkspaceTouchpointsSchema = z.object({
  mutatedFiles: z.array(z.string()),
  inspectedFiles: z.array(z.string()),
  commandOutcomes: z.array(CommandOutcomeSchema),
  errorHeadlines: z.array(z.string()),
});
export type WorkspaceTouchpoints = z.infer<typeof WorkspaceTouchpointsSchema>;

export const ToolFootprintDigestSchema = z.object({
  mutatedFiles: z.array(z.string()),
  inspectedFiles: z.array(z.string()),
  commandOutcomes: z.array(CommandOutcomeSchema),
  errorHeadlines: z.array(z.string()),
});
export type ToolFootprintDigest = z.infer<typeof ToolFootprintDigestSchema>;

export interface ShadowTurnRecord {
  turnIndex: number;
  rawUser: string;
  distilledIntent: string;
  compiledPrompt: string;
  distilledReply: string | null;
  createdAt: string;
  completedAt: string | null;
}

export const ShadowTurnRecordSchema = z.object({
  turnIndex: z.number(),
  rawUser: z.string(),
  distilledIntent: z.string(),
  compiledPrompt: z.string(),
  distilledReply: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

export const ShadowTurnRecordV2Schema = z.object({
  turnSeq: z.number(),
  rawUser: z.string(),
  distilledIntent: z.string(),
  distilledReply: z.string().nullable(),
  footprintDigest: ToolFootprintDigestSchema.nullable().optional(),
  compiledPrompt: z.string().optional(),
  createdAt: z.string().optional(),
  completedAt: z.string().nullable().optional(),
});
export type ShadowTurnRecordV2 = z.infer<typeof ShadowTurnRecordV2Schema>;

export const ShadowSessionRecordV1Schema = z.object({
  version: z.literal(1),
  mainAgentId: z.string(),
  botId: z.string(),
  companionAgentId: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  turns: z.array(ShadowTurnRecordSchema),
});
export type ShadowSessionRecordV1 = z.infer<typeof ShadowSessionRecordV1Schema>;

export const ShadowSessionRecordV2Schema = z.object({
  version: z.literal(2),
  mainAgentId: z.string(),
  botId: z.string(),
  companionAgentId: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  rootGoal: RootGoalSchema.nullable().default(null),
  activeConstraints: z.array(ShadowConstraintSchema).default([]),
  recentlyRevokedConstraints: z.array(RevokedConstraintSchema).default([]),
  workspaceTouchpoints: WorkspaceTouchpointsSchema.default({
    mutatedFiles: [],
    inspectedFiles: [],
    commandOutcomes: [],
    errorHeadlines: [],
  }),
  recentTurns: z.array(ShadowTurnRecordV2Schema).default([]),
  turns: z.array(ShadowTurnRecordSchema).default([]),
});
export type ShadowSessionRecordV2 = z.infer<typeof ShadowSessionRecordV2Schema>;

export const ShadowSessionRecordSchema = z.union([
  ShadowSessionRecordV2Schema,
  ShadowSessionRecordV1Schema.transform((v1): ShadowSessionRecordV2 => ({
    version: 2,
    mainAgentId: v1.mainAgentId,
    botId: v1.botId,
    companionAgentId: v1.companionAgentId,
    provider: v1.provider,
    model: v1.model,
    createdAt: v1.createdAt,
    updatedAt: v1.updatedAt,
    rootGoal: null,
    activeConstraints: [],
    recentlyRevokedConstraints: [],
    workspaceTouchpoints: {
      mutatedFiles: [],
      inspectedFiles: [],
      commandOutcomes: [],
      errorHeadlines: [],
    },
    recentTurns: v1.turns.slice(-5).map((t) => ({
      turnSeq: t.turnIndex,
      rawUser: t.rawUser,
      distilledIntent: t.distilledIntent,
      distilledReply: t.distilledReply,
      compiledPrompt: t.compiledPrompt,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
    })),
    turns: v1.turns,
  })),
]);
export type ShadowSessionRecord = ShadowSessionRecordV2;

export interface ParsedCompanionIntent {
  rawUserText: string;
  turnIndex: number;
  distilledIntent: string;
  compiledPrompt: string;
}

const TAIL_COMPANION_INTENT_RE =
  /\n*<companion_intent\s+version="1">\s*\nTURN:\s*(\d+)\s*\nDISTILLED_INTENT:\s*([\s\S]*?)\nCOMPILED_PROMPT:\s*([\s\S]*?)\n<\/companion_intent>\s*$/i;

/**
 * Formats user's raw message with tail-anchored companion intent envelope.
 * Strictly appends at the tail so Byte-0 KV Cache is preserved for the main agent.
 */
export function formatCompanionIntentEnvelope(params: {
  rawUserText: string;
  turnIndex: number;
  distilledIntent: string;
  compiledPrompt: string;
}): string {
  const cleanRaw = params.rawUserText.trimEnd();
  const intent = params.distilledIntent.trim();
  const prompt = params.compiledPrompt.trim();
  return `${cleanRaw}\n\n<companion_intent version="1">\nTURN: ${params.turnIndex}\nDISTILLED_INTENT: ${intent}\nCOMPILED_PROMPT:\n${prompt}\n</companion_intent>`;
}

/**
 * Strictly parses the tail-anchored companion intent envelope.
 * MUST ONLY match when `<companion_intent version="1">...</companion_intent>` is at the end of the text.
 * Never matches mid-text quotes or transcripts.
 */
export function parseCompanionIntentEnvelope(text: string): ParsedCompanionIntent | null {
  if (!text || typeof text !== "string") return null;

  // Quick check: must contain the opening tag and closing tag near the end
  if (!text.includes("<companion_intent version=\"1\">") || !text.trimEnd().endsWith("</companion_intent>")) {
    return null;
  }

  const match = TAIL_COMPANION_INTENT_RE.exec(text);
  if (!match) return null;

  const rawUserText = text.slice(0, match.index).trimEnd();
  const turnIndex = parseInt(match[1]!, 10);
  const distilledIntent = match[2]!.trim();
  const compiledPrompt = match[3]!.trim();

  if (!Number.isFinite(turnIndex) || !distilledIntent || !compiledPrompt) {
    return null;
  }

  return {
    rawUserText,
    turnIndex,
    distilledIntent,
    compiledPrompt,
  };
}

// ---------------------------------------------------------------- G0–G5 0ms Bypass Gate

export type CompanionBypassReason =
  | "G0_COLD_START"
  | "G1_SLASH_COMMAND"
  | "G2_SHORT_CONFIRMATION"
  | "G3_DEICTIC_FREE_ATOMIC_COMMAND"
  | "G4_LARGE_STACK_OR_DIFF"
  | "G5_PROTOCOL_OR_ALREADY_WRAPPED"
  | "EMPTY_OR_WHITESPACE";

export interface CompanionBypassResult {
  bypassed: boolean;
  gate?: CompanionBypassReason;
  needsBackfill?: boolean;
}

const DEICTIC_PRONOUNS_RE =
  /(?:那个|刚才|上面|它|这个|同样|也|\bthat\b|\bit\b|\bthose\b|\bsame\b)/i;

const G2_CONFIRMATION_RE =
  /^(?:好|好的|继续|可以|行|同意|ok|yes|lgtm|1|2|3|方案1|第一个|第二个|方案2|方案3|第1个|第2个|第3个|确定|收到|没问题|对|是的|go|yep|sure)$/i;

const G3_ATOMIC_DEV_RE =
  /^(?:全部提交|push|git\s+push|git\s+status|git\s+diff|git\s+log|npm\s+test|pnpm\s+test|yarn\s+test|npm\s+run\s+typecheck|build|lint|跑一下测试|build\s*看看|修一下\s*lint|typecheck)$/i;

/**
 * Deterministic G0–G5 0ms Bypass Gate.
 * Classifies inputs in < 1ms to short-circuit trivial/self-contained requests without companion LLM overhead.
 */
export function classifyCompanionBypass(input: {
  rawText: string;
  turnsCount: number;
}): CompanionBypassResult {
  const { rawText, turnsCount } = input;
  if (!rawText) return { bypassed: true, gate: "EMPTY_OR_WHITESPACE" };
  const trimmed = rawText.trim();
  if (!trimmed) return { bypassed: true, gate: "EMPTY_OR_WHITESPACE" };

  // G5: Existing envelope or workflow briefs
  if (
    parseCompanionIntentEnvelope(rawText) !== null ||
    trimmed.endsWith("</companion_intent>") ||
    isBriefDispatchMessage(trimmed)
  ) {
    return { bypassed: true, gate: "G5_PROTOCOL_OR_ALREADY_WRAPPED" };
  }

  // G1: Slash commands (/compact, /clear, /new, /learn, etc.)
  if (trimmed.startsWith("/")) {
    return { bypassed: true, gate: "G1_SLASH_COMMAND" };
  }

  // G0: First turn (cold start) -> 0ms bypass to main agent + async backfill
  if (turnsCount === 0) {
    return { bypassed: true, gate: "G0_COLD_START", needsBackfill: true };
  }

  // G2: Pure short confirmations / option picks (<= 12 non-space chars without negation/pivot)
  const nonSpace = trimmed.replace(/\s+/g, "");
  const hasPivotOrNegation = /[不别但改除了]/.test(trimmed);
  if (nonSpace.length <= 12 && !hasPivotOrNegation && G2_CONFIRMATION_RE.test(trimmed)) {
    return { bypassed: true, gate: "G2_SHORT_CONFIRMATION", needsBackfill: true };
  }

  // G3: Deictic-free short atomic dev commands (<= 35 chars, no deictic pronouns)
  if (trimmed.length <= 35 && !DEICTIC_PRONOUNS_RE.test(trimmed) && G3_ATOMIC_DEV_RE.test(trimmed)) {
    return { bypassed: true, gate: "G3_DEICTIC_FREE_ATOMIC_COMMAND", needsBackfill: true };
  }

  // G4: Large error stack / diff paste (> 1200 chars with stack/diff signatures and short/no deictic text)
  if (trimmed.length > 1200) {
    const hasStackOrDiff =
      /Traceback \(most recent call last\)/i.test(trimmed) ||
      /\bat\s+.+?:\d+:\d+\)?/m.test(trimmed) ||
      /^diff --git /m.test(trimmed) ||
      /^(?:Error|TypeError|ReferenceError|SyntaxError|AssertionError):/m.test(trimmed);

    if (hasStackOrDiff) {
      const nonCodeLines = trimmed.split("\n").filter((line) => {
        const l = line.trim();
        return l && !/^(?:at\s|diff|---|\+\+\+|@@|\{|\}|\*|\/\/|#|\d+\|)/.test(l);
      });
      const naturalText = nonCodeLines.join(" ");
      if (naturalText.length < 60 || !DEICTIC_PRONOUNS_RE.test(naturalText)) {
        return { bypassed: true, gate: "G4_LARGE_STACK_OR_DIFF", needsBackfill: true };
      }
    }
  }

  return { bypassed: false };
}

/**
 * Determines whether companion compile should be bypassed.
 * Backward-compatible helper with optional turnsCount (defaults to 1).
 */
export function shouldBypassCompanionIntent(text: string, turnsCount?: number): boolean {
  return classifyCompanionBypass({ rawText: text, turnsCount: turnsCount ?? 1 }).bypassed;
}

// ---------------------------------------------------------------- Closed-World Identifier Guard

export interface ClosedWorldGuardResult {
  cleanedPrompt: string;
  droppedPaths: string[];
  blockedCommands: string[];
  modified: boolean;
}

const DESTRUCTIVE_COMMANDS = [
  { pattern: /\b(?:git\s+)?reset\s+--hard\b/gi, name: "reset --hard" },
  { pattern: /\brm\s+-(?:rf|fr|r)\b/gi, name: "rm -rf" },
  { pattern: /\b(?:git\s+push\s+.*?|git\s+commit\s+.*?)?--force\b/gi, name: "--force" },
];

const CODE_FILE_EXT_RE =
  /\b([a-zA-Z0-9_\-\.\/]+\.(?:ts|tsx|js|jsx|json|py|go|rs|md|yaml|yml|html|css|scss|sh|sql|vue|svelte))\b/gi;

/**
 * Outbound Closed-World Identifier Guard.
 * Filters hallucinated file paths not present in rawUserText ∪ ledger ∪ workspaceTouchpoints,
 * and drops unrequested dangerous commands (reset --hard, rm -rf, --force).
 */
export function applyClosedWorldGuard(
  compiledPrompt: string,
  allowedSources: readonly string[],
  rawUserText = ""
): ClosedWorldGuardResult {
  let cleaned = compiledPrompt;
  const droppedPaths: string[] = [];
  const blockedCommands: string[] = [];

  // 1. Destructive commands check
  for (const { pattern, name } of DESTRUCTIVE_COMMANDS) {
    if (pattern.test(cleaned)) {
      const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const userHasIt = new RegExp(escaped, "i").test(rawUserText);
      if (!userHasIt) {
        cleaned = cleaned.replace(pattern, "[unrequested destructive command blocked]");
        blockedCommands.push(name);
      }
    }
  }

  // 2. Closed-world identifier / path check
  const corpus = allowedSources.join("\n").toLowerCase();

  cleaned = cleaned.replace(CODE_FILE_EXT_RE, (match, path: string) => {
    const norm = path.replace(/^\.\//, "").trim();
    const basename = norm.split(/[/\\]/).pop() || norm;

    if (corpus.includes(norm.toLowerCase()) || corpus.includes(basename.toLowerCase())) {
      return match;
    }

    droppedPaths.push(norm);
    return `[hallucinated path removed]`;
  });

  const modified = droppedPaths.length > 0 || blockedCommands.length > 0;
  return {
    cleanedPrompt: cleaned,
    droppedPaths,
    blockedCommands,
    modified,
  };
}

// ---------------------------------------------------------------- Patch-Only Constraint Ops Lifecycle

export interface StagedConstraintOp {
  op: "ADD" | "SUPERSEDE" | "REVOKE";
  target_id?: string | null;
  targetId?: string | null;
  polarity?: "MUST" | "MUST_NOT" | "PREFER";
  strength?: "MUST" | "MUST_NOT" | "PREFER";
  rule?: string;
  verbatim_quote?: string;
  verbatimEvidence?: string;
  reason?: string;
}

/**
 * Applies patch-only constraint mutations.
 * Untouched constraints in activeConstraints are preserved byte-for-byte.
 * Recently revoked constraints are pruned after 3 turns.
 */
export function applyConstraintOps(
  state: {
    activeConstraints: readonly ShadowConstraint[];
    recentlyRevokedConstraints: readonly RevokedConstraint[];
  },
  ops: readonly StagedConstraintOp[],
  currentTurnSeq: number,
  fallbackEvidence = ""
): {
  activeConstraints: ShadowConstraint[];
  recentlyRevokedConstraints: RevokedConstraint[];
} {
  // 1. Prune recentlyRevokedConstraints older than 3 turns
  const active: ShadowConstraint[] = [...state.activeConstraints];
  let revoked: RevokedConstraint[] = state.recentlyRevokedConstraints.filter(
    (r) => currentTurnSeq - r.revokedAtTurn < 3
  );

  // Compute highest existing ID
  let maxId = 0;
  for (const c of [...active, ...revoked]) {
    const m = /^C(\d+)$/.exec(c.id);
    if (m) {
      const num = parseInt(m[1]!, 10);
      if (num > maxId) maxId = num;
    }
  }

  for (const op of ops) {
    const strength = op.strength ?? op.polarity ?? "MUST";
    const rule = op.rule?.trim() ?? "";
    const evidence = (op.verbatimEvidence ?? op.verbatim_quote ?? fallbackEvidence).trim();
    const targetId = op.target_id || op.targetId;

    if (op.op === "ADD") {
      if (!rule) continue;
      maxId++;
      active.push({
        id: `C${maxId}`,
        rule,
        strength,
        verbatimEvidence: evidence.slice(0, 200),
        validFromTurn: currentTurnSeq,
      });
      if (active.length > 12) {
        // Cap at 12 active constraints, preserve newest
        active.splice(0, active.length - 12);
      }
    } else if (op.op === "SUPERSEDE") {
      if (!targetId || !rule) continue;
      const idx = active.findIndex((c) => c.id === targetId);
      if (idx !== -1) {
        const old = active[idx]!;
        maxId++;
        const newConstraint: ShadowConstraint = {
          id: `C${maxId}`,
          rule,
          strength,
          verbatimEvidence: evidence.slice(0, 200),
          validFromTurn: currentTurnSeq,
        };
        revoked.push({
          id: old.id,
          rule: old.rule,
          revokedAtTurn: currentTurnSeq,
          reason: op.reason ?? `Superseded by C${maxId}`,
        });
        active[idx] = newConstraint;
      }
    } else if (op.op === "REVOKE") {
      if (!targetId) continue;
      const idx = active.findIndex((c) => c.id === targetId);
      if (idx !== -1) {
        const old = active[idx]!;
        revoked.push({
          id: old.id,
          rule: old.rule,
          revokedAtTurn: currentTurnSeq,
          reason: op.reason ?? "Revoked by user",
        });
        active.splice(idx, 1);
      }
    }
  }

  if (revoked.length > 5) {
    revoked = revoked.slice(-5);
  }

  return {
    activeConstraints: active,
    recentlyRevokedConstraints: revoked,
  };
}
