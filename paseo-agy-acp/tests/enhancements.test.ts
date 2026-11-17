import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ProviderEvent } from '@getpaseo/plugin/server/provider'
import {
  buildTurnError,
  ERROR_STEP_TYPE,
  inspectConversationError,
  parseGoDurationMs,
  parseUpstreamErrorPayload,
} from '../server/error-inspection.ts'
import {
  extractSecurityWarning,
  extractSecurityWarningPromptInfo,
  mapPermissionActions,
  permissionKind,
  RequestPermissionRequestSchema,
  SECURITY_WARNING_MAX_CHARS,
} from '../server/permissions.ts'
import {
  boundToolCallPayload,
  EDIT_SNAPSHOT_MAX_BYTES,
  EditDiffTracker,
  synthesizeUnifiedDiff,
  TOOL_META_BUDGET,
  TOOL_RAW_PAYLOAD_BUDGET,
  TOOL_TITLE_BUDGET,
} from '../server/tool-payload.ts'
import { Timeline } from '../server/mapping.ts'
import { connectAcp } from '../server/transport.ts'
import { SessionManager } from '../server/session.ts'
import { AgyUsageSource } from '../server/usage.ts'
import { removeDir } from './helpers/cleanup.ts'

test('P0 #1: parseGoDurationMs and parseUpstreamErrorPayload extract quota resetAt and retryable', () => {
  assert.equal(parseGoDurationMs('5s'), 5000)
  assert.equal(parseGoDurationMs('1m30s'), 90_000)
  assert.equal(parseGoDurationMs('500ms'), 500)
  assert.equal(parseGoDurationMs('-5s'), undefined)
  assert.equal(parseGoDurationMs('invalid'), undefined)

  const fixedNow = Date.parse('2026-11-15T12:00:00.000Z')
  const withTimestamp = parseUpstreamErrorPayload(
    {
      error: {
        code: 'QUOTA_EXHAUSTED',
        message: 'Quota exhausted for model',
        details: [{ quotaResetTimeStamp: '2026-11-15T12:30:00Z' }],
      },
    },
    fixedNow,
  )
  assert.equal(withTimestamp?.quotaExhausted, true)
  assert.equal(withTimestamp?.code, 'QUOTA_EXHAUSTED')
  assert.equal(withTimestamp?.resetAt, '2026-11-15T12:30:00.000Z')
  assert.equal(withTimestamp?.retryable, true)

  const withDelay = parseUpstreamErrorPayload(
    {
      status: 'RESOURCE_EXHAUSTED',
      retryDelay: '2m30s',
    },
    fixedNow,
  )
  assert.equal(withDelay?.retryAfterMs, 150_000)
  assert.equal(withDelay?.resetAt, '2026-11-15T12:02:30.000Z')
  assert.equal(withDelay?.retryable, true)
})

test('P0 #1: inspectConversationError reads step_type=17 read-only and handles missing/corrupt DBs', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agy-err-inspect-'))
  try {
    assert.equal(inspectConversationError(home, 'missing-session'), undefined)

    const convDir = join(home, 'conversations')
    mkdirSync(convDir, { recursive: true })
    const dbPath = join(convDir, 'sess-1.db')
    const db = new DatabaseSync(dbPath)
    db.exec(
      'CREATE TABLE steps (idx INTEGER PRIMARY KEY, step_type INTEGER, step_json TEXT);',
    )
    db.prepare(
      'INSERT INTO steps (idx, step_type, step_json) VALUES (?, ?, ?)',
    ).run(
      1,
      ERROR_STEP_TYPE,
      JSON.stringify({
        error: {
          code: 'QUOTA_EXHAUSTED',
          message: 'Old quota error',
          quotaResetDelay: '10s',
        },
      }),
    )
    db.prepare(
      'INSERT INTO steps (idx, step_type, step_json) VALUES (?, ?, ?)',
    ).run(
      5,
      ERROR_STEP_TYPE,
      JSON.stringify({
        error: {
          code: 'QUOTA_EXHAUSTED',
          message: 'Current quota error',
          quotaResetTimeStamp: '2026-11-15T18:00:00Z',
        },
      }),
    )
    db.close()

    const inspected = inspectConversationError(home, 'sess-1', 3)
    assert.equal(inspected?.message, 'Current quota error')
    assert.equal(inspected?.resetAt, '2026-11-15T18:00:00.000Z')
    assert.equal(inspected?.retryable, true)

    const err = buildTurnError('refusal', inspected)
    assert.equal(err?.code, 'QUOTA_EXHAUSTED')
    assert.equal(err?.message, 'Current quota error')
    const diag = JSON.parse(err?.diagnostic ?? '{}')
    assert.equal(diag.quotaExhausted, true)
    assert.equal(diag.resetAt, '2026-11-15T18:00:00.000Z')
    assert.equal(diag.stopReason, 'refusal')

    const refusalOnly = buildTurnError('refusal', undefined)
    assert.equal(refusalOnly?.code, 'REFUSAL')

    writeFileSync(join(convDir, 'corrupt.db'), 'not-a-sqlite-db')
    assert.equal(inspectConversationError(home, 'corrupt'), undefined)
  } finally {
    await removeDir(home)
  }
})

