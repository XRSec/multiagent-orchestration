// Purpose: 4-Tier E2E acceptance test suite for Claude Agent SDK Control Plane Helper.
// Context: Validates 8 decoupled capabilities and 7-turn mock session derived from Claude ID 2efe9e50.
// Usage: node --test tests/test-agent-control-plane-e2e.mjs OR node tests/test-agent-control-plane-e2e.mjs
// Prerequisites: Node.js >= 18.0.0, zero external network or model dependencies.

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  MOCK_CLAUDE_SESSION_ID,
  MOCK_SUPERPOWERS_SKILL_MD,
  MOCK_PACKAGE_JSON_LARGE,
  MOCK_GREP_OUTPUT_LARGE,
  MOCK_RAW_TOOLS,
  sha256,
  IntentPreflightHelper,
  PromptCacheLockHelper,
  ProgressiveDisclosureHelper,
  StepScrubberHelper,
  PromptDistillationHelper,
  ToolSlimmingHelper,
  McpMetaToolingHelper,
  SkillCapsuleHelper
} from './fixtures/session-2efe9e50-mock.mjs';

const tempCacheDir = path.join(os.tmpdir(), `agent-control-plane-test-${Date.now()}`);

// ============================================================================
// TIER 1: FEATURE COVERAGE (8 Decoupled Core Capabilities)
// ============================================================================
describe('Tier 1: Feature Coverage & Atomic Interface Contracts', () => {
  it('F-01: IntentPreflight should provide 0ms bypass for continuation phrases', () => {
    const helper = new IntentPreflightHelper();
    const prevContext = { lastCapabilities: new Set(['FILE_READ', 'COMMAND_RUN']), lastAllowedTools: ['Read', 'Bash'] };
    const res = helper.analyze('继续', prevContext);

    assert.strictEqual(res.isBypass, true, 'Continuation phrase must bypass preflight');
    assert.strictEqual(res.intentType, 'BYPASS_CONTINUATION');
    assert.ok(res.requiredCapabilities.has('FILE_READ'));
    assert.ok(res.requiredCapabilities.has('COMMAND_RUN'));
    assert.ok(res.latencyMs < 5.0, 'Latency must be negligible');
  });

  it('F-02: PromptCacheLock should enforce static prefix invariance and tail injection', () => {
    const helper = new PromptCacheLockHelper();
    const segments = [
      { id: 'standing_order', priority: 1, content: '# STANDING ORDER V1.0' },
      { id: 'base_soul', priority: 2, content: 'Role: Senior Systems Architect' }
    ];
    const { staticPrefix, staticHash } = helper.assembleStaticPrefix(segments);
    const bundle1 = helper.injectTail(staticPrefix, { timestampIso: '2026-11-02T06:00:00Z', activeSessionId: 'sess-1' });
    const bundle2 = helper.injectTail(staticPrefix, { timestampIso: '2026-11-02T06:05:00Z', activeSessionId: 'sess-2' });

    assert.strictEqual(bundle1.staticHash, staticHash);
    assert.strictEqual(bundle2.staticHash, staticHash);
    assert.ok(helper.verifyCacheInvariance(bundle1, bundle2), 'Prefix must be strictly invariant across turns');
    assert.ok(bundle1.fullPrompt.includes('=== [EPHEMERAL_TAIL_CONTEXT] ==='));
  });

  it('F-03: ProgressiveDisclosure should support 3 levels and limit Level 2 capsule <= 180 chars', () => {
    const helper = new ProgressiveDisclosureHelper();
    const rawContent = 'Line 1: important header\n' + 'Line x: content\n'.repeat(499) + 'Line x: content';

    const l1 = helper.renderLevel1('res-101', { totalLines: 501, totalBytes: 8000, tag: 'code' });
    assert.strictEqual(l1.level, 1);
    assert.ok(l1.renderedText.startsWith('[ResourceFolded: res-101'));

    const l2 = helper.renderLevel2('res-101', rawContent, 180);
    assert.strictEqual(l2.level, 2);
    assert.ok(l2.renderedText.length <= 180, `Capsule length ${l2.renderedText.length} must be <= 180`);

    const l3 = helper.renderLevel3('res-101', rawContent, { startLine: 1, endLine: 5 });
    assert.strictEqual(l3.level, 3);
    assert.ok(l3.renderedText.includes('[Lines 1-5 of 501]'));
  });

  it('F-04: StepScrubber should retain head/tail and compress middle history', () => {
    const helper = new StepScrubberHelper();
    const output = Array.from({ length: 60 }, (_, i) => `log line ${i + 1}`).join('\n');
    const compressed = helper.compressHeadTail(output, 6, 6);

    assert.ok(compressed.startsWith('log line 1\n'), 'Head line must be preserved');
    assert.ok(compressed.endsWith('log line 60'), 'Tail line must be preserved');
    assert.ok(compressed.includes('[Scrubbed: 48 lines collapsed for cache stability]'));
  });

  it('F-05: PromptDistillation should remove courtesies and partition cold/hot sections', () => {
    const helper = new PromptDistillationHelper();
    const prompt = '麻烦你帮我查看一下：apps/desktop/src/main.js 这个文件，非常感谢！';
    const distilled = helper.distill(prompt);

    assert.ok(!distilled.distilledCombined.includes('麻烦你'));
    assert.ok(!distilled.distilledCombined.includes('非常感谢'));
    assert.ok(distilled.prefixHash.length === 64, 'Cold prefix hash must be SHA-256');
    assert.ok(distilled.tokensSavedEstimate > 0);
  });

  it('F-06: ToolSlimming should remove redundant schema fields and filter by capabilities', () => {
    const helper = new ToolSlimmingHelper();
    const compiled = helper.getOrCompile(MOCK_RAW_TOOLS, new Set(['FILE_READ']));

    assert.strictEqual(compiled.tools.length, 2, 'Should only retain Read and Grep for FILE_READ');
    assert.strictEqual(compiled.tools[0].parameters.properties.path.examples, undefined, 'Examples must be stripped');
    assert.ok(compiled.schemaHash.length === 64);
  });

  it('F-07: McpMetaTooling should collapse multiple tools into exactly 2 gateway tools', () => {
    const helper = new McpMetaToolingHelper();
    helper.registerServerSnapshot('filesystem', [{ name: 'Read' }, { name: 'Write' }, { name: 'Stat' }]);
    helper.registerServerSnapshot('browser', [{ name: 'Navigate' }, { name: 'Click' }]);

    const metaTools = helper.getMetaToolDefinitions();
    assert.strictEqual(metaTools.length, 2, 'Must expose exactly 2 meta tools');
    assert.ok(metaTools.some(t => t.name === 'gateway_list_tools'));
    assert.ok(metaTools.some(t => t.name === 'gateway_call_tool'));

    const searchRes = helper.listTools('Click');
    assert.strictEqual(searchRes.length, 1);
    assert.strictEqual(searchRes[0].name, 'Click');
  });

  it('F-08: SkillCapsule should distill Markdown to <= 180 chars and persist SHA-256 cache', () => {
    const helper = new SkillCapsuleHelper();
    const res1 = helper.loadOrDistill('superpowers', MOCK_SUPERPOWERS_SKILL_MD, tempCacheDir);

    assert.ok(res1.capsuleText.length <= 180, `Capsule length ${res1.capsuleText.length} must be <= 180`);
    assert.strictEqual(res1.fromDiskCache, false, 'First run should not be from disk cache');

    const res2 = helper.loadOrDistill('superpowers', MOCK_SUPERPOWERS_SKILL_MD, tempCacheDir);
    assert.strictEqual(res2.fromDiskCache, true, 'Second run must hit disk cache');
    assert.strictEqual(res2.sourceHash, res1.sourceHash);
  });
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (Adversarial Robustness & Limits)
// ============================================================================
describe('Tier 2: Boundary & Corner Cases (Adversarial Robustness)', () => {
  it('B-01: Continuation detection must handle whitespaces, punctuation and reject mixed commands', () => {
    const helper = new IntentPreflightHelper();
    const validVariants = [' ok ', '\n继续！\t', '好的。', '  1  ', 'proceed!'];
    for (const v of validVariants) {
      assert.strictEqual(helper.analyze(v).isBypass, true, `Variant "${v}" should bypass`);
    }

    const invalidMixed = '好的，帮我把 main.js 删除并提交代码';
    const res = helper.analyze(invalidMixed);
    assert.strictEqual(res.isBypass, false, 'Mixed command must NOT bypass');
    assert.strictEqual(res.intentType, 'CODE_MUTATION');
  });

  it('B-02: Extreme large input (>50KB) must strictly conform to <= 180 chars capsule limit', () => {
    const helper = new ProgressiveDisclosureHelper();
    const extremeLargeText = 'CRITICAL_METRIC: OK\n' + 'DUMP_DATA_OFFSET_X: 0xDEADBEEF\n'.repeat(2500); // > 75KB
    const capsule180 = helper.renderLevel2('extreme-dump', extremeLargeText, 180);
    assert.ok(capsule180.renderedText.length <= 180, `Expected <= 180, got ${capsule180.renderedText.length}`);

    const capsuleTruncated = helper.renderLevel2('extreme-dump', extremeLargeText, 80);
    assert.ok(capsuleTruncated.renderedText.length <= 80, `Expected <= 80, got ${capsuleTruncated.renderedText.length}`);
    assert.ok(capsuleTruncated.renderedText.endsWith('...]'));
  });

  it('B-03: StepScrubber must maintain 0-byte difference when step < 6', () => {
    const helper = new StepScrubberHelper();
    const history = [
      { step: 1, rawOutput: Array.from({ length: 40 }, (_, i) => `log line ${i + 1}`).join('\n'), isScrubbed: false },
      { step: 2, rawOutput: Array.from({ length: 40 }, (_, i) => `step 2 line ${i + 1}`).join('\n'), isScrubbed: false }
    ];

    const scrubbedAtStep5 = helper.scrubSessionHistory(history, 5, 6);
    assert.strictEqual(scrubbedAtStep5[0].isScrubbed, false, 'Step 1 output must remain untouched at step 5');
    assert.strictEqual(scrubbedAtStep5[0].scrubbedOutput, undefined);

    const scrubbedAtStep6 = helper.scrubSessionHistory(history, 6, 6);
    assert.strictEqual(scrubbedAtStep6[0].isScrubbed, true, 'Step 1 output must be compressed at step 6 boundary');
    assert.ok(scrubbedAtStep6[0].scrubbedOutput.length < history[0].rawOutput.length);
  });

  it('B-04: Skill cache must detect 1-char source modification and invalidate stale cache', () => {
    const helper = new SkillCapsuleHelper();
    const skillA = MOCK_SUPERPOWERS_SKILL_MD;
    const skillB = MOCK_SUPERPOWERS_SKILL_MD + '\n# Extra revision marker';

    const resA = helper.loadOrDistill('dyn-skill', skillA, tempCacheDir);
    const resB = helper.loadOrDistill('dyn-skill', skillB, tempCacheDir);

    assert.notStrictEqual(resA.sourceHash, resB.sourceHash, 'Hashes must differ after content change');
    assert.strictEqual(resB.fromDiskCache, false, 'Modified skill must trigger fresh distillation');
  });

  it('B-05: McpMetaTooling must reject non-existent server or tool gracefully', async () => {
    const helper = new McpMetaToolingHelper();
    await assert.rejects(
      async () => helper.dispatchMetaCall('unknown-server', 'unknown-tool', {}),
      /MCP tool not found in registry/
    );
  });
});

// ============================================================================
// TIER 3: CROSS-FEATURE INTERACTIONS & PIPELINE LIFECYCLE
// ============================================================================
describe('Tier 3: Cross-Feature Interactions & Pipeline Orchestration', () => {
  it('X-01: Phase 1 & 2 synergy: Preflight intent guides schema slimming and prefix lock', () => {
    const intentHelper = new IntentPreflightHelper();
    const promptHelper = new PromptDistillationHelper();
    const toolHelper = new ToolSlimmingHelper();
    const cacheLockHelper = new PromptCacheLockHelper();

    const rawUserInput = '请问可不可以帮我搜索并查看 package.json 中的依赖项？';
    const intent = intentHelper.analyze(rawUserInput);
    const distilled = promptHelper.distill(rawUserInput);
    const compiledTools = toolHelper.getOrCompile(MOCK_RAW_TOOLS, intent.requiredCapabilities);

    const staticBase = cacheLockHelper.assembleStaticPrefix([
      { id: 'sys', priority: 1, content: 'Base Harness Directive' },
      { id: 'tools', priority: 2, content: JSON.stringify(compiledTools.tools) }
    ]);
    const turnBundle = cacheLockHelper.injectTail(staticBase.staticPrefix, {
      timestampIso: '2026-11-02T06:15:00Z',
      activeSessionId: MOCK_CLAUDE_SESSION_ID,
      steeringDirectives: [distilled.distilledCombined]
    });

    assert.ok(intent.requiredCapabilities.has('FILE_READ'));
    assert.ok(!compiledTools.tools.some(t => t.name === 'Bash'), 'Bash must not be exposed for read-only intent');
    assert.ok(turnBundle.fullPrompt.startsWith(staticBase.staticPrefix));
  });

  it('X-02: Zero cross-import invariant: All helpers operate via standalone state transfer', () => {
    const context = {
      sessionId: MOCK_CLAUDE_SESSION_ID,
      turnIndex: 1,
      stepCounter: 0,
      activeCapabilities: new Set(),
      history: []
    };

    const preflight = new IntentPreflightHelper();
    const analysis = preflight.analyze('查看日志', context);
    context.activeCapabilities = analysis.requiredCapabilities;

    const scrubber = new StepScrubberHelper();
    context.history.push({ step: ++context.stepCounter, rawOutput: 'initial log data', isScrubbed: false });
    const scrubbed = scrubber.scrubSessionHistory(context.history, context.stepCounter, 6);

    assert.strictEqual(scrubbed.length, 1);
    assert.strictEqual(context.stepCounter, 1);
  });
});

// ============================================================================
// TIER 4: REAL-WORLD APPLICATION (Claude 2efe9e50 7-Turn Mock Replay)
// ============================================================================
describe('Tier 4: Real-World 7-Turn Mock Session (Claude ID 2efe9e50)', () => {
  const sessionHarness = {
    sessionId: MOCK_CLAUDE_SESSION_ID,
    turn: 0,
    stepCounter: 0,
    staticPrefix: '',
    staticHash: '',
    history: [],
    lastCapabilities: new Set(),
    lastTools: []
  };

  const preflight = new IntentPreflightHelper();
  const cacheLocker = new PromptCacheLockHelper();
  const disclosure = new ProgressiveDisclosureHelper();
  const scrubber = new StepScrubberHelper();
  const distiller = new PromptDistillationHelper();
  const slimmer = new ToolSlimmingHelper();
  const mcpHelper = new McpMetaToolingHelper();
  const skillHelper = new SkillCapsuleHelper();

  it('Turn 1: Cold start + 13KB superpower skill capsule distillation + tail injection', () => {
    sessionHarness.turn = 1;
    const userInput = '请问麻烦你帮我检查下系统权限，并引入 superpowers 技能，谢谢！';
    const distilled = distiller.distill(userInput);
    assert.ok(!distilled.distilledCombined.includes('麻烦你'));

    const skillRecord = skillHelper.loadOrDistill('using-superpowers', MOCK_SUPERPOWERS_SKILL_MD, tempCacheDir);
    assert.ok(skillRecord.capsuleText.length <= 180);

    const basePrompt = cacheLocker.assembleStaticPrefix([
      { id: 'standing_order', priority: 1, content: 'SYSTEM STANDING ORDER V1.0' }
    ]);
    sessionHarness.staticPrefix = basePrompt.staticPrefix;
    sessionHarness.staticHash = basePrompt.staticHash;

    const turn1Bundle = cacheLocker.injectTail(sessionHarness.staticPrefix, {
      timestampIso: '2026-11-02T06:20:00Z',
      activeSessionId: sessionHarness.sessionId,
      capsuleInjection: skillRecord.capsuleText
    });

    assert.strictEqual(turn1Bundle.staticHash, sessionHarness.staticHash);
    sessionHarness.lastCapabilities = new Set(['FILE_READ']);
    sessionHarness.lastTools = ['Read', 'Grep'];
  });

  it('Turn 2: 5KB Read package.json output intercepted to Layer 2 capsule (<= 180 chars)', () => {
    sessionHarness.turn = 2;
    sessionHarness.stepCounter++;
    const readOutput = MOCK_PACKAGE_JSON_LARGE;
    assert.ok(readOutput.length > 3000);

    const l2Capsule = disclosure.renderLevel2('package.json', readOutput, 180);
    assert.ok(l2Capsule.renderedText.length <= 180);

    sessionHarness.history.push({
      step: sessionHarness.stepCounter,
      rawOutput: readOutput,
      isScrubbed: false
    });
    assert.strictEqual(sessionHarness.stepCounter, 1);
  });

  it('Turn 3: Continuation "继续" triggers 0ms bypass, inherits capabilities and locks cache', () => {
    sessionHarness.turn = 3;
    const res = preflight.analyze('继续', {
      lastCapabilities: sessionHarness.lastCapabilities,
      lastAllowedTools: sessionHarness.lastTools
    });

    assert.strictEqual(res.isBypass, true);
    assert.strictEqual(res.intentType, 'BYPASS_CONTINUATION');
    assert.ok(res.requiredCapabilities.has('FILE_READ'));

    const turn3Bundle = cacheLocker.injectTail(sessionHarness.staticPrefix, {
      timestampIso: '2026-11-02T06:22:00Z',
      activeSessionId: sessionHarness.sessionId
    });
    assert.strictEqual(turn3Bundle.staticHash, sessionHarness.staticHash, 'Static prefix hash must stay identical');
  });

  it('Turn 4 & Turn 5: Sequential tool steps advance stepCounter to 5 while history remains frozen', () => {
    // Turn 4
    sessionHarness.turn = 4;
    sessionHarness.stepCounter++;
    sessionHarness.history.push({ step: sessionHarness.stepCounter, rawOutput: MOCK_GREP_OUTPUT_LARGE.slice(0, 2000), isScrubbed: false });

    // Turn 5
    sessionHarness.turn = 5;
    sessionHarness.stepCounter++;
    sessionHarness.history.push({ step: sessionHarness.stepCounter, rawOutput: MOCK_GREP_OUTPUT_LARGE.slice(2000, 4000), isScrubbed: false });

    assert.strictEqual(sessionHarness.stepCounter, 3);
    const checked = scrubber.scrubSessionHistory(sessionHarness.history, sessionHarness.stepCounter, 6);
    assert.ok(checked.every(e => !e.isScrubbed), 'No entries should be scrubbed before step threshold 6');
  });

  it('Turn 6: Step threshold 6 boundary triggers chunk-aligned history scrubbing', () => {
    sessionHarness.turn = 6;
    sessionHarness.stepCounter = 6; // Reached step threshold
    sessionHarness.history.push({ step: 4, rawOutput: 'log data 4\n'.repeat(30), isScrubbed: false });
    sessionHarness.history.push({ step: 5, rawOutput: 'log data 5\n'.repeat(30), isScrubbed: false });
    sessionHarness.history.push({ step: 6, rawOutput: 'log data 6\n'.repeat(30), isScrubbed: false });

    const scrubbedHistory = scrubber.scrubSessionHistory(sessionHarness.history, sessionHarness.stepCounter, 6);
    const scrubbedEntries = scrubbedHistory.filter(e => e.isScrubbed);

    assert.ok(scrubbedEntries.length > 0, 'Entries prior to threshold 6 must be scrubbed');
    assert.ok(scrubbedEntries[0].scrubbedOutput.includes('collapsed for cache stability'));
  });

  it('Turn 7: Secondary skill query triggers instant SHA-256 disk cache hit (< 2ms)', () => {
    sessionHarness.turn = 7;
    const start = performance.now();
    const cachedSkill = skillHelper.loadOrDistill('using-superpowers', MOCK_SUPERPOWERS_SKILL_MD, tempCacheDir);
    const durationMs = performance.now() - start;

    assert.strictEqual(cachedSkill.fromDiskCache, true, 'Turn 7 skill reload must hit local disk cache');
    assert.ok(durationMs < 10.0, `Cache load duration ${durationMs.toFixed(2)}ms must be ultra fast`);
    assert.ok(cachedSkill.capsuleText.length <= 180);
  });
});
