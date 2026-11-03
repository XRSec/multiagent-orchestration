/**
 * On-disk host mirror marker (`<Home>/.host-mirror.json`) plus the per-Home
 * critical sections that keep file bytes and marker hashes in agreement.
 *
 * Every "write SOUL/USER + record marker" and "read SOUL/USER + read marker"
 * runs under `withBotProfileMirrorLock(<Home dir>)`. Without it a reconcile
 * rewrite and a save mirror could interleave into file = S0 / marker = h(S1),
 * which classifies as 'edited' and derives stale text (the original rollback).
 *
 * fs only: no Electron, no DB. DB freshness is injected via `readCurrent`.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  botProfileDir,
  readBotProfileFolder,
  writeBotProfileFolder,
  type BotProfileFolderContent,
} from './botProfileFolder.js';
import {
  fingerprintBotProfileText,
  mergeBotProfileMirrorMarker,
  parseBotProfileMirrorMarker,
  serializeBotProfileMirrorMarker,
  withBotProfileMirrorLock,
  type BotProfileMirrorMarker,
  type BotProfileMirrorSlot,
  type BotProfileMirrorTexts,
} from './botProfileMirrorMarker.js';

export const BOT_PROFILE_MIRROR_MARKER_FILE = '.host-mirror.json';

type FolderWriter = (
  userDataDir: string,
  botId: string,
  patch: BotProfileMirrorTexts,
) => Promise<void>;

/** Current DB texts, read inside the lock for the freshness check. */
export interface BotProfileMirrorCurrent {
  currentVersion: number;
  identitySource: string;
  userContextSource: string;
}

function markerPath(userDataDir: string, botId: string): string {
  return path.join(botProfileDir(userDataDir, botId), BOT_PROFILE_MIRROR_MARKER_FILE);
}

function lockKey(userDataDir: string, botId: string): string {
  return path.resolve(botProfileDir(userDataDir, botId));
}

/** Never throws: missing, non-regular (symlink / dir), unreadable or malformed -> null. */
export async function readBotProfileMirrorMarker(
  userDataDir: string,
  botId: string,
): Promise<BotProfileMirrorMarker | null> {
  try {
    const target = markerPath(userDataDir, botId);
    const stat = await fs.lstat(target);
    if (!stat.isFile()) return null;
    return parseBotProfileMirrorMarker(await fs.readFile(target, 'utf8'));
  } catch {
    return null;
  }
}