test('P0 #2: toggling full-access from default hot-switches in-memory without process restart', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agy-hotswitch-'))
  const log = join(home, 'calls.log')
  const fixture = join(home, 'fixture-hotswitch.mjs')
  const sdkUrl = import.meta.resolve('@agentclientprotocol/sdk')
  await writeFile(
    fixture,
    `
import { AgentSideConnection, ndJsonStream } from ${JSON.stringify(sdkUrl)}
import { appendFileSync } from 'node:fs'
import { Readable, Writable } from 'node:stream'

appendFileSync(process.env.AGY_LOG, 'start:' + process.pid + '\\n')
const nativeId = '22222222-2222-4222-8222-222222222222'
const configOptions = [{
  id: 'mode', name: 'Mode', category: 'mode', type: 'select', currentValue: 'default',
  options: [{ value: 'default', name: 'Default' }, { value: 'accept-edits', name: 'Accept edits' }],
}]
const stream = ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))
new AgentSideConnection((client) => ({
  async initialize() { return { protocolVersion: 1, agentCapabilities: { loadSession: true } } },
  async authenticate() { return {} },
  async newSession() {
    appendFileSync(process.env.AGY_LOG, 'new\\n')
    setImmediate(() => {
      void client.sessionUpdate({ sessionId: nativeId, update: { sessionUpdate: 'available_commands_update', availableCommands: [] } })
    })
    return { sessionId: nativeId, configOptions }
  },
  async loadSession() {
    appendFileSync(process.env.AGY_LOG, 'load\\n')
    return { configOptions }
  },
  async setSessionConfigOption({ configId, value }) {
    appendFileSync(process.env.AGY_LOG, 'cfg:' + configId + '=' + value + '\\n')
    return { configOptions: configOptions.map((o) => o.id === configId ? { ...o, currentValue: String(value) } : o) }
  },
  async cancel() {},
  async prompt() {
    const res = await client.requestPermission({
      sessionId: nativeId,
      toolCall: { toolCallId: 'tc-1', title: 'Run tool', rawInput: { cmd: 'echo hi' } },
      options: [{ optionId: 'yes', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'Deny', kind: 'reject_once' }],
    })
    const msg = res.outcome?.outcome === 'selected' ? 'approved:' + res.outcome.optionId : 'denied'
    await client.sessionUpdate({ sessionId: nativeId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: msg } } })
    return { stopReason: 'end_turn' }
  },
}), stream)
`,
  )
  const events: ProviderEvent[] = []
  const manager = new SessionManager({
    launch: {
      command: process.execPath,
      args: [fixture],
      env: { HOME: home, PATH: process.env.PATH ?? '', AGY_LOG: log },
    },
    usage: new AgyUsageSource(),
    capabilities: ['session.configure'],
    emit: (e) => events.push(structuredClone(e)),
  })
  try {
    await manager.open({
      type: 'session.open',
      requestId: 'open-hs',
      sessionId: 'hs',
      history: 'skip',
      config: {
        cwd: home,
        env: {},
        mcpServers: {},
        settings: {},
        persist: true,
      },
    })
    await manager.handle({
      type: 'session.configure',
      requestId: 'cfg-fa',
      sessionId: 'hs',
      changes: { mode: 'full-access' },
    })
    await manager.handle({
      type: 'session.prompt',
      sessionId: 'hs',
      prompt: {
        clientMessageId: 'p1',
        delivery: 'auto',
        input: { type: 'message', content: [{ type: 'text', text: 'go' }] },
      },
    })
    assert.ok(!events.some((e) => e.type === 'session.permission'))
    assert.ok(
      events.some(
        (e) =>
          e.type === 'timeline.item' &&
          e.item.type === 'assistant_message' &&
          e.item.text === 'approved:yes',
      ),
    )

    const logText = await readFile(log, 'utf8')
    const starts = logText.split('\n').filter((l) => l.startsWith('start:'))
    assert.equal(starts.length, 1)
    assert.ok(!logText.includes('load\n'))
  } finally {
    await manager.close()
    await removeDir(home)
  }
})

