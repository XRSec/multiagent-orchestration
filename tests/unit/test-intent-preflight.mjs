/**
 * Purpose: Unit tests for IntentPreflightHelper (Helper 1)
 * Usage: node --test tests/unit/test-intent-preflight.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  IntentPreflightHelper,
  INTENT_TYPES,
  CAPABILITY_TYPES
} from '../../packages/agent-control-plane/helpers/intent-preflight/IntentPreflightHelper.mjs';

describe('IntentPreflightHelper (Helper 1)', () => {
  const helper = new IntentPreflightHelper();

  it('1.1 顺延词 0ms 旁路直通且完全继承上下文能力', () => {
    const prevContext = {
      lastCapabilities: new Set([CAPABILITY_TYPES.FILE_READ, CAPABILITY_TYPES.FILE_WRITE]),
      lastAllowedTools: ['view_file', 'write_to_file']
    };
    // Warm up continuation bypass branch for V8 inline caching
    helper.analyze('ok', prevContext);

    const testPhrases = ['ok', '继续', '好', '好的', 'yes', 'proceed', '  继续!  ', 'OKAY'];
    for (const phrase of testPhrases) {
      const res = helper.analyze(phrase, prevContext);
      assert.strictEqual(res.isBypass, true, `Phrase "${phrase}" should trigger bypass`);
      assert.strictEqual(res.intentType, INTENT_TYPES.BYPASS_CONTINUATION);
      assert.ok(res.requiredCapabilities.has(CAPABILITY_TYPES.FILE_READ));
      assert.ok(res.requiredCapabilities.has(CAPABILITY_TYPES.FILE_WRITE));
      assert.deepStrictEqual(res.suggestedTools, ['view_file', 'write_to_file']);
      assert.ok(res.latencyMs < 2.0, `Latency must be < 2ms, got ${res.latencyMs}ms`);
    }
  });

  it('1.2 首轮无上下文顺延词应安全降级，不崩溃', () => {
    const res = helper.analyze('继续', null);
    assert.strictEqual(res.isBypass, true);
    assert.strictEqual(res.intentType, INTENT_TYPES.BYPASS_CONTINUATION);
    assert.ok(res.requiredCapabilities.has(CAPABILITY_TYPES.FILE_READ));
    assert.strictEqual(res.requiredCapabilities.size, 1);
  });

  it('1.3 顺延词复合修改指令拦截（防逃逸）', () => {
    const res = helper.analyze('好的，请帮我把 index.mjs 删除了', {
      lastCapabilities: new Set([CAPABILITY_TYPES.FILE_READ])
    });
    assert.strictEqual(res.isBypass, false);
    assert.strictEqual(res.intentType, INTENT_TYPES.CODE_MUTATION);
    assert.ok(res.requiredCapabilities.has(CAPABILITY_TYPES.FILE_WRITE));
    assert.ok(res.suggestedTools.includes('write_to_file'));
  });

  it('1.4 只读探索意图收敛，严禁写工具暴露', () => {
    const res = helper.analyze('查看一下当前目录结构和 package.json 内容');
    assert.strictEqual(res.isBypass, false);
    assert.strictEqual(res.intentType, INTENT_TYPES.READ_EXPLORE);
    assert.ok(res.requiredCapabilities.has(CAPABILITY_TYPES.FILE_READ));
    assert.ok(!res.requiredCapabilities.has(CAPABILITY_TYPES.FILE_WRITE));
    assert.ok(!res.suggestedTools.includes('write_to_file'));
    assert.ok(res.suggestedTools.includes('view_file'));
    assert.ok(res.suggestedTools.includes('list_dir'));
  });

  it('1.5 命令行执行意图激活 COMMAND_RUN', () => {
    const res = helper.analyze('运行 pnpm test 执行自动化单元测试');
    assert.strictEqual(res.isBypass, false);
    assert.strictEqual(res.intentType, INTENT_TYPES.TERMINAL_EXEC);
    assert.ok(res.requiredCapabilities.has(CAPABILITY_TYPES.COMMAND_RUN));
    assert.ok(res.suggestedTools.includes('run_command'));
  });
});
