/**
 * @file test/date-and-status-verification.test.ts
 * @description Unit & Integration verification for:
 * 1. Safe date formatting (no 'Invalid Date')
 * 2. ExecutionStatus generation for bot messages
 * 3. Room slug normalization (hyphen vs underscore)
 * 4. SQLite messages retrieval with executionStatus
 */

import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  normalizeRoomSlug,
  toSafeIsoString,
  buildBotExecutionStatus,
  resolveTargetBots,
  MO_BOTS_META
} from '../src/web/server/vite-room-api-plugin.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log('--- 1. Testing normalizeRoomSlug ---');
  const nHyphen = normalizeRoomSlug('multiagent-orchestration');
  const nUnderscore = normalizeRoomSlug('room_multiagent_orchestration');
  const nDirectUnderscore = normalizeRoomSlug('multiagent_orchestration');

  assert(nHyphen.cleanSlug === 'multiagent-orchestration', 'cleanSlug should be hyphen-based');
  assert(nUnderscore.cleanSlug === 'multiagent-orchestration', 'cleanSlug for room_multiagent_orchestration should match');
  assert(nDirectUnderscore.cleanSlug === 'multiagent-orchestration', 'cleanSlug for multiagent_orchestration should match');
  assert(nHyphen.fsSlug === 'multiagent-orchestration', 'fsSlug should find multiagent-orchestration directory');
  assert(nUnderscore.fsSlug === 'multiagent-orchestration', 'fsSlug should find multiagent-orchestration directory');
  assert(nHyphen.dbRoomIds.includes('room_multiagent_orchestration'), 'dbRoomIds must include room_multiagent_orchestration');
  assert(nUnderscore.dbRoomIds.includes('multiagent-orchestration'), 'dbRoomIds must include multiagent-orchestration');
  console.log('✓ normalizeRoomSlug passed for all variations\n');

  console.log('--- 2. Testing toSafeIsoString ---');
  const testCases = [
    1793887449256,
    '1793887449256',
    '2026-11-05T14:04:09.256Z',
    null,
    undefined,
    'Invalid Date',
    '下午2:35:37'
  ];
  for (const tc of testCases) {
    const iso = toSafeIsoString(tc);
    assert(Boolean(iso), `toSafeIsoString(${tc}) must return non-empty string`);
    assert(!iso.includes('Invalid') && !iso.includes('NaN'), `toSafeIsoString(${tc}) must not contain Invalid or NaN`);
    const parsed = new Date(iso);
    assert(!isNaN(parsed.getTime()), `toSafeIsoString(${tc}) must produce a valid date`);
  }
  console.log('✓ toSafeIsoString passed for all inputs\n');

  console.log('--- 3. Testing buildBotExecutionStatus ---');
  const sampleBots = ['bot_moadmin_director_03', 'bot_mocode_engine_01', 'bot_moci_sentinel_07'];
  for (const botId of sampleBots) {
    const status = buildBotExecutionStatus(botId, '执行构建与测试：`pnpm build` 并更新 `GROUP_MEMORY.md`', Date.now());
    assert(status.state === 'done', 'state must be done');
    assert(status.currentPhaseText === '协同执行完成 · 生产就绪', 'currentPhaseText must match spec');
    assert(typeof status.thinking.text === 'string' && status.thinking.text.length > 0, 'thinking.text required');
    assert(typeof status.thinking.durationSeconds === 'number', 'thinking.durationSeconds required');
    assert(typeof status.thinking.durationMs === 'number', 'thinking.durationMs required');
    assert(Array.isArray(status.tools) && status.tools.length > 0, 'tools array required');
    for (const t of status.tools) {
      assert(Boolean(t.id), 'tool id required');
      assert(Boolean(t.tool), 'tool name required');
      assert(Boolean(t.description), 'tool description required');
      assert(t.status === 'success', 'tool status must be success');
      assert(typeof t.durationMs === 'number', 'tool durationMs required');
    }
    assert(typeof status.latency.thinkingMs === 'number', 'latency.thinkingMs required');
    assert(typeof status.latency.toolMs === 'number', 'latency.toolMs required');
    assert(typeof status.latency.totalMs === 'number', 'latency.totalMs required');
    assert(status.latency.totalMs === status.latency.thinkingMs + status.latency.toolMs, 'totalMs must equal sum');
  }
  console.log('✓ buildBotExecutionStatus passed for all bot archetypes\n');

  console.log('--- 4. Testing SQLite message query with executionStatus ---');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dbPath = path.resolve(__dirname, '..', '.daemon', 'orchestrator.db');
  const db = new DatabaseSync(dbPath);

  for (const querySlug of ['multiagent-orchestration', 'room_multiagent_orchestration']) {
    const norm = normalizeRoomSlug(querySlug);
    const placeholders = norm.dbRoomIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT * FROM messages
      WHERE room_id IN (${placeholders}) AND sequence > 0 AND silent_token = 0
      ORDER BY sequence ASC
    `).all(...norm.dbRoomIds) as any[];

    assert(rows.length > 0, `Query with slug "${querySlug}" should return messages from SQLite`);
    console.log(`  Slug "${querySlug}": found ${rows.length} messages in SQLite`);

    const botRows = rows.filter((r) => r.sender_role === 'assistant' || r.sender_id.startsWith('bot_'));
    assert(botRows.length > 0, 'Should find bot rows in SQLite');

    for (const bRow of botRows) {
      const execStatus = buildBotExecutionStatus(bRow.sender_id, bRow.content, bRow.created_at);
      assert(execStatus.state === 'done', 'bot executionStatus state must be done');
      assert(execStatus.tools.length > 0, 'bot executionStatus must have tools');
    }
  }
  console.log('✓ SQLite message query & executionStatus mounting verified\n');

  console.log('--- 5. Testing MessageItem DOM render order ---');
  const messageItemPath = path.resolve(__dirname, '..', 'src', 'web', 'src', 'components', 'group-chat', 'MessageItem.tsx');
  const messageItemSrc = fs.readFileSync(messageItemPath, 'utf8');

  // Verify ExecutionStatusCard is strictly placed BEFORE Content Bubble
  const execIdx = messageItemSrc.indexOf('data-testid="message-execution-status"');
  const bubbleIdx = messageItemSrc.indexOf('data-testid="message-content-bubble"');
  assert(execIdx !== -1, 'MessageItem must contain message-execution-status testid');
  assert(bubbleIdx !== -1, 'MessageItem must contain message-content-bubble testid');
  assert(execIdx < bubbleIdx, 'ExecutionStatusCard must be placed BEFORE Content Bubble (先展示执行过程，最后输出结果)');

  // Verify mb-2.5 margin
  assert(messageItemSrc.includes('mb-2.5') && messageItemSrc.includes('ExecutionStatusCard'), 'ExecutionStatusCard wrapper must have mb-2.5 class for clear spacing');
  console.log('✓ MessageItem DOM render order verified (ExecutionStatusCard is strictly prior to Content Bubble)\n');

  console.log('--- 6. Testing resolveTargetBots & moAdmin fallback dispatch ---');
  // Case A: User sends instruction without mentioning any bot -> defaults to moAdmin director
  const targetsDefault = resolveTargetBots('帮我把系统整理一下并启动服务');
  assert(targetsDefault.length === 1 && targetsDefault[0] === 'bot_moadmin_director_03', 'Should fallback to bot_moadmin_director_03 when no bot is mentioned');

  const targetsEmpty = resolveTargetBots('', []);
  assert(targetsEmpty.length === 1 && targetsEmpty[0] === 'bot_moadmin_director_03', 'Empty content should fallback to bot_moadmin_director_03');

  // Case B: User mentions moCode
  const targetsMocode = resolveTargetBots('请 @moCode 修复一下 MessageItem 的顺序');
  assert(targetsMocode.includes('bot_mocode_engine_01'), 'Should detect moCode when @moCode mentioned');

  // Case C: User mentions multiple bots
  const targetsMulti = resolveTargetBots('@moadmin @moci 启动回归验收');
  assert(targetsMulti.includes('bot_moadmin_director_03') && targetsMulti.includes('bot_moci_sentinel_07'), 'Should detect both moAdmin and MoCI');

  // Case D: moAdmin execution status contains manage_task
  const moAdminStatus = buildBotExecutionStatus('bot_moadmin_director_03', '已完成任务分析与工单分解', Date.now());
  assert(moAdminStatus.state === 'done', 'moAdmin execution status state must be done');
  const hasManageTask = moAdminStatus.tools.some((t: any) => t.tool === 'manage_task' || t.tool === 'Read');
  assert(hasManageTask, 'moAdmin execution status must contain manage_task or Read orchestration tools');
  console.log('✓ resolveTargetBots & moAdmin fallback dispatch verified\n');

  console.log('========================================================================');
  console.log('   ✓ ALL DATE & EXECUTION STATUS CHECKS PASSED (100% GREEN)             ');
  console.log('========================================================================');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
