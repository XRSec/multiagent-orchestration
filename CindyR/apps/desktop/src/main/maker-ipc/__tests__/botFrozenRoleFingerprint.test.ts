import { describe, expect, it } from 'vitest';

import {
  computeFrozenRoleFingerprint,
  diffFrozenRole,
  readFrozenRoleFingerprint,
  resolveFrozenRoleCheck,
  type FrozenRoleInputs,
} from '../botFrozenRoleFingerprint.js';

const base: FrozenRoleInputs = { displayName: 'Ada', description: 'Writes docs', systemPromptOverride: 'Be terse.' };
const fp = (patch: Partial<FrozenRoleInputs> = {}) => computeFrozenRoleFingerprint({ ...base, ...patch });

describe('computeFrozenRoleFingerprint', () => {
  it('is deterministic, trims displayName and keeps description raw', () => {
    expect(fp()).toEqual(fp());
    expect(fp({ displayName: '  Ada ' }).displayNameSha256).toBe(fp().displayNameSha256);
    expect(fp({ description: 'Writes docs ' }).descriptionSha256).not.toBe(fp().descriptionSha256);
    expect(fp().displayNameSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maps the overlay like the prompt injection does', () => {
    expect(fp({ systemPromptOverride: null }).systemPromptOverrideSha256).toBeNull();
    expect(fp({ systemPromptOverride: '  \n ' }).systemPromptOverrideSha256)
      .toBe(fp({ systemPromptOverride: '' }).systemPromptOverrideSha256);
    expect(fp({ systemPromptOverride: 'x' }).systemPromptOverrideSha256)
      .not.toBe(fp({ systemPromptOverride: '' }).systemPromptOverrideSha256);
  });
});

describe('diffFrozenRole', () => {
  it('reports drifted fields in fixed order', () => {
    expect(diffFrozenRole(fp(), fp())).toEqual([]);
    expect(diffFrozenRole(fp(), fp({ displayName: 'Bea' }))).toEqual(['displayName']);
    expect(diffFrozenRole(fp(), fp({ systemPromptOverride: 'Loud.', description: 'Other' })))
      .toEqual(['description', 'systemPromptOverride']);
  });

  it('ignores the overlay when either side is unknown', () => {
    expect(diffFrozenRole(fp({ systemPromptOverride: null }), fp({ systemPromptOverride: 'B' }))).toEqual([]);
    expect(diffFrozenRole(fp({ systemPromptOverride: 'A' }), fp({ systemPromptOverride: null }))).toEqual([]);
  });
});

describe('readFrozenRoleFingerprint', () => {
  it('rejects malformed values', () => {
    expect(readFrozenRoleFingerprint(null)).toBeNull();
    expect(readFrozenRoleFingerprint(undefined)).toBeNull();
    expect(readFrozenRoleFingerprint([fp()])).toBeNull();
    expect(readFrozenRoleFingerprint({ ...fp(), schemaVersion: 2 })).toBeNull();
    expect(readFrozenRoleFingerprint({ ...fp(), displayNameSha256: 1 })).toBeNull();
    expect(readFrozenRoleFingerprint({ ...fp(), descriptionSha256: null })).toBeNull();
    expect(readFrozenRoleFingerprint({ ...fp(), systemPromptOverrideSha256: 7 })).toBeNull();
  });

  it('accepts a JSON round-trip', () => {
    for (const value of [fp(), fp({ systemPromptOverride: null })]) {
      expect(readFrozenRoleFingerprint(JSON.parse(JSON.stringify(value)))).toEqual(value);
    }
  });
});

describe('resolveFrozenRoleCheck', () => {
  it('re-baselines to current for missing or legacy snapshots', () => {
    const current = fp();
    expect(resolveFrozenRoleCheck(null, current)).toEqual({ baseline: current, drift: [] });
    expect(resolveFrozenRoleCheck({ schemaVersion: 1, runtimeEpoch: {} }, current))
      .toEqual({ baseline: current, drift: [] });
    expect(resolveFrozenRoleCheck({ frozenRole: 'corrupt' }, current))
      .toEqual({ baseline: current, drift: [] });
  });

  it('keeps the original baseline so drift is never laundered', () => {
    const frozen = fp();
    const renamed = fp({ displayName: 'Bea' });
    const first = resolveFrozenRoleCheck({ frozenRole: frozen }, renamed);
    expect(first).toEqual({ baseline: frozen, drift: ['displayName'] });
    const second = resolveFrozenRoleCheck(
      JSON.parse(JSON.stringify({ frozenRole: first.baseline, frozenRoleDrift: first.drift })),
      renamed,
    );
    expect(second).toEqual({ baseline: frozen, drift: ['displayName'] });
    expect(resolveFrozenRoleCheck({ frozenRole: second.baseline }, fp()).drift).toEqual([]);
  });

  it('upgrades an unknown baseline overlay to the first known value without drift', () => {
    const frozen = fp({ systemPromptOverride: null });
    const known = fp({ systemPromptOverride: 'A' });
    const upgraded = resolveFrozenRoleCheck({ frozenRole: frozen }, known);
    expect(upgraded).toEqual({ baseline: known, drift: [] });
    expect(resolveFrozenRoleCheck({ frozenRole: upgraded.baseline }, fp({ systemPromptOverride: 'B' })).drift)
      .toEqual(['systemPromptOverride']);
  });
});
