/**
 * Two-clock tool budget regression suite.
 * Purpose: a running tool gets its own, longer clock and visible "still running" notices.
 * Context: turn-silence clock stays at turnStallTimeoutMs; tool clock is toolStallTimeoutMs.
 * Usage: `node --test tests/two-clock-tool-budget.test.ts`.
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
import { AgyUsageSource } from '../server/usage.ts'

interface Clocks {
  turnStall: number
  toolStall: number
  notice: number
}

function manager(home: string, events: ProviderEvent[], clocks: Clocks) {
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
    turnStallTimeoutMs: clocks.turnStall,
    toolStallTimeoutMs: clocks.toolStall,
    toolNoticeMs: clocks.notice,
  })
}

async function open(m: SessionManager, home: string) {
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
}

function prompt(m: SessionManager, text: string) {
  return m.handle({
    type: 'session.prompt',
    sessionId: 's',
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

function terminals(events: ProviderEvent[]) {
  return events.filter(
    (e) => e.type === 'session.turn' && e.state !== 'started',
  )
}

function notices(events: ProviderEvent[]) {
  return events.filter(
    (e) => e.type === 'timeline.item' && e.item.type === 'notification',
  )
}

test(
  'a running tool survives past the turn clock and completes',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-twoclock-survive-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, {
      turnStall: 100,
      toolStall: 1000,
      notice: 1000,
    })
    try {
      await open(m, home)
      await prompt(m, 'slow-tool-400')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const terminal = terminals(events)[0]
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'completed')
    } finally {
      await m.close()
      await rm(home, { recursive: true, force: true })
    }
  },
)

test(
  'still-running notices repeat and stop after the tool settles',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-twoclock-notice-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, {
      turnStall: 100,
      toolStall: 2000,
      notice: 100,
    })
    try {
      await open(m, home)
      await prompt(m, 'slow-tool-400')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const emitted = notices(events)
      assert.ok(
        emitted.length >= 2,
        `expected repeated notices, got ${JSON.stringify(emitted)}`,
      )
      for (const notice of emitted) {
        assert.ok(notice.type === 'timeline.item')
        assert.ok(notice.item.type === 'notification')
        assert.match(String(notice.item.message), /still running/)
        assert.match(String(notice.item.message), /run_command/)
      }
      const countAfterSettle = emitted.length
      await delay(150)
      assert.equal(
        notices(events).length,
        countAfterSettle,
        'notices must stop once the tool settles',
      )
    } finally {
      await m.close()
      await rm(home, { recursive: true, force: true })
    }
  },
)

test(
  'a tool exceeding the tool clock fails the tool and the turn, even with notices',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-twoclock-timeout-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, {
      turnStall: 5000,
      toolStall: 150,
      notice: 50,
    })
    try {
      await open(m, home)
      void prompt(m, 'tool-never-settles')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const terminal = terminals(events)[0]
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'failed')
      assert.match(terminal.error?.message ?? '', /run_command/)
      assert.match(terminal.error?.message ?? '', /produced no result/)
      assert.ok(
        notices(events).length > 0,
        'notices must not prevent the tool clock from expiring',
      )
      const tool = events.findLast(
        (e) =>
          e.type === 'timeline.item' &&
          e.item.type === 'tool_call' &&
          e.item.callId === 'never-tool',
      )
      assert.ok(
        tool?.type === 'timeline.item' && tool.item.type === 'tool_call',
      )
      assert.equal(tool.item.status, 'failed')
      assert.match(String(tool.item.error), /produced no result/)
      assert.equal(
        events.some(
          (e) =>
            e.type === 'timeline.item' &&
            e.item.type === 'tool_call' &&
            e.item.callId === 'never-tool' &&
            e.item.status === 'completed',
        ),
        false,
        'a timed-out tool must never be completed',
      )
    } finally {
      await m.close()
      await rm(home, { recursive: true, force: true })
    }
  },
)

test(
  'only the tool owning the expired clock gets the timeout diagnostic',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-twoclock-multi-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, {
      turnStall: 5000,
      toolStall: 200,
      notice: 5000,
    })
    try {
      await open(m, home)
      void prompt(m, 'two-tools-older-expires')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const tool = (callId: string) =>
        events.findLast(
          (e) =>
            e.type === 'timeline.item' &&
            e.item.type === 'tool_call' &&
            e.item.callId === callId,
        )
      const alpha = tool('tool-alpha')
      const beta = tool('tool-beta')
      assert.ok(
        alpha?.type === 'timeline.item' && alpha.item.type === 'tool_call',
      )
      assert.ok(
        beta?.type === 'timeline.item' && beta.item.type === 'tool_call',
      )
      assert.notEqual(alpha.item.name, beta.item.name)
      assert.equal(alpha.item.status, 'failed')
      assert.equal(beta.item.status, 'failed')
      assert.match(String(alpha.item.error), /produced no result/)
      assert.ok(
        String(alpha.item.error).includes(alpha.item.name),
        'the expired tool must be named in its own error',
      )
      assert.equal(
        beta.item.error,
        'Turn ended while this tool was still running',
      )
      assert.equal(
        String(beta.item.error).includes(alpha.item.name),
        false,
        'a younger tool must not carry the expired tool name',
      )
      assert.equal(
        String(alpha.item.error).includes(beta.item.name),
        false,
        'the expired tool must not carry a younger tool name',
      )
    } finally {
      await m.close()
      await rm(home, { recursive: true, force: true })
    }
  },
)

test(
  'metadata-only subagent updates do not keep a turn alive',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-twoclock-metadata-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, {
      turnStall: 100,
      toolStall: 5000,
      notice: 5000,
    })
    try {
      await open(m, home)
      void prompt(m, 'metadata-subagent-stream-then-hang')
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
      await rm(home, { recursive: true, force: true })
    }
  },
)

test(
  'silence after the last tool settles trips the turn clock',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-twoclock-settled-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, {
      turnStall: 100,
      toolStall: 2000,
      notice: 500,
    })
    try {
      await open(m, home)
      void prompt(m, 'tool-settles-then-hang')
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
      await rm(home, { recursive: true, force: true })
    }
  },
)

test(
  'turn silence with no tool running still fails at the turn clock',
  { timeout: 8000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), 'agy-twoclock-silence-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events, {
      turnStall: 100,
      toolStall: 2000,
      notice: 1000,
    })
    try {
      await open(m, home)
      void prompt(m, 'hang')
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
      await rm(home, { recursive: true, force: true })
    }
  },
)
