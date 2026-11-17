/**
 * Purpose: Verify the wrapper↔plugin account-switch contract reloads at safe points only.
 * Context: `agy` emits one `[agy-switch]` JSON line on stderr when it switches accounts.
 * Usage: `node --test tests/account-switch-reload.test.ts`.
 * Prerequisites: Node >= 22.18.0; uses tests/mock-acp.ts as the native runtime.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ProviderEvent,
  ProviderLaunch,
} from '@getpaseo/plugin/server/provider'
import { SessionManager } from '../server/session.ts'
import { AgyUsageSource } from '../server/usage.ts'
import { RETRYABLE_ERROR_TOKENS } from '../server/error-inspection.ts'
import { resolveAcpArgs } from '../server/transport.ts'
import { waitUntil } from './helpers.ts'
import { removeDir } from './helpers/cleanup.ts'

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'agy-switch-reload-'))
  const log = join(home, 'calls')
  const events: ProviderEvent[] = []
  const manager = new SessionManager({
    launch: {
      command: process.execPath,
      args: [fileURLToPath(new URL('./mock-acp.ts', import.meta.url))],
      env: {
        HOME: home,
        PATH: process.env.PATH ?? '',
        AGY_TEST_LOG: log,
        AGY_TEST_LOG_LOAD: '1',
        AGY_TEST_LOG_ELICITATION_CAP: '1',
      },
    },
    usage: new AgyUsageSource(),
    capabilities: ['prompt.message'],
    emit: (event) => events.push(structuredClone(event)),
  })
  return {
    home,
    log,
    events,
    manager,
    async close() {
      await manager.close()
      await removeDir(home)
    },
  }
}

async function openSession(
  manager: SessionManager,
  home: string,
  sessionId: string,
  events: ProviderEvent[],
) {
  await manager.open({
    type: 'session.open',
    requestId: `open-${sessionId}`,
    sessionId,
    history: 'skip',
    config: {
      cwd: home,
      env: {},
      mcpServers: {},
      settings: {},
      persist: false,
    },
  })
  await waitUntil(
    () =>
      events.some(
        (event) =>
          event.type === 'session.ready' && event.sessionId === sessionId,
      ),
    5000,
    () => `session ${sessionId} never became ready`,
  )
}

async function promptSession(
  manager: SessionManager,
  sessionId: string,
  text: string,
) {
  await manager.handle({
    type: 'session.prompt',
    sessionId,
    prompt: {
      clientMessageId: `${sessionId}-${text}`,
      delivery: 'auto',
      input: { type: 'message', content: [{ type: 'text', text }] },
    },
  })
}

function assertCompletedTurn(
  events: readonly ProviderEvent[],
  sessionId: string,
) {
  const states = events.flatMap((event) =>
    event.type === 'session.turn' && event.sessionId === sessionId
      ? [event.state]
      : [],
  )
  assert.equal(states.at(-1), 'completed', JSON.stringify(states))
  assert.ok(!states.includes('failed'), JSON.stringify(states))
}

async function readLog(path: string): Promise<string[]> {
  const text = await readFile(path, 'utf8').catch(() => '')
  return text.split('\n').filter(Boolean)
}

test('successful switch reloads at turn end and leaves the turn outcome unchanged', async () => {
  const f = await fixture()
  try {
    await openSession(f.manager, f.home, 'a', f.events)
    await promptSession(f.manager, 'a', 'agy-switch-ok hello')
    assertCompletedTurn(f.events, 'a')
    assert.deepEqual(
      f.events.filter((e) => e.type === 'session.runtime_failed'),
      [],
    )
    const lines = await readLog(f.log)
    assert.ok(
      lines.includes('load'),
      `expected a session/load reload, got ${JSON.stringify(lines)}`,
    )
  } finally {
    await f.close()
  }
})

test('malformed switch line is ignored and does not throw or reload', async () => {
  const f = await fixture()
  try {
    await openSession(f.manager, f.home, 'a', f.events)
    await promptSession(f.manager, 'a', 'agy-switch-malformed hello')
    assertCompletedTurn(f.events, 'a')
    const lines = await readLog(f.log)
    assert.ok(
      !lines.includes('load'),
      `malformed line must not trigger a reload, got ${JSON.stringify(lines)}`,
    )
  } finally {
    await f.close()
  }
})

test('a switch in session A reloads session B before B next prompt', async () => {
  const f = await fixture()
  try {
    await openSession(f.manager, f.home, 'a', f.events)
    await openSession(f.manager, f.home, 'b', f.events)
    await promptSession(f.manager, 'a', 'agy-switch-ok hello')
    const afterA = await readLog(f.log)
    assert.ok(
      afterA.includes('load'),
      `A should reload at turn end, got ${JSON.stringify(afterA)}`,
    )
    await promptSession(f.manager, 'b', 'switch-probe-hello')
    const lines = await readLog(f.log)
    const promptIndex = lines.lastIndexOf('prompt:switch-probe-hello')
    const loadBeforePrompt = lines
      .slice(0, promptIndex)
      .filter((line) => line === 'load').length
    assert.equal(
      loadBeforePrompt,
      2,
      `B must reload before its prompt, got ${JSON.stringify(lines)}`,
    )
    assertCompletedTurn(f.events, 'b')
  } finally {
    await f.close()
  }
})

test('a skipped switch triggers no reload', async () => {
  const f = await fixture()
  try {
    await openSession(f.manager, f.home, 'a', f.events)
    await promptSession(f.manager, 'a', 'agy-switch-skipped hello')
    assertCompletedTurn(f.events, 'a')
    const lines = await readLog(f.log)
    assert.ok(
      !lines.includes('load'),
      `skipped switch must not reload, got ${JSON.stringify(lines)}`,
    )
  } finally {
    await f.close()
  }
})

test('ownership contract strips forbidden model and switch flags from launch args', () => {
  assert.deepEqual(resolveAcpArgs(undefined), ['acp'])
  const launch = {
    command: 'agy',
    args: [
      'acp',
      '--model',
      'x',
      '-m',
      'y',
      '--model-name=z',
      '--switch-account',
      '--account=target',
      '--log-file',
      '/tmp/a.log',
    ],
  } as ProviderLaunch
  const args = resolveAcpArgs(launch)
  assert.deepEqual(args, ['acp', '--log-file', '/tmp/a.log'])
  assert.ok(!args.some((arg) => /--?model|^-m$|switch|account/i.test(arg)))
  assert.deepEqual(
    resolveAcpArgs({
      command: 'agy',
      args: ['--model', 'x'],
    } as ProviderLaunch),
    ['acp'],
  )
})

test('shared retryable token list stays canonical (8/8)', () => {
  assert.deepEqual(
    [...RETRYABLE_ERROR_TOKENS],
    [
      'UNAVAILABLE',
      'RESOURCE_EXHAUSTED',
      '\\b503\\b',
      '\\b429\\b',
      'rate limit',
      'capacity',
      'high traffic',
      'try again',
    ],
  )
})
