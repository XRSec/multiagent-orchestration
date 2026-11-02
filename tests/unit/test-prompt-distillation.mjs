/**
 * Purpose: Unit tests for PromptDistillationHelper (Helper 5)
 * Usage: node --test tests/unit/test-prompt-distillation.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PromptDistillationHelper
} from '../../packages/agent-control-plane/helpers/prompt-distillation/PromptDistillationHelper.mjs';

describe('PromptDistillationHelper (Helper 5)', () => {
  it('3.1 剥离冗余中英文客套词并计算节省 Token', () => {
    const distiller = new PromptDistillationHelper();
    const input = '请问一下，麻烦你帮我查看下 index.js，非常感谢！';
    const cleaned = distiller.stripCourtesy(input);
    assert.ok(!cleaned.includes('请问一下'));
    assert.ok(!cleaned.includes('麻烦你'));
    assert.ok(!cleaned.includes('非常感谢'));
    assert.ok(cleaned.includes('查看下 index.js'));

    const enInput = 'Could you kindly please inspect the test-runner.mjs file? Thank you very much!';
    const enCleaned = distiller.stripCourtesy(enInput);
    assert.ok(!enCleaned.toLowerCase().includes('could you kindly'));
    assert.ok(!enCleaned.toLowerCase().includes('thank you very much'));
    assert.ok(enCleaned.includes('inspect the test-runner.mjs file'));
  });

  it('3.2 否定语义保护防逆转', () => {
    const distiller = new PromptDistillationHelper();
    const input = '请不要修改 packages/agent-control-plane/constants.mjs 文件，请勿删除注释！';
    const cleaned = distiller.stripCourtesy(input);
    assert.ok(cleaned.includes('不要修改') || cleaned.includes('勿删除'));
    assert.ok(!cleaned.startsWith('修改 packages/'));
  });

  it('3.3 冷热分离提取与确定性前缀哈希', () => {
    const distiller = new PromptDistillationHelper();
    const prompt1 = `
规范: 单文件代码行数严格 <= 600 行
要求: 必须使用纯原生 ESM
请帮我把 user.js 重构为 user.mjs
    `;
    const prompt2 = `
规范: 单文件代码行数严格 <= 600 行
要求: 必须使用纯原生 ESM
请帮我把 order.js 重构为 order.mjs
    `;

    const res1 = distiller.distill(prompt1);
    const res2 = distiller.distill(prompt2);

    assert.strictEqual(res1.prefixHash, res2.prefixHash);
    assert.ok(res1.coldPrefix.includes('单文件代码行数严格 <= 600 行'));
    assert.ok(res1.hotParameters.includes('user.js'));
    assert.ok(res2.hotParameters.includes('order.js'));
    assert.strictEqual(res2.cacheHit, true, 'Prompt 2 cold prefix should hit LRU cache');
  });

  it('3.4 原生 Map LRU 缓存命中与容量淘汰机制', () => {
    const distiller = new PromptDistillationHelper({ maxCacheSize: 2 });

    distiller.distill('规范: 规则A\n参数 1'); // cache size = 1
    distiller.distill('规范: 规则B\n参数 2'); // cache size = 2

    let stats = distiller.getCacheStats();
    assert.strictEqual(stats.size, 2);

    // 重新访问规则A，刷新 LRU
    distiller.distill('规范: 规则A\n参数 1 重新访问');
    stats = distiller.getCacheStats();
    assert.strictEqual(stats.hits, 1);

    // 插入规则C，容量溢出，应淘汰最早的规则B
    distiller.distill('规范: 规则C\n参数 3');
    stats = distiller.getCacheStats();
    assert.strictEqual(stats.size, 2);

    // 再次访问规则B应为 miss
    const resB = distiller.distill('规范: 规则B\n参数 2 再次');
    assert.strictEqual(resB.cacheHit, false);
  });
});
