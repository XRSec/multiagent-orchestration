/**
 * Child-session watchdog and interrupt semantics regression suite.
 * Purpose: eliminate premature 120s kills and "user force cancellation" misattribution.
 * Requirements:
 *  - Case A: Child runs past turnDeadlineMs while emitting events or staying in an active tool call -> parent does NOT trigger fireStall.
 *  - Case B: Child is completely silent with no active tool beyond childIdleTimeoutMs -> parent accurately triggers child_wait_timeout with structured context and does NOT report user force cancellation.
 *  - Case C: Explicit user_cancel -> cascades interruption to children as before.
 *  - Configuration: KNOWN_SETTINGS and session settings support child watchdog timeouts.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import type { ProviderEvent } from '@getpaseo/plugin/server/provider'
import { KNOWN_SETTINGS, SessionManager } from '../server/session.ts'
import { AgyUsageSource } from '../server/usage.ts'
import { removeDir } from './helpers/cleanup.ts'

const CHILD_NATIVE_ID = '22222222-2222-4222-8222-222222222222'

function createManager(
  home: string,
  events: ProviderEvent[],
  opts: {
    turnStallTimeoutMs?: number
    childIdleTimeoutMs?: number
    childToolExecTimeoutMs?: number
    childMaxWaitMs?: number
    pollIntervalMs?: number
  } = {},
) {
  return new SessionManager({
    launch: {
      command: process.execPath,
      args: [fileURLToPath(new URL('./mock-acp.ts', import.meta.url))],
      env: { HOME: home, PATH: process.env.PATH ?? '' },
    },
    usage: new AgyUsageSource(),
    capabilities: [
      'prompt.message',
      'permission',
      'session.configure',
      'session.subsession',
    ],
    emit(event) {
      events.push(event)
    },
    stallTimeoutMs: 5000,
    turnStallTimeoutMs: opts.turnStallTimeoutMs ?? 100,
    childIdleTimeoutMs: opts.childIdleTimeoutMs ?? 300,
    childToolExecTimeoutMs: opts.childToolExecTimeoutMs ?? 800,
    childMaxWaitMs: opts.childMaxWaitMs ?? 2000,
    pollIntervalMs: opts.pollIntervalMs ?? 10,
  })
}

async function writeChildTranscript(
  home: string,
  childId: string,
  rows: Record<string, unknown>[],
) {
  const dir = join(
    home,
    '.gemini/antigravity-cli/brain',
    childId,
    '.system_generated/logs',
  )
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'transcript_full.jsonl'),
    rows.map((r) => JSON.stringify(r) + '\n').join(''),
  )
}

async function appendChildTranscript(
  home: string,
  childId: string,
  rows: Record<string, unknown>[],
) {
  const dir = join(
    home,
    '.gemini/antigravity-cli/brain',
    childId,
    '.system_generated/logs',
  )
  await mkdir(dir, { recursive: true })
  const content = rows.map((r) => JSON.stringify(r) + '\n').join('')
  await writeFile(join(dir, 'transcript_full.jsonl'), content, { flag: 'a' })
}

async function waitFor(
  predicate: () => boolean,
  describe: () => string,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    assert.ok(Date.now() < deadline, describe())
    await delay(10)
  }
}

test('KNOWN_SETTINGS includes 3-tier child watchdog settings keys', () => {
  assert.ok(KNOWN_SETTINGS.has('childIdleTimeoutMs'))
  assert.ok(KNOWN_SETTINGS.has('childToolExecTimeoutMs'))
  assert.ok(KNOWN_SETTINGS.has('childMaxWaitMs'))
})

test(
  'Case A: child running past parent turnDeadlineMs while emitting activity does NOT trigger parent fireStall',
  { timeout: 10000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-child-case-a-'))
    const events: ProviderEvent[] = []
    // Parent turnDeadlineMs is short (150ms).
    // Child timeouts are larger (idle: 800ms, tool: 1500ms, max: 4000ms).
    const m = createManager(home, events, {
      turnStallTimeoutMs: 150,
      childIdleTimeoutMs: 800,
      childToolExecTimeoutMs: 1500,
      childMaxWaitMs: 4000,
      pollIntervalMs: 10,
    })

    try {
      // 1. Prepare child transcript with initial steps
      await writeChildTranscript(home, CHILD_NATIVE_ID, [
        { step_index: 0, type: 'USER_INPUT', content: 'subtask start' },
        {
          step_index: 1,
          type: 'PLANNER_RESPONSE',
          status: 'IN_PROGRESS',
          content: 'Working on subtask step 1...',
        },
      ])

      await m.handle({
        type: 'session.open',
        requestId: 'open',
        sessionId: 's',
        history: 'skip',
        config: {
          cwd: home,
          env: { HOME: home },
          mcpServers: {},
          settings: {},
          persist: true,
          mode: 'full-access',
        },
      })

      // 2. Launch prompt which spawns child and hangs waiting for child
      void m.handle({
        type: 'session.prompt',
        sessionId: 's',
        prompt: {
          clientMessageId: 'p-1',
          delivery: 'auto',
          input: {
            type: 'message',
            content: [
              { type: 'text', text: `spawn-child-and-hang:${CHILD_NATIVE_ID}` },
            ],
          },
        },
      })

      // Wait until child is opened and recognized as running
      await waitFor(
        () =>
          events.some(
            (e) =>
              e.type === 'session.opened' &&
              e.sessionId === `s:child:${CHILD_NATIVE_ID}`,
          ),
        () => 'child session did not open',
      )

      // 3. Keep emitting periodic child updates past the parent's turnDeadlineMs (150ms)
      // Total duration ~ 350ms, well past 150ms
      for (let i = 2; i <= 5; i++) {
        await delay(80)
        await appendChildTranscript(home, CHILD_NATIVE_ID, [
          {
            step_index: i,
            type: 'PLANNER_RESPONSE',
            status: 'IN_PROGRESS',
            content: `Child progress chunk ${i}`,
          },
        ])
      }

      // 4. Verify parent has NOT failed despite > 350ms having elapsed (parent turn deadline was 150ms)
      const parentTurns = events.filter(
        (e) =>
          e.type === 'session.turn' &&
          e.sessionId === 's' &&
          e.state !== 'started',
      )
      assert.equal(
        parentTurns.length,
        0,
        'parent turn should not have failed or stalled',
      )
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)

test(
  'Case A (active tool grace): child running active tool past childIdleTimeoutMs survives under childToolExecTimeoutMs',
  { timeout: 10000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-child-case-a-tool-'))
    const events: ProviderEvent[] = []
    // parent turn deadline: 100ms
    // child idle timeout: 250ms
    // child tool exec timeout: 1200ms
    const m = createManager(home, events, {
      turnStallTimeoutMs: 100,
      childIdleTimeoutMs: 250,
      childToolExecTimeoutMs: 1200,
      childMaxWaitMs: 3000,
      pollIntervalMs: 10,
    })

    try {
      // Child transcript starts with an active tool call (e.g. git repack / long build)
      await writeChildTranscript(home, CHILD_NATIVE_ID, [
        { step_index: 0, type: 'USER_INPUT', content: 'heavy repo work' },
        {
          step_index: 1,
          type: 'PLANNER_RESPONSE',
          status: 'IN_PROGRESS',
          tool_calls: [
            {
              id: 'tool-git-repack',
              name: 'git repack',
              args: { flags: '-ad' },
            },
          ],
        },
      ])

      await m.handle({
        type: 'session.open',
        requestId: 'open',
        sessionId: 's',
        history: 'skip',
        config: {
          cwd: home,
          env: { HOME: home },
          mcpServers: {},
          settings: {},
          persist: true,
          mode: 'full-access',
        },
      })

      void m.handle({
        type: 'session.prompt',
        sessionId: 's',
        prompt: {
          clientMessageId: 'p-tool',
          delivery: 'auto',
          input: {
            type: 'message',
            content: [
              { type: 'text', text: `spawn-child-and-hang:${CHILD_NATIVE_ID}` },
            ],
          },
        },
      })

      // Wait until child tool_call is tracked on the timeline
      await waitFor(
        () =>
          events.some(
            (e) =>
              e.type === 'timeline.item' &&
              e.sessionId === `s:child:${CHILD_NATIVE_ID}` &&
              e.item.type === 'tool_call' &&
              e.item.name === 'git repack' &&
              e.item.status === 'running',
          ),
        () => 'child tool call not running',
      )

      // Sleep 400ms: this is > parent turnDeadlineMs (100ms) AND > childIdleTimeoutMs (250ms),
      // but well within childToolExecTimeoutMs (1200ms).
      await delay(400)

      // Assert parent turn has NOT stalled or failed
      const parentTurns = events.filter(
        (e) =>
          e.type === 'session.turn' &&
          e.sessionId === 's' &&
          e.state !== 'started',
      )
      assert.equal(
        parentTurns.length,
        0,
        'parent turn should remain active under childToolExecTimeoutMs',
      )
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)

test(
  'Case B: silent child with no active tool beyond childIdleTimeoutMs triggers child_wait_timeout with structured context without reporting user_cancel',
  { timeout: 10000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-child-case-b-'))
    const events: ProviderEvent[] = []
    // child idle timeout is set to 200ms
    const m = createManager(home, events, {
      turnStallTimeoutMs: 500,
      childIdleTimeoutMs: 200,
      childToolExecTimeoutMs: 1000,
      childMaxWaitMs: 3000,
      pollIntervalMs: 10,
    })

    try {
      // Child transcript starts with input, but remains completely silent after step 1
      await writeChildTranscript(home, CHILD_NATIVE_ID, [
        { step_index: 0, type: 'USER_INPUT', content: 'silent child task' },
        {
          step_index: 1,
          type: 'PLANNER_RESPONSE',
          status: 'IN_PROGRESS',
          content: 'Started, now silent...',
        },
      ])

      await m.handle({
        type: 'session.open',
        requestId: 'open',
        sessionId: 's',
        history: 'skip',
        config: {
          cwd: home,
          env: { HOME: home },
          mcpServers: {},
          settings: {},
          persist: true,
          mode: 'full-access',
        },
      })

      void m.handle({
        type: 'session.prompt',
        sessionId: 's',
        prompt: {
          clientMessageId: 'p-silent',
          delivery: 'auto',
          input: {
            type: 'message',
            content: [
              { type: 'text', text: `spawn-child-and-hang:${CHILD_NATIVE_ID}` },
            ],
          },
        },
      })

      // Wait until child is opened
      await waitFor(
        () =>
          events.some(
            (e) =>
              e.type === 'session.opened' &&
              e.sessionId === `s:child:${CHILD_NATIVE_ID}`,
          ),
        () => 'child session did not open',
      )

      // Wait for parent turn to fail due to child_wait_timeout (childIdleTimeoutMs: 200ms)
      await waitFor(
        () =>
          events.some(
            (e) =>
              e.type === 'session.turn' &&
              e.sessionId === 's' &&
              e.state === 'failed',
          ),
        () => 'parent turn did not fail on child idle timeout',
      )

      const terminal = events.find(
        (e) =>
          e.type === 'session.turn' &&
          e.sessionId === 's' &&
          e.state !== 'started',
      ) as Extract<ProviderEvent, { type: 'session.turn' }>

      assert.ok(terminal)
      assert.equal(terminal.state, 'failed')

      const errMsg =
        typeof terminal.error === 'string'
          ? terminal.error
          : (terminal.error?.message ?? '')

      // Structured context check:
      // 1. Must mention child session id
      assert.ok(
        errMsg.includes(`s:child:${CHILD_NATIVE_ID}`) ||
          errMsg.includes(CHILD_NATIVE_ID),
        `error message must include unresponsive child session id, got: "${errMsg}"`,
      )
      // 2. Must mention silence or wait duration
      assert.ok(
        errMsg.includes('silence') || errMsg.includes('wait'),
        `error message must mention silence duration, got: "${errMsg}"`,
      )
      // 3. Must NOT report "user force cancellation" or "user_cancel"
      assert.ok(
        !errMsg.toLowerCase().includes('user force cancellation'),
        `error message must not misattribute to user force cancellation: "${errMsg}"`,
      )
      assert.ok(
        !errMsg.toLowerCase().includes('user_cancel'),
        `error message must not mention user_cancel: "${errMsg}"`,
      )
      assert.notEqual(terminal.state, 'canceled')
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)

test(
  'Case C: explicit user_cancel cascades interruption to children',
  { timeout: 10000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-child-case-c-'))
    const events: ProviderEvent[] = []
    const m = createManager(home, events, {
      turnStallTimeoutMs: 5000,
      childIdleTimeoutMs: 5000,
      childToolExecTimeoutMs: 5000,
      childMaxWaitMs: 10000,
      pollIntervalMs: 10,
    })

    try {
      await writeChildTranscript(home, CHILD_NATIVE_ID, [
        { step_index: 0, type: 'USER_INPUT', content: 'active child work' },
        {
          step_index: 1,
          type: 'PLANNER_RESPONSE',
          status: 'IN_PROGRESS',
          content: 'Child busy working...',
        },
      ])

      await m.handle({
        type: 'session.open',
        requestId: 'open',
        sessionId: 's',
        history: 'skip',
        config: {
          cwd: home,
          env: { HOME: home },
          mcpServers: {},
          settings: {},
          persist: true,
          mode: 'full-access',
        },
      })

      void m.handle({
        type: 'session.prompt',
        sessionId: 's',
        prompt: {
          clientMessageId: 'p-cancel',
          delivery: 'auto',
          input: {
            type: 'message',
            content: [
              { type: 'text', text: `spawn-child-and-hang:${CHILD_NATIVE_ID}` },
            ],
          },
        },
      })

      await waitFor(
        () =>
          events.some(
            (e) =>
              e.type === 'session.opened' &&
              e.sessionId === `s:child:${CHILD_NATIVE_ID}`,
          ),
        () => 'child session did not open',
      )

      // Ensure child turn has started
      await waitFor(
        () =>
          events.some(
            (e) =>
              e.type === 'session.turn' &&
              e.sessionId === `s:child:${CHILD_NATIVE_ID}` &&
              e.state === 'started',
          ),
        () => 'child turn not started',
      )

      // Explicit user cancel from Paseo / user
      await m.handle({
        type: 'session.interrupt',
        requestId: 'user-interrupt',
        sessionId: 's',
      })

      // Verify child turn receives canceled state
      await waitFor(
        () =>
          events.some(
            (e) =>
              e.type === 'session.turn' &&
              e.sessionId === `s:child:${CHILD_NATIVE_ID}` &&
              e.state === 'canceled',
          ),
        () => 'child turn was not canceled by user interrupt',
      )

      // Verify parent turn also receives canceled state
      await waitFor(
        () =>
          events.some(
            (e) =>
              e.type === 'session.turn' &&
              e.sessionId === 's' &&
              e.state === 'canceled',
          ),
        () => 'parent turn was not canceled by user interrupt',
      )
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)

test('session settings dynamically configure child watchdog timeouts without rejection', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agy-child-settings-'))
  const events: ProviderEvent[] = []
  const m = createManager(home, events)

  try {
    await m.handle({
      type: 'session.open',
      requestId: 'open',
      sessionId: 's',
      history: 'skip',
      config: {
        cwd: home,
        env: { HOME: home },
        mcpServers: {},
        settings: {
          childIdleTimeoutMs: 65000,
          childToolExecTimeoutMs: 120000,
          childMaxWaitMs: 300000,
        },
        persist: true,
        mode: 'full-access',
      },
    })

    // Dynamically update settings via session.configure
    await m.handle({
      type: 'session.configure',
      requestId: 'cfg-1',
      sessionId: 's',
      changes: {
        settings: {
          childIdleTimeoutMs: 70000,
          childToolExecTimeoutMs: 140000,
          childMaxWaitMs: 350000,
        },
      },
    })

    // Should not throw and settings are accepted
    assert.ok(true)
  } finally {
    await m.close()
    await removeDir(home)
  }
})
