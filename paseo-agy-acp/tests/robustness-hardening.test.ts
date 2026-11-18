import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { connectAcp, sanitizeAcpStderrExcerpt } from '../server/transport.ts'
import {
  ERROR_STEP_TYPE,
  getFileIdentity,
  inspectConversationError,
  readLastStepIndexFromDb,
  sameFile,
} from '../server/error-inspection.ts'
import { queueTurnJournalOp } from '../server/turn-journal.ts'
import { removeSessionArtifacts } from '../server/preflight.ts'
import {
  captureTurnFileCheckpoint,
  GIT_TIMEOUT_MS,
  setGitTimeoutMs,
} from '../server/checkpoints.ts'
import { revertSession } from '../server/revert.ts'
import {
  runLoadSessionWithReplayIdle,
  SessionManager,
} from '../server/session.ts'
import { SubagentRegistry } from '../server/subagents.ts'
import type { BrainWatchHandle } from '../server/brain.ts'
import { watchBrain } from '../server/brain.ts'
import { TranscriptReader } from '../server/brain-io.ts'
import { AgyUsageSource } from '../server/usage.ts'
import { removeDir } from './helpers/cleanup.ts'

const execFileAsync = promisify(execFile)

// --- AC-1 & AC-8: sanitizeAcpStderrExcerpt ---
test('AC-1 & AC-8: sanitizeAcpStderrExcerpt redacts credentials, URLs and home paths', () => {
  const fakeHome = '/Users/fakeuser'
  const rawStderr = [
    'Login at: https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=123.apps.googleusercontent.com',
    'Pair device: https://example.com/pair#secret12345 or /pair#direct999',
    'Authorization: Bearer ya29.a0AfH6SMDIu1234567890abcdef',
    'Proxy: Basic dXNlcjpwYXNzd29yZA==',
    'Headers: x-api-key: my_secret_api_key_value_123',
    'File error in /Users/fakeuser/project/file.ts',
  ].join('\n')

  const sanitized = sanitizeAcpStderrExcerpt(rawStderr, fakeHome)
  assert.doesNotMatch(sanitized, /accounts\.google\.com/)
  assert.doesNotMatch(sanitized, /secret12345/)
  assert.doesNotMatch(sanitized, /direct999/)
  assert.doesNotMatch(sanitized, /ya29\.a0AfH6SMDIu/)
  assert.doesNotMatch(sanitized, /dXNlcjpwYXNzd29yZA==/)
  assert.doesNotMatch(sanitized, /my_secret_api_key_value_123/)
  assert.doesNotMatch(sanitized, /\/Users\/fakeuser/)
  assert.match(sanitized, /\[REDACTED_AUTH_URL\]/)
  assert.match(sanitized, /\[REDACTED_PAIR_URL\]/)
  assert.match(sanitized, /Bearer \[REDACTED_TOKEN\]/)
  assert.match(sanitized, /Basic \[REDACTED_TOKEN\]/)
  assert.match(sanitized, /x-api-key: \[REDACTED_KEY\]/)
  assert.match(sanitized, /\$HOME\/project\/file\.ts/)
})

// --- AC-1: transport TransformStream resilience on writer.write failure ---
test('AC-1: invalid session/request_permission with broken stdin does not abort readable stream', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agy-ac1-perm-'))
  try {
    const receivedUpdates: unknown[] = []
    const childScript = `
      // Destroy stdin immediately so any write from parent fails
      process.stdin.destroy();
      // Send an invalid session/request_permission (fails RequestPermissionRequestSchema)
      const invalidPerm = JSON.stringify({
        jsonrpc: '2.0',
        id: 99,
        method: 'session/request_permission',
        params: { unknownField: true }
      });
      process.stdout.write(invalidPerm + '\\n');
      // Wait slightly then send a valid sessionUpdate notification that must pass through
      setTimeout(() => {
        const update = JSON.stringify({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 'test-sess',
            update: {
              sessionUpdate: 'agent_thought_chunk',
              content: { type: 'text', text: 'ok' }
            }
          }
        });
        process.stdout.write(update + '\\n');
      }, 50);
      setTimeout(() => process.exit(0), 150);
    `

    const transport = connectAcp(
      {
        command: process.execPath,
        args: ['-e', childScript],
        env: { HOME: home, PATH: process.env.PATH ?? '' },
      },
      home,
      {},
      {
        sessionUpdate: async (params) => {
          receivedUpdates.push(params)
        },
        requestPermission: async () => ({
          outcome: { outcome: 'cancelled' },
        }),
      },
      () => {},
    )

    // Wait for the child to send the messages and exit
    await delay(300)
    await transport.close().catch(() => undefined)

    // The sessionUpdate notification must have arrived despite writer.write failing on broken stdin
    assert.equal(receivedUpdates.length, 1)
    assert.equal(
      (receivedUpdates[0] as { sessionId: string }).sessionId,
      'test-sess',
    )
  } finally {
    await removeDir(home)
  }
})

