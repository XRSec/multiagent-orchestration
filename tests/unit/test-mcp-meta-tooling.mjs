/**
 * Purpose: Unit tests for McpMetaToolingHelper (Helper 7)
 * Usage: node --test tests/unit/test-mcp-meta-tooling.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  McpMetaToolingHelper,
  META_TOOL_NAMES
} from '../../packages/agent-control-plane/helpers/mcp-meta-tooling/McpMetaToolingHelper.mjs';

describe('McpMetaToolingHelper Unit Tests (Helper 7)', () => {
  it('Test 7.1: 元工具折叠收敛，向模型暴露工具数恒等于 2', () => {
    const helper = new McpMetaToolingHelper();

    // 注册来自 3 个不同 Server 的 50 个工具
    const server1Tools = Array.from({ length: 20 }, (_, i) => ({
      toolName: `fs_tool_${i + 1}`,
      description: `Filesystem utility ${i + 1}`,
      parameters: { type: 'object', properties: { path: { type: 'string' } } }
    }));
    const server2Tools = Array.from({ length: 20 }, (_, i) => ({
      toolName: `db_tool_${i + 1}`,
      description: `Database query tool ${i + 1}`,
      parameters: { type: 'object', properties: { sql: { type: 'string' } } }
    }));
    const server3Tools = Array.from({ length: 10 }, (_, i) => ({
      toolName: `browser_action_${i + 1}`,
      description: `Headless browser action ${i + 1}`,
      tags: ['browser', 'web'],
      parameters: { type: 'object', properties: { url: { type: 'string' } } }
    }));

    helper.registerServerSnapshot('filesystem', server1Tools);
    helper.registerServerSnapshot('database', server2Tools);
    helper.registerServerSnapshot('browser', server3Tools);

    const metaTools = helper.getMetaToolDefinitions();
    assert.strictEqual(metaTools.length, 2, '无论外部有多少工具，暴露的元工具数量必须恒等于 2');

    const names = metaTools.map(t => t.name);
    assert.ok(names.includes(META_TOOL_NAMES.LIST_TOOLS));
    assert.ok(names.includes(META_TOOL_NAMES.CALL_TOOL));
  });

  it('Test 7.2: 本地快照快速检索 (keyword 与 server 筛选)', () => {
    const helper = new McpMetaToolingHelper();
    helper.registerServerSnapshot('driver', [
      { toolName: 'click', description: 'Click element on screen', tags: ['ui', 'cursor'] },
      { toolName: 'type_text', description: 'Type text into active element', tags: ['keyboard'] },
      { toolName: 'browser_navigate', description: 'Navigate to target URL', tags: ['browser', 'web'] }
    ]);
    helper.registerServerSnapshot('nowledge', [
      { toolName: 'memory_search', description: 'Search personal knowledge', tags: ['memory'] },
      { toolName: 'web_search', description: 'Perform external web search query', tags: ['browser', 'search'] }
    ]);

    // 搜索 keyword: 'browser'
    const results = helper.listToolsFromSnapshot(null, 'browser');
    assert.strictEqual(results.length, 2);
    const resultNames = results.map(r => r.toolName);
    assert.ok(resultNames.includes('browser_navigate'));
    assert.ok(resultNames.includes('web_search'));

    // 限定 server: 'driver'
    const driverOnly = helper.listToolsFromSnapshot('driver');
    assert.strictEqual(driverOnly.length, 3);
  });

  it('Test 7.3: 元工具分发调用与转发执行', async () => {
    const helper = new McpMetaToolingHelper();
    helper.registerServerSnapshot('driver', [
      { toolName: 'click', description: 'Click screen', parameters: { type: 'object' } }
    ]);

    let executedCall = null;
    helper.registerDispatcher('driver', async (tool, args) => {
      executedCall = { tool, args };
      return { status: 'clicked', x: args.x, y: args.y };
    });

    const result = await helper.dispatchMetaCall('driver', 'click', { x: 10, y: 20 });
    assert.deepStrictEqual(executedCall, { tool: 'click', args: { x: 10, y: 20 } });
    assert.strictEqual(result.status, 'clicked');
    assert.strictEqual(result.x, 10);
    assert.strictEqual(result.y, 20);

    // 调用不存在的工具抛错
    await assert.rejects(
      async () => helper.dispatchMetaCall('driver', 'non_existent_tool', {}),
      /MCP tool not found in snapshot/
    );
  });
});
