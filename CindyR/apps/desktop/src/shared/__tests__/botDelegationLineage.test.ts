import { describe, expect, it } from 'vitest';
import {
  DELEGATION_LINEAGE_MAX_ENTRIES,
  DELEGATION_LINEAGE_MAX_JSON_CHARS,
  assertDelegationAdmissible,
  evaluateDelegationAdmission,
  isDelegationAdmissionCode,
  parseDelegationLineage,
  type DelegationAdmissionInput,
} from '../botDelegationLineage';

const base: DelegationAdmissionInput = {
  parentLineage: [], parentDepth: 0, requesterBotId: 'A', targetBotId: null, targetProfileVersion: null, maxDepth: 1,
};
const evaluate = (patch: Partial<DelegationAdmissionInput>) => evaluateDelegationAdmission({ ...base, ...patch });
const ids = (n: number) => Array.from({ length: n }, (_, i) => `bot-${i}`);

describe('parseDelegationLineage', () => {
  it.each([null, undefined, '', '[]'])('returns [] for %s', (value) => {
    expect(parseDelegationLineage(value)).toEqual([]);
  });
  it('parses an array of bot ids', () => {
    expect(parseDelegationLineage('["a","b"]')).toEqual(['a', 'b']);
  });
  it.each(['{', '[1]', '[""]', '"a"', JSON.stringify(ids(DELEGATION_LINEAGE_MAX_ENTRIES + 1))])(
    'returns null for %s', (value) => {
      expect(parseDelegationLineage(value)).toBeNull();
    },
  );
  it('rejects oversized JSON before parsing, even with few entries', () => {
    const long = JSON.stringify(['a'.repeat(DELEGATION_LINEAGE_MAX_JSON_CHARS)]);
    expect(parseDelegationLineage(long)).toBeNull();
    const fits = JSON.stringify(['a'.repeat(DELEGATION_LINEAGE_MAX_JSON_CHARS - 4)]);
    expect(fits.length).toBe(DELEGATION_LINEAGE_MAX_JSON_CHARS);
    expect(parseDelegationLineage(fits)).toEqual(['a'.repeat(DELEGATION_LINEAGE_MAX_JSON_CHARS - 4)]);
  });
});

describe('evaluateDelegationAdmission', () => {
  it('matches the hard-coded producer values for a top-level plain task', () => {
    expect(evaluate({})).toEqual({ ok: true, lineage: ['A'], depth: 1 });
  });
  it('enforces maxDepth', () => {
    const nested = { parentLineage: ['A'], parentDepth: 1, requesterBotId: 'B' };
    expect(evaluate({ ...nested, maxDepth: 1 })).toEqual({ ok: false, code: 'DELEGATION_DEPTH_EXCEEDED' });
    expect(evaluate({ ...nested, maxDepth: 2 })).toEqual({ ok: true, lineage: ['A', 'B'], depth: 2 });
  });
  it('rejects requester re-entry and target cycles', () => {
    expect(evaluate({ parentLineage: ['A', 'B'], parentDepth: 2, maxDepth: 5 }))
      .toEqual({ ok: false, code: 'DELEGATION_CYCLE' });
    expect(evaluate({ parentLineage: ['A'], parentDepth: 1, requesterBotId: 'B', targetBotId: 'A', targetProfileVersion: 3, maxDepth: 5 }))
      .toEqual({ ok: false, code: 'DELEGATION_CYCLE' });
  });
  it('rejects self targets', () => {
    expect(evaluate({ targetBotId: 'A', targetProfileVersion: 1 })).toEqual({ ok: false, code: 'DELEGATION_SELF_TARGET' });
  });
  it.each([null, 0, 1.5, Number.NaN])('rejects target version %s before cycle and depth rules', (version) => {
    expect(evaluate({ targetBotId: 'B', targetProfileVersion: version }))
      .toEqual({ ok: false, code: 'DELEGATION_TARGET_VERSION_MISSING' });
    expect(evaluate({ parentLineage: ['B'], parentDepth: 9, targetBotId: 'B', targetProfileVersion: version }))
      .toEqual({ ok: false, code: 'DELEGATION_TARGET_VERSION_MISSING' });
  });
  it('admits a frozen target version at the top level', () => {
    expect(evaluate({ targetBotId: 'B', targetProfileVersion: 2 })).toEqual({ ok: true, lineage: ['A'], depth: 1 });
  });
  it('rejects a lineage whose JSON would exceed the reader cap, keeping writer and reader symmetric', () => {
    const longId = 'x'.repeat(DELEGATION_LINEAGE_MAX_JSON_CHARS);
    expect(evaluate({ requesterBotId: longId })).toEqual({ ok: false, code: 'DELEGATION_LINEAGE_INVALID' });
    const fittingId = 'x'.repeat(DELEGATION_LINEAGE_MAX_JSON_CHARS - 4);
    const admitted = evaluate({ requesterBotId: fittingId });
    expect(admitted).toEqual({ ok: true, lineage: [fittingId], depth: 1 });
    if (admitted.ok) expect(parseDelegationLineage(JSON.stringify(admitted.lineage))).toEqual([fittingId]);
  });
  it.each([
    { parentDepth: -1 },
    { maxDepth: 1.5 },
    { parentLineage: [''] },
    { parentLineage: ids(DELEGATION_LINEAGE_MAX_ENTRIES), parentDepth: DELEGATION_LINEAGE_MAX_ENTRIES, maxDepth: 100 },
  ])('rejects invalid input %#', (patch) => {
    expect(evaluate(patch)).toEqual({ ok: false, code: 'DELEGATION_LINEAGE_INVALID' });
  });
});

describe('assertDelegationAdmissible / isDelegationAdmissionCode', () => {
  it('throws the admission code as the error message', () => {
    expect(() => assertDelegationAdmissible({ ...base, parentLineage: ['A'], parentDepth: 1, maxDepth: 5 }))
      .toThrowError(expect.objectContaining({ message: 'DELEGATION_CYCLE' }));
    expect(assertDelegationAdmissible(base)).toEqual({ lineage: ['A'], depth: 1 });
  });
  it('recognizes exactly the five admission codes', () => {
    for (const code of ['DELEGATION_LINEAGE_INVALID', 'DELEGATION_DEPTH_EXCEEDED', 'DELEGATION_CYCLE',
      'DELEGATION_SELF_TARGET', 'DELEGATION_TARGET_VERSION_MISSING']) {
      expect(isDelegationAdmissionCode(code)).toBe(true);
    }
    expect(isDelegationAdmissionCode('BOT_DELEGATION_CONCURRENCY_LIMIT')).toBe(false);
    expect(isDelegationAdmissionCode(undefined)).toBe(false);
  });
});
