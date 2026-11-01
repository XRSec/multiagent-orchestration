import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMapEnvelope,
  formatMapEnvelope,
  validateMapPacket,
  MapProtocolValidationError,
} from '../src/core/map-parser.mjs';

test('MAP Parser - extracts valid RELAY envelope and strips delimiters', () => {
  const raw = `Here is my initial analysis.

<!-- CINDY_MAP:BEGIN -->
{
  "version": "1.0.0",
  "action": "RELAY",
  "sender": "researcher",
  "target": "coder",
  "task_id": "123e4567-e89b-12d3-a456-426614174000",
  "payload": {
    "summary": "Completed architecture review",
    "artifacts": ["docs/architecture.md"],
    "next_instructions": "Implement the state machine."
  }
}
<!-- CINDY_MAP:END -->

End of turn.`;

  const parsed = parseMapEnvelope(raw);
  assert.equal(parsed.hasMap, true);
  assert.equal(parsed.packet.action, 'RELAY');
  assert.equal(parsed.packet.sender, 'researcher');
  assert.equal(parsed.packet.target, 'coder');
  assert.equal(parsed.packet.payload.summary, 'Completed architecture review');
  assert.deepEqual(parsed.packet.payload.artifacts, ['docs/architecture.md']);

  // Stripped text should not contain CINDY_MAP tags
  assert.match(parsed.cleanText, /Here is my initial analysis\./);
  assert.match(parsed.cleanText, /End of turn\./);
  assert.doesNotMatch(parsed.cleanText, /<!-- CINDY_MAP/);
});

test('MAP Parser - generates default COMPLETE packet when no envelope is present', () => {
  const raw = 'Just a standard textual response without any protocol tags.';
  const parsed = parseMapEnvelope(raw, {
    sender: 'coder',
    target: 'reviewer',
    taskId: 'task-999',
  });

  assert.equal(parsed.hasMap, false);
  assert.equal(parsed.cleanText, raw);
  assert.equal(parsed.packet.action, 'COMPLETE');
  assert.equal(parsed.packet.sender, 'coder');
  assert.equal(parsed.packet.target, 'reviewer');
  assert.equal(parsed.packet.task_id, 'task-999');
  assert.equal(parsed.packet.payload.summary, raw);
});

test('MAP Parser - enforces DISPATCH subtasks schema validation', () => {
  const invalidDispatch = {
    version: '1.0.0',
    action: 'DISPATCH',
    sender: 'orchestrator',
    target: 'ALL',
    task_id: 'task-1',
    payload: {
      summary: 'Fan out',
      subtasks: [], // Empty subtasks not allowed for DISPATCH
    },
  };

  assert.throws(
    () => validateMapPacket(invalidDispatch),
    (err) => err instanceof MapProtocolValidationError && err.message.includes('subtasks')
  );
});

test('MAP Parser - enforces P2P_QUERY schema validation', () => {
  const invalidP2p = {
    version: '1.0.0',
    action: 'P2P_QUERY',
    sender: 'coder',
    target: 'researcher',
    task_id: 'task-1',
    payload: {
      summary: 'Query',
      // missing payload.p2p_query
    },
  };

  assert.throws(
    () => validateMapPacket(invalidP2p),
    (err) => err instanceof MapProtocolValidationError && err.message.includes('p2p_query')
  );
});

test('MAP Parser - formatMapEnvelope generates valid parseable block', () => {
  const packet = {
    version: '1.0.0',
    action: 'COMPLETE',
    sender: 'reviewer',
    target: 'orchestrator',
    task_id: 't-123',
    payload: {
      summary: 'All checks passed',
      artifacts: ['tests/index.test.mjs'],
    },
  };

  const formatted = formatMapEnvelope(packet);
  const reParsed = parseMapEnvelope(formatted);

  assert.equal(reParsed.hasMap, true);
  assert.deepEqual(reParsed.packet, packet);
});
