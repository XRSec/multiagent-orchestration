import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProviderEvent } from '@getpaseo/plugin/server/provider'
import {
  SessionManager,
  resolveCompactionThresholds,
  DEFAULT_CONTEXT_WARN_THRESHOLD_TOKENS,
  DEFAULT_CONTEXT_AUTO_COMPACT_THRESHOLD_TOKENS,
} from '../server/session.ts'
import { AgyUsageSource } from '../server/usage.ts'
import { removeDir } from './helpers/cleanup.ts'

async function thresholdHarness(t: TestContext, autoCompactEnabled = true) {
  const home = await mkdtemp(join(tmpdir(), 'agy-context-threshold-'))
  const events: ProviderEvent[] = []
  const m = new SessionManager({
    launch: {
      command: process.execPath,
      args: [fileURLToPath(new URL('./mock-acp.ts', import.meta.url))],
      env: { HOME: home, PATH: process.env.PATH ?? '' },
    },
    usage: new AgyUsageSource(),
    capabilities: ['prompt.message', 'prompt.command', 'session.configure'],
    emit: (e) => events.push(structuredClone(e)),
  })
  t.after(async () => {
    await m.close()
    await removeDir(home)
  })
  const start = m.start.bind(m)
  let session!: Awaited<ReturnType<typeof m.start>>
  t.mock.method(
    m,
    'start',
    async (...args: Parameters<typeof start>) =>
      (session = await start(...args)),
  )
  await m.open({
    type: 'session.open',
    requestId: 'open',
    sessionId: 's',
    history: 'skip',
    config: {
      cwd: home,
      env: {},
      mcpServers: {},
      settings: autoCompactEnabled ? { autoCompactEnabled: true } : {},
      persist: true,
    },
  })
  let sequence = 0
  const sendMessage = (text: string) =>
    m.handle({
      type: 'session.prompt',
      sessionId: 's',
      prompt: {
        clientMessageId: `p${++sequence}`,
        delivery: 'auto',
        input: { type: 'message', content: [{ type: 'text', text }] },
      },
    })
  const notifications = () =>
    events.filter(
      (
        e,
      ): e is Extract<ProviderEvent, { type: 'timeline.item' }> & {
        item: { type: 'notification' }
      } => e.type === 'timeline.item' && e.item.type === 'notification',
    )
  return { m, session, events, sendMessage, notifications }
}

test('context usage >= 230K emits one warning notification and resets below 230K', async (t) => {
  const h = await thresholdHarness(t)

  h.session.publishUsage({ contextWindowUsedTokens: 229_999 })
  assert.equal(h.notifications().length, 0)

  h.session.publishUsage({ contextWindowUsedTokens: 230_000 })
  assert.equal(h.notifications().length, 1)
  assert.equal(h.notifications()[0].item.level, 'warning')
  assert.match(h.notifications()[0].item.message, /230K/)
  assert.match(h.notifications()[0].item.message, /250K/)

  h.session.publishUsage({ contextWindowUsedTokens: 245_000 })
  assert.equal(h.notifications().length, 1)

  h.session.publishUsage({ contextWindowUsedTokens: 50_000 })
  h.session.publishUsage({ contextWindowUsedTokens: 235_000 })
  assert.equal(h.notifications().length, 2)
  assert.match(h.notifications()[1].item.message, /235K/)
})

test('context usage >= 250K runs /compact before sending the next user message and emits done notification', async (t) => {
  const h = await thresholdHarness(t)
  const sentPrompts: string[] = []
  t.mock.method(h.session.transport.rpc, 'prompt', async (params: any) => {
    const text = params.prompt.map((b: any) => b.text ?? '').join('')
    sentPrompts.push(text)
    if (text === '/compact') {
      h.session.publishUsage({ contextWindowUsedTokens: 45_000 })
    }
    return { stopReason: 'end_turn' as const }
  })

  h.session.publishUsage({ contextWindowUsedTokens: 250_000 })
  await h.sendMessage('hello world')

  assert.deepEqual(sentPrompts, ['/compact', 'hello world'])
  const info = h
    .notifications()
    .find(
      (n) => n.item.level === 'info' && /250K.*\/compact/.test(n.item.message),
    )
  assert.ok(info)
  const done = h
    .notifications()
    .find((n) => n.item.message === 'Automatic /compact completed.')
  assert.ok(done)
  assert.equal(done.item.level, 'info')
  assert.match(done.item.id, /:context-autocompact-done:/)
})

test('explicit /compact at >= 250K does not double-send /compact', async (t) => {
  const h = await thresholdHarness(t)
  const sentPrompts: string[] = []
  t.mock.method(h.session.transport.rpc, 'prompt', async (params: any) => {
    sentPrompts.push(params.prompt.map((b: any) => b.text ?? '').join(''))
    return { stopReason: 'end_turn' as const }
  })

  h.session.publishUsage({ contextWindowUsedTokens: 260_000 })
  await h.sendMessage('/compact')

  assert.deepEqual(sentPrompts, ['/compact'])
})

