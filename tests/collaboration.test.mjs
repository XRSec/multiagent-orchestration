import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { defaultRegistry } from '../src/session/agent-registry.mjs';
import { SessionManager } from '../src/session/session-manager.mjs';
import { P2PRouter, ERROR_P2P_MAX_DEPTH, P2PDepthExceededError } from '../src/collaboration/p2p.mjs';
import { RelayPipeline, RelayState } from '../src/collaboration/relay.mjs';
import { DispatchEngine } from '../src/collaboration/dispatch.mjs';

test('Agent Registry - loads required agents and role assignments', () => {
  const orchestrator = defaultRegistry.getOrchestrator();
  assert.ok(orchestrator);
  assert.equal(orchestrator.id, 'orchestrator');

  const specialists = defaultRegistry.getSpecialists();
  assert.equal(specialists.length, 3);
  const ids = specialists.map((s) => s.id).sort();
  assert.deepEqual(ids, ['coder', 'researcher', 'reviewer']);
});

test('Session Manager - timeline isolation between public group and P2P sidechannel', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessions-test-'));
  try {
    const sm = new SessionManager(tempDir);

    // Add public group event
    sm.appendTimelineEvent({
      channel: 'grp_main',
      sender: 'user',
      target: 'orchestrator',
      content: 'Public discussion message',
    });

    // Add private P2P event
    sm.appendTimelineEvent({
      channel: 'p2p_coder_researcher_task1',
      sender: 'coder',
      target: 'researcher',
      content: 'Private architecture question',
    });

    const publicEvents = sm.getPublicTimeline();
    assert.equal(publicEvents.length, 1);
    assert.equal(publicEvents[0].content, 'Public discussion message');

    // Verify P2P event was not leaked to public timeline
    assert.ok(!publicEvents.some((e) => e.channel.startsWith('p2p_')));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('P2P Protocol - strictly enforces CallDepth <= 3 recursion bound', async () => {
  const p2pRouter = new P2PRouter({ maxDepth: 3 });

  // Depth 4 should immediately throw E_P2P_MAX_DEPTH
  await assert.rejects(
    async () => {
      await p2pRouter.query({
        srcAgent: 'coder',
        targetAgent: 'researcher',
        query: 'What is the interface?',
        depth: 4,
      });
    },
    (err) => {
      assert.ok(err instanceof P2PDepthExceededError);
      assert.equal(err.code, ERROR_P2P_MAX_DEPTH);
      assert.equal(err.depth, 4);
      return true;
    }
  );
});

test('Relay Protocol - initializes FSM stages correctly', () => {
  const pipeline = new RelayPipeline({
    taskId: 'test-relay-fsm',
    pipeline: ['researcher', 'coder', 'reviewer'],
  });

  const status = pipeline.getStageStatus();
  assert.equal(status.researcher, RelayState.IDLE);
  assert.equal(status.coder, RelayState.IDLE);
  assert.equal(status.reviewer, RelayState.IDLE);
});

test('Dispatch Engine - rejects invalid or empty subtasks', async () => {
  const engine = new DispatchEngine({ taskId: 'test-dispatch-empty' });
  await assert.rejects(
    async () => {
      await engine.dispatchSubtasks([]);
    },
    /subtasks must be a non-empty array/
  );
});
