import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import type {
  ProviderEvent,
  ProviderTimelineItem,
} from '@getpaseo/plugin/server/provider'
import {
  ERROR_STEP_TYPE,
  inspectConversationError,
} from '../server/error-inspection.ts'
import { settleBrainTurn, watchBrain } from '../server/brain.ts'
import { SubagentRegistry } from '../server/subagents.ts'
import { waitUntil } from './helpers.ts'

const parent = '11111111-1111-4111-8111-111111111111'
const child = '22222222-2222-4222-8222-222222222222'

async function makeTempRoot() {
  const appDataDir = await mkdtemp(join(tmpdir(), 'agy-subagent-fail-'))
  const brainRoot = join(appDataDir, 'brain')
  const convDir = join(appDataDir, 'conversations')
  await mkdir(brainRoot, { recursive: true })
  await mkdir(convDir, { recursive: true })
  return {
    appDataDir,
    brainRoot,
    convDir,
    async writeTranscript(id: string, rows: Record<string, unknown>[]) {
      const dir = join(brainRoot, id, '.system_generated', 'logs')
      await mkdir(dir, { recursive: true })
      await writeFile(
        join(dir, 'transcript_full.jsonl'),
        rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
      )
    },
    async writeSubagents(
      id: string,
      records: Array<{
        conversationId: string
        state: string
        spawnStepIndex: number
      }>,
    ) {
      const dir = join(brainRoot, id, '.system_generated', 'subagents')
      await mkdir(dir, { recursive: true })
      for (const rec of records) {
        await writeFile(
          join(dir, `${rec.conversationId}.json`),
          JSON.stringify(rec),
        )
      }
    },
    writeRealStepsDb(
      id: string,
      stepIdx: number,
      stepType: number,
      status: number,
      payloadText: string,
    ) {
      const db = new DatabaseSync(join(convDir, `${id}.db`))
      db.exec(
        'CREATE TABLE IF NOT EXISTS steps (idx INTEGER PRIMARY KEY, step_type INTEGER NOT NULL DEFAULT 0, status INTEGER NOT NULL DEFAULT 0, has_subtrajectory numeric NOT NULL DEFAULT false, metadata BLOB, error_details BLOB, permissions BLOB, task_details BLOB, render_info BLOB, step_payload BLOB, step_format INTEGER NOT NULL DEFAULT 0);',
      )
      const blob = Buffer.concat([
        Buffer.from([0x08, stepType, 0x20, status, 0x2a, 0x10]),
        Buffer.from(payloadText, 'utf8'),
        Buffer.from([0x28, 0x00]),
      ])
      db.prepare(
        'INSERT INTO steps (idx, step_type, status, error_details, step_payload) VALUES (?, ?, ?, NULL, ?)',
      ).run(stepIdx, stepType, status, blob)
      db.close()
    },
    close: () => rm(appDataDir, { recursive: true, force: true }),
  }
}

function invokeRows(childId: string) {
  return [
    { step_index: 0, type: 'USER_INPUT', content: 'delegate work' },
    {
      step_index: 1,
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      tool_calls: [{ id: 'call-1', name: 'invoke_subagent', args: {} }],
    },
    {
      step_index: 2,
      type: 'GENERIC',
      status: 'DONE',
      content: `Subagent started with id "${childId}"`,
      tool_result: { conversationId: childId },
    },
  ]
}

test('inspectConversationError parses real steps schema with step_payload BLOB and no step_json', async () => {
  const f = await makeTempRoot()
  try {
    const jsonError = JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'Individual quota reached.',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'QUOTA_EXHAUSTED',
            metadata: {
              quotaResetDelay: '30s',
              quotaResetTimeStamp: '2026-11-22T06:42:11Z',
            },
          },
        ],
      },
    })
    f.writeRealStepsDb(
      child,
      12,
      ERROR_STEP_TYPE,
      3,
      `prefix-proto-${jsonError}-suffix`,
    )

    const inspected = inspectConversationError(f.appDataDir, child, 0)
    assert.equal(inspected?.message, 'Individual quota reached.')
    assert.equal(inspected?.code, 'QUOTA_EXHAUSTED')
    assert.equal(inspected?.quotaExhausted, true)
    assert.equal(inspected?.resetAt, '2026-11-22T06:42:11.000Z')
    assert.equal(inspected?.retryAfterMs, 30_000)
    assert.equal(inspected?.retryable, true)
    assert.equal(inspected?.stepIndex, 12)
  } finally {
    await f.close()
  }
})

