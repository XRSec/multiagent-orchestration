/**
 * Purpose: Unit tests for ToolSlimmingHelper (Helper 6)
 * Usage: node --test tests/unit/test-tool-slimming.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ToolSlimmingHelper,
  CAPABILITY_TYPES
} from '../../packages/agent-control-plane/helpers/tool-slimming/ToolSlimmingHelper.mjs';

describe('ToolSlimmingHelper Unit Tests (Helper 6)', () => {
  it('Test 6.1: Schema 精炼体积缩减 >= 40% 且关键字段完好保留', () => {
    const slimmer = new ToolSlimmingHelper();
    const verboseTool = {
      name: 'view_file',
      description: 'View the complete contents of a file from the local file system with full syntax highlight and line number index. This tool supports text files and binary files up to 100MB in total size with offset pagination.',
      parameters: {
        type: 'object',
        title: 'ViewFileInputParameters',
        $schema: 'http://json-schema.org/draft-07/schema#',
        examples: [{ filePath: '/workspace/app.js' }],
        properties: {
          filePath: {
            type: 'string',
            title: 'File Absolute Path',
            description: 'The target absolute path of the file to inspect on the filesystem. Must be fully resolved.',
            default: '/workspace',
            markdownDescription: 'Use absolute path only. Never pass relative paths.',
            examples: ['/home/user/code/index.js']
          },
          offset: {
            type: 'number',
            title: 'Byte Offset',
            default: 0,
            examples: [0, 1024]
          }
        },
        required: ['filePath']
      }
    };

    const originalJson = JSON.stringify(verboseTool);
    const slimmed = slimmer.slimSchema(verboseTool);
    const slimmedJson = JSON.stringify(slimmed);

    const shrinkageRatio = 1 - (slimmedJson.length / originalJson.length);
    assert.ok(shrinkageRatio >= 0.40, `体积缩减率必须 >= 40%，实际为 ${(shrinkageRatio * 100).toFixed(2)}%`);

    // 关键结构字段保留校验
    assert.strictEqual(slimmed.name, 'view_file');
    assert.strictEqual(slimmed.parameters.type, 'object');
    assert.deepStrictEqual(slimmed.parameters.required, ['filePath']);
    assert.strictEqual(slimmed.parameters.properties.filePath.type, 'string');

    // 冗余元数据剔除校验
    assert.strictEqual(slimmed.parameters.title, undefined);
    assert.strictEqual(slimmed.parameters.$schema, undefined);
    assert.strictEqual(slimmed.parameters.examples, undefined);
    assert.strictEqual(slimmed.parameters.properties.filePath.title, undefined);
    assert.strictEqual(slimmed.parameters.properties.filePath.default, undefined);
    assert.strictEqual(slimmed.parameters.properties.filePath.markdownDescription, undefined);
    assert.strictEqual(slimmed.parameters.properties.filePath.examples, undefined);
  });

  it('Test 6.2: 动态能力最小集过滤排除无关工具', () => {
    const slimmer = new ToolSlimmingHelper();
    const tools = [
      { name: 'view_file', description: 'Read file' },
      { name: 'list_dir', description: 'List dir' },
      { name: 'write_to_file', description: 'Write file' },
      { name: 'replace_file_content', description: 'Replace content' },
      { name: 'run_command', description: 'Run shell command' },
      { name: 'mcp_gateway_call_tool', description: 'Call mcp' },
      { name: 'read_skill', description: 'Read skill' },
      { name: 'grep_search', description: 'Grep search' }
    ];

    const capsOnlyRead = new Set([CAPABILITY_TYPES.FILE_READ]);
    const filtered = slimmer.filterByCapabilities(tools, capsOnlyRead);
    const filteredNames = filtered.map(t => t.name);

    assert.ok(filteredNames.includes('view_file'));
    assert.ok(filteredNames.includes('list_dir'));
    assert.ok(filteredNames.includes('grep_search'));
    assert.ok(!filteredNames.includes('write_to_file'));
    assert.ok(!filteredNames.includes('replace_file_content'));
    assert.ok(!filteredNames.includes('run_command'));
  });

  it('Test 6.3: 预编译哈希缓存引用命中 (assert.strictEqual)', () => {
    const slimmer = new ToolSlimmingHelper();
    const tools = [
      { name: 'view_file', description: 'Read file', parameters: { type: 'object', properties: {} } },
      { name: 'list_dir', description: 'List dir', parameters: { type: 'object', properties: {} } }
    ];

    const setA = slimmer.getOrCompile(tools, new Set([CAPABILITY_TYPES.FILE_READ]));
    const setB = slimmer.getOrCompile(tools, new Set([CAPABILITY_TYPES.FILE_READ]));

    assert.strictEqual(setA, setB, '二次调用必须命中预编译缓存，返回完全相同的对象引用');
    assert.strictEqual(setA.schemaHash.length, 64);
    assert.ok(setA.tokenEstimate > 0);
  });
});
