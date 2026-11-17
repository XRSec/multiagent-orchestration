import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { lstat, mkdir, open, rename } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { pluginDataPath } from "./bot-home";
import { atomicWrite, ensureRealDirectory, readRegularText } from "./files";

// Cross-process lock for one delegated chat, so two hosts cannot append to the same
// conversation. File lease, per docs/proposals/session-policy.md [3.2.2]: O_EXCL create,
// take over only after expiry by renaming the old lock to a tombstone, then create again
// and confirm the nonce is ours.

export const LEASE_TTL_MS = 120_000;
const RECORD_LIMIT = 4096;

interface LeaseRecord {
  holder: string;
  nonce: string;
  expiresAt: number;
}

export interface Lease {
  readonly path: string;
  readonly nonce: string;
}

/** Identifies this process instance, so a restarted process never resumes an old lease. */
const INSTANCE = randomUUID();
const HOLDER = `${hostname()}:${process.pid}:${INSTANCE}`;

/** The lock path is a hash, so a chat id can never escape the leases folder. */
export function leaseFile(chatId: string, directory = join(pluginDataPath(), "leases")): string {
  return join(directory, `${createHash("sha256").update(chatId).digest("hex")}.lock`);
}

function parseRecord(text: string | null): LeaseRecord | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Partial<LeaseRecord>;
    if (typeof raw.holder !== "string" || typeof raw.nonce !== "string") return null;
    if (typeof raw.expiresAt !== "number" || !Number.isFinite(raw.expiresAt)) return null;
    return { holder: raw.holder, nonce: raw.nonce, expiresAt: raw.expiresAt };
  } catch {
    return null;
  }
}

async function readRecord(path: string): Promise<LeaseRecord | null> {
  return parseRecord(await readRegularText(path, RECORD_LIMIT).catch(() => null));
}

async function createExclusive(path: string, record: LeaseRecord): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify(record), "utf8");
  } finally {
    await handle.close();
  }
  return true;
}

async function ensureLeasesFolder(path: string): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await ensureRealDirectory(directory);
}

/** What was judged stale, kept so a claim can prove it moved the same file. */
export interface StaleLock {
  readonly nonce: string | null;
}

/** Returns the judged-stale lock, or null when a live holder still owns it. */
export async function staleAt(path: string, ttlMs = LEASE_TTL_MS): Promise<StaleLock | null> {
  const held = await readRecord(path);
  if (held) return held.expiresAt > Date.now() ? null : { nonce: held.nonce };
  // Unreadable: only clear it once the file itself is older than a full lease.
  const info = await lstat(path).catch(() => null);
  if (!info || Date.now() - info.mtimeMs < ttlMs) return null;
  return { nonce: null };
}

/** Puts a moved lock back where it was, without overwriting a newer holder. */
async function restore(from: string, to: string): Promise<void> {
  if (await lstat(to).catch(() => null)) throw new Error("A newer lock appeared while restoring a lock that was moved by mistake.");
  await rename(from, to);
}

/**
 * Moves the judged lock aside, proves the moved file is the one judged, then takes it.
 * Without the proof, a lock created between the read and the move would be stolen.
 */
export async function claimStale(path: string, stale: StaleLock, nonce: string, ttlMs = LEASE_TTL_MS): Promise<boolean> {
  const judged = stale.nonce ?? "unreadable";
  const tombstone = `${path}.${judged.slice(0, 8)}.${nonce.slice(0, 8)}.tombstone`;
  try {
    await rename(path, tombstone);
  } catch (error) {
    // A missing lock means another process already took it over; the caller's read-back decides.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const moved = await readRecord(tombstone);
  const sameLock = stale.nonce === null ? moved === null : moved?.nonce === stale.nonce;
  if (!sameLock) {
    // A live lock was moved by mistake: put it back and give up; a failed restore throws.
    await restore(tombstone, path);
    return false;
  }
  return createExclusive(path, { holder: HOLDER, nonce, expiresAt: Date.now() + ttlMs });
}

/** Returns a lease only when this process demonstrably holds it; null means someone else does. */
export async function acquireLease(chatId: string, options: { ttlMs?: number; directory?: string } = {}): Promise<Lease | null> {
  const ttlMs = options.ttlMs ?? LEASE_TTL_MS;
  const path = leaseFile(chatId, options.directory);
  await ensureLeasesFolder(path);
  const nonce = randomUUID();
  const confirm = async (): Promise<Lease | null> => ((await readRecord(path))?.nonce === nonce ? { path, nonce } : null);
  if (await createExclusive(path, { holder: HOLDER, nonce, expiresAt: Date.now() + ttlMs })) return confirm();
  const stale = await staleAt(path, ttlMs);
  if (!stale) return null;
  if (!(await claimStale(path, stale, nonce, ttlMs))) return null;
  // Read back: a concurrent claim may have replaced the file between create and now.
  return confirm();
}

/** Extends a lease this process still holds; false means the lease moved to another holder. */
export async function renewLease(lease: Lease, ttlMs = LEASE_TTL_MS): Promise<boolean> {
  if ((await readRecord(lease.path))?.nonce !== lease.nonce) return false;
  await atomicWrite(lease.path, JSON.stringify({ holder: HOLDER, nonce: lease.nonce, expiresAt: Date.now() + ttlMs }));
  return true;
}

/**
 * Releases only this process's own lock. The file is moved aside first and inspected by nonce,
 * so a lock that changed hands is put back instead of deleted.
 */
export async function releaseLease(lease: Lease): Promise<void> {
  const tombstone = `${lease.path}.${lease.nonce.slice(0, 8)}.release`;
  try {
    await rename(lease.path, tombstone);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if ((await readRecord(tombstone))?.nonce === lease.nonce) {
    rmSync(tombstone, { force: true });
    return;
  }
  await restore(tombstone, lease.path);
}