/** Unlocked read-merge-write; rename replaces a planted symlink instead of following it. */
async function recordUnlocked(
  userDataDir: string,
  botId: string,
  written: BotProfileMirrorTexts,
): Promise<void> {
  if (written.identitySource === undefined && written.userContextSource === undefined) return;
  const target = markerPath(userDataDir, botId);
  const prev = await readBotProfileMirrorMarker(userDataDir, botId);
  const next = mergeBotProfileMirrorMarker(prev, written);
  // Reconcile records on every consistent pass; skip the rewrite when nothing changes.
  const serialized = serializeBotProfileMirrorMarker(next);
  if (prev && serializeBotProfileMirrorMarker(prev) === serialized) return;
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${randomUUID()}`;
  await fs.writeFile(tmp, serialized, 'utf8');
  try {
    await fs.rename(tmp, target);
  } catch (cause) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw cause;
  }
}

function mirrorTexts(patch: BotProfileMirrorTexts): BotProfileMirrorTexts {
  const out: BotProfileMirrorTexts = {};
  if (patch.identitySource !== undefined) out.identitySource = patch.identitySource;
  if (patch.userContextSource !== undefined) out.userContextSource = patch.userContextSource;
  return out;
}

/** One single-slot patch per slot present in `patch`. */
function splitSlots(patch: BotProfileMirrorTexts): BotProfileMirrorTexts[] {
  const parts: BotProfileMirrorTexts[] = [];
  if (patch.identitySource !== undefined) parts.push({ identitySource: patch.identitySource });
  if (patch.userContextSource !== undefined) {
    parts.push({ userContextSource: patch.userContextSource });
  }
  return parts;
}

/**
 * Writes each slot separately and waits for EVERY slot to settle before the
 * caller releases the lock: an orphaned slot write must never land after a
 * later locked writer (file = old text, marker = newer hash -> 'edited' ->
 * rollback). Records hashes only for slots that succeeded; rethrows the first
 * write error.
 */
async function writeSlotsUnlocked(
  userDataDir: string,
  botId: string,
  patch: BotProfileMirrorTexts,
  write: FolderWriter,
): Promise<void> {
  const parts = splitSlots(patch);
  const results = await Promise.allSettled(parts.map((part) => write(userDataDir, botId, part)));
  const written: BotProfileMirrorTexts = {};
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') Object.assign(written, parts[index]);
  });
  const failed = results.find((result) => result.status === 'rejected');
  if (!failed) return recordUnlocked(userDataDir, botId, written);
  await recordUnlocked(userDataDir, botId, written).catch(() => {});
  throw (failed as PromiseRejectedResult).reason;
}

/** Records hashes of `written`. Throws on failure; callers swallow. */
export function recordBotProfileMirror(
  userDataDir: string,
  botId: string,
  written: BotProfileMirrorTexts,
): Promise<void> {
  return withBotProfileMirrorLock(lockKey(userDataDir, botId), () =>
    recordUnlocked(userDataDir, botId, mirrorTexts(written)),
  );
}

/**
 * Host mirror write. The marker is recorded only after the write succeeds: a
 * failed mirror leaves the old hash (= old file), so reconcile sees 'stale'.
 */
export function writeBotProfileFolderMirrored(
  userDataDir: string,
  botId: string,
  patch: BotProfileMirrorTexts,
  write: FolderWriter = writeBotProfileFolder,
): Promise<void> {
  return withBotProfileMirrorLock(lockKey(userDataDir, botId), () =>
    writeSlotsUnlocked(userDataDir, botId, mirrorTexts(patch), write),
  );
}

/** Folder and marker observed together, never straddling a write + record. */
export function readBotProfileFolderWithMarker(
  userDataDir: string,
  botId: string,
): Promise<{ folder: BotProfileFolderContent; marker: BotProfileMirrorMarker | null }> {
  return withBotProfileMirrorLock(lockKey(userDataDir, botId), async () => {
    const folder = await readBotProfileFolder(userDataDir, botId);
    const marker = await readBotProfileMirrorMarker(userDataDir, botId);
    return { folder, marker };
  });
}

/** Records only the slots whose file bytes still equal `observed`. */
export function recordBotProfileMirrorIfUnchanged(
  userDataDir: string,
  botId: string,
  observed: BotProfileMirrorTexts,
): Promise<void> {
  return withBotProfileMirrorLock(lockKey(userDataDir, botId), async () => {
    const folder = await readBotProfileFolder(userDataDir, botId);
    const still: BotProfileMirrorTexts = {};
    if (
      observed.identitySource !== undefined &&
      folder.identitySource === observed.identitySource
    ) {
      still.identitySource = observed.identitySource;
    }
    if (
      observed.userContextSource !== undefined &&
      folder.userContextSource === observed.userContextSource
    ) {
      still.userContextSource = observed.userContextSource;
    }
    await recordUnlocked(userDataDir, botId, still);
  });
}

/**
 * Stale slots whose file bytes still hash to the marker, observed in the same
 * critical section. A slot edited since classification is dropped, so the
 * rewrite never clobbers a hand / Agent edit (next reconcile sees 'edited').
 */
async function stillStaleSlots(
  userDataDir: string,
  botId: string,
  slots: BotProfileMirrorSlot[],
): Promise<BotProfileMirrorSlot[]> {
  const marker = await readBotProfileMirrorMarker(userDataDir, botId);
  if (!marker) return [];
  const folder = await readBotProfileFolder(userDataDir, botId);
  return slots.filter((slot) => {
    const text = slot === 'soul' ? folder.identitySource : folder.userContextSource;
    return marker[slot] !== undefined && fingerprintBotProfileText(text) === marker[slot];
  });
}

/**
 * Rewrites the given stale slots from the CURRENT DB texts, only if the DB
 * version still equals `expectedCurrentVersion` and the slot file still holds
 * the bytes the host last wrote. Returns false when nothing was rewritten.
 */
export function rewriteBotProfileMirrorIfCurrent(
  userDataDir: string,
  botId: string,
  slots: BotProfileMirrorSlot[],
  expectedCurrentVersion: number,
  readCurrent: () => Promise<BotProfileMirrorCurrent | null>,
  write: FolderWriter = writeBotProfileFolder,
): Promise<boolean> {
  return withBotProfileMirrorLock(lockKey(userDataDir, botId), async () => {
    const current = await readCurrent();
    if (!current || current.currentVersion !== expectedCurrentVersion) return false;
    const stale = await stillStaleSlots(userDataDir, botId, slots);
    if (stale.length === 0) return false;
    const patch: BotProfileMirrorTexts = {};
    if (stale.includes('soul')) patch.identitySource = current.identitySource;
    if (stale.includes('userContext')) patch.userContextSource = current.userContextSource;
    await writeSlotsUnlocked(userDataDir, botId, patch, write);
    return true;
  });
}