test('silent SQLite step_type=17 error in child surfaces through settleBrainTurn and watchBrain', async () => {
  const f = await makeTempRoot()
  const events: ProviderEvent[] = []
  let stop: ReturnType<typeof watchBrain> | undefined
  try {
    await f.writeSubagents(parent, [
      {
        conversationId: child,
        state: 'SUBAGENT_STATE_ALIVE',
        spawnStepIndex: 2,
      },
    ])
    await f.writeTranscript(parent, invokeRows(child))
    await f.writeTranscript(child, [
      {
        step_index: 0,
        type: 'SYSTEM_MESSAGE',
        content:
          '<SYSTEM_MESSAGE>\n[Message] sender=parent content=do work\n</SYSTEM_MESSAGE>',
      },
      {
        step_index: 1,
        type: 'PLANNER_RESPONSE',
        status: 'RUNNING',
        content: '',
      },
    ])
    f.writeRealStepsDb(
      child,
      2,
      ERROR_STEP_TYPE,
      3,
      JSON.stringify({
        error: {
          code: 503,
          status: 'UNAVAILABLE',
          message: 'Upstream backend unavailable',
        },
      }),
    )

    const settled = await settleBrainTurn(f.brainRoot, parent, 'p', () => {}, {
      minStepIndex: -1,
      pollIntervalMs: 5,
      stallTimeoutMs: 2000,
    })
    assert.equal(settled.status, 'failed')
    assert.match(settled.error ?? '', /Upstream backend unavailable/)

    stop = watchBrain(f.brainRoot, child, 'c', (e) => events.push(e), 10)
    await waitUntil(() =>
      events.some((e) => e.type === 'session.turn' && e.state === 'failed'),
    )
    const failEvt = events.find(
      (e) => e.type === 'session.turn' && e.state === 'failed',
    )
    assert.match(
      failEvt?.type === 'session.turn'
        ? typeof failEvt.error === 'string'
          ? failEvt.error
          : (failEvt.error?.message ?? '')
        : '',
      /Upstream backend unavailable/,
    )
  } finally {
    stop?.()
    await f.close()
  }
})

test('SYSTEM_MESSAGE subagent error in parent transcript fails settleChildren unless parent recovers', async () => {
  const f = await makeTempRoot()
  try {
    await f.writeSubagents(parent, [
      {
        conversationId: child,
        state: 'SUBAGENT_STATE_ALIVE',
        spawnStepIndex: 2,
      },
    ])
    await f.writeTranscript(parent, [
      ...invokeRows(child),
      {
        step_index: 3,
        type: 'SYSTEM_MESSAGE',
        content: `<SYSTEM_MESSAGE>\n[Message] timestamp=2026-11-16T21:00:00Z sender=system priority=MESSAGE_PRIORITY_HIGH content=The subagent bot-mocode with id "${child}" encountered an error and has either stopped or failed to start execution: Model quota exceeded\n</SYSTEM_MESSAGE>`,
      },
    ])

    const failed = await settleBrainTurn(f.brainRoot, parent, 'p', () => {}, {
      minStepIndex: -1,
      pollIntervalMs: 5,
      stallTimeoutMs: 500,
    })
    assert.equal(failed.status, 'failed')
    assert.match(failed.error ?? '', /Model quota exceeded/)

    await f.writeTranscript(parent, [
      ...invokeRows(child),
      {
        step_index: 3,
        type: 'SYSTEM_MESSAGE',
        content: `<SYSTEM_MESSAGE>\n[Message] timestamp=2026-11-16T21:00:00Z sender=system priority=MESSAGE_PRIORITY_HIGH content=The subagent bot-mocode with id "${child}" encountered an error and has either stopped or failed to start execution: Model quota exceeded\n</SYSTEM_MESSAGE>`,
      },
      {
        step_index: 4,
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        stop_reason: 'end_turn',
        content: 'Handled subagent failure gracefully.',
      },
    ])

    const recovered = await settleBrainTurn(
      f.brainRoot,
      parent,
      'p',
      () => {},
      {
        minStepIndex: -1,
        pollIntervalMs: 5,
        stallTimeoutMs: 500,
      },
    )
    assert.equal(recovered.status, 'completed')
  } finally {
    await f.close()
  }
})

