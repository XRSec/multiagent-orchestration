import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ProviderEvent } from '@getpaseo/plugin/server/provider'
import { SessionManager } from '../server/session.ts'
import { AgyUsageSource } from '../server/usage.ts'
import { removeDir } from './helpers/cleanup.ts'

async function thresholdHarness(t: TestContext) {
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
      settings: {},
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

test('context usage >= 280K emits one warning notification and resets below 280K', async (t) => {
  const h = await thresholdHarness(t)

  h.session.publishUsage({ contextWindowUsedTokens: 279_999 })
  assert.equal(h.notifications().length, 0)

  h.session.publishUsage({ contextWindowUsedTokens: 280_000 })
  assert.equal(h.notifications().length, 1)
  assert.equal(h.notifications()[0].item.level, 'warning')
  assert.match(h.notifications()[0].item.message, /280K/)

  h.session.publishUsage({ contextWindowUsedTokens: 295_000 })
  assert.equal(h.notifications().length, 1)

  h.session.publishUsage({ contextWindowUsedTokens: 50_000 })
  h.session.publishUsage({ contextWindowUsedTokens: 285_000 })
  assert.equal(h.notifications().length, 2)
  assert.match(h.notifications()[1].item.message, /285K/)
})

test('context usage >= 300K runs /compact before sending the next user message', async (t) => {
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

  h.session.publishUsage({ contextWindowUsedTokens: 300_000 })
  await h.sendMessage('hello world')

  assert.deepEqual(sentPrompts, ['/compact', 'hello world'])
  const info = h.notifications().find((n) => n.item.level === 'info')
  assert.ok(info)
  assert.match(info.item.message, /300K.*\/compact/)
})

test('explicit /compact at >= 300K does not double-send /compact', async (t) => {
  const h = await thresholdHarness(t)
  const sentPrompts: string[] = []
  t.mock.method(h.session.transport.rpc, 'prompt', async (params: any) => {
    sentPrompts.push(params.prompt.map((b: any) => b.text ?? '').join(''))
    return { stopReason: 'end_turn' as const }
  })

  h.session.publishUsage({ contextWindowUsedTokens: 310_000 })
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

  h.session.publishUsage({ contextWindowUsedTokens: 305_000 })
  await h.sendMessage('still send')

  assert.deepEqual(sentPrompts, ['/compact', 'still send'])
  const warn = h
    .notifications()
    .find((n) => /Automatic \/compact failed/.test(n.item.message))
  assert.ok(warn)
  assert.equal(warn.item.level, 'warning')
})
