// Purpose: Empirical adversarial verification & stress test suite for Claude Agent SDK Control Plane Helpers.
// Context: Evaluates Helper 1 (IntentPreflight), Helper 2 (PromptCacheLock), Helper 5 (PromptDistillation),
//          Helper 6 (ToolSlimming), and Helper 7 (McpMetaTooling) under extreme boundaries and malicious inputs.
// Usage: node --test tests/test-m1-helpers-adversarial.mjs OR node tests/test-m1-helpers-adversarial.mjs
// Constraints: Node.js 18+ native ESM, zero external dependencies, file <= 600 lines.

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  IntentPreflightHelper,
  PromptCacheLockHelper,
  PromptDistillationHelper,
  ToolSlimmingHelper,
  McpMetaToolingHelper,
  INTENT_TYPES,
  CAPABILITY_TYPES,
  DEFAULT_CAPABILITIES,
  META_TOOL_NAMES,
  TAIL_INJECTION_SEPARATOR
} from '../packages/agent-control-plane/index.mjs';

// ============================================================================
// VECTOR 1: HELPER 1 (IntentPreflightHelper) ADVERSARIAL STRESS
// ============================================================================
describe('Vector 1: IntentPreflightHelper (Adversarial & Boundary Stress)', () => {
  const helper = new IntentPreflightHelper();

  it('1.1 Continuation punctuation, whitespace, and formatting variants correctly bypass', () => {
    const validVariants = [
      '  \n ok \t ',
      '\r\n\t继续\t\n',
      '【好的】',
      '“ok”',
      '（确认）',
      '《收到》',
      '……proceed……',
      '---yes---',
      'ok!!!',
      '   好   ',
      '  y  ',
      '1',
      '没问题。'
    ];

    for (const v of validVariants) {
      assert.strictEqual(
        helper.isContinuationPhrase(v),
        true,
        `Variant "${v}" should be recognized as continuation phrase`
      );
      const res = helper.analyze(v);
      assert.strictEqual(res.isBypass, true, `Variant "${v}" must trigger bypass branch`);
      assert.strictEqual(res.intentType, INTENT_TYPES.BYPASS_CONTINUATION);
      assert.ok(res.latencyMs < 2.0, `Bypass latency for "${v}" must be < 2.0ms`);
    }
  });

  it('1.2 Malicious compound commands MUST NOT bypass and must restrict permissions', () => {
    const maliciousCases = [
      { input: '好的，rm -rf /', expectedBypass: false, expectNotCap: CAPABILITY_TYPES.COMMAND_RUN },
      { input: '行，请删除所有文件', expectedBypass: false, expectedIntent: INTENT_TYPES.CODE_MUTATION },
      { input: '继续，修改配置参数', expectedBypass: false, expectedIntent: INTENT_TYPES.CODE_MUTATION },
      { input: 'ok, please run npm test', expectedBypass: false, expectedIntent: INTENT_TYPES.TERMINAL_EXEC },
      { input: '收到，启动后端服务', expectedBypass: false, expectedIntent: INTENT_TYPES.TERMINAL_EXEC },
      { input: 'proceed with caution and drop database', expectedBypass: false },
      { input: '好，编写新的单元测试', expectedBypass: false, expectedIntent: INTENT_TYPES.CODE_MUTATION }
    ];

    for (const tc of maliciousCases) {
      assert.strictEqual(
        helper.isContinuationPhrase(tc.input),
        false,
        `Malicious compound "${tc.input}" must NOT be a continuation phrase`
      );
      const res = helper.analyze(tc.input);
      assert.strictEqual(res.isBypass, false, `Malicious compound "${tc.input}" must NOT bypass`);
      if (tc.expectedIntent) {
        assert.strictEqual(res.intentType, tc.expectedIntent, `Intent mismatch for "${tc.input}"`);
      }
      if (tc.expectNotCap) {
        assert.ok(!res.requiredCapabilities.has(tc.expectNotCap), `Capability ${tc.expectNotCap} must NOT be granted`);
      }
    }
  });

  it('1.3 Cold start and null/undefined/empty context robustness', () => {
    const contexts = [
      null,
      undefined,
      {},
      { lastCapabilities: new Set(), lastAllowedTools: [] },
      { lastCapabilities: null, lastAllowedTools: null }
    ];

    for (const ctx of contexts) {
      const res = helper.analyze('ok', ctx);
      assert.strictEqual(res.isBypass, true);
      assert.deepStrictEqual(res.requiredCapabilities, DEFAULT_CAPABILITIES);
      assert.ok(res.suggestedTools.includes('view_file'));
      assert.ok(!res.suggestedTools.includes('write_to_file'));
      assert.ok(!res.suggestedTools.includes('run_command'));
    }
  });

  it('1.4 Heterogeneous extreme inputs zero-crash defense', () => {
    const extremeInputs = [
      null,
      undefined,
      123456,
      0,
      -1,
      NaN,
      {},
      [],
      Symbol('adversarial'),
      true,
      false,
      '   \t\n\r   ',
      '!@#$%^&*()_+{}|:"<>?',
      'A'.repeat(50000)
    ];

    for (const inp of extremeInputs) {
      assert.doesNotThrow(() => {
        const isCont = helper.isContinuationPhrase(inp);
        const res = helper.analyze(inp);
        assert.strictEqual(isCont, false);
        assert.strictEqual(res.isBypass, false);
        assert.ok(res.requiredCapabilities.has(CAPABILITY_TYPES.FILE_READ));
      }, `Input ${String(inp)} should not throw`);
    }
  });
});

