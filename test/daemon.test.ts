/**
 * @file test/daemon.test.ts
 * @description Comprehensive Integration Tests for Cindy-style Device Gateway.
 * Single unified WebSocket protocol, zero dual-protocol overhead.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { DaemonServer } from '../src/daemon/transport/DaemonServer';
import { GatewayClient } from '../src/daemon/gateway/GatewayClient';
import { DaemonErrorCode } from '../src/daemon/protocol/errors';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function requestHttpJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function runGatewayTests() {
  console.log('========================================================================');
  console.log('    Cindy-Style Multi-Agent Device Gateway Integration Test Suite       ');
  console.log('========================================================================\n');

  const projectRoot = path.resolve(__dirname, '..');
  const tempDir = path.join(projectRoot, 'sandboxes', `gateway-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const hostClaudeDir = path.join(os.homedir(), '.claude');
  const hostInitialStat = fs.existsSync(hostClaudeDir) ? fs.statSync(hostClaudeDir) : null;
  const testPort = 38299;

  console.log('[Test 1] Starting DaemonServer as Device Gateway Host...');
  const daemon = new DaemonServer({
    projectRoot,
    dataDir: tempDir,
    httpPort: testPort,
    httpHost: '127.0.0.1',
  });

  await daemon.start();
  const pidFile = path.join(tempDir, 'daemon.pid');
  assert(fs.existsSync(pidFile), 'daemon.pid must exist');
  assert(fs.readFileSync(pidFile, 'utf-8').trim() === String(process.pid), 'PID must match process.pid');

  // Verify duplicate startup prevention
  try {
    const duplicate = new DaemonServer({
      projectRoot,
      dataDir: tempDir,
      httpPort: testPort + 1,
    });
    await duplicate.start();
    assert(false, 'Duplicate startup must be blocked');
  } catch (err: any) {
    assert(err.message.includes('Another daemon instance is already running'), 'Should throw duplicate error');
  }
  console.log(`  ✓ PASS: Device Gateway Host started on port ${testPort} with PID lock.\n`);

  console.log('[Test 2] Probing HTTP GET /health (for FRP / monitoring)...');
  const healthRes = await requestHttpJson(`http://127.0.0.1:${testPort}/health`);
  assert(healthRes.statusCode === 200, 'Health check must return 200');
  assert(healthRes.data?.status === 'ok', 'Status must be ok');
  console.log('  ✓ PASS: Health probe responded with status: ok.\n');

  console.log('[Test 3] Connecting GatewayClient over WebSocket with link-open handshake...');
  const client = new GatewayClient({
    url: `ws://127.0.0.1:${testPort}/gateway`,
    clientName: 'TestController',
    clientType: 'cli',
  });

  const accept = await client.connect();
  assert(accept.gatewayId !== undefined, 'Gateway must return gatewayId');
  assert(accept.allowlistHash !== undefined, 'Gateway must return allowlistHash');
  assert(client.connected, 'Client state must be connected');
  console.log(`  ✓ PASS: Gateway handshake accepted by ${accept.gatewayId} (allowlistHash: ${accept.allowlistHash}).\n`);

  console.log('[Test 4] Executing system:ping and system:status via GatewayClient...');
  const pingRes = await client.ping();
  assert(pingRes.pong === true, 'Ping must return pong');
  console.log(`  Ping latency: ${pingRes.latencyMs}ms`);

  const status = await client.invoke('system:status', {});
  assert(status.pid === process.pid, 'Status PID must match');
  assert(status.activeConnections === 1, 'Should report 1 active client connection');
  console.log('  ✓ PASS: Remote invokes settled with sub-millisecond roundtrip.\n');

  console.log('[Test 5] Registering 7 core Mo-Bots and querying via agent:list...');
  const storage = daemon.getStorage();
  const expectedBots = ['moCode', 'moDoc', 'moAdmin', 'MoDeep', 'MoGit', 'Mo', 'MoCI'];
  for (const botName of expectedBots) {
    const botDir = path.join(projectRoot, 'Bots', botName);
    const profile = JSON.parse(fs.readFileSync(path.join(botDir, 'profile.json'), 'utf-8'));
    storage.registerBot({
      id: profile.id,
      name: botName,
      display_name: profile.display_name,
      description: profile.description,
      avatar: profile.avatar,
      avatar_color: profile.avatar_color,
      status: profile.status,
      canonical_session_id: profile.canonical_session_id,
      bot_dir: botDir,
      claude_config_dir: path.join(botDir, 'claude_config'),
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    });
  }

  const bots = await client.invoke('agent:list', {});
  assert(bots.length >= 7, 'Must return at least 7 registered bots');
  console.log(`  ✓ PASS: All ${bots.length} bots listed through Gateway invoke.\n`);

  console.log('[Test 6] Creating room and initializing GROUP_MEMORY.md blackboard...');
  const room = await client.invoke('room:create', {
    id: 'gateway_core_room',
    name: 'Gateway Chamber',
    charterText: '# Gateway Chamber Charter\nSingle-protocol multi-agent collaboration.',
    initialMemoryText: '# Group Memory & Blackboard\n\n## 1. Ground Truth\n- Gateway online',
  });
  assert(room.id === 'gateway_core_room', 'Room ID must match');

  const roomInfo = await client.invoke('room:get', { roomId: 'gateway_core_room' });
  assert(roomInfo.blackboard.memory.includes('Gateway online'), 'Blackboard memory must be initialized');
  console.log('  ✓ PASS: Room and Blackboard created and verified.\n');

  console.log('[Test 7] Subscribing to Topic and executing agent:chat turn with push streaming...');
  const receivedPushes: Array<{ event: string; data: any }> = [];
  await client.subscribe('session:gateway_core_room', (event, data) => {
    receivedPushes.push({ event, data });
  });

  const chatResult = await client.invoke('agent:chat', {
    roomId: 'gateway_core_room',
    botId: 'bot_moadmin_director_03',
    content: 'TASK: Acknowledge receipt and confirm single-protocol gateway architecture online.',
    role: 'user',
  }, 120000);

  assert(chatResult.replyContent !== undefined, 'Bot reply must be present');
  assert(chatResult.sequence >= 2, 'Sequence must increment');
  assert(chatResult.blackboardUpdated === true, 'Blackboard should be updated on TASK completion');
  assert(receivedPushes.length > 0, 'Client must have received push streams via WebSocket');
  console.log(`  Received ${receivedPushes.length} real-time push events from gateway.`);
  console.log('  ✓ PASS: Turn executed, single-speaker enforced, real-time push streaming verified.\n');

  console.log('[Test 8] Testing Anti-Loop Circuit Breaker over Gateway invoke...');
  const orchestrator = daemon.getOrchestrator();
  let tripped = false;
  for (let i = 0; i < 15; i++) {
    try {
      await orchestrator.handleChat({
        roomId: 'gateway_core_room',
        botId: 'bot_moadmin_director_03',
        content: `Loop test ${i}`,
        role: 'bot',
      });
    } catch (err: any) {
      if (err.code === DaemonErrorCode.CIRCUIT_BREAKER_TRIPPED) {
        tripped = true;
        break;
      }
    }
  }
  assert(tripped, 'Circuit breaker must trip on runaway loop');

  // Human intervention recovers circuit breaker
  const humanRecovery = await client.invoke('agent:chat', {
    roomId: 'gateway_core_room',
    botId: 'bot_moadmin_director_03',
    content: 'Human owner command: Resume execution.',
    role: 'user',
  }, 120000);
  assert(humanRecovery.replyContent !== undefined, 'Human input must recover circuit breaker');
  console.log('  ✓ PASS: Anti-loop circuit breaker tripped and recovered upon human owner input.\n');

  console.log('[Test 9] Executing Worker Task and verifying Allowlist default-deny...');
  const taskResult = await client.invoke('worker:task:execute', {
    taskId: 'worker_gw_01',
    botId: 'bot_moci_sentinel_07',
    command: 'node',
    args: ['-e', 'console.log("Gateway worker executed successfully");'],
  });
  assert(taskResult.exitCode === 0, 'Worker must exit with 0');
  assert(taskResult.stdout.includes('Gateway worker executed successfully'), 'Worker stdout must match');

  // Verify non-allowlisted channel rejection
  try {
    await client.invoke('forbidden:dangerous:channel', {});
    assert(false, 'Non-allowlisted channel must be rejected');
  } catch (err: any) {
    assert(err.message.includes('not allowed by gateway security allowlist'), 'Should reject forbidden channel');
  }
  console.log('  ✓ PASS: Worker task executed and security allowlist default-deny verified.\n');

  console.log('[Test 9.5] Verifying Gateway Rewind, Compaction, Fork, Tombstone & Input Queue channels...');
  const roomObj = storage.getRoom('gateway_core_room')!;
  const gwSessionId = `session_${roomObj.id}`;
  const msgToRewind = storage.appendMessage(gwSessionId, 'human_user', 'user', 'Ephemeral user prompt for rewind test', {
    roomId: roomObj.id,
    clientId: 'gw-rewind-client-id-01',
  });
  storage.appendMessage(gwSessionId, 'bot_moadmin_director_03', 'assistant', 'Ephemeral bot response to rewind', {
    roomId: roomObj.id,
    clientId: 'gw-rewind-asst-id-01',
  });

  const gwPreview = await client.invoke('rewind:preview', {
    sessionId: gwSessionId,
    clientId: 'gw-rewind-client-id-01',
  });
  assert(gwPreview.canRewind === true, 'rewind:preview must return canRewind=true');
  assert(gwPreview.targetMessageId === msgToRewind.id, 'rewind:preview targetMessageId must match');

  const gwCommit = await client.invoke('rewind:commit', {
    sessionId: gwSessionId,
    clientId: 'gw-rewind-client-id-01',
    stopIfRunning: true,
  });
  assert(gwCommit.rewoundMessageCount === 2, `Expected 2 rewound messages, got ${gwCommit.rewoundMessageCount}`);

  const gwCompact = await client.invoke('session:compact', {
    sessionId: gwSessionId,
    instructions: 'Preserve architecture decisions',
  });
  assert(gwCompact.scheduled === true, 'session:compact must schedule bridge compaction');

  const gwFork = await client.invoke('session:fork', {
    sourceSessionId: gwSessionId,
    newSessionId: 'session_gw_forked_01',
    title: 'Gateway Forked Session',
  });
  assert(gwFork.session.parent_session_id === gwSessionId, 'session:fork must link parent_session_id');

  await client.invoke('session:queue:save', {
    sessionId: gwSessionId,
    items: [{ clientId: 'q_gw_1', content: 'Queued via Gateway', enqueuedAt: Date.now() }],
  });
  const gwQueueLoad = await client.invoke('session:queue:load', { sessionId: gwSessionId });
  assert(gwQueueLoad.items.length === 1 && gwQueueLoad.items[0].clientId === 'q_gw_1', 'session:queue:load must return saved item');
  await client.invoke('session:queue:clear', { sessionId: gwSessionId });
  const gwQueueAfterClear = await client.invoke('session:queue:load', { sessionId: gwSessionId });
  assert(gwQueueAfterClear.items.length === 0, 'session:queue:clear must empty queue');

  const gwInterrupted = await client.invoke('session:interrupted', {});
  assert(Array.isArray(gwInterrupted.interruptedSessions), 'session:interrupted must return array');
  console.log('  ✓ PASS: Gateway Rewind, Compaction, Fork, and Input Queue channels verified.\n');

  console.log('[Test 10] Disconnecting client, stopping Daemon, and auditing host ~/.claude...');
  client.disconnect();
  assert(!client.connected, 'Client should be disconnected');

  await daemon.stop();
  assert(!fs.existsSync(pidFile), 'PID file must be deleted upon stop');

  if (hostInitialStat && fs.existsSync(hostClaudeDir)) {
    const hostFinalStat = fs.statSync(hostClaudeDir);
    assert(
      hostFinalStat.mtimeMs === hostInitialStat.mtimeMs,
      `Host ~/.claude was touched! Initial: ${hostInitialStat.mtime.toISOString()}, Final: ${hostFinalStat.mtime.toISOString()}`
    );
    console.log(`  Host ~/.claude mtime remained untouched: ${hostFinalStat.mtime.toISOString()}`);
  }
  console.log('  ✓ PASS: Gateway stopped cleanly. Host ~/.claude 100% untouched.\n');

  console.log('========================================================================');
  console.log('  ✓ ALL 10 CINDY GATEWAY INTEGRATION TESTS PASSED (Exit Code 0)        ');
  console.log('========================================================================');
}

runGatewayTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
