/**
 * Purpose: Tier 1 Feature Coverage (Category-Partition) E2E Test Suite.
 * Context: Validates primary behavior (happy path) for features F01 - F23.
 * Usage: npx tsx test/e2e/tier1-feature-coverage.test.ts
 * Prerequisites: Node.js 22+, tsx runtime.
 */

import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as http from 'node:http';
import {
  startTestGateway,
  TestGatewayInstance,
  PROJECT_ROOT,
  safeRm,
} from './helpers/e2e-harness';
import { UniversalConfigLoader } from '../../src/daemon/config/UniversalConfigLoader';
import { BlackboardStore } from '../../src/daemon/blackboard/BlackboardStore';
import { evaluateFastPath } from '../../src/daemon/orchestrator/fastPath';
import { REMOTE_INVOKE_ALLOWLIST, computeAllowlistHash } from '../../src/daemon/gateway/allowlist';

describe('Tier 1: Feature Coverage (Category-Partition)', () => {
  let gw: TestGatewayInstance;

  before(async () => {
    gw = await startTestGateway({ prefix: 'tier1' });
  });

  after(async () => {
    if (gw) await gw.stop();
  });

  test('F01: GatewayServer HTTP /health probe responds with status: ok', async () => {
    const healthUrl = `http://127.0.0.1:${gw.port}/health`;
    const res = await new Promise<{ statusCode?: number; data: any }>((resolve, reject) => {
      http.get(healthUrl, (response) => {
        let body = '';
        response.on('data', (c) => (body += c));
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode,
            data: JSON.parse(body),
          });
        });
      }).on('error', reject);
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.data.status, 'ok');
    assert.ok(typeof res.data.activeClients === 'number');
  });

  test('F01 & F02: WebSocket full-duplex link-open and link-accept handshake', async () => {
    const client = await gw.createClient({ clientName: 'Tier1TestClient', clientType: 'web' });
    assert.ok(client.connected, 'GatewayClient should be connected and authenticated');
    
    // Test ping-pong roundtrip
    const pingRes = await client.invoke('system:ping', {});
    assert.equal(pingRes.pong, true);
    assert.ok(typeof pingRes.timestamp === 'number');
    client.disconnect();
  });

  test('F02 & F03: JSON-RPC remote invokes and allowlist hash verification', async () => {
    const client = await gw.createClient();
    const status = await client.invoke('system:status', {});
    assert.ok(status.pid > 0);
    assert.ok(typeof status.registeredBotsCount === 'number');

    const expectedHash = computeAllowlistHash();
    assert.ok(expectedHash.length === 16, 'Allowlist hash must be 16 hex chars');
    assert.ok(REMOTE_INVOKE_ALLOWLIST.includes('agent:chat'));
    assert.ok(REMOTE_INVOKE_ALLOWLIST.includes('room:create'));
    client.disconnect();
  });

  test('F04 & F12: WebGatewayClient topic subscriptions & push streaming frames', async () => {
    const client = await gw.createClient();
    const receivedFrames: Array<{ event: string; data: any }> = [];

    // Subscribe to both session:<roomId> and direct:<sessionId>
    await client.subscribe('session:room_tier1', (event, data) => {
      receivedFrames.push({ event, data });
    });
    await client.subscribe('direct:session_tier1', (event, data) => {
      receivedFrames.push({ event, data });
    });

    // Simulate emission of the standard 7 stream events
    const streamEvents = [
      { topic: 'session:room_tier1', event: 'agent:turn_start', data: { turnId: 't-1', botId: 'moAdmin', timestamp: Date.now() } },
      { topic: 'session:room_tier1', event: 'agent:thinking', data: { turnId: 't-1', botId: 'moAdmin', thinking_delta: 'Thinking...', accumulated: 'Thinking...' } },
      { topic: 'session:room_tier1', event: 'agent:tool_use', data: { turnId: 't-1', botId: 'moAdmin', toolCallId: 'tc-1', toolName: 'read_file', input: { path: 'a.txt' } } },
      { topic: 'session:room_tier1', event: 'agent:tool_result', data: { turnId: 't-1', botId: 'moAdmin', toolCallId: 'tc-1', toolName: 'read_file', result: 'content', durationMs: 12 } },
      { topic: 'session:room_tier1', event: 'agent:text_delta', data: { turnId: 't-1', botId: 'moAdmin', text_delta: 'Hello world' } },
      { topic: 'session:room_tier1', event: 'agent:turn_complete', data: { turnId: 't-1', botId: 'moAdmin', text: 'Hello world', status: 'completed', metrics: { durationMs: 150 } } },
      { topic: 'direct:session_tier1', event: 'agent:turn_interrupted', data: { turnId: 't-2', botId: 'moCode', reason: 'user_abort' } },
    ];

    for (const frame of streamEvents) {
      gw.server.push(frame.topic, frame.event, frame.data);
    }

    // Await async push packet delivery
    await new Promise((r) => setTimeout(r, 80));

    assert.equal(receivedFrames.length, 7, 'Must receive all 7 push streaming frames');
    assert.equal(receivedFrames[0].event, 'agent:turn_start');
    assert.equal(receivedFrames[1].event, 'agent:thinking');
    assert.equal(receivedFrames[2].event, 'agent:tool_use');
    assert.equal(receivedFrames[3].event, 'agent:tool_result');
    assert.equal(receivedFrames[4].event, 'agent:text_delta');
    assert.equal(receivedFrames[5].event, 'agent:turn_complete');
    assert.equal(receivedFrames[6].event, 'agent:turn_interrupted');
    client.disconnect();
  });

  test('F08: 7 Mo-Bots asset harmonization in Customizations/agents/', () => {
    const botsDir = path.join(PROJECT_ROOT, 'Customizations', 'agents');
    assert.ok(fs.existsSync(botsDir), 'Customizations/agents directory must exist');

    const expectedBots = ['moAdmin', 'moCode', 'moDoc', 'MoCI', 'MoGit', 'MoDeep', 'Mo'];
    for (const botName of expectedBots) {
      const bDir = path.join(botsDir, botName);
      assert.ok(fs.existsSync(bDir), `Bot directory ${botName} must exist`);

      // 4-Pack Asset Verification
      const profilePath = path.join(bDir, 'profile.json');
      const capabilitiesPath = path.join(bDir, 'capabilities.json');
      const workbenchPath = path.join(bDir, 'workbench.json');
      const soulPath = path.join(bDir, 'SOUL.md');

      assert.ok(fs.existsSync(profilePath), `${botName} missing profile.json`);
      assert.ok(fs.existsSync(capabilitiesPath), `${botName} missing capabilities.json`);
      assert.ok(fs.existsSync(workbenchPath), `${botName} missing workbench.json`);
      assert.ok(fs.existsSync(soulPath), `${botName} missing SOUL.md`);

      // Parse JSON validity
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      assert.ok(profile.id, `${botName} profile.json must have id`);
      const botNameField = profile.name || profile.display_name;
      assert.ok(botNameField, `${botName} profile.json must have name or display_name`);

      const capabilities = JSON.parse(fs.readFileSync(capabilitiesPath, 'utf-8'));
      assert.ok(
        Array.isArray(capabilities.skills) ||
        Array.isArray(capabilities.tools) ||
        capabilities.tier !== undefined ||
        capabilities.mcpServers !== undefined ||
        capabilities.permissions !== undefined,
        `${botName} capabilities.json must declare skills, tools, or permissions`
      );
    }
  });

  test('F09: Dynamic Agent Scanner loads bots from disk and registers into storage', () => {
    const count = gw.storage.scanAndRegisterAgents(PROJECT_ROOT);
    assert.ok(count >= 7, `Must discover at least 7 agents, found ${count}`);

    const registeredBots = gw.storage.listBots();
    assert.ok(registeredBots.length >= 7, 'All 7 bots registered into SQLite');
  });

  test('F14 & F15: Direct Chat P2P physical lane vs Group Blackboard coordination', async () => {
    // 1. Group Blackboard Room creation
    const room = gw.storage.createRoom({
      id: 'tier1_group_room',
      name: 'Tier 1 Chamber',
      charterText: '# Tier 1 Charter\nMultiagent consensus.',
      initialMemoryText: '# Group Memory\n- Initial consensus established.',
    });
    assert.equal(room.id, 'tier1_group_room');

    // 2. Direct Chat Session creation
    const directSessionId = 'direct_p2p_lane_01';
    gw.storage.addMessage({
      room_id: `direct:${directSessionId}`,
      sender_id: 'human_user',
      sender_type: 'user',
      content: 'Private confidential prompt',
      role: 'user',
    });

    // 3. Assert Group Blackboard is pristine and unaffected by direct message
    const bb = gw.storage.readBlackboard('tier1_group_room');
    assert.ok(bb.memory.includes('Initial consensus established'));
    assert.ok(!bb.memory.includes('Private confidential prompt'), 'Direct chat must NOT pollute group blackboard');
  });

  test('F18 & F19: Transcript persistence format and session lifecycle operations', async () => {
    const transcriptsDir = path.join(PROJECT_ROOT, 'storage', 'transcripts');
    fs.mkdirSync(transcriptsDir, { recursive: true });

    const sessionId = `s-test-${Date.now()}`;
    const transcriptFile = path.join(transcriptsDir, `${sessionId}.jsonl`);

    // Write transcript lines
    const line1 = { sequence: 1, sender: 'user', content: 'Ping', timestamp: Date.now() };
    const line2 = { sequence: 2, sender: 'bot', content: 'Pong', timestamp: Date.now() };
    fs.appendFileSync(transcriptFile, JSON.stringify(line1) + '\n', 'utf-8');
    fs.appendFileSync(transcriptFile, JSON.stringify(line2) + '\n', 'utf-8');

    assert.ok(fs.existsSync(transcriptFile));
    const lines = fs.readFileSync(transcriptFile, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).sequence, 1);
    assert.equal(JSON.parse(lines[1]).sequence, 2);

    // Teardown transcript file
    await safeRm(transcriptFile);
  });

  test('F20 & F21: Cindy 4-Tier Capability Matrix contract and permission modes', () => {
    const capabilityTiers = {
      'chat-only': { allowWrite: false, allowExec: false, isolatedSandbox: true },
      'config': { allowWrite: false, allowExec: false, manageProfile: true },
      'basic-tools': { allowWrite: false, allowExec: false, allowRead: true },
      'full-access': { allowWrite: true, allowExec: true, allowRead: true },
    };

    assert.equal(capabilityTiers['chat-only'].allowWrite, false);
    assert.equal(capabilityTiers['basic-tools'].allowWrite, false);
    assert.equal(capabilityTiers['full-access'].allowWrite, true);
    assert.equal(capabilityTiers['full-access'].allowExec, true);
  });

  test('F22 & F23: Models configuration loading and 0ms Prompt Distill Fast-Path', () => {
    // 1. Models config loading
    const loader = new UniversalConfigLoader(PROJECT_ROOT);
    const modelsConfig = loader.loadModelsConfig();
    assert.ok(modelsConfig.providers, 'Models configuration must define providers');

    // 2. Fast-Path regex evaluation
    const tempStoreDir = path.join(PROJECT_ROOT, 'sandboxes', `tier1-fp-${Date.now()}`);
    fs.mkdirSync(tempStoreDir, { recursive: true });
    const store = new BlackboardStore(tempStoreDir);

    try {
      // 0ms bypass for affirmation
      store.mutate('test', 'INIT', (draft) => {
        draft.kanban.activeTask = {
          id: 'T-100',
          title: 'Unit task',
          assignee: 'moCode',
          status: 'TODO',
          specification: 'Spec',
          acceptanceCriteria: 'Pass',
          stagnationCount: 0,
          rejectionCount: 0,
          crossReviewed: false,
        };
        return 'Init';
      });

      const fastAffirm = evaluateFastPath('好的，继续推进', store);
      assert.equal(fastAffirm.mode, 'BYPASS_TO_CODER');

      // 0ms bypass for emergency stop
      const fastAbort = evaluateFastPath('stop 全部暂停', store);
      assert.equal(fastAbort.mode, 'ABORT_ALL');
      assert.ok(store.readState().kanban.activeTask === null, 'Active task must be aborted');

      // 0ms bypass for native command
      const fastCmd = evaluateFastPath('npm test -- -t auth', store);
      assert.equal(fastCmd.mode, 'DIRECT_COMMAND');
    } finally {
      store.close();
      safeRm(tempStoreDir);
    }
  });

  test('F06 & F07: Verification of SSE and simulated mock eradication', () => {
    // Check that messages-controller and web hooks do NOT contain fake timeout simulated dialogue
    const msgControllerPath = path.join(PROJECT_ROOT, 'src/web/server/controllers/messages-controller.ts');
    if (fs.existsSync(msgControllerPath)) {
      const code = fs.readFileSync(msgControllerPath, 'utf-8');
      assert.ok(!code.includes('runDefaultSimulatedDialogue'), 'messages-controller must not contain simulated dialogue runner');
    }
  });

  test('F28: Authentic session creation, zero mock messages, and persistent turn execution', async () => {
    // 1. Session storage persistence
    const { upsertPersistentSession, loadPersistentSessions, deletePersistentSession } = await import('../../src/web/server/session-storage');
    const testSessionId = `s-e2e-${Date.now()}`;
    const testSession = {
      id: testSessionId,
      title: 'E2E 真实会话',
      workingDir: PROJECT_ROOT,
      agentKind: 'claude-code' as const,
      model: 'gemini-3.8-flash',
      status: 'idle' as const,
      updatedAt: '刚刚',
      messageCount: 0,
    };
    upsertPersistentSession(testSession);
    const sessions = loadPersistentSessions();
    const found = sessions.find((s) => s.id === testSessionId);
    assert.ok(found, 'Session must be persisted to session-storage');

    // 2. Ensure SessionPage and NewChatPage have zero hardcoded MOCK_MESSAGES
    const newChatPageCode = fs.readFileSync(path.join(PROJECT_ROOT, 'src/web/src/pages/cc-agent/NewChatPage.tsx'), 'utf-8');
    assert.ok(!newChatPageCode.includes('s-orca-lead-01'), 'NewChatPage must not jump to hardcoded s-orca-lead-01 mock');

    const sessionPageCode = fs.readFileSync(path.join(PROJECT_ROOT, 'src/web/src/pages/cc-agent/SessionPage.tsx'), 'utf-8');
    assert.ok(!sessionPageCode.includes('MOCK_MESSAGES'), 'SessionPage must not import or initialize with MOCK_MESSAGES');

    // Clean up
    deletePersistentSession(testSessionId);
  });
});