// ============================================================================
// VECTOR 2: HELPER 2 (PromptCacheLockHelper) ADVERSARIAL STRESS
// ============================================================================
describe('Vector 2: PromptCacheLockHelper (Injection & Invariance Stress)', () => {
  const helper = new PromptCacheLockHelper();

  it('2.1 Static purity validator catches all dynamic injection vectors', () => {
    const dirtyCases = [
      { text: 'System time: 2026-11-02T06:27:56Z', violation: 'ISO timestamp detected' },
      { text: 'Request uuid: a52b2ec7-8e62-4d78-a683-b22fee4c6130', violation: 'UUID detected' },
      { text: 'Seed: ${Date.now()}', violation: 'Dynamic JS evaluation template detected' },
      { text: 'Seed: ${performance.now()}', violation: 'Dynamic JS evaluation template detected' },
      { text: 'Seed: ${Math.random()}', violation: 'Dynamic JS evaluation template detected' }
    ];

    for (const tc of dirtyCases) {
      const check = helper.validateStaticPurity(tc.text);
      assert.strictEqual(check.isPure, false, `Should detect dirty static content: ${tc.text}`);
      assert.ok(check.violations.includes(tc.violation), `Missing expected violation: ${tc.violation}`);
    }

    assert.strictEqual(helper.validateStaticPurity(12345).isPure, false);
    assert.strictEqual(helper.validateStaticPurity(null).isPure, false);

    const pureText = '# STANDING ORDER V1.0\nRole: Senior Systems Architect\nFormat: 100% en-US.';
    const pureCheck = helper.validateStaticPurity(pureText);
    assert.strictEqual(pureCheck.isPure, true);
    assert.strictEqual(pureCheck.violations.length, 0);
  });

  it('2.2 Deterministic prefix assembly and base hash lock tamper resistance', () => {
    const segments = [
      { id: 'b_policy', priority: 50, content: 'Policy B content' },
      { id: 'a_policy', priority: 10, content: 'Policy A content' },
      { id: 'z_policy', priority: 10, content: 'Policy Z content' },
      { id: 'c_empty', priority: 5, content: '   \n  ' },
      { id: 'd_invalid', priority: 5, content: null }
    ];

    const { staticPrefix, staticHash } = helper.assembleStaticPrefix(segments);
    assert.ok(staticPrefix.startsWith('Policy A content\n\nPolicy Z content\n\nPolicy B content'));
    assert.strictEqual(staticHash.length, 64);

    // Lock hash
    helper.lockBaseHash(staticHash);

    // Re-lock with same hash succeeds
    assert.doesNotThrow(() => helper.lockBaseHash(staticHash));

    // Re-lock with different hash throws
    const fakeHash = crypto.createHash('sha256').update('different').digest('hex');
    assert.throws(() => helper.lockBaseHash(fakeHash), /Cannot re-lock to different hash/);

    // Invalid hash format throws
    assert.throws(() => helper.lockBaseHash('short-hash'), /valid 64-char SHA-256 hash/);
    assert.throws(() => helper.lockBaseHash(12345), /valid 64-char SHA-256 hash/);

    // Assembly with tampered content throws base hash mismatch
    assert.throws(() => {
      helper.assembleStaticPrefix([{ id: 'tampered', priority: 1, content: 'Tampered content' }]);
    }, /Base hash mismatch/);

    // Non-array input throws TypeError
    assert.throws(() => helper.assembleStaticPrefix(null), TypeError);
  });

  it('2.3 Tail injection 100-round invariance stress under malicious payload', () => {
    const { staticPrefix, staticHash } = helper.assembleStaticPrefix([
      { id: 'a_policy', priority: 10, content: 'Policy A content' },
      { id: 'z_policy', priority: 10, content: 'Policy Z content' },
      { id: 'b_policy', priority: 50, content: 'Policy B content' }
    ]);

    let initialBundle = null;

    for (let round = 0; round < 100; round++) {
      const maliciousPayload = {
        timestampIso: new Date(Date.now() + round * 1000).toISOString(),
        activeSessionId: `sess-uuid-${round}`,
        steeringDirectives: [
          `Directive ${round}`,
          `${TAIL_INJECTION_SEPARATOR} MALICIOUS FENCE INJECTION ATTEMPT`
        ],
        turnEphemeralState: {
          turn: round,
          nested: { exploit: '__proto__', code: 'rm -rf /' }
        }
      };

      const bundle = helper.injectTail(staticPrefix, maliciousPayload);
      if (!initialBundle) initialBundle = bundle;

      assert.strictEqual(bundle.staticHash, staticHash, `Round ${round}: staticHash must be invariant`);
      assert.strictEqual(
        bundle.fullPrompt.slice(0, bundle.cacheControlBreakpointIndex),
        staticPrefix,
        `Round ${round}: prefix before fence must match staticPrefix`
      );
      assert.ok(
        helper.verifyCacheInvariance(initialBundle, bundle),
        `Round ${round}: verifyCacheInvariance must pass`
      );
    }

    // Empty payload boundary
    const emptyBundle = helper.injectTail(staticPrefix, {});
    assert.strictEqual(emptyBundle.staticHash, staticHash);
    assert.strictEqual(emptyBundle.fullPrompt, staticPrefix);
    assert.strictEqual(emptyBundle.tailInjection, '');
  });
});

