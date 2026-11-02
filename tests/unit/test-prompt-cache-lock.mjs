/**
 * Purpose: Unit tests for PromptCacheLockHelper (Helper 2)
 * Usage: node --test tests/unit/test-prompt-cache-lock.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PromptCacheLockHelper,
  TAIL_INJECTION_SEPARATOR
} from '../../packages/agent-control-plane/helpers/prompt-cache-lock/PromptCacheLockHelper.mjs';

describe('PromptCacheLockHelper (Helper 2)', () => {
  it('2.1 静态前缀确定性组装与哈希幂等性', () => {
    const locker = new PromptCacheLockHelper();
    const segmentsA = [
      { id: 'standing-order', priority: 10, content: '# Standing Order\nRules here.' },
      { id: 'partner-soul', priority: 30, content: '# Partner Soul\nRole here.' },
      { id: 'harness', priority: 20, content: '# Harness\nContract here.' }
    ];
    // 逆序传入
    const segmentsB = [
      { id: 'partner-soul', priority: 30, content: '# Partner Soul\nRole here.' },
      { id: 'standing-order', priority: 10, content: '# Standing Order\nRules here.' },
      { id: 'harness', priority: 20, content: '# Harness\nContract here.' }
    ];

    const resA = locker.assembleStaticPrefix(segmentsA);
    const resB = locker.assembleStaticPrefix(segmentsB);

    assert.strictEqual(resA.staticHash, resB.staticHash);
    assert.strictEqual(resA.staticPrefix, resB.staticPrefix);
    assert.ok(resA.staticPrefix.indexOf('Standing Order') < resA.staticPrefix.indexOf('Harness'));
    assert.ok(resA.staticPrefix.indexOf('Harness') < resA.staticPrefix.indexOf('Partner Soul'));
  });

  it('2.2 尾部注入保证前缀绝对不变与 KV 缓存稳定性', () => {
    const locker = new PromptCacheLockHelper();
    const staticPrefix = '# Base System Prompt\nPure static rules.';
    
    const turn1 = locker.injectTail(staticPrefix, {
      timestampIso: '2026-11-02T10:00:00Z',
      activeSessionId: 'sess-001',
      steeringDirectives: ['First directive']
    });

    const turn2 = locker.injectTail(staticPrefix, {
      timestampIso: '2026-11-02T10:05:00Z',
      activeSessionId: 'sess-001',
      steeringDirectives: ['Updated directive']
    });

    assert.strictEqual(turn1.staticHash, turn2.staticHash);
    assert.ok(turn1.fullPrompt.startsWith(staticPrefix));
    assert.ok(turn2.fullPrompt.startsWith(staticPrefix));
    assert.ok(turn1.fullPrompt.includes(TAIL_INJECTION_SEPARATOR));
    assert.ok(locker.verifyCacheInvariance(turn1, turn2));
  });

  it('2.3 基座哈希锁定后防篡改抛错', () => {
    const locker = new PromptCacheLockHelper();
    const baseHash = 'a'.repeat(64);
    locker.lockBaseHash(baseHash);

    assert.throws(() => {
      locker.lockBaseHash('b'.repeat(64));
    }, /Cannot re-lock to different hash/);

    assert.throws(() => {
      locker.assembleStaticPrefix([{ id: 'bad', priority: 1, content: 'tampered' }]);
    }, /Base hash mismatch/);
  });

  it('2.4 静态段纯度校验阻断动态插值', () => {
    const locker = new PromptCacheLockHelper();
    const pureContent = '# Pure Rules\nAll content is static and immutable.';
    const impureContent = '# Tampered Rules\nCreated at 2026-11-02T14:30:00Z by uuid 12345678-1234-1234-1234-123456789abc';

    assert.strictEqual(locker.validateStaticPurity(pureContent).isPure, true);
    const impureCheck = locker.validateStaticPurity(impureContent);
    assert.strictEqual(impureCheck.isPure, false);
    assert.ok(impureCheck.violations.length >= 2);
  });
});