// --- AC-2: doRelaunch deadline timeout resilience & disposable close artifact cleanup ---
test('AC-2: doRelaunch catches termination deadline timeout without failing session, and disposable close cleans artifacts', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agy-ac2-test-'))
  const appData = join(home, '.gemini', 'antigravity-cli')
  const manager = new SessionManager({
    launch: {
      command: process.execPath,
      args: [fileURLToPath(new URL('./mock-acp.ts', import.meta.url))],
      env: { HOME: home, PATH: process.env.PATH ?? '' },
    },
    usage: new AgyUsageSource(),
    capabilities: ['prompt.message'],
    emit() {},
  })

  try {
    const session = await manager.start('test-ac2-session', home, {
      cwd: home,
      env: { HOME: home },
      model: 'default',
      mcpServers: {},
      settings: {},
      persist: false,
    })
    session.state.metadata = await session.transport.request(
      session.transport.rpc.newSession({ cwd: home, mcpServers: [] }),
    )
    session.state.nativeId = session.state.metadata.sessionId

    // Part 1: doRelaunch() catching TERMINATION_DEADLINE_MS timeout does NOT mark state.failed = true
    // Simulate transport.close() timing out with termination deadline error
    const origClose1 = session.transport.close
    session.transport.close = async () => {
      void origClose1.call(session.transport).catch(() => undefined)
      throw new Error('agy did not exit after termination (pid: 99999)')
    }
    // Relaunch the session
    await session.relaunch(false, true)
    assert.equal(
      session.state.failed,
      false,
      'session must not be marked failed on close deadline timeout',
    )

    // Part 2: disposable session.close() still runs removeSessionArtifacts() when transport.close() times out
    const convDir = join(appData, 'conversations')
    mkdirSync(convDir, { recursive: true })
    const dbFile = join(convDir, `${session.state.nativeId}.db`)
    writeFileSync(dbFile, 'disposable-db-content')
    assert.equal(existsSync(dbFile), true)

    // Override current transport close to simulate deadline timeout
    const origClose2 = session.transport.close
    session.transport.close = async () => {
      void origClose2.call(session.transport).catch(() => undefined)
      throw new Error('agy did not exit after termination (pid: 99999)')
    }

    try {
      await session.close()
      assert.equal(
        existsSync(dbFile),
        false,
        'removeSessionArtifacts must run even if transport.close times out',
      )
    } finally {
      session.transport.close = origClose2
    }
  } finally {
    manager.close()
    await removeDir(home)
  }
})

// --- AC-3: SubagentRegistry.closeAll() drain ---
test('AC-3: SubagentRegistry.closeAll() awaits in-flight child drain', async () => {
  let drained = false
  const emittedEvents: unknown[] = []
  const registry = new SubagentRegistry({
    sessionId: 'parent-1',
    cwd: process.cwd(),
    brainRoot: '/tmp/brain',
    capabilities: [],
    emit: (event) => emittedEvents.push(event),
    getNativeId: () => 'parent-1',
    isParentTurnActive: () => false,
    isLoading: () => false,
    isUnavailable: () => false,
  })

  let resolveDrain!: () => void
  const drainPromise = new Promise<void>((resolve) => {
    resolveDrain = resolve
  })

  const mockHandle = Object.assign(() => {}, {
    ready: Promise.resolve(),
    isRunning: () => true,
    isStopped: () => false,
    isStopping: () => false,
    resumePoint: () => ({ afterStep: 0, turnSeq: 1 }),
    cancel: async () => {},
    drain: async () => {
      await drainPromise
      drained = true
    },
  }) as unknown as BrainWatchHandle

  // Access private children map for test wiring
  ;(
    registry as unknown as { children: Map<string, BrainWatchHandle> }
  ).children.set('parent-1:child:child-1', mockHandle)

  let closeSettled = false
  const closePromise = registry.closeAll().then(() => {
    closeSettled = true
  })

  // Has not settled yet because drain is still in flight
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(closeSettled, false)
  assert.equal(drained, false)

  // Resolve drain
  resolveDrain()
  await closePromise
  assert.equal(closeSettled, true)
  assert.equal(drained, true)
})