test('failed automatic /compact warns and still sends the user message', async (t) => {
  const h = await thresholdHarness(t)
  const sentPrompts: string[] = []
  t.mock.method(h.session.transport.rpc, 'prompt', async (params: any) => {
    const text = params.prompt.map((b: any) => b.text ?? '').join('')
    sentPrompts.push(text)
    if (text === '/compact') {
      throw new Error('compact unavailable')
    }
    return { stopReason: 'end_turn' as const }
  })

  h.session.publishUsage({ contextWindowUsedTokens: 255_000 })
  await h.sendMessage('still send')

  assert.deepEqual(sentPrompts, ['/compact', 'still send'])
  const warn = h
    .notifications()
    .find((n) => /Automatic \/compact failed/.test(n.item.message))
  assert.ok(warn)
  assert.equal(warn.item.level, 'warning')
})

test('resolveCompactionThresholds returns 230K/250K defaults with autoCompactEnabled=false when unset', () => {
  assert.equal(DEFAULT_CONTEXT_WARN_THRESHOLD_TOKENS, 230_000)
  assert.equal(DEFAULT_CONTEXT_AUTO_COMPACT_THRESHOLD_TOKENS, 250_000)

  const res1 = resolveCompactionThresholds()
  assert.equal(res1.autoCompactEnabled, false)
  assert.equal(res1.warnThresholdTokens, 230_000)
  assert.equal(res1.autoCompactThresholdTokens, 250_000)
  assert.equal(res1.warnTokens, 230_000)
  assert.equal(res1.compactTokens, 250_000)

  const res2 = resolveCompactionThresholds({} as any)
  assert.equal(res2.autoCompactEnabled, false)
  assert.equal(res2.warnThresholdTokens, 230_000)
  assert.equal(res2.autoCompactThresholdTokens, 250_000)

  const resOptIn = resolveCompactionThresholds({
    providerOptions: { autoCompactEnabled: true },
  } as any)
  assert.equal(resOptIn.autoCompactEnabled, true)
})

test('default session without opt-in does not warn or auto-run /compact at >= 250K', async (t) => {
  const h = await thresholdHarness(t, false)
  const sentPrompts: string[] = []
  t.mock.method(h.session.transport.rpc, 'prompt', async (params: any) => {
    sentPrompts.push(params.prompt.map((b: any) => b.text ?? '').join(''))
    return { stopReason: 'end_turn' as const }
  })

  h.session.publishUsage({ contextWindowUsedTokens: 260_000 })
  await h.sendMessage('hello world')

  assert.equal(h.notifications().length, 0)
  assert.deepEqual(sentPrompts, ['hello world'])
})

test('resolveCompactionThresholds respects providerOptions overrides', () => {
  const res1 = resolveCompactionThresholds({
    providerOptions: { autoCompactThresholdTokens: 200_000 },
  } as any)
  assert.equal(res1.autoCompactThresholdTokens, 200_000)
  assert.equal(res1.warnThresholdTokens, 180_000)

  const res2 = resolveCompactionThresholds({
    providerOptions: {
      autoCompactThresholdTokens: 200_000,
      autoCompactWarnThresholdTokens: 150_000,
    },
  } as any)
  assert.equal(res2.autoCompactThresholdTokens, 200_000)
  assert.equal(res2.warnThresholdTokens, 150_000)
})

test('resolveCompactionThresholds respects settings overrides', () => {
  const res1 = resolveCompactionThresholds({
    settings: { autoCompactThresholdTokens: 180_000 },
  } as any)
  assert.equal(res1.autoCompactThresholdTokens, 180_000)
  assert.equal(res1.warnThresholdTokens, 160_000)

  const res2 = resolveCompactionThresholds({
    settings: {
      autoCompactThresholdTokens: 180_000,
      autoCompactWarnThresholdTokens: 140_000,
    },
  } as any)
  assert.equal(res2.autoCompactThresholdTokens, 180_000)
  assert.equal(res2.warnThresholdTokens, 140_000)
})

test('resolveCompactionThresholds respects environment variable overrides', (t) => {
  const origEnv = process.env.PASEO_AGY_COMPACT_THRESHOLD_TOKENS
  const origWarn = process.env.PASEO_AGY_COMPACT_WARN_THRESHOLD_TOKENS
  t.after(() => {
    if (origEnv !== undefined)
      process.env.PASEO_AGY_COMPACT_THRESHOLD_TOKENS = origEnv
    else delete process.env.PASEO_AGY_COMPACT_THRESHOLD_TOKENS
    if (origWarn !== undefined)
      process.env.PASEO_AGY_COMPACT_WARN_THRESHOLD_TOKENS = origWarn
    else delete process.env.PASEO_AGY_COMPACT_WARN_THRESHOLD_TOKENS
  })

  // config.env takes precedence or is read
  const resConfigEnv = resolveCompactionThresholds({
    env: { PASEO_AGY_COMPACT_THRESHOLD_TOKENS: '190000' },
  } as any)
  assert.equal(resConfigEnv.autoCompactThresholdTokens, 190_000)
  assert.equal(resConfigEnv.warnThresholdTokens, 170_000)

  // process.env fallback
  process.env.PASEO_AGY_COMPACT_THRESHOLD_TOKENS = '120000'
  process.env.PASEO_AGY_COMPACT_WARN_THRESHOLD_TOKENS = '95000'
  const resProcessEnv = resolveCompactionThresholds()
  assert.equal(resProcessEnv.autoCompactThresholdTokens, 120_000)
  assert.equal(resProcessEnv.warnThresholdTokens, 95_000)
})

