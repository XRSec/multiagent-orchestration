/**
 * Purpose: Comprehensive integration test suite for SPEC-ARCH-SESSION-REWIND-COMPACT-2026.
 * Context: Verifies Dual-ID Session Storage, Two-Phase Rewind, Tombstones, MemoryFlushController, Fork JSONL Repair, Transcript Relocation, Shadow Git Savepoints, and Queue Snapshots.
 * Usage: npx tsx test/session-lifecycle-rewind-compaction.test.ts
 * Prerequisites: Node.js 22.5+/26+ native node:sqlite.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  StorageManager,
  computeForkSourceMessagesDigest,
} from '../src/storage/StorageManager';
import {
  RuntimeEnvironment,
  safeTruncateContent,
} from '../src/storage/RuntimeEnvironment';
import {
  MemoryFlushController,
  isClaudeResumeSessionNotFound,
  relocateClaudeSessionTranscripts,
  repairForkedClaudeJsonl,
  sanitizeClaudeProjectKey,
  GitSnapshotSavepointEngine,
} from '../src/daemon/orchestrator/SessionLifecycleEngine';
import {
  AgentOrchestrator,
  parseGroupActionTag,
  resolveMentionedBotIds,
} from '../src/daemon/orchestrator/AgentOrchestrator';

async function runSuite() {
  console.log('========================================================================');
  console.log('   Session Lifecycle, Rewind, Compaction & Persistence Test Suite       ');
  console.log('========================================================================\n');

  const projectRoot = path.resolve(__dirname, '..');
  const tempRoot = path.join(projectRoot, 'sandboxes', `test-lifecycle-${Date.now()}`);
  fs.mkdirSync(tempRoot, { recursive: true });

  const storage = new StorageManager(tempRoot);
  const runtime = new RuntimeEnvironment(projectRoot, storage);
  storage.scanAndRegisterAgents(projectRoot);
  const orchestrator = new AgentOrchestrator({ storage, runtime });

  try {
    // 1. Dual-ID Session Storage & Atomic CAS Clearing
    console.log('[Test 1] Dual-ID Session Storage & compareAndClearSdkSessionId CAS...');
    const session = storage.createSession(
      'session_dual_id_01',
      'dm',
      'bot_mocode_engine_01',
      'Dual ID Test Session',
      projectRoot,
      path.join(projectRoot, 'Bots', 'moCode', 'claude_config'),
      { sdkSessionId: 'sdk-uuid-initial-111' }
    );
    assert.equal(session.id, 'session_dual_id_01');
    assert.equal(session.sdk_session_id, 'sdk-uuid-initial-111');
    assert.equal(session.status, 'active');

    // CAS mismatch should NOT clear
    const mismatchCleared = storage.compareAndClearSdkSessionId(
      'session_dual_id_01',
      'sdk-uuid-wrong-999'
    );
    assert.equal(mismatchCleared, false);
    assert.equal(storage.getSession('session_dual_id_01')?.sdk_session_id, 'sdk-uuid-initial-111');

    // CAS match MUST atomically clear to NULL
    const matchCleared = storage.compareAndClearSdkSessionId(
      'session_dual_id_01',
      'sdk-uuid-initial-111'
    );
    assert.equal(matchCleared, true);
    assert.equal(storage.getSession('session_dual_id_01')?.sdk_session_id, null);
    console.log('  ✓ PASS: Dual-ID separation and atomic CAS clearing verified.\n');

    // 2. Two-Phase Message Rewind (Soft-Delete rewind_at, Prior Assistant UUID & Cursor Clamping)
    console.log('[Test 2] Two-Phase Rewind, Prior Assistant Anchor & Group Cursor Clamping...');
    const room = storage.createRoom({
      id: 'room_rewind_test',
      slug: 'rewind-test-room',
      name: 'Rewind Test Room',
      members: ['moAdmin', 'moCode', 'MoCI'],
    });
    const roomSessionId = `session_${room.id}`;

    const m1 = storage.appendMessage(roomSessionId, 'human_user', 'user', 'Turn 1 user prompt', {
      roomId: room.id,
      clientId: 'user-uuid-1',
    });
    const m2 = storage.appendMessage(roomSessionId, 'moAdmin', 'assistant', 'Turn 1 assistant reply', {
      roomId: room.id,
      clientId: 'asst-uuid-1',
      agentMeta: { uuid: 'asst-uuid-1' },
    });
    const m3 = storage.appendMessage(roomSessionId, 'human_user', 'user', 'Turn 2 bad prompt to rewind', {
      roomId: room.id,
      clientId: 'user-uuid-2',
    });
    const m4 = storage.appendMessage(roomSessionId, 'moCode', 'assistant', 'Turn 2 assistant reply to discard', {
      roomId: room.id,
      clientId: 'asst-uuid-2',
      agentMeta: { uuid: 'asst-uuid-2' },
    });

    // Advance member cursor to m4.sequence
    storage.updateMemberCursor(room.id, 'moCode', m4.sequence);
    assert.equal(storage.getMemberCursor(room.id, 'moCode')?.last_seen_sequence, m4.sequence);

    // Mutate Blackboard state before and after m3
    const bbStore = orchestrator.getBlackboardStore();
    bbStore.mutate('moAdmin', 'PRE_REWIND_GOAL', (draft) => {
      draft.rootGoal = { objective: 'Stable Goal v1', invariants: ['Keep WAL'], locked: true };
      return 'Set goal v1';
    });

    // Preview Rewind at m3 (user-uuid-2)
    const preview = await orchestrator.previewRewind(roomSessionId, 'user-uuid-2');
    assert.equal(preview.canRewind, true);
    assert.equal(preview.targetMessageId, m3.id);
    assert.equal(preview.priorAssistantUuid, 'asst-uuid-1');

    // Commit Rewind at m3
    const commitRes = await orchestrator.commitRewind(roomSessionId, 'user-uuid-2', {
      stopIfRunning: true,
    });
    assert.equal(commitRes.rewoundMessageCount, 2, 'm3 and m4 must be soft-rewound');
    assert.equal(commitRes.priorAssistantUuid, 'asst-uuid-1');
    assert.equal(commitRes.generation, 1);

    // Visible messages should only contain m1 and m2
    const visibleAfterRewind = storage.getVisibleSessionMessages(roomSessionId);
    assert.equal(visibleAfterRewind.length, 2);
    assert.equal(visibleAfterRewind[0].id, m1.id);
    assert.equal(visibleAfterRewind[1].id, m2.id);

    // Audit rows in SQLite must still exist with rewind_at != null (never physically deleted)
    const rewoundRow = storage.getMessageByIdOrClientId(roomSessionId, m3.id);
    assert.ok(rewoundRow && rewoundRow.rewind_at !== null, 'Rewound message must retain audit row with rewind_at');

    // Member cursor must be clamped back to m3.sequence - 1 (which equals m2.sequence)
    assert.equal(
      storage.getMemberCursor(room.id, 'moCode')?.last_seen_sequence,
      m2.sequence,
      'Group member cursor must be clamped on rewind'
    );
    console.log('  ✓ PASS: Two-phase rewind, soft-delete audit preservation, and cursor clamping verified.\n');

    // 3. Message Tombstone & Context Rebuild Handoff
    console.log('[Test 3] Message Tombstone & Context Rebuild Handoff...');
    const tombRes = storage.tombstoneMessage(roomSessionId, m2.id);
    assert.equal(tombRes.tombstonedId, m2.id);
    assert.ok(tombRes.handoffText.includes('<conversation-handoff'));
    assert.ok(tombRes.handoffText.includes('Turn 1 user prompt'));
    assert.ok(!tombRes.handoffText.includes('Turn 1 assistant reply'));

    const consumedHandoff = storage.consumePendingContextRebuildHandoff(roomSessionId);
    assert.equal(consumedHandoff, tombRes.handoffText);
    assert.equal(storage.consumePendingContextRebuildHandoff(roomSessionId), null, 'Handoff must be consumed once');
    console.log('  ✓ PASS: Tombstone conversion and one-shot context_rebuild handoff verified.\n');

    // 4. Session Forking & Digest Verification
    console.log('[Test 4] Session Forking & SHA-256 Digest Verification...');
    const m5 = storage.appendMessage(roomSessionId, 'moAdmin', 'assistant', 'New branch reply', {
      roomId: room.id,
      clientId: 'asst-uuid-5',
    });
    const forkRes = storage.forkSessionAtMessage(
      roomSessionId,
      'session_forked_child_01',
      m5.id,
      'Forked Engineering Branch'
    );
    assert.equal(forkRes.session.parent_session_id, roomSessionId);
    assert.equal(forkRes.session.forked_at_message_id, m5.id);
    assert.equal(forkRes.copiedMessages, 2); // m1 and m5 (m2 is tombstone, m3/m4 rewound)
    assert.equal(forkRes.sourceDigest.length, 64);
    console.log('  ✓ PASS: Session forking and SHA-256 source digest verified.\n');

    // 5. MemoryFlushController Multi-Threshold Watermarks & Compact Boundary Reset
    console.log('[Test 5] MemoryFlushController Watermarks [0.70, 0.85, 0.92] & Boundary Reset...');
    const firedEvents: number[] = [];
    const flushCtrl = new MemoryFlushController({
      onThresholdCrossed: (ev) => firedEvents.push(ev.threshold),
    });

    flushCtrl.onUsageUpdate(100_000, 200_000); // 0.50 -> none
    assert.deepEqual(flushCtrl.getFiredThresholds(), []);

    flushCtrl.onUsageUpdate(150_000, 200_000); // 0.75 -> fires 0.70
    assert.deepEqual(flushCtrl.getFiredThresholds(), [0.7]);

    flushCtrl.onUsageUpdate(155_000, 200_000); // 0.775 -> does NOT duplicate 0.70
    assert.equal(firedEvents.length, 1);

    flushCtrl.onUsageUpdate(190_000, 200_000); // 0.95 -> fires 0.85 and 0.92
    assert.deepEqual(flushCtrl.getFiredThresholds(), [0.7, 0.85, 0.92]);

    const resetPrev = flushCtrl.onCompactBoundary();
    assert.deepEqual(resetPrev, [0.7, 0.85, 0.92]);
    assert.deepEqual(flushCtrl.getFiredThresholds(), [], 'Thresholds must reset after compact_boundary');
    console.log('  ✓ PASS: MemoryFlushController watermarks and compact_boundary reset verified.\n');

    // 6. Invalid Resume Classifier, Copy-on-Relocate & Fork JSONL Repair
    console.log('[Test 6] Invalid-Resume Classifier, Transcript Relocation & Fork JSONL Repair...');
    assert.equal(
      isClaudeResumeSessionNotFound(
        new Error('No conversation found with session ID: 123e4567-e89b-12d3-a456-426614174000.'),
        '123e4567-e89b-12d3-a456-426614174000'
      ),
      true
    );
    assert.equal(
      isClaudeResumeSessionNotFound(
        new Error('No conversation found with session ID: other-id'),
        '123e4567-e89b-12d3-a456-426614174000'
      ),
      false
    );
    assert.equal(
      isClaudeResumeSessionNotFound(new Error('HTTP 404 Not Found'), '123e4567-e89b-12d3-a456-426614174000'),
      false
    );

    // Test Copy-On-Relocate & Fork JSONL Repair
    const fakeConfigDir = path.join(tempRoot, 'claude_config_test');
    const oldWorkDir = path.join(tempRoot, 'old_proj');
    const newWorkDir = path.join(tempRoot, 'new_proj');
    const oldKeyDir = path.join(fakeConfigDir, 'projects', sanitizeClaudeProjectKey(oldWorkDir));
    fs.mkdirSync(oldKeyDir, { recursive: true });

    const testSdkId = '11111111-2222-3333-4444-555555555555';
    const oldUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const newUuid = '99999999-8888-7777-6666-555555555555';
    const danglingUuid = '00000000-0000-0000-0000-000000000000';

    const sampleJsonl = [
      JSON.stringify({ type: 'user', uuid: newUuid, originalUuid: oldUuid, content: 'hello' }),
      JSON.stringify({
        type: 'system',
        subtype: 'compact_boundary',
        uuid: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
        compactMetadata: {
          preservedSegment: {
            startUuid: oldUuid,
            endUuid: newUuid,
          },
        },
      }),
      JSON.stringify({
        type: 'system',
        subtype: 'compact_boundary',
        uuid: 'cccccccc-dddd-eeee-ffff-000000000000',
        compactMetadata: {
          preservedSegment: {
            startUuid: danglingUuid,
            endUuid: newUuid,
          },
        },
      }),
    ].join('\n');

    const srcJsonlPath = path.join(oldKeyDir, `${testSdkId}.jsonl`);
    fs.writeFileSync(srcJsonlPath, sampleJsonl, 'utf-8');

    const reloc = relocateClaudeSessionTranscripts({
      sdkSessionIds: [testSdkId],
      oldWorkingDir: oldWorkDir,
      newWorkingDir: newWorkDir,
      claudeConfigDir: fakeConfigDir,
    });
    assert.deepEqual(reloc.copied, [testSdkId]);
    assert.ok(fs.existsSync(srcJsonlPath), 'Source transcript must be preserved (copy, never move)');

    const dstJsonlPath = path.join(
      fakeConfigDir,
      'projects',
      sanitizeClaudeProjectKey(newWorkDir),
      `${testSdkId}.jsonl`
    );
    const repairRes = repairForkedClaudeJsonl(dstJsonlPath);
    assert.equal(repairRes.changed, true);
    assert.equal(repairRes.compactBoundaryCount, 2);
    assert.equal(repairRes.remappedUuidCount, 1);

    const repairedLines = fs
      .readFileSync(dstJsonlPath, 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    assert.equal(
      repairedLines[1].compactMetadata.preservedSegment.startUuid,
      newUuid,
      'Old UUID must be remapped to new forked UUID'
    );
    assert.equal(
      repairedLines[2].compactMetadata.preservedSegment,
      undefined,
      'Dangling preservedSegment reference must be stripped'
    );
    console.log('  ✓ PASS: Invalid-resume classifier, Copy-on-Relocate, and Fork JSONL repair verified.\n');

    // 7. Crash-Safe Input Queue Snapshots (16 MiB Guard & Base64 Stripping) & Interrupted Turn Detection
    console.log('[Test 7] Input Queue Snapshots & Interrupted Turn Detection...');
    storage.saveInputQueueSnapshot('session_dual_id_01', [
      {
        clientId: 'q-1',
        content: 'Follow-up task while busy',
        enqueuedAt: Date.now(),
        files: [{ name: 'clip.png', path: '/tmp/clip.png', base64: 'iVBORw0KGgoAAAANSUhEUg==' }],
      },
    ]);
    const loadedQueue = storage.loadInputQueueSnapshot('session_dual_id_01');
    assert.equal(loadedQueue.length, 1);
    assert.equal(loadedQueue[0].content, 'Follow-up task while busy');

    // Mark turn started without ending -> should appear in listInterruptedSessions()
    storage.markTurnStarted('session_dual_id_01', 2000);
    const interrupted = storage.listInterruptedSessions();
    assert.ok(interrupted.some((s) => s.id === 'session_dual_id_01'));

    // Mark turn ended -> no longer interrupted
    storage.markTurnEnded('session_dual_id_01', 3000);
    assert.ok(!storage.listInterruptedSessions().some((s) => s.id === 'session_dual_id_01'));
    console.log('  ✓ PASS: Crash-safe input queue snapshots and interrupted turn watermarks verified.\n');

    // 8. Shadow Git Savepoint Engine & Peer Overlap Detection
    console.log('[Test 8] Shadow Git Savepoint Engine (refs/cindy/savepoints/<sessionId>)...');
    const dummyRepo = path.join(tempRoot, 'dummy_git_repo');
    fs.mkdirSync(dummyRepo, { recursive: true });
    execFileSync('git', ['init'], { cwd: dummyRepo });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dummyRepo });
    execFileSync('git', ['config', 'user.name', 'Test Runner'], { cwd: dummyRepo });
    fs.writeFileSync(path.join(dummyRepo, 'hello.txt'), 'v1 content\n', 'utf-8');

    const spEngine = new GitSnapshotSavepointEngine();
    const t1 = spEngine.beginTurnOnRepo(dummyRepo, 'sess_A');
    assert.equal(t1.overlappedWithPeer, false);
    const t2 = spEngine.beginTurnOnRepo(dummyRepo, 'sess_B');
    assert.equal(t2.overlappedWithPeer, true, 'Concurrent session on same repo must flag overlap');
    spEngine.endTurnOnRepo(dummyRepo, 'sess_A');
    spEngine.endTurnOnRepo(dummyRepo, 'sess_B');

    const sp = spEngine.captureShadowSavepoint(dummyRepo, 'sess_A', 'msg_anchor_1', 'before-edit');
    assert.ok(sp.commitSha && sp.commitSha.length >= 40, 'Must create shadow savepoint commit SHA');
    assert.equal(spEngine.readSavepointTip(dummyRepo, 'sess_A'), sp.commitSha);
    console.log('  ✓ PASS: Shadow Git Savepoint created under hidden ref without polluting working tree.\n');

    // 9. Context Delta Injection (<untrusted-json-block>) & Emoji-Safe Truncation
    console.log('[Test 9] Peer Delta Context Injection & Surrogate-Safe Truncation...');
    const emojiStr = 'A'.repeat(599) + '🚀' + 'B'.repeat(20);
    const truncated = safeTruncateContent(emojiStr, 600);
    assert.ok(truncated.endsWith('🚀…'), 'Must not split 4-byte emoji surrogate pair');

    const assembledPrompt = runtime.assembleContextPrompt('moCode', room.id, [
      { id: 'm1', role: 'user', sender: 'human_user', content: 'Please review storage engine' },
    ]);
    assert.ok(
      assembledPrompt.includes('<untrusted-json-block>'),
      'Peer delta messages must be injected inside <untrusted-json-block>'
    );
    assert.ok(assembledPrompt.includes('Please review storage engine'));

    // Group action & mention parsing
    const actionTag = parseGroupActionTag(
      '<group-Action type="collaborate">@moCode @MoCI</group-Action>'
    );
    assert.equal(actionTag?.action, 'collaborate');
    assert.deepEqual(actionTag?.targets, ['moCode', 'MoCI']);
    assert.equal(
      resolveMentionedBotIds('你好 @MoCI 请跑一下测试', storage),
      'bot_moci_sentinel_07'
    );
    console.log('  ✓ PASS: Delta injection, emoji-safe truncation, and @mention/<group-Action> routing verified.\n');

    console.log('========================================================================');
    console.log('   ALL 9 LIFECYCLE, REWIND & COMPACTION CHECKPOINTS PASSED!             ');
    console.log('========================================================================');
  } finally {
    storage.close();
    orchestrator.getBlackboardStore().close();
    try {
      execFileSync('/opt/xrsec/.env/rmfile', [tempRoot]);
    } catch {}
  }
}

runSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
