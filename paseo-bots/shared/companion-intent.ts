/**
 * Purpose: Shared envelope format, parsing, and data contracts for Dual-Session Companion Intent Compiler & Reply Distiller.
 * Context: Used by server companion session engine and client UI streams / composers.
 * Usage: formatCompanionIntentEnvelope, parseCompanionIntentEnvelope, shouldBypassCompanionIntent.
 */

import { z } from "zod";
import { isBriefDispatchMessage } from "./protocol-cards";

export const SHADOW_SESSION_LABEL = "paseo-bots:shadow-session";
export const SHADOW_FOR_LABEL = "paseo-bots:shadow-for";

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

export interface ShadowSessionRecord {
  version: 1;
  mainAgentId: string;
  botId: string;
  companionAgentId: string | null;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  turns: ShadowTurnRecord[];
}

export const ShadowSessionRecordSchema = z.object({
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

/**
 * Determines whether companion compile should be bypassed:
 * - Empty or whitespace-only
 * - Slash commands (e.g. /learn, /compact, /remember)
 * - Already wrapped in a companion intent envelope
 * - Workflow brief dispatch messages (<task_brief>, <repair_brief>)
 */
export function shouldBypassCompanionIntent(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("/")) return true;
  if (parseCompanionIntentEnvelope(text) !== null) return true;
  if (trimmed.endsWith("</companion_intent>")) return true;
  if (isBriefDispatchMessage(trimmed)) return true;
  return false;
}