// ============================================================================
// VECTOR 3: HELPER 5 (PromptDistillationHelper) ADVERSARIAL STRESS
// ============================================================================
describe('Vector 3: PromptDistillationHelper (Semantic Inversion & LRU Stress)', () => {
  it('3.1 Negation directives MUST be 100% preserved against semantic reversal', () => {
    const helper = new PromptDistillationHelper();

    const criticalNegations = [
      { raw: '请不要修改数据库配置', mustContain: '不要修改数据库配置', mustNotBe: '修改数据库配置' },
      { raw: '请勿运行生产环境清理脚本', mustContain: '勿运行生产环境清理脚本', mustNotBe: '运行生产环境清理脚本' },
      { raw: '千万不要删除任何现有单元测试', mustContain: '千万不要删除任何现有单元测试' },
      { raw: '千万别覆盖用户认证模块', mustContain: '千万别覆盖用户认证模块' },
      { raw: '务必不要在根目录执行 rm 命令', mustContain: '务必不要在根目录执行 rm 命令' },
      { raw: 'Please do not truncate production logs', mustContain: 'do not truncate production logs' },
      { raw: "Please don't overwrite schema definitions", mustContain: "don't overwrite schema definitions" },
      {
        raw: '您好，麻烦你帮我检查一下系统架构，但是请千万不要修改任何文件，非常感谢！',
        mustContain: '千万不要修改任何文件',
        mustNotContain: '非常感谢'
      }
    ];

    for (const tc of criticalNegations) {
      const stripped = helper.stripCourtesy(tc.raw);
      assert.ok(
        stripped.includes(tc.mustContain),
        `Preserved negation failed for "${tc.raw}": got "${stripped}"`
      );
      if (tc.mustNotContain) {
        assert.ok(
          !stripped.includes(tc.mustNotContain),
          `Courtesy phrase "${tc.mustNotContain}" should have been stripped`
        );
      }
    }
  });

  it('3.2 Deeply nested stacked courtesies and giant string stress', () => {
    const helper = new PromptDistillationHelper();

    const stacked = '您好，麻烦你，能否帮我请问一下，可不可以辛苦了，非常感谢，谢谢你！';
    const stripped = helper.stripCourtesy(stacked);
    assert.strictEqual(stripped, '', 'Pure stacked courtesy must reduce to empty string');

    const englishStacked = 'Hello! Hi! Could you kindly please would you please thank you very much thanks a lot!';
    const englishStripped = helper.stripCourtesy(englishStacked);
    assert.strictEqual(englishStripped, '', 'Pure English courtesy must reduce to empty string');

    // 100,000 character stress
    const giant = '请问一下 ' + '必须遵守规范。\n'.repeat(5000) + ' 谢谢！';
    const distilled = helper.distill(giant);
    assert.ok(distilled.coldPrefix.length > 0);
    assert.ok(distilled.tokensSavedEstimate > 0);
    assert.strictEqual(typeof distilled.prefixHash, 'string');
    assert.strictEqual(distilled.prefixHash.length, 64);
  });

  it('3.3 LRU cache bounded capacity, eviction order, and deterministic stats', () => {
    const helper = new PromptDistillationHelper({ maxCacheSize: 4 });

    const p1 = '必须遵守规范 1';
    const p2 = '要求满足原则 2';
    const p3 = '必须保持格式 3';
    const p4 = '严禁违反约束 4';
    const p5 = '规则必须执行 5';

    helper.distill(p1);
    helper.distill(p2);
    helper.distill(p3);
    helper.distill(p4);

    let stats = helper.getCacheStats();
    assert.strictEqual(stats.size, 4);
    assert.strictEqual(stats.misses, 4);
    assert.strictEqual(stats.hits, 0);

    // Evicts p1
    helper.distill(p5);
    stats = helper.getCacheStats();
    assert.strictEqual(stats.size, 4, 'Cache size must remain capped at maxCacheSize');
    assert.strictEqual(stats.misses, 5);

    // p5 was just accessed -> hit
    const res5 = helper.distill(p5);
    assert.strictEqual(res5.cacheHit, true);
    assert.strictEqual(helper.getCacheStats().hits, 1);

    // p1 was evicted -> miss
    const res1 = helper.distill(p1);
    assert.strictEqual(res1.cacheHit, false);
    assert.strictEqual(helper.getCacheStats().misses, 6);

    // clearCache reset
    helper.clearCache();
    const cleared = helper.getCacheStats();
    assert.strictEqual(cleared.size, 0);
    assert.strictEqual(cleared.hits, 0);
    assert.strictEqual(cleared.misses, 0);
  });
});

