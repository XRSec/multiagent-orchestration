/**
 * Turn termination invariant regression suite.
 * Purpose: prove a turn is never completed without positive terminal evidence.
 * Context: covers bounded settlement, exit structural terminal, journal reconciliation and stopReason mapping.
 * Usage: `node --test tests/turn-terminal-invariant.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import type { ProviderEvent } from '@getpaseo/plugin/server/provider'
import { SessionManager } from '../server/session.ts'
import { watchBrain } from '../server/brain.ts'
import { isCompletePlannerResponse } from '../server/brain-io.ts'
import { AgyUsageSource } from '../server/usage.ts'
import { writeBrainTranscript } from './helpers.ts'
import {
  beginTurnJournal,
  reconcileRunningTurns,
} from '../server/turn-journal.ts'
import { removeDir } from './helpers/cleanup.ts'

function manager(
  home: string,
  events: ProviderEvent[],
  stallTimeoutMs: number,
) {
  return new SessionManager({
    launch: {
      command: process.execPath,
      args: [fileURLToPath(new URL('./mock-acp.ts', import.meta.url))],
      env: { HOME: home, PATH: process.env.PATH ?? '' },
    },
    usage: new AgyUsageSource(),
    capabilities: ['prompt.message', 'permission', 'session.configure'],
    emit(event) {
      events.push(event)
    },
    stallTimeoutMs: 5000,
    turnStallTimeoutMs: stallTimeoutMs,
  })
}

async function open(
  m: SessionManager,
  sessionId: string,
  home: string,
  extra: Record<string, unknown> = {},
) {
  await m.handle({
    type: 'session.open',
    requestId: 'open',
    sessionId,
    history: 'skip',
    config: {
      cwd: home,
      env: { HOME: home },
      mcpServers: {},
      settings: {},
      persist: true,
      ...extra,
    },
  })
}

async function prompt(m: SessionManager, sessionId: string, text: string) {
  await m.handle({
    type: 'session.prompt',
    sessionId,
    prompt: {
      clientMessageId: `${text}-${Math.random()}`,
      delivery: 'auto',
      input: { type: 'message', content: [{ type: 'text', text }] },
    },
  })
}

async function waitFor(
  predicate: () => boolean,
  describe: () => string,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    assert.ok(Date.now() < deadline, describe())
    await delay(5)
  }
}

function terminals(events: ProviderEvent[], turnId?: string) {
  return events.filter(
    (e) =>
      e.type === 'session.turn' &&
      e.state !== 'started' &&
      (turnId === undefined || e.turnId === turnId),
  )
}

test(
  'a prompt that never settles fails within the deadline with one terminal',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-invariant-hang-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, 50)
    try {
      await open(m, 's', home, { mode: 'full-access' })
      await prompt(m, 's', 'hang')
      await waitFor(
        () => terminals(events).length === 1,
        () => JSON.stringify(events),
      )
      const started = events.find(
        (e) => e.type === 'session.turn' && e.state === 'started',
      )
      assert.ok(started?.type === 'session.turn')
      const done = terminals(events, started.turnId)
      assert.equal(done.length, 1)
      const terminal = done[0]
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'failed')
      assert.match(terminal.error?.message ?? '', /no progress/)
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)

test(
  'a missing stop reason fails instead of completing',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-invariant-nostop-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, 5000)
    try {
      await open(m, 's', home, { mode: 'full-access' })
      await prompt(m, 's', 'no-stop-reason')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const terminal = terminals(events)[0]
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'failed')
      assert.match(terminal.error?.message ?? '', /without a stop reason/)
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)

test(
  'a tool still running at turn end is failed, never fabricated completed',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-invariant-tool-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, 5000)
    try {
      await open(m, 's', home, { mode: 'full-access' })
      await prompt(m, 's', 'plain-turn')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const terminal = terminals(events)[0]
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'completed')
      const tool = events.findLast(
        (e) =>
          e.type === 'timeline.item' &&
          e.item.type === 'tool_call' &&
          e.item.callId === 'unfinished',
      )
      assert.ok(
        tool?.type === 'timeline.item' && tool.item.type === 'tool_call',
      )
      assert.equal(tool.item.status, 'failed')
      assert.match(
        String(tool.item.error ?? ''),
        /no result|before the turn ended/,
      )
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)

test(
  'runtime exit during an active turn emits exactly one failed terminal',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-invariant-exit-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, 5000)
    try {
      await open(m, 's', home, { mode: 'full-access' })
      await prompt(m, 's', 'crash')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const started = events.find(
        (e) => e.type === 'session.turn' && e.state === 'started',
      )
      assert.ok(started?.type === 'session.turn')
      await delay(100)
      const done = terminals(events, started.turnId)
      assert.equal(done.length, 1, JSON.stringify(done))
      const terminal = done[0]
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'failed')
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)

test(
  'a leftover running journal record is reconciled to failed on open',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-invariant-journal-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, 5000)
    const nativeId = '11111111-1111-4111-8111-111111111111'
    const appDataDir = join(home, '.gemini', 'antigravity-cli')
    try {
      await beginTurnJournal(appDataDir, {
        turnId: 'stale-turn',
        clientMessageId: 'stale-message',
        nativeId,
        startedAt: Date.now(),
        status: 'running',
      })
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
        },
        persistence: { version: 1, data: { sessionId: nativeId } },
      })
      await waitFor(
        () => events.some((e) => e.type === 'session.ready'),
        () => JSON.stringify(events),
      )
      const terminal = events.find(
        (e) => e.type === 'session.turn' && e.turnId === 'stale-turn',
      )
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'failed')
      assert.match(terminal.error?.message ?? '', /restarted/)
      assert.deepEqual(
        await reconcileRunningTurns(appDataDir, nativeId),
        [],
        'journal must be cleared after reconciliation',
      )
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)

test(
  'a pending permission suspends the deadline and silence after the answer fails',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-invariant-perm-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, 100)
    try {
      await open(m, 's', home)
      void prompt(m, 's', 'permission-then-hang')
      await waitFor(
        () => events.some((e) => e.type === 'session.permission'),
        () => JSON.stringify(events),
      )
      // (a) Waiting well past the deadline must not fail the turn.
      await delay(400)
      assert.equal(
        terminals(events).length,
        0,
        `a pending approval must not trip the watchdog: ${JSON.stringify(events)}`,
      )
      const permission = events.find((e) => e.type === 'session.permission')
      assert.ok(permission?.type === 'session.permission')
      await m.handle({
        type: 'session.permission',
        sessionId: 's',
        permissionId: permission.request.id,
        response: { behavior: 'allow' },
      })
      // (b) After the wait ends, continued silence fails within one deadline.
      await waitFor(
        () => terminals(events).length === 1,
        () => JSON.stringify(events),
      )
      const terminal = terminals(events)[0]
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'failed')
      assert.match(terminal.error?.message ?? '', /no progress/)
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)

test(
  'brain.finishTurn fails an unfinished tool and the child turn',
  { timeout: 8000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'agy-invariant-brain-'))
    const nativeId = '77777777-7777-4777-8777-777777777777'
    const events: ProviderEvent[] = []
    const transcriptPath = await writeBrainTranscript(root, nativeId, [
      {
        step_index: 0,
        type: 'USER_INPUT',
        source: 'USER_EXPLICIT',
        status: 'DONE',
        content: '<USER_REQUEST>run a tool</USER_REQUEST>',
      },
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        source: 'MODEL',
        status: 'DONE',
        content: 'running a tool',
        tool_calls: [
          {
            id: 'brain-tool',
            name: 'run_command',
            args: { CommandLine: 'sleep 5' },
          },
        ],
      },
    ])
    const handle = watchBrain(
      root,
      nativeId,
      'child-session',
      (event) => events.push(event),
      20,
      // A transcript that disappears while the parent is inactive ends the child turn.
      () => false,
    )
    try {
      await waitFor(
        () =>
          events.some(
            (e) =>
              e.type === 'timeline.item' &&
              e.item.type === 'tool_call' &&
              e.item.callId === 'brain-tool' &&
              e.item.status === 'running',
          ),
        () => JSON.stringify(events),
      )
      await rm(transcriptPath)
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const terminal = terminals(events)[0]
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'failed')
      assert.match(
        terminal.error?.message ?? '',
        /result before the turn ended/,
      )
      const tool = events.findLast(
        (e) =>
          e.type === 'timeline.item' &&
          e.item.type === 'tool_call' &&
          e.item.callId === 'brain-tool',
      )
      assert.ok(
        tool?.type === 'timeline.item' && tool.item.type === 'tool_call',
      )
      assert.equal(tool.item.status, 'failed')
    } finally {
      handle()
      await removeDir(root)
    }
  },
)

test('completion evidence uses the canonical planner completeness check', () => {
  assert.equal(
    isCompletePlannerResponse({
      type: 'PLANNER_RESPONSE',
      status: 'INTERRUPTED',
    }),
    false,
    'a non-DONE planner row is not completion evidence',
  )
  assert.equal(
    isCompletePlannerResponse({
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      tool_calls: [],
    }),
    true,
    'a DONE row with tool_calls: [] is completion evidence',
  )
  assert.equal(
    isCompletePlannerResponse({
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      tool_calls: [{ name: 'run_command' }],
    }),
    false,
    'a DONE row with an unresolved tool call is not completion evidence',
  )
})

test(
  'usage_update-only traffic does not keep a turn alive past the deadline',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-invariant-usage-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, 100)
    try {
      await open(m, 's', home, { mode: 'full-access' })
      await prompt(m, 's', 'usage-streaming-slow')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const terminal = terminals(events)[0]
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'failed')
      assert.match(terminal.error?.message ?? '', /no progress/)
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)

test(
  'usage_update interleaved with tool progress keeps the turn alive',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-invariant-usage-progress-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, 100)
    try {
      await open(m, 's', home, { mode: 'full-access' })
      await prompt(m, 's', 'usage-with-tool-progress')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const terminal = terminals(events)[0]
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'completed')
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)

test(
  'ACP sessionUpdate traffic keeps a turn alive past the deadline without transcript rows',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-invariant-stream-'))
    const events: ProviderEvent[] = []
    // Deadline 100ms; the mock streams updates every ~30ms with no transcript rows.
    const m = manager(home, events, 100)
    try {
      await open(m, 's', home, { mode: 'full-access' })
      await prompt(m, 's', 'tool-streaming-slow')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const terminal = terminals(events)[0]
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'completed')
    } finally {
      await m.close()
      await removeDir(home)
    }
  },
)
