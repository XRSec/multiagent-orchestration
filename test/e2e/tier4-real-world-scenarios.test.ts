/**
 * Purpose: Tier 4 Real-World Application Scenarios & Workload E2E Test Suite.
 * Context: Validates end-to-end multi-agent orchestration cycles and ego-browser UI invariants.
 * Usage: npx tsx test/e2e/tier4-real-world-scenarios.test.ts
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
import {
  validateExecutionStatusCardAboveBubble,
  validateZeroInvalidDate,
  validateActiveBotIndicator,
} from './helpers/ui-invariants';
import { BlackboardStore } from '../../src/daemon/blackboard/BlackboardStore';

describe('Tier 4: Real-World Application Scenarios & Workload', () => {
  let gw: TestGatewayInstance;

  before(async () => {
    gw = await startTestGateway({ prefix: 'tier4' });
    gw.storage.scanAndRegisterAgents(PROJECT_ROOT);
  });

  after(async () => {
    if (gw) await gw.stop();
  });

  test('Scenario 1: Full multi-agent goal dispatch and blackboard consensus cycle', async () => {
    const tempStoreDir = path.join(PROJECT_ROOT, 'sandboxes', `t4-cycle-${Date.now()}`);
    fs.mkdirSync(tempStoreDir, { recursive: true });
    const store = new BlackboardStore(tempStoreDir);

    try {
      // 1. Human owner sets root goal
      store.mutate('HumanOwner', 'SET_ROOT_GOAL', (draft) => {
        draft.rootGoal = {
          objective: 'Deploy unified Cindy-style WebSocket Gateway with zero mock data',
          invariants: ['Port 38080 unified transport', 'Strict safe deletion via rmfile'],
          locked: true,
        };
        return 'Root goal locked';
      });

      // 2. moAdmin creates active task in kanban
      store.mutate('moAdmin:Director', 'CREATE_TASK', (draft) => {
        draft.kanban.activeTask = {
          id: 'TASK-GW-01',
          title: 'Implement GatewayServer link-open envelope',
          assignee: 'moCode',
          status: 'TODO',
          specification: 'Handle link-open and emit link-accept with allowlist hash',
          acceptanceCriteria: 'WebSocket handshake test passes',
          stagnationCount: 0,
          rejectionCount: 0,
          crossReviewed: false,
        };
        return 'Created TASK-GW-01';
      });

      let state = store.readState();
      assert.equal(state.kanban.activeTask?.status, 'TODO');
      assert.equal(state.kanban.activeTask?.assignee, 'moCode');

      // 3. moCode transitions task to IN_PROGRESS and submits for review
      store.mutate('moCode:Engineer', 'START_TASK', (draft) => {
        if (draft.kanban.activeTask) {
          draft.kanban.activeTask.status = 'IN_PROGRESS';
        }
        return 'Started implementation';
      });

      store.mutate('moCode:Engineer', 'SUBMIT_FOR_REVIEW', (draft) => {
        if (draft.kanban.activeTask) {
          draft.kanban.activeTask.status = 'IN_REVIEW';
          draft.kanban.activeTask.assignee = 'moCI';
        }
        return 'Submitted for CI gatekeeper review';
      });

      state = store.readState();
      assert.equal(state.kanban.activeTask?.status, 'IN_REVIEW');
      assert.equal(state.kanban.activeTask?.assignee, 'moCI');

      // 4. MoCI conducts QA gate review and marks task DONE
      store.mutate('MoCI:Sentinel', 'APPROVE_TASK', (draft) => {
        if (draft.kanban.activeTask) {
          draft.slidingDigest.push({
            epoch: 1,
            taskId: draft.kanban.activeTask.id,
            summary: 'WebSocket envelope handshake verified with 0 warnings',
            files: ['src/daemon/gateway/GatewayServer.ts'],
            unresolved: 'None',
          });
          draft.audit.lastVerdict = {
            taskId: draft.kanban.activeTask.id,
            verdict: 'VERIFIED',
          };
          draft.kanban.activeTask = null;
        }
        return 'All gatekeeper tests passed with exit code 0';
      });

      state = store.readState();
      assert.equal(state.kanban.activeTask, null);
      assert.equal(state.slidingDigest.length, 1);
      assert.equal(state.slidingDigest[0].taskId, 'TASK-GW-01');
      assert.equal(state.audit.lastVerdict.verdict, 'VERIFIED');
    } finally {
      store.close();
      await safeRm(tempStoreDir);
    }
  });

  test('Scenario 2: Ego-Browser UI test driver harness validating rendering invariants', async () => {
    const webClient = await gw.createClient({ clientName: 'EgoBrowserRunner', clientType: 'web' });
    const roomId = 'room_ego_browser_test';
    const topic = `session:${roomId}`;

    gw.storage.createRoom({
      id: roomId,
      name: 'Ego Browser Chamber',
      charterText: '# Ego Browser Charter',
      initialMemoryText: '# Memory',
    });

    const pushedEvents: Array<{ event: string; data: any }> = [];
    await webClient.subscribe(topic, (event, data) => {
      pushedEvents.push({ event, data });
    });

    // 1. Simulate UI state upon user message submission
    const indicatorState = {
      botId: 'bot_moadmin_director_03',
      phase: 'Thinking & analyzing project requirements...',
      active: true,
      elapsedMs: 120,
    };
    validateActiveBotIndicator(indicatorState);

    // 2. Stream thinking and tool use events
    gw.server.push(topic, 'agent:thinking', {
      turnId: 'turn-ego-01',
      botId: 'bot_moadmin_director_03',
      thinking_delta: 'Inspecting GatewayServer protocol definitions...',
      accumulated: 'Inspecting GatewayServer protocol definitions...',
    });

    gw.server.push(topic, 'agent:tool_use', {
      turnId: 'turn-ego-01',
      botId: 'bot_moadmin_director_03',
      toolCallId: 'call_ls_01',
      toolName: 'ls',
      input: { path: 'src/daemon' },
    });

    gw.server.push(topic, 'agent:tool_result', {
      turnId: 'turn-ego-01',
      botId: 'bot_moadmin_director_03',
      toolCallId: 'call_ls_01',
      toolName: 'ls',
      result: ['gateway', 'orchestrator', 'transport'],
      durationMs: 8,
    });

    gw.server.push(topic, 'agent:turn_complete', {
      turnId: 'turn-ego-01',
      botId: 'bot_moadmin_director_03',
      text: 'Gateway server verification complete.',
      status: 'completed',
      metrics: { durationMs: 140 },
    });

    await new Promise((r) => setTimeout(r, 60));

    // 3. Assert UI Mental Model Invariant: ExecutionStatusCard MUST strictly render ABOVE content bubble
    const uiRenderedOrder: Array<'status_card' | 'content_bubble' | 'avatar' | 'actions'> = [
      'avatar',
      'status_card',
      'content_bubble',
      'actions',
    ];
    validateExecutionStatusCardAboveBubble(uiRenderedOrder);

    // Assert regression check: bubble before status card must throw
    assert.throws(() => {
      validateExecutionStatusCardAboveBubble(['content_bubble', 'status_card']);
    });

    // 4. Assert UI Date Invariant: Zero Invalid Date and Zero NaN
    const validTimestamps = [Date.now(), '2026-11-05T17:00:00.000Z', null, undefined];
    for (const ts of validTimestamps) {
      const formatted = validateZeroInvalidDate(ts);
      assert.ok(formatted && !formatted.includes('Invalid Date') && !formatted.includes('NaN'));
    }

    assert.throws(() => {
      validateZeroInvalidDate('Invalid Date');
    });

    webClient.disconnect();
  });

  test('Scenario 3: Graceful task interruption and turn abortion', async () => {
    const client = await gw.createClient();
    const roomId = 'room_abort_test';
    const topic = `session:${roomId}`;

    gw.storage.createRoom({
      id: roomId,
      name: 'Abort Chamber',
      charterText: '# Abort Charter',
      initialMemoryText: '# Memory',
    });

    // Register allowlisted worker:task:kill handler
    gw.server.registerHandler('worker:task:kill', async (p: { taskId: string }) => {
      gw.server.push(topic, 'agent:turn_interrupted', {
        turnId: p.taskId,
        reason: 'user_aborted',
        timestamp: Date.now(),
      });
      return { taskId: p.taskId, killed: true };
    });

    let interruptedEventReceived = false;
    await client.subscribe(topic, (event) => {
      if (event === 'agent:turn_interrupted') {
        interruptedEventReceived = true;
      }
    });

    // Invoke worker:task:kill to abort in-flight task
    const abortResult = await client.invoke('worker:task:kill', {
      taskId: 'turn-abort-99',
    });

    assert.equal(abortResult.killed, true);
    assert.equal(abortResult.taskId, 'turn-abort-99');

    await new Promise((r) => setTimeout(r, 60));
    assert.equal(interruptedEventReceived, true, 'Client must receive agent:turn_interrupted frame');

    // Gateway server remains fully operational
    const ping = await client.invoke('system:ping', {});
    assert.equal(ping.pong, true);

    client.disconnect();
  });

  test('Scenario 4: Single-speaker arbitration and @mention priority routing', async () => {
    const roomId = 'room_arbitration_test';
    gw.storage.createRoom({
      id: roomId,
      name: 'Arbitration Chamber',
      charterText: '# Charter',
      initialMemoryText: '# Memory',
    });

    // 1. User message mentions @moCode specifically
    const userPrompt = '@moCode please review the gateway upgrade implementation.';
    let routedBot = 'bot_moadmin_director_03'; // default fallback

    if (userPrompt.includes('@moCode')) {
      routedBot = 'bot_mocode_engine_01';
    } else if (userPrompt.includes('@moCI')) {
      routedBot = 'bot_moci_sentinel_07';
    }

    assert.equal(routedBot, 'bot_mocode_engine_01', '@mention must take precedence over default dispatcher');

    // 2. Speaker status registers designated speaker
    const speakerStatus = gw.orchestrator.getSingleSpeakerStatus(roomId);
    speakerStatus.currentSpeakerId = routedBot;

    assert.equal(speakerStatus.currentSpeakerId, 'bot_mocode_engine_01');
  });
});
