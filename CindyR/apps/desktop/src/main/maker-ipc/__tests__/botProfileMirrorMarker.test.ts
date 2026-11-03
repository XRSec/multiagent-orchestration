import { describe, expect, it } from 'vitest';

import {
  classifyBotProfileSlot,
  fingerprintBotProfileText,
  mergeBotProfileMirrorMarker,
  parseBotProfileMirrorMarker,
  planBotProfileMirror,
  serializeBotProfileMirrorMarker,
  withBotProfileMirrorLock,
} from '../botProfileMirrorMarker';

const h1 = fingerprintBotProfileText('one');
const h2 = fingerprintBotProfileText('two');

describe('fingerprintBotProfileText', () => {
  it('is a deterministic 64-hex sha256 that distinguishes a trailing newline', () => {
    expect(fingerprintBotProfileText('a')).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintBotProfileText('a')).toBe(fingerprintBotProfileText('a'));
    expect(fingerprintBotProfileText('a')).not.toBe(fingerprintBotProfileText('a\n'));
  });
});

describe('parseBotProfileMirrorMarker', () => {
  it('returns null for empty, invalid JSON, wrong schema or arrays', () => {
    expect(parseBotProfileMirrorMarker('')).toBeNull();
    expect(parseBotProfileMirrorMarker('{not json')).toBeNull();
    expect(parseBotProfileMirrorMarker(JSON.stringify({ schemaVersion: 2, soul: h1 }))).toBeNull();
    expect(parseBotProfileMirrorMarker(JSON.stringify([1]))).toBeNull();
  });

  it('drops a slot that is not 64-hex and round-trips through serialize', () => {
    const parsed = parseBotProfileMirrorMarker(
      JSON.stringify({ schemaVersion: 1, soul: 'nope', userContext: h2 }),
    );
    expect(parsed).toEqual({ schemaVersion: 1, userContext: h2 });
    const marker = { schemaVersion: 1 as const, soul: h1, userContext: h2 };
    const text = serializeBotProfileMirrorMarker(marker);
    expect(text.endsWith('\n')).toBe(true);
    expect(parseBotProfileMirrorMarker(text)).toEqual(marker);
  });
});

describe('mergeBotProfileMirrorMarker', () => {
  it('replaces only the written slots', () => {
    const merged = mergeBotProfileMirrorMarker(
      { schemaVersion: 1, soul: h1, userContext: h2 },
      { identitySource: 'x' },
    );
    expect(merged).toEqual({
      schemaVersion: 1,
      soul: fingerprintBotProfileText('x'),
      userContext: h2,
    });
  });

  it('creates a schemaVersion 1 marker from null', () => {
    expect(mergeBotProfileMirrorMarker(null, { userContextSource: 'u' })).toEqual({
      schemaVersion: 1,
      userContext: fingerprintBotProfileText('u'),
    });
  });
});

describe('classifyBotProfileSlot', () => {
  it('in-sync whenever file equals snapshot', () => {
    expect(classifyBotProfileSlot('s', 's', undefined)).toBe('in-sync');
    expect(classifyBotProfileSlot('s', 's', h1)).toBe('in-sync');
  });

  it('stale when the file is exactly what the host last wrote', () => {
    expect(classifyBotProfileSlot('one', 'new', h1)).toBe('stale');
  });

  it('edited without a marker or when the hash differs', () => {
    expect(classifyBotProfileSlot('one', 'new', undefined)).toBe('edited');
    expect(classifyBotProfileSlot('hand edit', 'new', h1)).toBe('edited');
  });
});

describe('planBotProfileMirror', () => {
  it('classifies each slot independently', () => {
    const plan = planBotProfileMirror(
      { identitySource: 'hand edit', userContextSource: 'two' },
      { identitySource: 'new soul', userContextSource: 'new user' },
      { schemaVersion: 1, soul: h1, userContext: h2 },
    );
    expect(plan).toEqual({ identity: 'edited', userContext: 'stale' });
  });
});

describe('withBotProfileMirrorLock', () => {
  it('serializes holders of one key and survives a rejected holder', async () => {
    const order: string[] = [];
    const slow = withBotProfileMirrorLock('k', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('a');
      throw new Error('boom');
    });
    const next = withBotProfileMirrorLock('k', async () => {
      order.push('b');
      return 2;
    });
    await expect(slow).rejects.toThrow('boom');
    await expect(next).resolves.toBe(2);
    expect(order).toEqual(['a', 'b']);
  });
});