// --- AC-4: permission and question host-side timeouts ---
test('AC-4: askUserQuestion and requestPermission expire cleanly on permissionTimeoutMs', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agy-timeout-test-'))
  const events: unknown[] = []
  const usage = new AgyUsageSource()
  const manager = new SessionManager({
    usage,
    capabilities: ['prompt'],
    emit: (e) => events.push(e),
    permissionTimeoutMs: 50,
  })

  try {
    // Open a mock session with permissionTimeoutMs: 50
    // Test askUserQuestion timeout
    const session = await manager.start('test-perm-timeout-sess', home, {
      cwd: home,
      env: {},
      model: 'default',
      mcpServers: {},
      settings: {},
      persist: false,
    })
    session.state.nativeId = '00000000-0000-4000-8000-000000000010'
    session.state.turn = 'turn-1'
    session.state.opened = true

    const q = session.askUserQuestion(
      [
        {
          id: 'q1',
          header: 'Confirm',
          question: 'Proceed?',
          options: [{ id: 'yes', label: 'Yes' }],
          multiSelect: false,
          allowOther: false,
        },
      ],
      'Confirm',
    )
    assert.ok(q !== null)
    assert.equal(session.permissions.size, 1)

    // Wait for permissionTimeoutMs (50ms) to fire
    const res = await q.promise
    assert.equal(res, null)
    assert.equal(session.permissions.size, 0)

    // Verify session.permission_resolved was emitted
    const resolvedEvent = events.find(
      (e) => (e as { type: string }).type === 'session.permission_resolved',
    )
    assert.ok(resolvedEvent !== undefined)

    await session.close()
  } finally {
    manager.close()
    await removeDir(home)
  }
})

// --- AC-5: SQLite busy_timeout, file identity sameFile, and idx > startIndex without LIMIT 5 ---
test('AC-5: getFileIdentity and sameFile identify identical vs different files', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agy-file-id-'))
  try {
    const f1 = join(home, 'file1.db')
    const f2 = join(home, 'file2.db')
    await writeFile(f1, 'test1', 'utf8')
    await writeFile(f2, 'test2', 'utf8')

    const id1 = getFileIdentity(f1)
    const id1b = getFileIdentity(f1)
    const id2 = getFileIdentity(f2)

    assert.ok(id1 !== undefined)
    assert.ok(id2 !== undefined)
    assert.equal(sameFile(id1, id1b), true)
    assert.equal(sameFile(id1, id2), false)
    assert.equal(sameFile(id1, undefined), false)
  } finally {
    await removeDir(home)
  }
})

test('AC-5: inspectConversationError scans all step_type=17 rows beyond minStepIndex without LIMIT 5', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agy-sqlite-scan-'))
  try {
    const convDir = join(home, 'conversations')
    mkdirSync(convDir, { recursive: true })
    const dbPath = join(convDir, 'sess-many-errors.db')
    const db = new DatabaseSync(dbPath)
    db.exec(`
      CREATE TABLE steps (
        idx INTEGER PRIMARY KEY,
        step_type INTEGER,
        status INTEGER,
        step_payload BLOB
      )
    `)
    const insert = db.prepare(
      'INSERT INTO steps (idx, step_type, status, step_payload) VALUES (?, ?, ?, ?)',
    )
    // Insert 12 error rows
    for (let i = 1; i <= 12; i++) {
      const payload = Buffer.from(
        JSON.stringify({
          error: {
            code: 'RESOURCE_EXHAUSTED',
            message: `Rate limit step ${i}`,
            details: [{ quotaResetTimeStamp: '2026-11-15T12:00:00Z' }],
          },
        }),
      )
      insert.run(i, ERROR_STEP_TYPE, 3, payload)
    }
    db.close()

    // Test readLastStepIndexFromDb
    const lastStep = readLastStepIndexFromDb(home, 'sess-many-errors')
    assert.equal(lastStep, 12)

    // With minStepIndex = 0, scans all 12 rows, most recent is idx 12
    const inspected = inspectConversationError(home, 'sess-many-errors', 0)
    assert.ok(inspected !== undefined)
    assert.equal(inspected?.stepIndex, 12)
    assert.equal(inspected?.message, 'Rate limit step 12')
    assert.equal(inspected?.retryable, true)

    // With minStepIndex = 11, scans only idx > 11 (which is idx 12)
    const inspectedFiltered = inspectConversationError(
      home,
      'sess-many-errors',
      11,
    )
    assert.ok(inspectedFiltered !== undefined)
    assert.equal(inspectedFiltered?.stepIndex, 12)

    // With minStepIndex = 12, scans only idx > 12 -> no rows found
    const inspectedNone = inspectConversationError(home, 'sess-many-errors', 12)
    assert.equal(inspectedNone, undefined)
  } finally {
    await removeDir(home)
  }
})