test('P1 #3 & P2 #5: security warning propagation on allow_always and interaction_* question detection', () => {
  const longMessage = 'W'.repeat(SECURITY_WARNING_MAX_CHARS + 50)
  const rawReq = {
    sessionId: 's1',
    toolCall: { toolCallId: 'interaction_abc', title: 'Tool' },
    options: [
      { optionId: 'once', name: 'Allow once', kind: 'allow_once' },
      {
        optionId: 'always',
        name: 'Allow always',
        kind: 'allow_always',
        _meta: {
          'agy.security.warning': {
            title: 'High Risk',
            message: longMessage,
          },
        },
      },
      { optionId: 'deny', name: 'Deny', kind: 'reject_once' },
    ],
  }
  const parsed = RequestPermissionRequestSchema.parse(rawReq)
  const warning = extractSecurityWarning(parsed.options[1])
  assert.equal(warning?.title, 'High Risk')
  assert.equal(warning?.message?.length, SECURITY_WARNING_MAX_CHARS)

  const actions = mapPermissionActions(parsed.options)
  assert.equal(actions[0].variant, undefined)
  assert.equal(actions[1].variant, 'danger')
  assert.equal(actions[2].variant, undefined)

  const promptInfo = extractSecurityWarningPromptInfo(parsed.options)
  assert.ok(promptInfo.description?.startsWith('High Risk: '))
  assert.ok(promptInfo.metadata?.securityWarning)

  assert.equal(
    permissionKind(parsed, { type: 'unknown', input: null, output: null }),
    'question',
  )
})

test('P1 #4: boundToolCallPayload caps large fields and EditDiffTracker synthesizes missing diffs', async () => {
  const huge = 'x'.repeat(TOOL_RAW_PAYLOAD_BUDGET + 5000)
  const bounded = boundToolCallPayload({
    title: 't'.repeat(TOOL_TITLE_BUDGET + 200),
    rawInput: { data: huge },
    rawOutput: huge,
    _meta: { trace: 'm'.repeat(TOOL_META_BUDGET + 500) },
  })
  assert.ok((bounded.title as string).length <= TOOL_TITLE_BUDGET)
  assert.ok((bounded.rawOutput as string).length <= TOOL_RAW_PAYLOAD_BUDGET)
  assert.ok(
    JSON.stringify(bounded.rawInput).length <= TOOL_RAW_PAYLOAD_BUDGET + 100,
  )
  assert.ok(JSON.stringify(bounded._meta).length <= TOOL_META_BUDGET + 100)

  const tl = new Timeline('p')
  const item = tl.update({
    sessionUpdate: 'tool_call',
    toolCallId: 'tc-huge',
    title: 'Big',
    status: 'completed',
    rawOutput: huge,
  })
  assert.equal(item?.type, 'tool_call')
  assert.ok(
    String(tl.toolCallSnapshot('tc-huge')?.rawOutput).length <=
      TOOL_RAW_PAYLOAD_BUDGET,
  )

  const dir = await mkdtemp(join(tmpdir(), 'agy-diff-'))
  try {
    const file = join(dir, 'sample.txt')
    await writeFile(file, 'line1\nline2\nline3\n')
    const tracker = new EditDiffTracker()
    await tracker.capturePending(dir, {
      toolCallId: 'edit-1',
      status: 'pending',
      kind: 'edit',
      locations: [{ path: 'sample.txt' }],
    })
    await writeFile(file, 'line1\nline2-edited\nline3\n')
    const enriched = await tracker.synthesizeIfMissing(dir, {
      sessionUpdate: 'tool_call_update',
      toolCallId: 'edit-1',
      status: 'completed',
      kind: 'edit',
      locations: [{ path: 'sample.txt' }],
    })
    const synth = (enriched._meta as Record<string, unknown>)
      ?.synthesizedUnifiedDiff as string
    assert.ok(synth.includes('--- a/sample.txt'))
    assert.ok(synth.includes('-line2'))
    assert.ok(synth.includes('+line2-edited'))

    const binFile = join(dir, 'bin.dat')
    await writeFile(binFile, Buffer.from([0, 1, 2, 3]))
    await tracker.capturePending(dir, {
      toolCallId: 'edit-bin',
      status: 'pending',
      kind: 'edit',
      locations: [{ path: 'bin.dat' }],
    })
    const binEnriched = await tracker.synthesizeIfMissing(dir, {
      sessionUpdate: 'tool_call_update',
      toolCallId: 'edit-bin',
      status: 'completed',
      kind: 'edit',
      locations: [{ path: 'bin.dat' }],
    })
    assert.equal(
      (binEnriched._meta as Record<string, unknown>)?.synthesizedUnifiedDiff,
      '[diff omitted: binary]',
    )

    const bigFile = join(dir, 'big.txt')
    await writeFile(bigFile, 'a'.repeat(EDIT_SNAPSHOT_MAX_BYTES + 10))
    await tracker.capturePending(dir, {
      toolCallId: 'edit-big',
      status: 'pending',
      kind: 'edit',
      locations: [{ path: 'big.txt' }],
    })
    const bigEnriched = await tracker.synthesizeIfMissing(dir, {
      sessionUpdate: 'tool_call_update',
      toolCallId: 'edit-big',
      status: 'completed',
      kind: 'edit',
      locations: [{ path: 'big.txt' }],
    })
    assert.equal(
      (bigEnriched._meta as Record<string, unknown>)?.synthesizedUnifiedDiff,
      '[diff omitted: too large]',
    )
    assert.ok(synthesizeUnifiedDiff('a.txt', '1\n2', '1\n3').includes('+3'))
  } finally {
    await removeDir(dir)
  }
})

