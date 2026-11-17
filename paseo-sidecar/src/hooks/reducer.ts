import type { HookDispatchResult, RuntimeType } from "../types.js";

export interface ReducedHookOutput {
  decision: "allow" | "deny" | "modify";
  exitCode: 0 | 2;
  reason?: string;
  updatedInput?: Record<string, unknown>;
  permissionDecision?: "allow" | "deny";
  additionalContext?: string;
  stopHookDowngraded?: boolean;
  stdoutJson?: Record<string, unknown>;
  stderrText?: string;
}

export interface ReduceOptions {
  maxContextTokens?: number;
  stopHookActive?: boolean;
  eventName?: string;
}

const DEFAULT_MAX_CONTEXT_TOKENS = 12000;
const CHARS_PER_TOKEN = 4;

function extractOutputRecord(output: unknown): Record<string, unknown> | undefined {
  if (output && typeof output === "object" && !Array.isArray(output)) {
    return output as Record<string, unknown>;
  }
  return undefined;
}

function extractContextFromRecord(rec: Record<string, unknown> | undefined): string {
  if (!rec) return "";

  if (typeof rec.additionalContext === "string" && rec.additionalContext.trim()) {
    return rec.additionalContext.trim();
  }

  const hookSpecific = extractOutputRecord(rec.hookSpecificOutput);
  if (
    typeof hookSpecific?.additionalContext === "string" &&
    hookSpecific.additionalContext.trim()
  ) {
    return hookSpecific.additionalContext.trim();
  }

  if (Array.isArray(rec.injectSteps)) {
    const stepTexts: string[] = [];
    for (const step of rec.injectSteps) {
      const stepRec = extractOutputRecord(step);
      if (
        typeof stepRec?.ephemeralMessage === "string" &&
        stepRec.ephemeralMessage.trim()
      ) {
        stepTexts.push(stepRec.ephemeralMessage.trim());
      }
    }
    if (stepTexts.length > 0) {
      return stepTexts.join("\n\n");
    }
  }

  return "";
}

function extractAdditionalContext(
  res: HookDispatchResult,
  outRec: Record<string, unknown> | undefined
): string {
  const fromRecord = extractContextFromRecord(outRec);
  if (fromRecord) {
    return fromRecord;
  }

  if (typeof res.output === "string") {
    const trimmed = res.output.trim();
    if (!trimmed) return "";

    try {
      const parsed: unknown = JSON.parse(trimmed);
      const parsedRec = extractOutputRecord(parsed);
      return extractContextFromRecord(parsedRec);
    } catch {
      return trimmed;
    }
  }

  return "";
}

function truncateToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  const suffix = "\n...[truncated to token budget]";
  const sliceLen = Math.max(0, maxChars - suffix.length);
  return text.slice(0, sliceLen) + suffix;
}

/**
 * Reduces an ordered list of HookDispatchResult into a single host-ready output.
 * - Deny-Wins short-circuit
 * - Sequential updatedInput fold (auto-adding permissionDecision: "allow" for codex/claude-code)
 * - Namespaced additionalContext concatenation with 12000-token budget truncation
 * - stop_hook_active downgrade to prevent infinite loops
 */
