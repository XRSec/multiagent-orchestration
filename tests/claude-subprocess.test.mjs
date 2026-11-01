import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveClaudeBinary, executeClaudeSubprocess } from '../src/core/claude-subprocess.mjs';

test('Claude Subprocess - binary resolution', () => {
  const binary = resolveClaudeBinary();
  assert.ok(binary);
  assert.equal(typeof binary, 'string');
});

test('Claude Subprocess - rejects empty prompt', async () => {
  await assert.rejects(
    async () => {
      await executeClaudeSubprocess({ prompt: '' });
    },
    /prompt must be a non-empty string/
  );
});

test('Claude Subprocess - handles timeout gracefully', async () => {
  // Use a 1ms timeout to verify process killing and status response
  const result = await executeClaudeSubprocess({
    prompt: 'Count to 100000000',
    timeoutMs: 1,
  });

  assert.equal(typeof result, 'object');
  assert.equal(result.timedOut, true);
  assert.equal(result.success, false);
});