test('P2 #6: connectAcp assigns per-process run-* TMPDIR and cleans it up on close', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agy-tmp-test-'))
  const tmpLog = join(dir, 'tmpdir.txt')
  const script = join(dir, 'echo-tmp.mjs')
  await writeFile(
    script,
    `
import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(tmpLog)}, process.env.TMPDIR ?? '')
setInterval(() => {}, 1000)
`,
  )
  const conn = connectAcp(
    { command: process.execPath, args: [script], env: {} },
    dir,
    {},
    {
      sessionUpdate: async () => {},
      requestPermission: async () => ({ outcome: { outcome: 'cancelled' } }),
    },
    () => {},
  )
  try {
    for (let i = 0; i < 40 && !existsSync(tmpLog); i++) {
      await new Promise((r) => setTimeout(r, 25))
    }
    const assignedTmp = await readFile(tmpLog, 'utf8')
    assert.match(assignedTmp, /run-/)
    assert.equal(existsSync(assignedTmp), true)

    await conn.close()
    for (let i = 0; i < 40 && existsSync(assignedTmp); i++) {
      await new Promise((r) => setTimeout(r, 25))
    }
    assert.equal(existsSync(assignedTmp), false)
  } finally {
    await conn.close().catch(() => undefined)
    await removeDir(dir)
  }
})

test('SessionManager.open() propagates configureSession error without emitting session.opened or session.closed', async () => {
  const home = await mkdtemp(join(tmpdir(), 'agy-open-err-'))
  const fixture = join(home, 'fixture-no-model.mjs')
  const sdkUrl = import.meta.resolve('@agentclientprotocol/sdk')
  await writeFile(
    fixture,
    `
import { AgentSideConnection, ndJsonStream } from ${JSON.stringify(sdkUrl)}
import { Readable, Writable } from 'node:stream'

const nativeId = '33333333-3333-4333-8333-333333333333'
const stream = ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))
new AgentSideConnection(() => ({
  async initialize() { return { protocolVersion: 1, agentCapabilities: { loadSession: true } } },
  async authenticate() { return {} },
  async newSession() {
    return { sessionId: nativeId, configOptions: [] }
  },
  async cancel() {},
  async prompt() { return { stopReason: 'end_turn' } },
}), stream)
`,
  )
  const events: ProviderEvent[] = []
  const manager = new SessionManager({
    launch: {
      command: process.execPath,
      args: [fixture],
      env: { HOME: home, PATH: process.env.PATH ?? '' },
    },
    usage: new AgyUsageSource(),
    capabilities: ['session.configure'],
    emit: (e) => events.push(structuredClone(e)),
  })
  try {
    await assert.rejects(
      manager.open({
        type: 'session.open',
        requestId: 'open-fail',
        sessionId: 'fail-sess',
        history: 'skip',
        config: {
          cwd: home,
          env: {},
          mcpServers: {},
          settings: {},
          persist: false,
          model: 'gemini-4-hydrogen',
        },
      }),
      /agy does not advertise model/,
    )
    assert.equal(
      events.some((e) => e.type === 'session.opened'),
      false,
    )
    assert.equal(
      events.some((e) => e.type === 'session.closed'),
      false,
    )
  } finally {
    await manager.close()
    await removeDir(home)
  }
})