// ============================================================================
// VECTOR 4: HELPER 6 (ToolSlimmingHelper) ADVERSARIAL STRESS
// ============================================================================
describe('Vector 4: ToolSlimmingHelper (Malformed Schema & Cache Stress)', () => {
  const helper = new ToolSlimmingHelper({ maxDescriptionChars: 80 });

  it('4.1 Malformed, empty, and non-object schemas gracefully handled without crash', () => {
    assert.strictEqual(helper.slimSchema(null), null);
    assert.strictEqual(helper.slimSchema(undefined), undefined);

    const emptyTool = { name: 'empty_tool' };
    assert.deepStrictEqual(helper.slimSchema(emptyTool), { name: 'empty_tool' });

    const noPropTool = { name: 'no_prop_tool', parameters: { type: 'object' } };
    assert.deepStrictEqual(helper.slimSchema(noPropTool), {
      name: 'no_prop_tool',
      parameters: { type: 'object' }
    });

    const inputSchemaTool = {
      name: 'input_schema_tool',
      inputSchema: { type: 'object', properties: {} }
    };
    const slimmedInput = helper.slimSchema(inputSchemaTool);
    assert.strictEqual(slimmedInput.name, 'input_schema_tool');
    assert.ok(slimmedInput.inputSchema);
  });

  it('4.1b [ADV-M1-01] Circular reference protection in schema structures', () => {
    const cyclicTool = { name: 'cyclic_tool' };
    cyclicTool.parameters = { type: 'object', properties: { self: cyclicTool } };

    // Empirical check: Verify whether circular reference is safely handled or causes stack overflow
    let threwOverflow = false;
    try {
      helper.slimSchema(cyclicTool);
    } catch (err) {
      if (err instanceof RangeError && err.message.includes('Maximum call stack size exceeded')) {
        threwOverflow = true;
      }
    }
    assert.strictEqual(
      threwOverflow,
      false,
      'ADV-M1-01 VULNERABILITY DETECTED: Helper 6 slimSchema enters infinite recursion on circular reference'
    );
  });

  it('4.2 Comprehensive metadata bloat stripping and description clamping', () => {
    const bloatedTool = {
      name: 'complex_bloated_tool',
      title: 'Title Bloat',
      $schema: 'http://json-schema.org/draft-07/schema#',
      description: 'First line of lengthy description\nSecond line with spaces    and more details that easily cross eighty characters total limit.',
      parameters: {
        title: 'Params Bloat',
        default: {},
        type: 'object',
        required: ['code'],
        properties: {
          code: {
            type: 'string',
            title: 'Code Field',
            description: 'Source code string to be executed or analyzed within the secure sandbox container.',
            examples: ['console.log(1)', 'const x = 2;'],
            default: 'console.log(1)',
            markdownDescription: '`code` is mandatory'
          },
          subItems: {
            type: 'array',
            items: {
              type: 'object',
              title: 'Sub Item Bloat',
              examples: [{ a: 1 }],
              properties: {
                id: { type: 'number', default: 10 }
              }
            }
          }
        }
      }
    };

    const slimmed = helper.slimSchema(bloatedTool);

    assert.strictEqual(slimmed.title, undefined);
    assert.strictEqual(slimmed.$schema, undefined);
    assert.ok(slimmed.description.length <= 80);
    assert.ok(slimmed.description.endsWith('...'));
    assert.ok(!slimmed.description.includes('\n'));

    const codeProp = slimmed.parameters.properties.code;
    assert.strictEqual(codeProp.title, undefined);
    assert.strictEqual(codeProp.examples, undefined);
    assert.strictEqual(codeProp.default, undefined);
    assert.strictEqual(codeProp.markdownDescription, undefined);
    assert.ok(codeProp.description.length <= 80);

    const subItem = slimmed.parameters.properties.subItems.items;
    assert.strictEqual(subItem.title, undefined);
    assert.strictEqual(subItem.examples, undefined);
    assert.strictEqual(subItem.properties.id.default, undefined);
  });

  it('4.3 Capability filtering with aliases, case-insensitivity, and fallback', () => {
    const tools = [
      { name: 'view_file' },
      { name: 'READ' },
      { name: 'grep' },
      { name: 'write_to_file' },
      { name: 'EDIT' },
      { name: 'run_command' },
      { name: 'BASH' },
      { name: 'unrelated_agent_tool' }
    ];

    assert.deepStrictEqual(helper.filterByCapabilities(null, new Set()), []);
    assert.deepStrictEqual(helper.filterByCapabilities(tools, null), tools);
    assert.deepStrictEqual(helper.filterByCapabilities(tools, new Set()), tools);

    const readTools = helper.filterByCapabilities(tools, new Set([CAPABILITY_TYPES.FILE_READ]));
    assert.strictEqual(readTools.length, 3);
    assert.deepStrictEqual(readTools.map(t => t.name), ['view_file', 'READ', 'grep']);

    const writeTools = helper.filterByCapabilities(tools, new Set([CAPABILITY_TYPES.FILE_WRITE]));
    assert.strictEqual(writeTools.length, 2);
    assert.deepStrictEqual(writeTools.map(t => t.name), ['write_to_file', 'EDIT']);

    const execTools = helper.filterByCapabilities(tools, new Set([CAPABILITY_TYPES.COMMAND_RUN]));
    assert.strictEqual(execTools.length, 2);
    assert.deepStrictEqual(execTools.map(t => t.name), ['run_command', 'BASH']);
  });

  it('4.4 Pre-compiled schema hash caching and reference identity', () => {
    const tools = [
      { name: 'read', description: 'Read file contents' },
      { name: 'bash', description: 'Run shell command' }
    ];

    const caps = new Set([CAPABILITY_TYPES.FILE_READ]);
    const res1 = helper.getOrCompile(tools, caps);
    const res2 = helper.getOrCompile(tools, caps);

    assert.strictEqual(res1, res2, 'Same tools and capabilities must return cached reference');
    assert.strictEqual(res1.schemaHash, res2.schemaHash);
    assert.strictEqual(res1.tools.length, 1);
    assert.ok(res1.tokenEstimate > 0);

    // Different capabilities produce distinct cache entries
    const resAll = helper.getOrCompile(tools, null);
    assert.notStrictEqual(res1, resAll);
    assert.strictEqual(resAll.tools.length, 2);
  });
});

