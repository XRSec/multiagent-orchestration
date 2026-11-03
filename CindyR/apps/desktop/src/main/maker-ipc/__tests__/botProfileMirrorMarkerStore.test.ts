import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { botProfileDir, readBotProfileFolder, writeBotProfileFolder } from '../botProfileFolder';
import { syncBotProfileFromFolder, type BotProfileFolderSyncDeps } from '../botProfileFolderSync';
import { fingerprintBotProfileText } from '../botProfileMirrorMarker';
import {
  BOT_PROFILE_MIRROR_MARKER_FILE,
  readBotProfileFolderWithMarker,
  readBotProfileMirrorMarker,
  recordBotProfileMirror,
  recordBotProfileMirrorIfUnchanged,
  rewriteBotProfileMirrorIfCurrent,
  writeBotProfileFolderMirrored,
} from '../botProfileMirrorMarkerStore';

const BOT = 'bot-1';
let root = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-profile-mirror-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const markerFile = () => path.join(botProfileDir(root, BOT), BOT_PROFILE_MIRROR_MARKER_FILE);
const soulFile = () => path.join(botProfileDir(root, BOT), 'SOUL.md');

describe('marker store', () => {
  it('record then read round-trips and leaves no tmp files', async () => {
    await recordBotProfileMirror(root, BOT, { identitySource: 's', userContextSource: 'u' });
    expect(await readBotProfileMirrorMarker(root, BOT)).toEqual({
      schemaVersion: 1,
      soul: fingerprintBotProfileText('s'),
      userContext: fingerprintBotProfileText('u'),
    });
    const entries = await fs.readdir(botProfileDir(root, BOT));
    expect(entries.filter((name) => name.includes('.tmp-'))).toEqual([]);
  });

  it('failed mirror write rethrows and never records the marker', async () => {
    await recordBotProfileMirror(root, BOT, { identitySource: 'old' });
    const before = await fs.readFile(markerFile(), 'utf8');
    const failing = vi.fn(async () => {
      throw new Error('disk full');
    });
    await expect(
      writeBotProfileFolderMirrored(root, BOT, { identitySource: 'new' }, failing),
    ).rejects.toThrow('disk full');
    expect(await fs.readFile(markerFile(), 'utf8')).toBe(before);
  });

  it('mirrored write records the written slot and keeps the other slot hash', async () => {
    await recordBotProfileMirror(root, BOT, { userContextSource: 'user' });
    await writeBotProfileFolderMirrored(root, BOT, { identitySource: 'soul' });
    expect(await fs.readFile(soulFile(), 'utf8')).toBe('soul');
    const marker = await readBotProfileMirrorMarker(root, BOT);
    expect(marker?.soul).toBe(fingerprintBotProfileText('soul'));
    expect(marker?.userContext).toBe(fingerprintBotProfileText('user'));
  });

  it('malformed marker or a directory at the marker path reads as null', async () => {
    await fs.mkdir(botProfileDir(root, BOT), { recursive: true });
    await fs.writeFile(markerFile(), '{oops', 'utf8');
    expect(await readBotProfileMirrorMarker(root, BOT)).toBeNull();
    await fs.rm(markerFile());
    await fs.mkdir(markerFile());
    expect(await readBotProfileMirrorMarker(root, BOT)).toBeNull();
  });

  it.skipIf(process.platform === 'win32')('symlinked marker reads as null', async () => {
    const outside = path.join(root, 'outside.json');
    await fs.writeFile(outside, JSON.stringify({ schemaVersion: 1, soul: 'a'.repeat(64) }));
    await fs.mkdir(botProfileDir(root, BOT), { recursive: true });
    await fs.symlink(outside, markerFile());
    expect(await readBotProfileMirrorMarker(root, BOT)).toBeNull();
  });

  it('concurrent mirrored writes end with file and marker agreeing', async () => {
    const texts = ['a', 'b', 'c', 'd', 'e'];
    await Promise.all(
      texts.map((text) => writeBotProfileFolderMirrored(root, BOT, { identitySource: text })),
    );
    const { folder, marker } = await readBotProfileFolderWithMarker(root, BOT);
    expect(marker?.soul).toBe(fingerprintBotProfileText(folder.identitySource));
  });

  it('concurrent records for soul and userContext keep both hashes', async () => {
    await Promise.all([
      recordBotProfileMirror(root, BOT, { identitySource: 's' }),
      recordBotProfileMirror(root, BOT, { userContextSource: 'u' }),
    ]);
    const marker = await readBotProfileMirrorMarker(root, BOT);
    expect(marker?.soul).toBe(fingerprintBotProfileText('s'));
    expect(marker?.userContext).toBe(fingerprintBotProfileText('u'));
  });

  it('record-if-unchanged skips a slot whose file moved on', async () => {
    await writeBotProfileFolder(root, BOT, { identitySource: 'later', userContextSource: 'u' });
    await recordBotProfileMirrorIfUnchanged(root, BOT, {
      identitySource: 'derived',
      userContextSource: 'u',
    });
    const marker = await readBotProfileMirrorMarker(root, BOT);
    expect(marker?.soul).toBeUndefined();
    expect(marker?.userContext).toBe(fingerprintBotProfileText('u'));
  });

  it('rewrite-if-current skips when the DB version moved', async () => {
    const write = vi.fn(writeBotProfileFolder);
    const current = { currentVersion: 4, identitySource: 'S1', userContextSource: '' };
    expect(
      await rewriteBotProfileMirrorIfCurrent(root, BOT, ['soul'], 3, async () => current, write),
    ).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it('a partially failed write holds the lock until the slow slot lands', async () => {
    await writeBotProfileFolderMirrored(root, BOT, {
      identitySource: 'S0',
      userContextSource: 'U0',
    });
    // Mimics writeBotProfileFolder's Promise.all: SOUL rejects immediately while
    // USER (U1) is still in flight and lands 50ms later.
    const partial = vi.fn(
      async (
        dir: string,
        id: string,
        patch: { identitySource?: string; userContextSource?: string },
      ) => {
        const writes: Array<Promise<void>> = [];
        if (patch.identitySource !== undefined) writes.push(Promise.reject(new Error('EIO')));
        if (patch.userContextSource !== undefined) {
          const text = patch.userContextSource;
          writes.push(
            new Promise((resolve) => setTimeout(resolve, 50)).then(() =>
              writeBotProfileFolder(dir, id, { userContextSource: text }),
            ),
          );
        }
        await Promise.all(writes);
      },
    );
    const first = writeBotProfileFolderMirrored(
      root,
      BOT,
      { identitySource: 'S1', userContextSource: 'U1' },
      partial,
    );
    const second = writeBotProfileFolderMirrored(root, BOT, { userContextSource: 'U2' });
    await expect(first).rejects.toThrow('EIO');
    await second;
    // Give any orphaned slot write time to land before observing the Home.
    await new Promise((resolve) => setTimeout(resolve, 120));
    const { folder, marker } = await readBotProfileFolderWithMarker(root, BOT);
    expect(folder.userContextSource).toBe('U2');
    expect(marker?.userContext).toBe(fingerprintBotProfileText('U2'));
    // The failed SOUL slot keeps the old hash so reconcile classifies it 'stale'.
    expect(folder.identitySource).toBe('S0');
    expect(marker?.soul).toBe(fingerprintBotProfileText('S0'));
  });

  it('rewrite-if-current leaves a slot edited after classification untouched', async () => {
    await writeBotProfileFolderMirrored(root, BOT, {
      identitySource: 'OLD',
      userContextSource: 'u',
    });
    // Classified 'stale' (file OLD == marker) ... then the user edits SOUL.md.
    await fs.writeFile(soulFile(), 'hand edit', 'utf8');
    const current = { currentVersion: 3, identitySource: 'NEW', userContextSource: 'u' };
    expect(
      await rewriteBotProfileMirrorIfCurrent(root, BOT, ['soul'], 3, async () => current),
    ).toBe(false);
    expect(await fs.readFile(soulFile(), 'utf8')).toBe('hand edit');
  });

  it('recording an unchanged marker does not rewrite the file', async () => {
    await recordBotProfileMirror(root, BOT, { identitySource: 's', userContextSource: 'u' });
    const before = await fs.stat(markerFile());
    await new Promise((resolve) => setTimeout(resolve, 20));
    await recordBotProfileMirrorIfUnchanged(root, BOT, {});
    await writeBotProfileFolder(root, BOT, { identitySource: 's', userContextSource: 'u' });
    await recordBotProfileMirrorIfUnchanged(root, BOT, {
      identitySource: 's',
      userContextSource: 'u',
    });
    const after = await fs.stat(markerFile());
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });
});

/** In-memory DB + real Home on disk, wired the same way bots.ts wires it. */
function realDeps(db: { version: number; soul: string; user: string }, snapshotVersion?: number) {
  const deriveVersion = vi.fn(async () => (db.version += 1));
  const snapshotOf = () => ({
    identitySource: db.soul,
    config: { userContextSource: db.user },
    currentVersion: db.version,
  });
  const frozen = snapshotVersion === undefined ? null : snapshotOf();
  const deps: BotProfileFolderSyncDeps = {
    readSnapshot: async () => frozen ?? snapshotOf(),
    readFolder: (id) => readBotProfileFolder(root, id),
    seedFolder: async () => {},
    deriveVersion,
    readFolderWithMarker: (id) => readBotProfileFolderWithMarker(root, id),
    rewriteFolder: (id, slots, expected) =>
      rewriteBotProfileMirrorIfCurrent(root, id, slots, expected, async () => ({
        currentVersion: db.version,
        identitySource: db.soul,
        userContextSource: db.user,
      })),
    recordMirror: (id, observed) => recordBotProfileMirrorIfUnchanged(root, id, observed),
  };
  return { deps, deriveVersion };
}

describe('end to end with real fs', () => {
  it('a failed mirror is repaired from the DB instead of rolling the save back', async () => {
    await writeBotProfileFolderMirrored(root, BOT, {
      identitySource: 'OLD',
      userContextSource: 'u',
    });
    const db = { version: 2, soul: 'NEW', user: 'u' };
    const failing = async () => {
      throw new Error('EIO');
    };
    await expect(
      writeBotProfileFolderMirrored(root, BOT, { identitySource: 'NEW' }, failing),
    ).rejects.toThrow();
    const { deps, deriveVersion } = realDeps(db);
    expect(await syncBotProfileFromFolder(BOT, deps)).toBe('mirror-stale');
    expect(deriveVersion).not.toHaveBeenCalled();
    expect(await fs.readFile(soulFile(), 'utf8')).toBe('NEW');
    expect(await syncBotProfileFromFolder(BOT, deps)).toBe('unchanged');
  });

  it('version moved during reconcile: rewrite skipped, file keeps S1, no derive', async () => {
    await writeBotProfileFolderMirrored(root, BOT, {
      identitySource: 'S0',
      userContextSource: 'u',
    });
    const db = { version: 1, soul: 'S0', user: 'u' };
    // Reconcile froze snapshot v1/S0; then a save commits v2/S1 and mirrors it.
    const { deps, deriveVersion } = realDeps(db, db.version);
    db.version = 2;
    db.soul = 'S1';
    await writeBotProfileFolderMirrored(root, BOT, { identitySource: 'S1' });
    expect(await syncBotProfileFromFolder(BOT, deps)).toBe('mirror-skipped');
    expect(deriveVersion).not.toHaveBeenCalled();
    expect(await fs.readFile(soulFile(), 'utf8')).toBe('S1');
  });
});
