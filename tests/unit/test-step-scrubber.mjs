/**
 * Purpose: Unit tests for StepScrubberHelper (Helper 4)
 * Usage: node --test tests/unit/test-step-scrubber.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StepScrubberHelper } from '../../packages/agent-control-plane/helpers/step-scrubber/StepScrubberHelper.mjs';

describe('StepScrubberHelper Unit Tests', () => {
  it('Test 4.1: 短输出 (<= 12 行) 原样保持不触发折叠', () => {
    const scrubber = new StepScrubberHelper({ headLines: 6, tailLines: 6 });
    const shortText = Array.from({ length: 10 }, (_, i) => `Output line ${i + 1}`).join('\n');

    const result = scrubber.compressHeadTail(shortText);
    assert.strictEqual(result, shortText, '短文本必须保持 100% 字节不变');
  });

  it('Test 4.2: 长输出 (50 行) 精确保留头 6 行 + 尾 6 行，中间行折叠', () => {
    const scrubber = new StepScrubberHelper({ headLines: 6, tailLines: 6 });
    const longText = Array.from({ length: 50 }, (_, i) => `Log record ${i + 1}`).join('\n');

    const scrubbed = scrubber.compressHeadTail(longText);
    const lines = scrubbed.split('\n');
    assert.strictEqual(lines.length, 13, '前 6 行 + 1 行折叠提示 + 后 6 行 = 13 行');
    assert.strictEqual(lines[0], 'Log record 1');
    assert.strictEqual(lines[5], 'Log record 6');
    assert.strictEqual(lines[6], '... [Scrubbed: 38 lines collapsed for cache stability] ...');
    assert.strictEqual(lines[7], 'Log record 45');
    assert.strictEqual(lines[12], 'Log record 50');
  });

  it('Test 4.3: Step < 6 时保持绝对稳定 (isScrubbed === false)', () => {
    const scrubber = new StepScrubberHelper({ chunkStep: 6 });
    const history = [
      { turnIndex: 0, rawOutput: 'A'.repeat(500) + '\n'.repeat(30) + 'End 0' },
      { turnIndex: 1, rawOutput: 'B'.repeat(500) + '\n'.repeat(30) + 'End 1' }
    ];

    // 当 currentTurn 为 4 时，未达 freezeThreshold (0)，历史不衰减
    const result = scrubber.scrubSessionHistory(history, 4);
    assert.strictEqual(result[0].isScrubbed, false);
    assert.strictEqual(result[1].isScrubbed, false);
    assert.strictEqual(result[0].scrubbedOutput, undefined);
  });

  it('Test 4.4: Step = 6 边界触发阶梯衰减并冻结历史', () => {
    const scrubber = new StepScrubberHelper({ chunkStep: 6, headLines: 2, tailLines: 2 });
    const history = [
      { turnIndex: 2, rawOutput: Array.from({ length: 20 }, (_, i) => `L${i + 1}`).join('\n') },
      { turnIndex: 6, rawOutput: Array.from({ length: 20 }, (_, i) => `L${i + 1}`).join('\n') }
    ];

    // 当 currentTurn 达到 6 时，freezeThreshold 为 6。turnIndex=2 < 6 触发衰减；turnIndex=6 >= 6 保持原样！
    const result = scrubber.scrubSessionHistory(history, 6);
    assert.strictEqual(result[0].isScrubbed, true);
    assert.ok(result[0].scrubbedOutput.includes('lines collapsed'));
    assert.strictEqual(result[1].isScrubbed, false, '当前步长窗口内的最新输出严禁变动');
  });

  it('Test 4.5: 幂等性校验，避免二次嵌套折叠', () => {
    const scrubber = new StepScrubberHelper({ chunkStep: 6, headLines: 2, tailLines: 2 });
    const history = [
      { turnIndex: 1, rawOutput: Array.from({ length: 20 }, (_, i) => `L${i + 1}`).join('\n') }
    ];

    const pass1 = scrubber.scrubSessionHistory(history, 6);
    const pass2 = scrubber.scrubSessionHistory(pass1, 7);

    assert.strictEqual(pass2[0].scrubbedOutput, pass1[0].scrubbedOutput);
    assert.strictEqual((pass2[0].scrubbedOutput.match(/Scrubbed/g) || []).length, 1);
  });
});