// --- AC-6: writeLanes cleanup & serialization ---
test('AC-6: queueTurnJournalOp settles and cleans up writeLanes map entry', async () => {
  const sessionId = 'test-session-lane-1'
  let executed = false
  await queueTurnJournalOp(sessionId, async () => {
    executed = true
  })
  assert.equal(executed, true)
  // Let the microtask / finally settle
  await new Promise((r) => setImmediate(r))
  let secondRan = false
  await queueTurnJournalOp(sessionId, async () => {
    secondRan = true
  })
  assert.equal(secondRan, true)
})

test('AC-6: removeSessionArtifacts serializes behind in-flight turn journal writes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agy-journal-serialize-'))
  const sessionId = '00000000-0000-4000-8000-000000000001'
  try {
    const convDir = join(home, 'conversations')
    mkdirSync(convDir, { recursive: true })
    writeFileSync(join(convDir, `${sessionId}.db`), 'dummy')

    let finishDone = false
    let removeStarted = false

    // Simulate in-flight journal write
    const slowWrite = queueTurnJournalOp(sessionId, async () => {
      await new Promise((r) => setTimeout(r, 40))
      finishDone = true
    })

    const removePromise = removeSessionArtifacts(home, sessionId).then(() => {
      removeStarted = true
    })

    await slowWrite
    assert.equal(finishDone, true)
    await removePromise
    assert.equal(removeStarted, true)
  } finally {
    await removeDir(home)
  }
})

// --- AC-7: TranscriptReader SyntaxError with code & watchBrain bounded error stop ---
test('AC-7: TranscriptReader readOnce attaches ERR_TRANSCRIPT_SYNTAX on malformed line', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agy-syntax-err-'))
  const sessionId = 'test-syntax-sess'
  const logDir = join(root, sessionId, '.system_generated', 'logs')
  mkdirSync(logDir, { recursive: true })
  const logFile = join(logDir, 'transcript_full.jsonl')
  writeFileSync(logFile, '{"valid": 1}\n{bad json line\n', 'utf8')

  const reader = new TranscriptReader()
  try {
    await reader.read(root, sessionId)
    // First read triggers reset/clearCursor on syntax error
    await reader.read(root, sessionId)
    assert.fail('Expected SyntaxError')
  } catch (err: unknown) {
    assert.ok(err instanceof SyntaxError)
    assert.equal((err as { code?: string }).code, 'ERR_TRANSCRIPT_SYNTAX')
  } finally {
    await removeDir(root)
  }
})

test('AC-7: watchBrain stops cleanly after consecutive poll errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agy-poll-err-'))
  const nativeId = '00000000-0000-4000-8000-000000000002'
  const sessionId = 'watch-err-sess'
  const events: unknown[] = []

  const logDir = join(root, nativeId, '.system_generated', 'logs')
  mkdirSync(logDir, { recursive: true })
  // Make transcript unreadable directory instead of file to trigger repeated non-missing read errors
  mkdirSync(join(logDir, 'transcript_full.jsonl'))

  const handle = watchBrain(
    root,
    nativeId,
    sessionId,
    (e) => events.push(e),
    20,
  )

  // Wait for 5 consecutive errors to trip the bound
  await new Promise((r) => setTimeout(r, 250))
  assert.equal(handle.isStopped(), true)
  await removeDir(root).catch(() => undefined)
})