test('SubagentRegistry.watchChild failure propagates via getChildFailure to settleBrainTurn', async () => {
  const f = await makeTempRoot()
  const events: ProviderEvent[] = []
  let registry: SubagentRegistry | undefined
  try {
    await f.writeSubagents(parent, [
      {
        conversationId: child,
        state: 'SUBAGENT_STATE_ALIVE',
        spawnStepIndex: 2,
      },
    ])
    await f.writeTranscript(parent, invokeRows(child))
    await f.writeTranscript(child, [
      {
        step_index: 0,
        type: 'SYSTEM_MESSAGE',
        content:
          '<SYSTEM_MESSAGE>\n[Message] sender=parent content=do work\n</SYSTEM_MESSAGE>',
      },
      {
        step_index: 1,
        type: 'ERROR_MESSAGE',
        status: 'ERROR',
        error: { message: 'Child crashed' },
      },
    ])

    registry = new SubagentRegistry({
      sessionId: 'p',
      cwd: f.appDataDir,
      brainRoot: f.brainRoot,
      capabilities: ['session.subsession'],
      emit: (e) => events.push(e),
      getNativeId: () => parent,
      isParentTurnActive: () => true,
      isLoading: () => false,
      isUnavailable: () => false,
    })
    const invokeItem: ProviderTimelineItem = {
      type: 'tool_call',
      id: 'p:tool:call-1',
      callId: 'call-1',
      name: 'invoke_subagent',
      status: 'completed',
      error: null,
      detail: {
        type: 'sub_agent',
        subAgentType: 'bot-mocode',
        childSessionId: child,
        log: '',
      },
    }
    registry.linkSubsession('p', parent, invokeItem)
    await waitUntil(() => registry?.getChildFailure(child) !== undefined)
    assert.match(registry.getChildFailure(child)?.error ?? '', /Child crashed/)

    const settled = await settleBrainTurn(f.brainRoot, parent, 'p', () => {}, {
      minStepIndex: -1,
      pollIntervalMs: 5,
      stallTimeoutMs: 500,
      getChildFailure: registry.getChildFailure,
    })
    assert.equal(settled.status, 'failed')
    assert.match(settled.error ?? '', /Child crashed/)
  } finally {
    registry?.closeAll()
    await f.close()
  }
})

test('settleBrainTurn does not reset lastActivity forever when unsettled child makes no progress', async () => {
  const f = await makeTempRoot()
  try {
    await f.writeSubagents(parent, [
      {
        conversationId: child,
        state: 'SUBAGENT_STATE_ALIVE',
        spawnStepIndex: 2,
      },
    ])
    await f.writeTranscript(parent, invokeRows(child))
    // Child directory exists with an incomplete transcript that never advances.
    await f.writeTranscript(child, [
      {
        step_index: 0,
        type: 'SYSTEM_MESSAGE',
        content:
          '<SYSTEM_MESSAGE>\n[Message] sender=parent content=work\n</SYSTEM_MESSAGE>',
      },
    ])

    const items: ProviderTimelineItem[] = []
    const settled = await settleBrainTurn(
      f.brainRoot,
      parent,
      'p',
      (item) => items.push(item),
      {
        minStepIndex: -1,
        pollIntervalMs: 5,
        stallTimeoutMs: 40,
      },
    )
    assert.equal(settled.status, 'failed')
    assert.equal(settled.stalled, true)
    assert.ok(
      items.some((i) => i.type === 'error' && i.id.endsWith(':stalled')),
    )
  } finally {
    await f.close()
  }
})
