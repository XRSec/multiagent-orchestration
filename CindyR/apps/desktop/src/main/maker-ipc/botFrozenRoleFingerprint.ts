import { createHash } from 'node:crypto';

// Delegation children are frozen at creation. Their role text (name, description,
// system_prompt.md overlay) lives outside the pinned Profile version, so we keep a
// hash-only fingerprint (never prompt bytes) and carry the first one forward.

export type FrozenRoleDriftField = 'displayName' | 'description' | 'systemPromptOverride';

export interface FrozenRoleInputs {
  displayName: string;
  description: string;
  /** null = unknown (folder unread / remote / read failed) */
  systemPromptOverride: string | null;
}

export interface FrozenRoleFingerprint {
  schemaVersion: 1;
  displayNameSha256: string;
  descriptionSha256: string;
  systemPromptOverrideSha256: string | null;
}

export interface FrozenRoleCheck {
  baseline: FrozenRoleFingerprint;
  drift: FrozenRoleDriftField[];
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Hashes each value exactly as the prompt builder consumes it. */
export function computeFrozenRoleFingerprint(input: FrozenRoleInputs): FrozenRoleFingerprint {
  const override = input.systemPromptOverride;
  return {
    schemaVersion: 1,
    displayNameSha256: sha256(input.displayName.trim()),
    descriptionSha256: sha256(input.description),
    // The overlay is injected only when its trimmed text is non-empty.
    systemPromptOverrideSha256: override === null ? null : sha256(override.trim() ? override : ''),
  };
}

/** Validates a fingerprint read back from resolvedJson; null when absent or malformed. */
export function readFrozenRoleFingerprint(value: unknown): FrozenRoleFingerprint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) return null;
  if (typeof record.displayNameSha256 !== 'string') return null;
  if (typeof record.descriptionSha256 !== 'string') return null;
  const override = record.systemPromptOverrideSha256;
  if (override !== null && typeof override !== 'string') return null;
  return {
    schemaVersion: 1,
    displayNameSha256: record.displayNameSha256,
    descriptionSha256: record.descriptionSha256,
    systemPromptOverrideSha256: override,
  };
}

/** Returns drifted field names in fixed order; an unknown overlay is never drift. */
export function diffFrozenRole(
  frozen: FrozenRoleFingerprint,
  current: FrozenRoleFingerprint,
): FrozenRoleDriftField[] {
  const drift: FrozenRoleDriftField[] = [];
  if (frozen.displayNameSha256 !== current.displayNameSha256) drift.push('displayName');
  if (frozen.descriptionSha256 !== current.descriptionSha256) drift.push('description');
  const frozenOverride = frozen.systemPromptOverrideSha256;
  const currentOverride = current.systemPromptOverrideSha256;
  if (frozenOverride !== null && currentOverride !== null && frozenOverride !== currentOverride) {
    drift.push('systemPromptOverride');
  }
  return drift;
}

/**
 * Carries the first frozen fingerprint forward so a drifted snapshot never becomes
 * the new baseline. Legacy snapshots without a fingerprint re-baseline to current.
 */
export function resolveFrozenRoleCheck(
  previousResolved: Record<string, unknown> | null,
  current: FrozenRoleFingerprint,
): FrozenRoleCheck {
  const previous = readFrozenRoleFingerprint(previousResolved?.frozenRole);
  if (!previous) return { baseline: current, drift: [] };
  const baseline: FrozenRoleFingerprint =
    previous.systemPromptOverrideSha256 === null && current.systemPromptOverrideSha256 !== null
      ? { ...previous, systemPromptOverrideSha256: current.systemPromptOverrideSha256 }
      : previous;
  return { baseline, drift: diffFrozenRole(baseline, current) };
}