// ============================================================================
// VECTOR 5: HELPER 7 (McpMetaToolingHelper) ADVERSARIAL STRESS
// ============================================================================
describe('Vector 5: McpMetaToolingHelper (Meta-Tool Folding & Snapshot Stress)', () => {
  const helper = new McpMetaToolingHelper();

  it('5.1 Meta tool definition count is strictly invariant and equals 2', () => {
    const metaDefs = helper.getMetaToolDefinitions();
    assert.strictEqual(metaDefs.length, 2, 'Must expose exactly 2 meta tools to model');
    assert.strictEqual(metaDefs[0].name, META_TOOL_NAMES.LIST_TOOLS);
    assert.strictEqual(metaDefs[1].name, META_TOOL_NAMES.CALL_TOOL);
    assert.ok(metaDefs[0].parameters.properties.keyword);
    assert.ok(metaDefs[1].parameters.required.includes('server'));
    assert.ok(metaDefs[1].parameters.required.includes('tool'));
  });

  it('5.2 Snapshot registration input validation, malformed entry handling & overwrite', () => {
    assert.throws(() => helper.registerServerSnapshot(null, []), TypeError);
    assert.throws(() => helper.registerServerSnapshot('', []), TypeError);
    assert.throws(() => helper.registerServerSnapshot('srv', null), TypeError);
    assert.throws(() => helper.registerServerSnapshot('srv', 'not_array'), TypeError);

    // Skips unnamed tools without throwing
    helper.registerServerSnapshot('test_srv', [
      { name: 'tool_one', description: 'First tool', tags: ['fast'] },
      { toolName: 'tool_two', description: 'Second tool', tags: ['safe'] },
      { description: 'Nameless item should be skipped' },
      null,
      123
    ]);

    const registered = helper.listToolsFromSnapshot('test_srv');
    assert.strictEqual(registered.length, 2);

    // Overwrite update
    helper.registerServerSnapshot('test_srv', [
      { name: 'tool_three', description: 'Third tool' }
    ]);
    const updated = helper.listToolsFromSnapshot('test_srv');
    assert.strictEqual(updated.length, 1);
    assert.strictEqual(updated[0].toolName, 'tool_three');
  });

  it('5.3 Search isolation for non-existent server and keyword', () => {
    const missingServer = helper.listToolsFromSnapshot('non_existent_server_xyz');
    assert.deepStrictEqual(missingServer, []);

    const missingKw = helper.listToolsFromSnapshot(null, 'impossible_search_query_12345');
    assert.deepStrictEqual(missingKw, []);

    // Case-insensitive multi-match
    helper.registerServerSnapshot('cua_driver', [
      { name: 'browser_click', description: 'Click browser element', tags: ['web', 'gui'] },
      { name: 'mouse_move', description: 'Move mouse cursor', tags: ['gui'] }
    ]);

    const guiHits = helper.listToolsFromSnapshot(null, 'GUI');
    assert.strictEqual(guiHits.length, 2);

    const clickHits = helper.listToolsFromSnapshot('cua_driver', 'CLICK');
    assert.strictEqual(clickHits.length, 1);
    assert.strictEqual(clickHits[0].toolName, 'browser_click');
  });

  it('5.4 Dispatch error handling for missing tools, servers & dispatchers', async () => {
    // Missing arguments
    await assert.rejects(
      () => helper.dispatchMetaCall('', 'tool'),
      /Both serverName and toolName are required/
    );
    await assert.rejects(
      () => helper.dispatchMetaCall('srv', ''),
      /Both serverName and toolName are required/
    );

    // Unregistered tool
    await assert.rejects(
      () => helper.dispatchMetaCall('cua_driver', 'non_existent_tool'),
      /MCP tool not found in snapshot: cua_driver:non_existent_tool/
    );

    // Default mock execution when no dispatcher registered
    const mockRes = await helper.dispatchMetaCall('cua_driver', 'browser_click', { x: 10, y: 20 });
    assert.strictEqual(mockRes.success, true);
    assert.strictEqual(mockRes.mockExecuted, true);
    assert.strictEqual(mockRes.tool, 'browser_click');
    assert.deepStrictEqual(mockRes.arguments, { x: 10, y: 20 });

    // Custom dispatcher registration and execution
    helper.registerDispatcher('cua_driver', async (tool, args) => {
      if (args.fail) throw new Error('Simulated driver failure');
      return { customSuccess: true, executed: tool };
    });

    const customRes = await helper.dispatchMetaCall('cua_driver', 'browser_click', { fail: false });
    assert.strictEqual(customRes.customSuccess, true);
    assert.strictEqual(customRes.executed, 'browser_click');

    await assert.rejects(
      () => helper.dispatchMetaCall('cua_driver', 'browser_click', { fail: true }),
      /Simulated driver failure/
    );

    // Invalid dispatcher registration
    assert.throws(() => helper.registerDispatcher('srv', 'not_a_func'), TypeError);
  });

  it('5.5 Deterministic snapshot SHA-256 hash calculation', () => {
    const hash1 = helper.computeSnapshotHash();
    const hash2 = helper.computeSnapshotHash();
    assert.strictEqual(hash1, hash2, 'Snapshot hash must be deterministic across calls');
    assert.strictEqual(hash1.length, 64);
  });
});
