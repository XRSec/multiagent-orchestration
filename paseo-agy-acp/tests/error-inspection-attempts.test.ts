/**
 * Purpose: Regression suite for retry-attempt rows, human-readable error text, retryability and bounded cancel.
 * Context: Fixtures mirror real agy blobs (UUID protobuf frame + 503 capacity text + EOF text).
 * Usage: `node --test tests/error-inspection-attempts.test.ts`.
 * Prerequisites: Node >= 22.18.0 with node:sqlite DatabaseSync.
 * Size: ~648 lines (500-800 band) because it embeds the verbatim production blobs next to the schema and interrupt regressions.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import type { ProviderEvent } from '@getpaseo/plugin/server/provider'
import {
  AGY_STEP_TYPE_PLANNER_RESPONSE,
  AGY_STEP_TYPE_USER_INPUT,
  ERROR_STEP_TYPE,
  buildTurnError,
  inspectConversationError,
  parseUpstreamErrorPayload,
  selectBlobErrorText,
} from '../server/error-inspection.ts'
import { SessionManager } from '../server/session.ts'
import { AgyUsageSource } from '../server/usage.ts'

const UUID = '46471cc4-9c71-4913-8159-c6812504aecb'
const CAPACITY =
  'API error (attempt 1): UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-high on the server'
const EOF =
  'API error (attempt 1): request failed: Post "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse": EOF'

/**
 * Verbatim `steps.step_payload` bytes (step_type=17) from the production conversation
 * `466f2ea4-3358-408c-9c68-1575eb9ac9fa`: the 503 capacity retry and the EOF stream failure.
 * They carry the real protobuf framing (`r`/`q` length byte, `2+<uuid>-<step>-2010` tail).
 */
const REAL_CAPACITY_HEX =
  '081120032acd010a0c08afe3efd706108098da83021805420c08afe3efd706108098da8302622434363437316363342d' +
  '396337312d343931332d383135392d633638313235303461656362a2014e0a2430613131363231302d303335612d3436' +
  '35662d396235302d3631386331613633386235381002222434363666326561342d333335382d343038632d396336382d' +
  '313537356562396163396661d201120a100803120c08afe3efd70610d8c8dc83029a0220346531623666636661343436' +
  '3433653539343735343863616430353535336139c201a4011aa1011272415049206572726f722028617474656d707420' +
  '31293a20554e415641494c41424c452028636f646520353033293a204e6f20636170616369747920617661696c61626c' +
  '6520666f72206d6f64656c2067656d696e692d332e382d666c6173682d68696768206f6e207468652073657276657232' +
  '2b30613131363231302d303335612d343635662d396235302d3631386331613633386235382d322d32303130'
const REAL_EOF_HEX =
  '081120032acf010a0c08fa8cf0d70610b8d9efa4011805420c08fa8cf0d70610b8d9efa401622439353635333866382d' +
  '633831662d346365362d393065622d656538616564336366343230a201500a2430613131363231302d303335612d3436' +
  '35662d396235302d36313863316136333862353810731833222434363666326561342d333335382d343038632d396336' +
  '382d313537356562396163396661d201120a100803120c08fa8cf0d70610b8caf4a4019a022033393034383735363236' +
  '37653436396539623665626337656633643533366531c201b5011ab201128501415049206572726f722028617474656d' +
  '70742031293a2072657175657374206661696c65643a20506f7374202268747470733a2f2f6461696c792d636c6f7564' +
  '636f64652d70612e676f6f676c65617069732e636f6d2f7631696e7465726e616c3a73747265616d47656e6572617465' +
  '436f6e74656e743f616c743d737365223a20454f46322830613131363231302d303335612d343635662d396235302d36' +
  '31386331613633386235382d313135'
const REAL_BLOBS = [
  { name: 'capacity-503', hex: REAL_CAPACITY_HEX, expected: CAPACITY },
  { name: 'stream-eof', hex: REAL_EOF_HEX, expected: EOF },
]

/** Build the real first readable frame: 0x62 + 0x24 + executor UUID. */
function uuidFrame(uuid = UUID): Buffer {
  return Buffer.concat([Buffer.from([0x62, 0x24]), Buffer.from(uuid, 'utf8')])
}

function blob(...parts: Buffer[]): Buffer {
  return Buffer.concat(parts)
}

