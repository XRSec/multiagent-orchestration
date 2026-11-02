import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { SdkPipelineAdapter } from '../../packages/agent-control-plane/SdkPipelineAdapter.mjs';

describe('SdkPipelineAdapter Unit Tests (Claude Agent SDK Lifecycle)', () => {
  const tempCacheDir = path.join(os.tmpdir(), `sdk-pipeline-test-${Date.now()}`);

  it('Pipeline Step 1: initStaticPrefix locks invariant prefix and hash', () => {
    const adapter = new SdkPipelineAdapter({ cacheDir: tempCacheDir });
    const { staticPrefix, staticHash } = adapter.initStaticPrefix([
      { id: 'standing_order', priority: 1, content: '# STANDING ORDER V1.0' },
      { id: 'base_soul', priority: 2, content: 'ROLE: Subsystem Control Helper' }
    ]);

    assert.ok(staticPrefix.includes('STANDING ORDER'));
    assert.strictEqual(typeof staticHash, 'string');
    assert.strictEqual(staticHash.length, 64);
  });

  it('Pipeline Step 2: handleUserPromptSubmit executes Phase 1 sequence cleanly', () => {
    const adapter = new SdkPipelineAdapter({ cacheDir: tempCacheDir });
    adapter.initStaticPrefix([
      { id: 'base', priority: 1, content: 'SYSTEM BASE PREFIX' }
    ]);

    const rawTools = [
      { name: 'read', description: 'Read files from disk', parameters: { type: 'object' } },
      { name: 'bash', description: 'Run bash shell commands', parameters: { type: 'object' } }
    ];

    const res = adapter.handleUserPromptSubmit('请问麻烦您帮我看一下代码，谢谢！', { rawTools });
    assert.ok(!res.effectivePrompt.includes('麻烦您'));
    assert.ok(!res.effectivePrompt.includes('请问'));
    assert.strictEqual(res.preflightResult.isBypass, false);
    assert.strictEqual(res.preflightResult.intentType, 'READ_EXPLORE');
    assert.ok(res.slimmedTools.tools.length >= 1);
    assert.ok(typeof res.slimmedTools.schemaHash === 'string');
    assert.ok(res.lockedPromptBundle.fullPrompt.includes('=== [EPHEMERAL_TAIL_CONTEXT] ==='));
  });

  it('Pipeline Step 3: handlePreToolUse intercepts skill file and returns capsule', () => {
    const adapter = new SdkPipelineAdapter({ cacheDir: tempCacheDir });
    const skillContent = `---
name: mock-skill
description: Comprehensive testing skill
---
# Mock Skill
1. Do this
2. Do that`;

    const intercept = adapter.handlePreToolUse({
      toolName: 'Read',
      args: { filePath: '/skills/mock-skill.md', content: skillContent }
    });

    assert.strictEqual(intercept.action, 'USE_CAPSULE');
    assert.ok(intercept.capsule.capsuleText.length <= 180);
  });

  it('Pipeline Step 4: handlePostToolUse compresses large outputs and triggers step=6 scrubbing', () => {
    const adapter = new SdkPipelineAdapter({ cacheDir: tempCacheDir, stepThreshold: 6 });
    
    // Simulate steps 1-5 with short output
    for (let i = 1; i <= 5; i++) {
      const stepRes = adapter.handlePostToolUse({
        toolName: 'read',
        rawOutput: `short output line ${i}`
      });
      assert.strictEqual(stepRes.step, i);
      assert.strictEqual(stepRes.disclosureInfo, null);
    }

    // Step 6 with large output (> 1200 chars)
    const giantOutput = 'Error line log trace: ' + 'x'.repeat(2000);
    const step6Res = adapter.handlePostToolUse({
      toolName: 'read',
      rawOutput: giantOutput
    });

    assert.strictEqual(step6Res.step, 6);
    assert.ok(step6Res.disclosureInfo !== null);
    assert.ok(step6Res.processedOutput.length <= 180);

    // Verify history has scrubbed prior entries at step=6 boundary
    assert.ok(adapter.state.history.some(h => h.isScrubbed));
  });

  it('Pipeline Step 5: getMcpMetaTools exposes invariant 2 meta tools', () => {
    const adapter = new SdkPipelineAdapter({ cacheDir: tempCacheDir });
    const metaTools = adapter.getMcpMetaTools();
    assert.strictEqual(metaTools.length, 2);
    assert.strictEqual(metaTools[0].name, 'mcp_gateway_list_tools');
    assert.strictEqual(metaTools[1].name, 'mcp_gateway_call_tool');
  });
});