export function reduceHookResults(
  results: HookDispatchResult[],
  runtime: RuntimeType,
  options: ReduceOptions = {}
): ReducedHookOutput {
  const maxTokens = options.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
  const stopHookActive = options.stopHookActive ?? false;

  let mergedInput: Record<string, unknown> | undefined;
  const contextParts: string[] = [];
  const stderrParts: string[] = [];
  let stopHookDowngraded = false;
  let askDecision: "force_ask" | "ask" | undefined;
  let askReason: string | undefined;
  let hasExplicitAllow = false;
  let allowReason: string | undefined;
  const permissionOverrides: string[] = [];
  const seenOverrides = new Set<string>();

  for (const res of results) {
    if (res.error) {
      stderrParts.push(`[${res.plugin_id}:${res.hook_id}] ${res.error}`);
    }

    const outRec = extractOutputRecord(res.output);

    // 1. Deny-Wins short-circuit (unless stop_hook_active downgrades it)
    const isDeny =
      res.decision === "deny" ||
      res.status === "blocked" ||
      outRec?.permissionDecision === "deny" ||
      outRec?.decision === "block" ||
      outRec?.decision === "deny";

    if (isDeny) {
      if (stopHookActive) {
        stopHookDowngraded = true;
        stderrParts.push(
          `[${res.plugin_id}:${res.hook_id}] stop_hook_active=true: downgraded block/deny to allow`
        );
        continue;
      }

      const reason =
        (typeof outRec?.reason === "string" && outRec.reason) ||
        res.error ||
        `Blocked by hook ${res.plugin_id}:${res.hook_id}`;

      const stdoutJson: Record<string, unknown> = {
        decision: "deny",
        reason,
      };
      if (runtime === "claude-code" || runtime === "codex") {
        stdoutJson.permissionDecision = "deny";
      }

      return {
        decision: "deny",
        exitCode: 2,
        reason,
        permissionDecision: "deny",
        stdoutJson,
        stderrText: stderrParts.length > 0 ? stderrParts.join("\n") : reason,
      };
    }

    // Track Antigravity pre-tool ask / allow / permissionOverrides directives
    if (outRec?.decision === "force_ask") {
      askDecision = "force_ask";
      askReason =
        typeof outRec.reason === "string" && outRec.reason.trim()
          ? outRec.reason.trim()
          : undefined;
    } else if (outRec?.decision === "ask" && askDecision !== "force_ask") {
      askDecision = "ask";
      if (typeof outRec.reason === "string" && outRec.reason.trim()) {
        askReason = outRec.reason.trim();
      }
    } else if (outRec?.decision === "allow") {
      hasExplicitAllow = true;
      if (!allowReason && typeof outRec.reason === "string" && outRec.reason.trim()) {
        allowReason = outRec.reason.trim();
      }
    }

    if (Array.isArray(outRec?.permissionOverrides)) {
      for (const item of outRec.permissionOverrides) {
        if (typeof item === "string" && item.trim() && !seenOverrides.has(item)) {
          seenOverrides.add(item);
          permissionOverrides.push(item);
        }
      }
    }

    // 2. Sequential updatedInput fold
    const candidateInput =
      res.modified_payload?.tool_input ??
      (outRec?.updatedInput && typeof outRec.updatedInput === "object"
        ? (outRec.updatedInput as Record<string, unknown>)
        : undefined);

    if (candidateInput) {
      mergedInput = { ...(mergedInput ?? {}), ...candidateInput };
    }

    // 3. Namespaced additionalContext collection
    const ctx = extractAdditionalContext(res, outRec);
    if (ctx) {
      contextParts.push(`[${res.plugin_id}:${res.hook_id}] ${ctx}`);
    }
  }

  const additionalContext =
    contextParts.length > 0
      ? truncateToTokenBudget(contextParts.join("\n\n"), maxTokens)
      : undefined;

  const decision: "allow" | "modify" = mergedInput ? "modify" : "allow";

  if (runtime === "gemini-cli") {
    const ev = options.eventName ?? "SessionStart";
    let geminiStdoutJson: Record<string, unknown> | undefined;

    if (ev === "PreInvocation" || ev === "SessionStart" || ev === "PostInvocation") {
      if (additionalContext) {
        geminiStdoutJson = {
          injectSteps: [{ ephemeralMessage: additionalContext }],
        };
      }
    } else if (ev === "PreToolUse") {
      if (askDecision) {
        geminiStdoutJson = {
          decision: askDecision,
          ...(askReason ? { reason: askReason } : {}),
        };
      } else if (hasExplicitAllow || permissionOverrides.length > 0) {
        geminiStdoutJson = {
          decision: "allow",
          ...(allowReason ? { reason: allowReason } : {}),
          ...(permissionOverrides.length > 0 ? { permissionOverrides } : {}),
        };
      }
    }

    return {
      decision,
      exitCode: 0,
      updatedInput: mergedInput,
      permissionDecision: undefined,
      additionalContext,
      stopHookDowngraded: stopHookDowngraded || undefined,
      stdoutJson: geminiStdoutJson,
      stderrText: stderrParts.length > 0 ? stderrParts.join("\n") : undefined,
    };
  }

  const stdoutJson: Record<string, unknown> = {};

  if (mergedInput) {
    stdoutJson.updatedInput = mergedInput;
  }
  if (
    (runtime === "claude-code" || runtime === "codex") &&
    (mergedInput || results.some((r) => r.decision === "allow"))
  ) {
    stdoutJson.permissionDecision = "allow";
  }
  if (additionalContext) {
    stdoutJson.additionalContext = additionalContext;
    stdoutJson.hookSpecificOutput = {
      hookEventName: options.eventName ?? "SessionStart",
      additionalContext,
    };
  }

  return {
    decision,
    exitCode: 0,
    updatedInput: mergedInput,
    permissionDecision:
      stdoutJson.permissionDecision === "allow" ? "allow" : undefined,
    additionalContext,
    stopHookDowngraded: stopHookDowngraded || undefined,
    stdoutJson: Object.keys(stdoutJson).length > 0 ? stdoutJson : undefined,
    stderrText: stderrParts.length > 0 ? stderrParts.join("\n") : undefined,
  };
}