// --- AC-9: revertSession fail-closed on fork error when scope === both ---
test('AC-9: revertSession fails closed by default when storage fork fails and scope === both', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agy-revert-fail-closed-'))
  try {
    const repo = join(root, 'repo')
    mkdirSync(repo, { recursive: true })
    await execFileAsync('git', ['init', repo])
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: repo })
    await execFileAsync('git', ['config', 'user.email', 'test@test.com'], {
      cwd: repo,
    })
    await writeFile(join(repo, 'a.txt'), 'hello\n')
    await execFileAsync('git', ['add', 'a.txt'], { cwd: repo })
    await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repo })

    const oldNativeId = '33333333-3333-4333-8333-333333333333'
    const checkpoint = await captureTurnFileCheckpoint(
      root,
      oldNativeId,
      repo,
      0,
    )
    assert.ok(checkpoint !== undefined)

    const convDir = join(root, 'conversations')
    mkdirSync(convDir, { recursive: true })
    writeFileSync(join(convDir, `${oldNativeId}.db`), 'corrupt-sqlite-header')

    const brainDir = join(
      root,
      'brain',
      oldNativeId,
      '.system_generated',
      'logs',
    )
    mkdirSync(brainDir, { recursive: true })
    writeFileSync(
      join(brainDir, 'transcript.jsonl'),
      JSON.stringify({ step_index: 0, type: 'USER_INPUT', content: 'Turn 1' }) +
        '\n' +
        JSON.stringify({
          step_index: 1,
          type: 'PLANNER_RESPONSE',
          content: 'Reply 1',
        }) +
        '\n' +
        JSON.stringify({
          step_index: 2,
          type: 'USER_INPUT',
          content: 'Turn 2',
        }) +
        '\n' +
        JSON.stringify({
          step_index: 3,
          type: 'PLANNER_RESPONSE',
          content: 'Reply 2',
        }) +
        '\n',
    )

    // With scope === 'both' and without fallbackToFreshOnForkError: true, it must fail closed (reject)
    await assert.rejects(
      revertSession({
        appDataDir: root,
        nativeId: oldNativeId,
        cwd: repo,
        scope: 'both',
        token: {
          version: 1,
          kind: 'agy-acp-turn',
          stepIndex: 2,
          turnOrdinal: 1,
          checkpointId: checkpoint.id,
          text: 'Turn 2',
        },
        createFreshSession: async () => 'fresh-id',
      }),
      /file is not a database|Database/i,
    )
  } finally {
    await removeDir(root)
  }
})

test('AC-9: GIT_TIMEOUT_MS is configurable and defaults to 15_000', () => {
  const original = GIT_TIMEOUT_MS
  try {
    assert.equal(typeof GIT_TIMEOUT_MS, 'number')
    setGitTimeoutMs(25_000)
    assert.equal(GIT_TIMEOUT_MS, 25_000)
  } finally {
    setGitTimeoutMs(original)
  }
})

// --- AC-10: runLoadSessionWithReplayIdle replay-idle gate ---
test('AC-10: runLoadSessionWithReplayIdle resolves with fallback when loadOperation hangs and activity goes idle', async () => {
  let triggerActivity!: () => void
  const fallback = { sessionId: 'fallback-sess' }
  const hangingOperation = new Promise<{ sessionId: string }>(() => {})

  const resultPromise = runLoadSessionWithReplayIdle({
    loadOperation: hangingOperation,
    fallbackResult: fallback,
    idleGapMs: 40,
    timeoutMs: 10_000,
    subscribeActivity: (listener) => {
      triggerActivity = listener
      return () => {}
    },
  })

  // Trigger activity, then wait for idle gap
  triggerActivity()
  const result = await resultPromise
  assert.deepEqual(result, fallback)
})

test('AC-10: runLoadSessionWithReplayIdle returns fast loadOperation immediately', async () => {
  const expected = { sessionId: 'fast-sess' }
  const fastOperation = Promise.resolve(expected)

  const result = await runLoadSessionWithReplayIdle({
    loadOperation: fastOperation,
    fallbackResult: { sessionId: 'fallback' },
    idleGapMs: 500,
    timeoutMs: 5000,
  })

  assert.deepEqual(result, expected)
})
