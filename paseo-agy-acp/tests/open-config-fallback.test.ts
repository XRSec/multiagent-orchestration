import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProviderEvent } from '@getpaseo/plugin/server/provider'
import { formatErrorMessage } from '../server/common.ts'
import { SessionManager } from '../server/session.ts'
import { AgyUsageSource } from '../server/usage.ts'
import { removeDir } from './helpers/cleanup.ts'

const nativeId = '11111111-1111-4111-8111-111111111111'

async function fixture(extraEnv: Record<string, string> = {}) {
  const home = await mkdtemp(join(tmpdir(), 'agy-config-fallback-'))
  const events: ProviderEvent[] = []
  const manager = new SessionManager({
    launch: {
      command: process.execPath,
      args: [fileURLToPath(new URL('./mock-acp.ts', import.meta.url))],
      env: { HOME: home, PATH: process.env.PATH ?? '', ...extraEnv },
    },
    usage: new AgyUsageSource(),
    capabilities: ['session.configure', 'prompt.message'],
    emit: (event) => events.push(structuredClone(event)),
  })
  return {
    home,
    events,
    manager,
    async close() {
      await manager.close()
      await removeDir(home)
    },
  }
}

function openInput(home: string, config: Record<string, unknown> = {}) {
  return {
    type: 'session.open' as const,
    requestId: 'open',
    sessionId: 's',
    history: 'skip' as const,
    persistence: { version: 1 as const, data: { sessionId: nativeId } },
    config: {
      cwd: home,
      env: {},
      mcpServers: {},
      settings: {},
      persist: true,
      ...config,
    },
  }
}

async function prompt(manager: SessionManager, text: string) {
  await manager.handle({
    type: 'session.prompt',
    sessionId: 's',
    prompt: {
      clientMessageId: `message-${text}`,
      delivery: 'auto',
      input: { type: 'message', content: [{ type: 'text', text }] },
    },
  })
}

function notices(events: readonly ProviderEvent[]) {
  return events.flatMap((event) =>
    event.type === 'timeline.item' && event.item.type === 'notification'
      ? [event.item]
      : [],
  )
}

test('open falls back to the native model when the stored model is unavailable', async () => {
  const f = await fixture({ AGY_TEST_UNKNOWN_MODEL: 'gemini-4-hydrogen' })
  try {
    await f.manager.open(openInput(f.home, { model: 'gemini-4-hydrogen' }))
    assert.equal(
      f.events.filter((event) => event.type === 'session.closed').length,
      0,
    )
    const config = f.events.findLast((event) => event.type === 'session.config')
    assert.ok(config?.type === 'session.config')
    assert.equal(config.config.model, 'test')
    const notice = notices(f.events).find((item) =>
      item.message.includes('gemini-4-hydrogen'),
    )
    assert.ok(notice, JSON.stringify(f.events))
    assert.match(notice.message, /continuing with "test"/)
    assert.ok(
      f.events.findIndex(
        (event) =>
          event.type === 'timeline.item' && event.item.type === 'notification',
      ) > f.events.findIndex((event) => event.type === 'session.opened'),
      'the notice must follow session.opened so the host can render it',
    )
    await prompt(f.manager, 'usage-fallback')
    assert.ok(
      f.events.some(
        (event) => event.type === 'session.turn' && event.state === 'completed',
      ),
      JSON.stringify(f.events),
    )
  } finally {
    await f.close()
  }
})

test('open skips a stored thinking option the resolved model rejects', async () => {
  const f = await fixture({ AGY_TEST_INVALID_THINKING: 'high' })
  try {
    await f.manager.open(openInput(f.home, { thinkingOption: 'high' }))
    const config = f.events.findLast((event) => event.type === 'session.config')
    assert.ok(config?.type === 'session.config')
    assert.equal(config.config.thinkingOption, 'low')
    const notice = notices(f.events).find((item) =>
      item.message.includes('thinking option "high"'),
    )
    assert.ok(notice, JSON.stringify(f.events))
  } finally {
    await f.close()
  }
})

test('open still fails for a non-availability config error', async () => {
  const f = await fixture({ AGY_TEST_CONFIG_ABORT: '1' })
  try {
    await assert.rejects(
      f.manager.open(openInput(f.home, { model: 'gemini-4-hydrogen' })),
      (error: unknown) =>
        /ACP runtime exited during config apply/.test(
          formatErrorMessage(error),
        ),
    )
  } finally {
    await f.close()
  }
})

test('an explicit unavailable model switch errors without poisoning the session', async () => {
  const f = await fixture({ AGY_TEST_UNKNOWN_MODEL: 'gemini-4-hydrogen' })
  try {
    await f.manager.open(openInput(f.home))
    await assert.rejects(
      f.manager.handle({
        type: 'session.configure',
        requestId: 'switch',
        sessionId: 's',
        changes: { model: 'gemini-4-hydrogen' },
      }),
      (error: unknown) =>
        /Unknown model ID: gemini-4-hydrogen/.test(formatErrorMessage(error)),
    )
    await prompt(f.manager, 'usage-usable')
    assert.ok(
      f.events.some(
        (event) => event.type === 'session.turn' && event.state === 'completed',
      ),
      JSON.stringify(f.events),
    )
  } finally {
    await f.close()
  }
})

test('a valid stored model opens without a fallback notice', async () => {
  const f = await fixture()
  try {
    await f.manager.open(openInput(f.home, { model: 'test' }))
    const config = f.events.findLast((event) => event.type === 'session.config')
    assert.ok(config?.type === 'session.config')
    assert.equal(config.config.model, 'test')
    assert.deepEqual(notices(f.events), [])
  } finally {
    await f.close()
  }
})

for (const failure of [
  'Invalid API key for model gemini-4-hydrogen',
  'model quota exceeded',
  'model temporarily unavailable',
  'invalid request: model parameters',
]) {
  test(`open rejects non-availability config failure: ${failure}`, async () => {
    const f = await fixture({ AGY_TEST_CONFIG_ERROR: failure })
    try {
      await assert.rejects(
        f.manager.open(openInput(f.home, { model: 'gemini-4-hydrogen' })),
        (error: unknown) => formatErrorMessage(error).includes(failure),
      )
      assert.equal(
        f.events.filter((event) => event.type === 'session.opened').length,
        0,
      )
      assert.deepEqual(notices(f.events), [])
    } finally {
      await f.close()
    }
  })
}

test('unknown model phrasing still falls back to the native model', async () => {
  const failure = 'Unknown model ID: gemini-4-hydrogen'
  const f = await fixture({ AGY_TEST_CONFIG_ERROR: failure })
  try {
    await f.manager.open(openInput(f.home, { model: 'gemini-4-hydrogen' }))
    const config = f.events.findLast((event) => event.type === 'session.config')
    assert.ok(config?.type === 'session.config')
    assert.equal(config.config.model, 'test')
    assert.ok(
      notices(f.events).some(
        (item) =>
          item.message.includes('gemini-4-hydrogen') &&
          item.message.includes('continuing with "test"'),
      ),
      JSON.stringify(f.events),
    )
  } finally {
    await f.close()
  }
})
