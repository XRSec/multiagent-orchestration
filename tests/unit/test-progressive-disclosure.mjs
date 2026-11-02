/**
 * Purpose: Unit tests for ProgressiveDisclosureHelper (Helper 3)
 * Usage: node --test tests/unit/test-progressive-disclosure.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProgressiveDisclosureHelper } from '../../packages/agent-control-plane/helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs';

describe('ProgressiveDisclosureHelper Unit Tests', () => {
  it('Test 3.1: Layer 1 零开销元数据折叠输出格式与指标精确性', () => {
    const helper = new ProgressiveDisclosureHelper();
    const mockContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    helper.registerResource('res-doc-01', mockContent, { tag: 'documentation' });

    const l1 = helper.renderLayer1('res-doc-01');
    assert.match(l1, /^\[ResourceFolded: res-doc-01 \| lines: 5 \| bytes: \d+ \| tag: documentation\]$/);
    assert.ok(l1.length < 90, 'Layer 1 元数据体积必须极小');
  });

  it('Test 3.2: Layer 2 微胶囊长度硬约束 <= 180 字符', () => {
    const helper = new ProgressiveDisclosureHelper();
    const giantContent = '# Title: Huge System Architecture Specification\n' + 'Very long detailed specification text '.repeat(100);
    helper.registerResource('res-arch-giant', giantContent, { tag: 'architecture' });

    const l2 = helper.renderLayer2('res-arch-giant');
    assert.ok(l2.startsWith('[ResourceCapsule: res-arch-giant |'));
    assert.ok(l2.length <= 180, `Layer 2 整体输出字符数必须 <= 180，实际为 ${l2.length}`);
  });

  it('Test 3.3: Layer 3 精准切片窗口 [Lines start-end of total] 与越界自适应', () => {
    const helper = new ProgressiveDisclosureHelper();
    const lines100 = Array.from({ length: 100 }, (_, i) => `Code line ${i + 1}`).join('\n');
    helper.registerResource('res-code-100', lines100);

    // 正常切片
    const l3Normal = helper.renderLayer3('res-code-100', { startLine: 10, endLine: 15 });
    assert.ok(l3Normal.startsWith('[ResourceSlice: res-code-100 | Lines 10-15 of 100]'));
    const sliceLines = l3Normal.split('\n').slice(1);
    assert.strictEqual(sliceLines.length, 6);
    assert.strictEqual(sliceLines[0], 'Code line 10');
    assert.strictEqual(sliceLines[5], 'Code line 15');

    // 越界自适应
    const l3Clamped = helper.renderLayer3('res-code-100', { startLine: 95, endLine: 200 });
    assert.ok(l3Clamped.startsWith('[ResourceSlice: res-code-100 | Lines 95-100 of 100]'));
  });

  it('Test 3.4: 统一门面 render 接口分级调度与非法参数防御', () => {
    const helper = new ProgressiveDisclosureHelper();
    helper.registerResource('res-test', 'Content test');

    assert.ok(helper.render('res-test', 1).includes('ResourceFolded'));
    assert.ok(helper.render('res-test', 2).includes('ResourceCapsule'));
    assert.ok(helper.render('res-test', 3).includes('ResourceSlice'));

    assert.throws(() => helper.render('non-existent', 1), /Resource not found/);
    assert.throws(() => helper.render('res-test', 99), /Unsupported disclosure level/);
  });
});
