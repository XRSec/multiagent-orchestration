/**
 * Host mirror marker for a Bot Home (pure logic, no fs / Electron / DB).
 *
 * The DB commits a profile save first and mirrors SOUL.md / memories/USER.md to
 * disk afterwards. If that mirror fails (or races a reconcile), the file still
 * holds the previous text. Without a marker, reconcile cannot tell this stale
 * mirror from a real hand / Agent edit and derives a version from the stale
 * text, silently reverting the saved profile.
 *
 * The marker stores, per slot, the sha256 of the exact text the host last wrote
 * successfully. Per slot, with F = file text, S = snapshot text, M = marker hash:
 *   - F === S                          -> 'in-sync'
 *   - F !== S && M && sha256(F) === M  -> 'stale'  (rewrite from DB, never derive)
 *   - otherwise                        -> 'edited' (legacy behavior: derive)
 *
 * Trust boundary (the marker lives in the Agent-writable Home): forging or
 * adding a marker can only turn 'edited' into 'stale', which makes the host
 * overwrite the file from the DB; it never causes a derive. Deleting or
 * corrupting the marker turns 'stale' back into 'edited', i.e. the legacy
 * derive-from-file behavior, which grants nothing beyond writing SOUL.md
 * directly.
 */

import { createHash } from 'node:crypto';

export const BOT_PROFILE_MIRROR_MARKER_SCHEMA = 1;

export type BotProfileMirrorSlot = 'soul' | 'userContext';

/** Hash values are lowercase sha256 hex. */
export interface BotProfileMirrorMarker {
  schemaVersion: 1;
  soul?: string;
  userContext?: string;
}

export type BotProfileSlotVerdict = 'in-sync' | 'stale' | 'edited';

export interface BotProfileMirrorTexts {
  identitySource?: string;
  userContextSource?: string;
}

export interface BotProfileMirrorPlan {
  identity: BotProfileSlotVerdict;
  userContext: BotProfileSlotVerdict;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function fingerprintBotProfileText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Tolerant parse: anything unexpected yields null or drops the bad slot. */
export function parseBotProfileMirrorMarker(raw: string): BotProfileMirrorMarker | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== BOT_PROFILE_MIRROR_MARKER_SCHEMA) return null;
  const marker: BotProfileMirrorMarker = { schemaVersion: 1 };
  for (const slot of ['soul', 'userContext'] as const) {
    const value = record[slot];
    if (typeof value === 'string' && SHA256_HEX.test(value)) marker[slot] = value;
  }
  return marker;
}

export function serializeBotProfileMirrorMarker(marker: BotProfileMirrorMarker): string {
  const out: BotProfileMirrorMarker = { schemaVersion: 1 };
  if (marker.soul !== undefined) out.soul = marker.soul;
  if (marker.userContext !== undefined) out.userContext = marker.userContext;
  return `${JSON.stringify(out)}\n`;
}

/** Only the slots present in `written` are replaced; the rest are kept. */
export function mergeBotProfileMirrorMarker(
  prev: BotProfileMirrorMarker | null,
  written: BotProfileMirrorTexts,
): BotProfileMirrorMarker {
  const next: BotProfileMirrorMarker = { schemaVersion: 1 };
  if (prev?.soul !== undefined) next.soul = prev.soul;
  if (prev?.userContext !== undefined) next.userContext = prev.userContext;
  if (written.identitySource !== undefined) {
    next.soul = fingerprintBotProfileText(written.identitySource);
  }
  if (written.userContextSource !== undefined) {
    next.userContext = fingerprintBotProfileText(written.userContextSource);
  }
  return next;
}

export function classifyBotProfileSlot(
  fileText: string,
  snapshotText: string,
  markerHash: string | undefined,
): BotProfileSlotVerdict {
  if (fileText === snapshotText) return 'in-sync';
  if (markerHash !== undefined && fingerprintBotProfileText(fileText) === markerHash) {
    return 'stale';
  }
  return 'edited';
}

export function planBotProfileMirror(
  folder: { identitySource: string; userContextSource: string },
  snapshot: { identitySource: string; userContextSource: string },
  marker: BotProfileMirrorMarker | null,
): BotProfileMirrorPlan {
  return {
    identity: classifyBotProfileSlot(folder.identitySource, snapshot.identitySource, marker?.soul),
    userContext: classifyBotProfileSlot(
      folder.userContextSource,
      snapshot.userContextSource,
      marker?.userContext,
    ),
  };
}

const mirrorLockTails = new Map<string, Promise<void>>();

/**
 * In-process keyed queue: runs `fn` after every earlier holder of `key` settles.
 * Callers key by the Home directory, so "write file(s) + record marker" and
 * "read file(s) + read marker" never interleave for one Bot Home.
 * Not reentrant: never call it again with the same key from inside `fn`.
 */
export function withBotProfileMirrorLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = mirrorLockTails.get(key) ?? Promise.resolve();
  const run = prev.then(fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  mirrorLockTails.set(key, tail);
  void tail.then(() => {
    if (mirrorLockTails.get(key) === tail) mirrorLockTails.delete(key);
  });
  return run;
}