function makeDb(
  appDataDir: string,
  nativeId: string,
  rows: Array<{
    idx: number
    stepType: number
    status?: number
    payload?: Buffer | string
  }>,
): void {
  const convDir = join(appDataDir, 'conversations')
  mkdirSync(convDir, { recursive: true })
  const db = new DatabaseSync(join(convDir, `${nativeId}.db`))
  try {
    db.exec(
      'CREATE TABLE IF NOT EXISTS steps (idx INTEGER PRIMARY KEY, step_type INTEGER, status INTEGER, step_payload BLOB);',
    )
    const insert = db.prepare(
      'INSERT OR REPLACE INTO steps (idx, step_type, status, step_payload) VALUES (?, ?, ?, ?)',
    )
    for (const row of rows)
      insert.run(row.idx, row.stepType, row.status ?? 3, row.payload ?? null)
  } finally {
    db.close()
  }
}

/** Conversation schema without the `status` column (older or trimmed datasets). */
function makeDbWithoutStatus(
  appDataDir: string,
  nativeId: string,
  rows: Array<{ idx: number; stepType: number; payload?: Buffer | string }>,
): void {
  const convDir = join(appDataDir, 'conversations')
  mkdirSync(convDir, { recursive: true })
  const db = new DatabaseSync(join(convDir, `${nativeId}.db`))
  try {
    db.exec(
      'CREATE TABLE IF NOT EXISTS steps (idx INTEGER PRIMARY KEY, step_type INTEGER, step_payload BLOB);',
    )
    const insert = db.prepare(
      'INSERT OR REPLACE INTO steps (idx, step_type, step_payload) VALUES (?, ?, ?)',
    )
    for (const row of rows)
      insert.run(row.idx, row.stepType, row.payload ?? null)
  } finally {
    db.close()
  }
}

function manager(home: string, events: ProviderEvent[]) {
  return new SessionManager({
    launch: {
      command: process.execPath,
      args: [fileURLToPath(new URL('./mock-acp.ts', import.meta.url))],
      env: {
        HOME: home,
        PATH: process.env.PATH ?? '',
        AGY_TEST_LOG: join(home, 'mock.log'),
        AGY_TEST_LOG_LOAD: '1',
      },
    },
    usage: new AgyUsageSource(),
    capabilities: ['prompt.message', 'permission', 'session.configure'],
    emit(event) {
      events.push(event)
    },
    stallTimeoutMs: 5000,
    turnStallTimeoutMs: 5000,
  })
}