test('resolveCompactionThresholds falls back to defaults or clamps on invalid inputs', () => {
  const invalidConfigs = [
    { providerOptions: { autoCompactThresholdTokens: -100 } },
    { providerOptions: { autoCompactThresholdTokens: 0 } },
    { providerOptions: { autoCompactThresholdTokens: NaN } },
    { providerOptions: { autoCompactThresholdTokens: 'invalid' } },
    { providerOptions: { autoCompactThresholdTokens: true } },
    { settings: { autoCompactThresholdTokens: null } },
  ]
  for (const cfg of invalidConfigs) {
    const res = resolveCompactionThresholds(cfg as any)
    assert.equal(res.autoCompactThresholdTokens, 250_000)
    assert.equal(res.warnThresholdTokens, 230_000)
  }

  // Small compact threshold clamps warn threshold to >= 0
  const smallCompact = resolveCompactionThresholds({
    providerOptions: { autoCompactThresholdTokens: 10_000 },
  } as any)
  assert.equal(smallCompact.autoCompactThresholdTokens, 10_000)
  assert.equal(smallCompact.warnThresholdTokens, 0)

  // Invalid warn threshold falls back to compact - 20_000
  const invalidWarn = resolveCompactionThresholds({
    providerOptions: {
      autoCompactThresholdTokens: 100_000,
      autoCompactWarnThresholdTokens: -50,
    },
  } as any)
  assert.equal(invalidWarn.autoCompactThresholdTokens, 100_000)
  assert.equal(invalidWarn.warnThresholdTokens, 80_000)
})

test('custom configured thresholds dynamically adjust warnings and auto-compaction', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'agy-context-custom-threshold-'))
  const events: ProviderEvent[] = []
  const m = new SessionManager({
    launch: {
      command: process.execPath,
      args: [fileURLToPath(new URL('./mock-acp.ts', import.meta.url))],
      env: { HOME: home, PATH: process.env.PATH ?? '' },
    },
    usage: new AgyUsageSource(),
    capabilities: ['prompt.message', 'prompt.command', 'session.configure'],
    emit: (e) => events.push(structuredClone(e)),
  })
  t.after(async () => {
    await m.close()
    await removeDir(home)
  })
  const start = m.start.bind(m)
  let session!: Awaited<ReturnType<typeof m.start>>
  t.mock.method(
    m,
    'start',
    async (...args: Parameters<typeof start>) =>
      (session = await start(...args)),
  )
  await m.open({
    type: 'session.open',
    requestId: 'open-custom',
    sessionId: 's-custom',
    history: 'skip',
    config: {
      cwd: home,
      env: {},
      mcpServers: {},
      settings: {
        autoCompactThresholdTokens: 100_000,
        autoCompactWarnThresholdTokens: 80_000,
      },
      persist: true,
    },
  })
  const notifications = () =>
    events.filter(
      (
        e,
      ): e is Extract<ProviderEvent, { type: 'timeline.item' }> & {
        item: { type: 'notification' }
      } => e.type === 'timeline.item' && e.item.type === 'notification',
    )

  // Below custom warn threshold (80K)
  session.publishUsage({ contextWindowUsedTokens: 79_999 })
  assert.equal(notifications().length, 0)

  // At custom warn threshold (80K)
  session.publishUsage({ contextWindowUsedTokens: 80_000 })
  assert.equal(notifications().length, 1)
  assert.match(notifications()[0].item.message, />= 80K.*At 100K/)

  // At custom auto-compact threshold (100K)
  const sentPrompts: string[] = []
  t.mock.method(session.transport.rpc, 'prompt', async (params: any) => {
    const text = params.prompt.map((b: any) => b.text ?? '').join('')
    sentPrompts.push(text)
    if (text === '/compact') {
      session.publishUsage({ contextWindowUsedTokens: 20_000 })
    }
    return { stopReason: 'end_turn' as const }
  })
  session.publishUsage({ contextWindowUsedTokens: 100_000 })
  await m.handle({
    type: 'session.prompt',
    sessionId: 's-custom',
    prompt: {
      clientMessageId: 'custom-p1',
      delivery: 'auto',
      input: {
        type: 'message',
        content: [{ type: 'text', text: 'custom msg' }],
      },
    },
  })
  assert.deepEqual(sentPrompts, ['/compact', 'custom msg'])
  const compactInfo = notifications().find(
    (n) => n.item.level === 'info' && />= 100K/.test(n.item.message),
  )
  assert.ok(compactInfo)
  const done = notifications().find(
    (n) => n.item.message === 'Automatic /compact completed.',
  )
  assert.ok(done)
  assert.match(done.item.id, /:context-autocompact-done:/)
})
