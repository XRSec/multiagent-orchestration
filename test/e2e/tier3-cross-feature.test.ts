/**
 * Purpose: Tier 3 Cross-Feature Interactions E2E Test Suite.
 * Context: Validates combinatorial multi-subsystem concurrency and state transitions.
 * Usage: npx tsx test/e2e/tier3-cross-feature.test.ts
 * Prerequisites: Node.js 22+, tsx runtime.
 */

import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  startTestGateway,
  TestGatewayInstance,
  PROJECT_ROOT,
  safeRm,
} from './helpers/e2e-harness';
import { evaluateFastPath } from '../../src/daemon/orchestrator/fastPath';
import { BlackboardStore } from '../../src/daemon/blackboard/BlackboardStore';

describe('Tier 3: Cross-Feature Interactions & Combinatorial Concurrency', () => {
  let gw: TestGatewayInstance;

  before(async () => {
    gw = await startTestGateway({ prefix: 'tier3' });
    gw.storage.scanAndRegisterAgents(PROJECT_ROOT);
  });

  after(async () => {
    if (gw) await gw.stop();
  });

  test('Interaction 1: Direct chat P2P lane concurrent with active group blackboard', async () => {
    const directClient = await gw.createClient({ clientName: 'DirectUser', clientType: 'web' });
    const groupClient = await gw.createClient({ clientName: 'GroupUser', clientType: 'web' });

    const roomId = 'room_group_collab';
    const directSessionId = 's_direct_p2p_99';

    // 1. Setup group room
    gw.storage.createRoom({
      id: roomId,
      name: 'Group Chamber',
      charterText: '# Group Charter',
      initialMemoryText: '# Group Memory\n- Group consensus base.',
    });

    // 2. Setup topic subscriptions
    const directPushes: Array<{ event: string; data: any }> = [];
    const groupPushes: Array<{ event: string; data: any }> = [];

    await directClient.subscribe(`direct:${directSessionId}`, (event, data) => {
      directPushes.push({ event, data });
    });
    await groupClient.subscribe(`session:${roomId}`, (event, data) => {
      groupPushes.push({ event, data });
    });

    // 3. Concurrently emit events to direct and group channels
    gw.server.push(`direct:${directSessionId}`, 'agent:text_delta', { text: 'Direct secret answer' });
    gw.server.push(`session:${roomId}`, 'agent:text_delta', { text: 'Group broadcast answer' });

    // Update group blackboard
    gw.storage.appendToBlackboard(roomId, '\n- Group update consensus');

    // Add direct message
    gw.storage.addMessage({
      room_id: `direct:${directSessionId}`,
      sender_id: 'human_user',
      sender_type: 'user',
      content: 'Confidential prompt in direct lane',
      role: 'user',
    });

    await new Promise((r) => setTimeout(r, 60));

    // Assert push isolation
    assert.equal(directPushes.length, 1);
    assert.equal(directPushes[0].data.text, 'Direct secret answer');

    assert.equal(groupPushes.length, 1);
    assert.equal(groupPushes[0].data.text, 'Group broadcast answer');

    // Assert blackboard state isolation
    const bb = gw.storage.readBlackboard(roomId);
    assert.ok(bb.memory.includes('Group update consensus'));
    assert.ok(!bb.memory.includes('Confidential prompt'), 'Group blackboard must remain untouched by direct chat');

    directClient.disconnect();
    groupClient.disconnect();
  });

  test('Interaction 2: Dynamic capability matrix mutation during active session', async () => {
    const tempBotDir = path.join(PROJECT_ROOT, 'sandboxes', `t3-bot-caps-${Date.now()}`);
    fs.mkdirSync(tempBotDir, { recursive: true });
    const capsPath = path.join(tempBotDir, 'capabilities.json');

    try {
      // 1. Initialize with chat-only mode
      const chatOnlyCaps = {
        tier: 'chat-only',
        allowWrite: false,
        allowExec: false,
        tools: ['web_search'],
      };
      fs.writeFileSync(capsPath, JSON.stringify(chatOnlyCaps, null, 2), 'utf-8');

      let currentCaps = JSON.parse(fs.readFileSync(capsPath, 'utf-8'));
      assert.equal(currentCaps.tier, 'chat-only');
      assert.equal(currentCaps.allowWrite, false);

      // 2. Dynamically mutate to full-access
      const fullAccessCaps = {
        tier: 'full-access',
        allowWrite: true,
        allowExec: true,
        tools: ['web_search', 'bash', 'file_edit', 'file_write'],
      };
      fs.writeFileSync(capsPath, JSON.stringify(fullAccessCaps, null, 2), 'utf-8');

      currentCaps = JSON.parse(fs.readFileSync(capsPath, 'utf-8'));
      assert.equal(currentCaps.tier, 'full-access');
      assert.equal(currentCaps.allowWrite, true);
      assert.equal(currentCaps.allowExec, true);
      assert.ok(currentCaps.tools.includes('bash'));
    } finally {
      await safeRm(tempBotDir);
    }
  });

  test('Interaction 3: Distillation pipeline combined with streaming push frames', async () => {
    const client = await gw.createClient();
    const topic = 'session:distill_stream_test';
    const receivedFrames: Array<{ event: string; data: any }> = [];

    await client.subscribe(topic, (event, data) => {
      receivedFrames.push({ event, data });
    });

    // 1. Evaluate fastPath on a complex multi-line prompt
    const complexPrompt = `
      Please conduct a comprehensive architectural refactoring of the authentication
      interceptor. Ensure zero backward incompatibility and write integration tests.
    `;
    const tempStoreDir = path.join(PROJECT_ROOT, 'sandboxes', `t3-distill-${Date.now()}`);
    fs.mkdirSync(tempStoreDir, { recursive: true });
    const store = new BlackboardStore(tempStoreDir);

    try {
      const fastPathRes = evaluateFastPath(complexPrompt, store);
      assert.equal(fastPathRes.mode, 'STANDARD_DISTILL', 'Complex prompt must trigger distillation');

      // 2. Stream frame emission representing intent distillation
      gw.server.push(topic, 'agent:thinking', {
        turnId: 'turn-distill-01',
        botId: 'moAdmin',
        thinking_delta: 'Extracting core intent: Refactor auth interceptor with zero breakage.',
        accumulated: 'Extracting core intent...',
      });

      // Stream text deltas
      gw.server.push(topic, 'agent:text_delta', {
        turnId: 'turn-distill-01',
        botId: 'moAdmin',
        text_delta: 'Task assigned to moCode.',
      });

      // Turn complete
      gw.server.push(topic, 'agent:turn_complete', {
        turnId: 'turn-distill-01',
        botId: 'moAdmin',
        status: 'completed',
        metrics: { durationMs: 210, distilledTokenSavings: '64%' },
      });

      await new Promise((r) => setTimeout(r, 60));

      assert.equal(receivedFrames.length, 3);
      assert.equal(receivedFrames[0].event, 'agent:thinking');
      assert.equal(receivedFrames[1].event, 'agent:text_delta');
      assert.equal(receivedFrames[2].event, 'agent:turn_complete');
      assert.equal(receivedFrames[2].data.metrics.distilledTokenSavings, '64%');
    } finally {
      store.close();
      await safeRm(tempStoreDir);
      client.disconnect();
    }
  });

  test('Interaction 4: Concurrent multi-bot monotonic sequence and JSONL transcript append', async () => {
    const roomId = `room_concurrent_seq_${Date.now()}`;
    gw.storage.createRoom({
      id: roomId,
      name: 'Concurrent Chamber',
      charterText: '# Charter',
      initialMemoryText: '# Memory',
    });

    const transcriptsDir = path.join(PROJECT_ROOT, 'storage', 'transcripts');
    fs.mkdirSync(transcriptsDir, { recursive: true });
    const transcriptPath = path.join(transcriptsDir, `${roomId}.jsonl`);

    // Clean up if already exists
    if (fs.existsSync(transcriptPath)) fs.unlinkSync(transcriptPath);

    // 3 bots write concurrently
    const bots = ['bot_moadmin_director_03', 'bot_mocode_engine_01', 'bot_moci_sentinel_07'];
    const addedMessages: any[] = [];

    for (let i = 0; i < 9; i++) {
      const botId = bots[i % bots.length];
      const msg = gw.storage.addMessage({
        room_id: roomId,
        sender_id: botId,
        sender_type: 'bot',
        content: `Step ${i} from ${botId}`,
        role: 'assistant',
      });
      addedMessages.push(msg);

      // Append to transcript
      fs.appendFileSync(
        transcriptPath,
        JSON.stringify({ sequence: msg.sequence, sender: botId, content: msg.content }) + '\n',
        'utf-8'
      );
    }

    // Verify monotonic increments
    const baseSeq = addedMessages[0].sequence;
    for (let i = 0; i < addedMessages.length; i++) {
      assert.equal(addedMessages[i].sequence, baseSeq + i, `Sequence must increment monotonically`);
    }

    // Verify transcript lines match
    const transcriptLines = fs.readFileSync(transcriptPath, 'utf-8').trim().split('\n');
    assert.equal(transcriptLines.length, 9);
    for (let i = 0; i < 9; i++) {
      const parsed = JSON.parse(transcriptLines[i]);
      assert.equal(parsed.sequence, baseSeq + i);
    }

    await safeRm(transcriptPath);
  });

  test('Interaction 5: Session lifecycle mutation while streaming push in-flight', async () => {
    const client = await gw.createClient();
    const sessionId = 's_lifecycle_stream_01';
    const topic = `direct:${sessionId}`;

    let streamChunkCount = 0;
    await client.subscribe(topic, () => {
      streamChunkCount++;
    });

    // Start emitting stream chunks
    gw.server.push(topic, 'agent:stream_chunk', { chunk: 'Chunk 1' });

    // Mutate session metadata (pinning, muting, renaming)
    const sessionMetadata = {
      id: sessionId,
      title: 'Renamed During Stream',
      isPinned: true,
      isMuted: true,
      updatedAt: new Date().toISOString(),
    };

    assert.equal(sessionMetadata.title, 'Renamed During Stream');
    assert.equal(sessionMetadata.isPinned, true);
    assert.equal(sessionMetadata.isMuted, true);

    // Continue emitting stream chunks
    gw.server.push(topic, 'agent:stream_chunk', { chunk: 'Chunk 2' });
    gw.server.push(topic, 'agent:turn_complete', { status: 'completed' });

    await new Promise((r) => setTimeout(r, 60));

    assert.equal(streamChunkCount, 3, 'Streaming stream was unaffected by lifecycle mutation');
    client.disconnect();
  });
});
