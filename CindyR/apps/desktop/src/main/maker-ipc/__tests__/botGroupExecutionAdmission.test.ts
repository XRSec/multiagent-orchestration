import { describe, expect, it } from 'vitest';
import { admitOrdinaryExecutionSource, type AdmissionInput } from '../botGroupExecutionAdmission.js';

// bot-group-chat.md §4.0: on single-speaker servers a teammate's reply wakes no teammate.
describe('ordinary execution source admission', () => {
  const human = { author: { kind: 'human' }, origin: 'user', deleted: false };
  const bot = { author: { kind: 'bot' }, origin: 'bot', deleted: false };
  const input = (extra: Partial<AdmissionInput> = {}): AdmissionInput => ({ singleSpeaker: true, digest: false, source: human, ...extra });

  it('admits a human user-origin source on a single-speaker server', () => {
    expect(admitOrdinaryExecutionSource(input())).toEqual({ ok: true });
  });

  it('rejects a teammate reply on a single-speaker server', () => {
    expect(admitOrdinaryExecutionSource(input({ source: bot }))).toEqual({ ok: false, reason: 'BOT_SOURCE' });
    expect(admitOrdinaryExecutionSource(input({ source: { author: { kind: 'bot' }, origin: 'import' } }))).toEqual({ ok: false, reason: 'BOT_SOURCE' });
    expect(admitOrdinaryExecutionSource(input({ source: { author: null, origin: 'bot' } }))).toEqual({ ok: false, reason: 'BOT_SOURCE' });
  });

  it.each([
    ['legacy server', { singleSpeaker: false }],
    ['plan step', { planId: 'plan-1' }],
    ['AI reply mask', { maskOwnerId: 'owner-1' }],
    ['digest', { digest: true }],
  ] as const)('rejects a system source regardless of %s', (_name, extra) => {
    expect(admitOrdinaryExecutionSource(input({ ...extra, source: { author: { kind: 'human' }, origin: 'system' } })))
      .toEqual({ ok: false, reason: 'SYSTEM_SOURCE' });
  });

  it('admits a teammate source on a legacy server (bounded continuation, §4.1-4.3)', () => {
    expect(admitOrdinaryExecutionSource(input({ singleSpeaker: false, source: bot }))).toEqual({ ok: true });
  });

  it.each([
    ['plan step', { planId: 'plan-1' }],
    ['AI reply mask', { maskOwnerId: 'owner-1' }],
    ['digest', { digest: true }],
  ] as const)('admits a teammate source for a %s', (_name, extra) => {
    expect(admitOrdinaryExecutionSource(input({ ...extra, source: bot }))).toEqual({ ok: true });
  });

  it('admits an unreadable source, a deleted human source, human imports and integration notices', () => {
    expect(admitOrdinaryExecutionSource(input({ source: undefined }))).toEqual({ ok: true });
    expect(admitOrdinaryExecutionSource(input({ source: { ...human, deleted: true } }))).toEqual({ ok: true });
    expect(admitOrdinaryExecutionSource(input({ source: { author: { kind: 'human' }, origin: 'import' } }))).toEqual({ ok: true });
    expect(admitOrdinaryExecutionSource(input({ source: { author: { kind: 'integration' }, origin: 'integration' } }))).toEqual({ ok: true });
  });
});
