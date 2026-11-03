/**
 * Host-side admission for ordinary bot-group executions (defense in depth).
 * bot-group-chat.md §4.0: on single-speaker servers a teammate's reply wakes no teammate.
 * The server dispatch rule stays authoritative; this only refuses to run a turn whose
 * source message breaks that rule, before any lane is created.
 * requester_id is intentionally not used: it is validated only for member.joined triggers.
 * Integration sources (group-notice cards) are not teammates and stay admitted.
 */

/** Minimal source shape, structurally compatible with chatServer's Message. */
export interface AdmissionSource { author?: { kind?: string } | null; origin?: string; deleted?: boolean }

export interface AdmissionInput {
  /** The server declared capabilities.groupSingleSpeaker === 1. */
  singleSpeaker: boolean;
  /** execution.plan_id: talk/work steps are host-scheduled, never bot-triggered. */
  planId?: string | null;
  /** execution.mask_owner_id: AI 代答 reply/digest act for a human. */
  maskOwnerId?: string | null;
  /** execution.mask_kind === 'digest'. */
  digest: boolean;
  /** The resolved source message (undefined = unreadable/absent). */
  source: AdmissionSource | undefined;
}

export type AdmissionVerdict = { ok: true } | { ok: false; reason: 'SYSTEM_SOURCE' | 'BOT_SOURCE' };

/** bot-group-chat.md §4.0: on single-speaker servers a companion's message never wakes a companion. */
export function admitOrdinaryExecutionSource(input: AdmissionInput): AdmissionVerdict {
  const { source } = input;
  // System messages never trigger an ordinary execution, on any server.
  if (source?.origin === 'system') return { ok: false, reason: 'SYSTEM_SOURCE' };
  // Legacy servers keep bounded continueDiscussion chaining (§4.1-4.3); plan steps, AI 代答
  // and digests are host-scheduled; an unreadable source keeps today's behavior.
  if (!input.singleSpeaker || input.planId || input.maskOwnerId || input.digest || !source) return { ok: true };
  if (source.author?.kind === 'bot' || source.origin === 'bot') return { ok: false, reason: 'BOT_SOURCE' };
  return { ok: true };
}
