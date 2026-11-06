/**
 * @file test/multiagent-room.test.ts
 * @description Verification test suite for "multiagent-orchestration" development room.
 */

import * as fs from 'fs';
import * as path from 'path';
import { StorageManager } from '../src/storage/StorageManager';
import { RuntimeEnvironment } from '../src/storage/RuntimeEnvironment';
import { AgentOrchestrator } from '../src/daemon/orchestrator/AgentOrchestrator';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function run() {
  console.log('========================================================================');
  console.log('   Multi-Agent Orchestration Development Room Verification Test        ');
  console.log('========================================================================\n');

  const projectRoot = path.resolve(__dirname, '..');
  const daemonDataDir = path.join(projectRoot, '.daemon');

  const storage = new StorageManager(daemonDataDir);
  const runtime = new RuntimeEnvironment(projectRoot, storage);
  const orchestrator = new AgentOrchestrator({ storage, runtime });

  console.log('[Test 1] Querying multiagent-orchestration room from SQLite & disk...');
  const room = storage.getRoom('multiagent-orchestration');
  assert(room !== null, 'Room "multiagent-orchestration" must exist');
  assert(room.slug === 'multiagent-orchestration', 'Slug must match');
  assert(room.name === 'Multi-Agent Orchestration 开发核心组', 'Name must match');

  const members = JSON.parse(room.members_json);
  assert(members.length === 7, `Expected 7 members, got ${members.length}`);
  console.log(`  Room Name: ${room.name}`);
  console.log(`  Members Count: ${members.length} core bots`);
  console.log('  ✓ PASS: Room record verified.\n');

  console.log('[Test 2] Verifying GROUP_CHARTER.md and GROUP_MEMORY.md integrity...');
  const blackboard = storage.readBlackboard('multiagent-orchestration');
  assert(blackboard.charter.includes('开发核心组章程'), 'Charter must contain title');
  assert(blackboard.charter.includes('moAdmin') && blackboard.charter.includes('moCode'), 'Charter must detail member roles');
  assert(blackboard.memory.includes('M1: 存储与运行时隔离搭建'), 'Blackboard must have milestone history');
  console.log('  ✓ PASS: Charter & Blackboard markdown files verified.\n');

  console.log('[Test 3] Simulating human task dispatch to moAdmin in multiagent-orchestration room...');
  const chatResult = await orchestrator.handleChat({
    roomId: room.id,
    botId: 'bot_moadmin_director_03',
    content: 'TASK: Launch M3 workstream: moCode please run stress benchmark on gateway, moDoc record results.',
    role: 'user',
  });

  assert(chatResult.replyContent !== undefined, 'moAdmin must reply');
  assert(chatResult.sequence >= 2, 'Sequence must increment monotonically');
  assert(chatResult.blackboardUpdated === true, 'Blackboard must update upon task completion');
  console.log(`  moAdmin Reply: ${chatResult.replyContent}`);
  console.log(`  New Message Sequence: ${chatResult.sequence}`);
  console.log('  ✓ PASS: Multi-agent chat turn executed and sequence advanced.\n');

  console.log('[Test 4] Verifying shared blackboard consensus fact update...');
  const updatedBlackboard = storage.readBlackboard('multiagent-orchestration');
  assert(
    updatedBlackboard.memory.includes('bot_moadmin_director_03') ||
    updatedBlackboard.memory.includes('moAdmin'),
    'Blackboard memory must record moAdmin consensus fact'
  );
  console.log('  ✓ PASS: Blackboard memory updated with real-time consensus.\n');

  console.log('[Test 5] Verifying Delta Slicing for moCode...');
  // moCode should now receive delta messages since its last cursor
  const codeBotDeltas = storage.getDeltaMessages(room.id, 'bot_mocode_engine_01');
  assert(codeBotDeltas.length >= 1, 'moCode must receive incremental delta messages');
  console.log(`  moCode received ${codeBotDeltas.length} new delta messages since last turn.`);
  console.log('  ✓ PASS: Monotonic delta slicing verified for member.\n');

  storage.close();

  console.log('========================================================================');
  console.log('  ✓ ALL MULTIAGENT ROOM TESTS PASSED (Exit Code 0)                     ');
  console.log('========================================================================');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