async function open(m: SessionManager, sessionId: string, home: string) {
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
      mode: 'full-access',
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

function terminals(events: ProviderEvent[]) {
  return events.filter(
    (event) => event.type === 'session.turn' && event.state !== 'started',
  )
}

async function waitFor(predicate: () => boolean, describe: () => string) {
  const deadline = Date.now() + 5000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out: ${describe()}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/** Methods the mock ACP runtime logged (`new`, `load`, `cancel`, `prompt`, ...). */
async function mockLog(home: string): Promise<string[]> {
  try {
    return (await readFile(join(home, 'mock.log'), 'utf8'))
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

/** Native session id the mock registered, discovered from the conversation DB it wrote. */
function nativeIdFor(home: string): string {
  const convDir = join(home, '.gemini/antigravity-cli/conversations')
  const dbFile = readdirSync(convDir).find((name) => name.endsWith('.db'))
  assert.ok(dbFile, 'the mock runtime must have written a conversation DB')
  return dbFile.slice(0, -'.db'.length)
}

test('attempt row followed by a terminal planner response is not a terminal failure', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agy-attempt-unit-'))
  try {
    makeDb(home, 'attempt-then-done', [
      {
        idx: 1,
        stepType: ERROR_STEP_TYPE,
        payload: blob(uuidFrame(), Buffer.from(CAPACITY)),
      },
      {
        idx: 2,
        stepType: AGY_STEP_TYPE_PLANNER_RESPONSE,
        payload: 'Recovered after retry.',
      },
    ])
    assert.equal(
      inspectConversationError(home, 'attempt-then-done', 0),
      undefined,
    )
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('next user input closes the turn window; a later terminal response is outside it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agy-attempt-window-'))
  try {
    makeDb(home, 'attempt-then-user-then-done', [
      {
        idx: 1,
        stepType: ERROR_STEP_TYPE,
        payload: blob(uuidFrame(), Buffer.from(CAPACITY)),
      },
      { idx: 2, stepType: AGY_STEP_TYPE_USER_INPUT, payload: 'next request' },
      {
        idx: 3,
        stepType: AGY_STEP_TYPE_PLANNER_RESPONSE,
        payload: 'different turn',
      },
    ])
    const inspected = inspectConversationError(
      home,
      'attempt-then-user-then-done',
      0,
    )
    assert.equal(inspected?.stepIndex, 1)
    assert.match(inspected?.message ?? '', /No capacity available/)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('UUID-only blob yields the generic fallback, never an identifier', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agy-attempt-uuid-'))
  try {
    makeDb(home, 'uuid-only', [
      {
        idx: 1,
        stepType: ERROR_STEP_TYPE,
        payload: uuidFrame('9a984e3a-6eae-4cc3-9748-b58ba995022d'),
      },
    ])
    const inspected = inspectConversationError(home, 'uuid-only', 0)
    assert.equal(inspected?.message, 'Upstream provider error (step_type=17)')
    assert.doesNotMatch(inspected?.message ?? '', /9a984e3a|b\$|3b\$/)
    assert.equal(
      selectBlobErrorText('b$46471cc4-9c71-4913-8159-c6812504aecb'),
      undefined,
    )
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('503 and EOF text blobs are human readable and retryable', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agy-attempt-text-'))
  try {
    makeDb(home, 'capacity-text', [
      {
        idx: 1,
        stepType: ERROR_STEP_TYPE,
        payload: blob(uuidFrame(), Buffer.from(CAPACITY)),
      },
    ])
    const capacity = inspectConversationError(home, 'capacity-text', 0)
    assert.match(
      capacity?.message ?? '',
      /No capacity available for model gemini-3\.8-flash-high/,
    )
    assert.doesNotMatch(capacity?.message ?? '', /46471cc4|b\$/)
    assert.equal(capacity?.retryable, true)
    const err = buildTurnError('unknown_upstream', capacity)
    assert.equal(err?.message, capacity?.message)
    assert.equal(JSON.parse(err?.diagnostic ?? '{}').retryable, true)

    const eof = parseUpstreamErrorPayload(EOF)
    assert.match(eof?.message ?? '', /streamGenerateContent/)
    assert.equal(eof?.retryable, false)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('full real agy blobs sanitize to the clean human sentence with no framing debris', async () => {
  for (const fixture of REAL_BLOBS) {
    const selected = selectBlobErrorText(
      Buffer.from(fixture.hex, 'hex').toString('utf8'),
    )
    assert.equal(selected, fixture.expected, `${fixture.name} selected text`)
    assert.doesNotMatch(
      selected ?? '',
      /[0-9a-f]{8}-[0-9a-f]{4}-/i,
      fixture.name,
    )
    assert.doesNotMatch(selected ?? '', /server2[+,(]/, fixture.name)
    assert.doesNotMatch(selected ?? '', /�/, fixture.name)
  }
  const home = mkdtempSync(join(tmpdir(), 'agy-attempt-real-blob-'))
  try {
    makeDb(home, 'real-capacity', [
      {
        idx: 1,
        stepType: ERROR_STEP_TYPE,
        payload: Buffer.from(REAL_CAPACITY_HEX, 'hex'),
      },
    ])
    const inspected = inspectConversationError(home, 'real-capacity', 0)
    assert.equal(inspected?.message, CAPACITY)
    assert.equal(inspected?.retryable, true)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('localized error text survives sanitization byte-for-byte', async () => {
  const german = 'Fehler: Ressource nicht verfügbar (503)'
  assert.equal(selectBlobErrorText(german), german)
  const chinese = '上游容量不足，请稍后重试 (503)'
  assert.equal(selectBlobErrorText(chinese), chinese)
  const accented = 'Erreur : capacité épuisée, réessayez (503)'
  assert.equal(selectBlobErrorText(accented), accented)
  const rtl = 'שגיאה: הקיבולת אוזלת, נסה שוב (503)'
  assert.equal(selectBlobErrorText(rtl), rtl)
  const emoji = '上游容量不足 😀 请稍后重试 (503)'
  assert.equal(selectBlobErrorText(emoji), emoji)

  const home = mkdtempSync(join(tmpdir(), 'agy-attempt-localized-'))
  try {
    makeDb(home, 'localized', [
      {
        idx: 1,
        stepType: ERROR_STEP_TYPE,
        payload: Buffer.concat([
          uuidFrame(),
          Buffer.from(` ${german}`, 'utf8'),
        ]),
      },
    ])
    const inspected = inspectConversationError(home, 'localized', 0)
    assert.equal(inspected?.message, german)
    assert.equal(inspected?.retryable, true)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a run dominated by replacement chars is rejected and falls back', async () => {
  assert.equal(selectBlobErrorText(`API 503 ${'�'.repeat(40)}`), undefined)
  const home = mkdtempSync(join(tmpdir(), 'agy-attempt-binary-'))
  try {
    makeDb(home, 'binary-run', [
      {
        idx: 1,
        stepType: ERROR_STEP_TYPE,
        payload: Buffer.concat([
          Buffer.from('API 503 ', 'utf8'),
          Buffer.from('�'.repeat(40), 'utf8'),
        ]),
      },
    ])
    const inspected = inspectConversationError(home, 'binary-run', 0)
    assert.equal(inspected?.message, 'Upstream provider error (step_type=17)')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('UUID removal never eats a decimal version or non-framing punctuation', () => {
  const uuid = '46471cc4-9c71-4913-8159-c6812504aecb'
  assert.equal(
    selectBlobErrorText(`version 1.2.3-${uuid} rejected 503`),
    'version 1.2.3 rejected 503',
  )
  assert.equal(
    selectBlobErrorText(`version 1.2.3:${uuid} rejected 503`),
    'version 1.2.3 rejected 503',
  )
  // Real protobuf tag/length debris variants still disappear completely.
  for (const glue of ['2+', '2,', '2(']) {
    assert.equal(
      selectBlobErrorText(`${CAPACITY}${glue}${uuid}-2-2010`),
      CAPACITY,
      `debris ${glue}`,
    )
  }
})

test('UUID debris never consumes a closing paren or the text before it', () => {
  const uuid = '46471cc4-9c71-4913-8159-c6812504aecb'
  assert.equal(
    selectBlobErrorText(`rate limited (503)${uuid}-3-2010`),
    'rate limited (503)',
  )
  assert.equal(
    selectBlobErrorText(`capacity (attempt 1)${uuid}-3-2010`),
    'capacity (attempt 1)',
  )
  // Real production glue: `server2(` + trajectory UUID + step tail.
  assert.equal(
    selectBlobErrorText(
      `${CAPACITY}2(0a116210-035a-465f-9b50-618c1a638b58-2-2010`,
    ),
    CAPACITY,
  )
  // A closing paren right after the numeric glue still terminates the walk.
  assert.equal(
    selectBlobErrorText(`${CAPACITY}2)+${uuid}-3-2010`),
    `${CAPACITY}2)`,
  )
  // Version numbers and comma-separated numbers are never eaten.
  assert.equal(
    selectBlobErrorText(`version 1.2.3-${uuid} rejected 503`),
    'version 1.2.3 rejected 503',
  )
  assert.equal(selectBlobErrorText(`2,503 ${uuid}`), '2,503')
})

test('a dataset without a status column still reports the step_type=17 failure', async () => {
  const home = mkdtempSync(join(tmpdir(), 'agy-attempt-nostatus-'))
  try {
    makeDbWithoutStatus(home, 'no-status-fail', [
      {
        idx: 1,
        stepType: ERROR_STEP_TYPE,
        payload: uuidFrame('9a984e3a-6eae-4cc3-9748-b58ba995022d'),
      },
    ])
    const inspected = inspectConversationError(home, 'no-status-fail', 0)
    assert.equal(inspected?.message, 'Upstream provider error (step_type=17)')
    assert.equal(inspected?.retryable, false)

    makeDbWithoutStatus(home, 'no-status-attempt', [
      {
        idx: 1,
        stepType: ERROR_STEP_TYPE,
        payload: Buffer.from(REAL_CAPACITY_HEX, 'hex'),
      },
      {
        idx: 2,
        stepType: AGY_STEP_TYPE_PLANNER_RESPONSE,
        payload: 'Recovered without a status column.',
      },
    ])
    assert.equal(
      inspectConversationError(home, 'no-status-attempt', 0),
      undefined,
    )
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test(
  'a completed turn with a mid-turn attempt row stays completed and interrupt acks fast',
  { timeout: 10000 },
  async () => {
    const home = mkdtempSync(join(tmpdir(), 'agy-attempt-complete-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events)
    try {
      await open(m, 's', home)
      await prompt(m, 's', 'attempt-503-complete')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const terminal = terminals(events).at(-1)
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'completed')
      assert.equal(terminal.error, undefined)

      const started = Date.now()
      await m.handle({
        type: 'session.interrupt',
        requestId: 'interrupt',
        sessionId: 's',
      })
      const elapsed = Date.now() - started
      assert.ok(elapsed < 500, `interrupt took ${elapsed}ms after settle`)
      assert.equal(terminals(events).length, 1)
      const log = await mockLog(home)
      assert.equal(
        log.includes('load'),
        false,
        'no-op interrupt must not relaunch',
      )
      assert.equal(
        log.includes('cancel'),
        false,
        'settled no-op interrupt must ack locally',
      )
    } finally {
      await m.close()
      await rm(home, { recursive: true, force: true })
    }
  },
)

test(
  'a settled turn that left background work still cancels the background owner',
  { timeout: 15000 },
  async () => {
    const home = mkdtempSync(join(tmpdir(), 'agy-attempt-settled-bg-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events)
    try {
      await open(m, 's', home)
      await prompt(m, 's', 'attempt-503-complete')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      // The turn is settled; agy registers a background task only after the terminal event.
      const nativeId = nativeIdFor(home)
      const logsDir = join(
        home,
        '.gemini/antigravity-cli/brain',
        nativeId,
        '.system_generated/logs',
      )
      mkdirSync(logsDir, { recursive: true })
      writeFileSync(
        join(logsDir, 'transcript_full.jsonl'),
        [
          {
            step_index: 1,
            type: 'USER_INPUT',
            content: '<USER_REQUEST>attempt-503-complete</USER_REQUEST>',
          },
          {
            step_index: 2,
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Scanning disk...',
            tool_calls: [
              {
                id: 'bg-late',
                name: 'run_command',
                args: { CommandLine: 'du -sh /home' },
              },
            ],
          },
          {
            step_index: 3,
            type: 'GENERIC',
            status: 'RUNNING',
            content: `Tool is running as a background task with task id: ${nativeId}/task-late\n`,
          },
          {
            step_index: 4,
            type: 'PLANNER_RESPONSE',
            status: 'DONE',
            content: 'Waiting for background scan to finish...',
          },
        ]
          .map((row) => JSON.stringify(row) + '\n')
          .join(''),
      )

      await m.handle({
        type: 'session.interrupt',
        requestId: 'interrupt',
        sessionId: 's',
      })
      const log = await mockLog(home)
      assert.ok(log.includes('cancel'), `expected native cancel, got ${log}`)
      assert.ok(
        log.includes('load'),
        `expected background owner relaunch, got ${log}`,
      )
    } finally {
      await m.close()
      await rm(home, { recursive: true, force: true })
    }
  },
)

test(
  'a failed turn gets the 503 sentence, stays retryable and interrupt acks fast',
  { timeout: 10000 },
  async () => {
    const home = mkdtempSync(join(tmpdir(), 'agy-attempt-fail-'))
    const events: ProviderEvent[] = []
    const m = manager(home, events)
    try {
      await open(m, 's', home)
      await prompt(m, 's', 'attempt-503-fail')
      await waitFor(
        () => terminals(events).length > 0,
        () => JSON.stringify(events),
      )
      const terminal = terminals(events).at(-1)
      assert.ok(terminal?.type === 'session.turn')
      assert.equal(terminal.state, 'failed')
      assert.match(
        terminal.error?.message ?? '',
        /No capacity available for model/,
      )
      assert.doesNotMatch(terminal.error?.message ?? '', /46471cc4|b\$/)
      assert.equal(
        JSON.parse(terminal.error?.diagnostic ?? '{}').retryable,
        true,
      )

      const started = Date.now()
      await m.handle({
        type: 'session.interrupt',
        requestId: 'interrupt',
        sessionId: 's',
      })
      const elapsed = Date.now() - started
      assert.ok(
        elapsed < 500,
        `interrupt took ${elapsed}ms after failed settle`,
      )
      assert.equal(terminals(events).length, 1)
    } finally {
      await m.close()
      await rm(home, { recursive: true, force: true })
    }
  },
)
