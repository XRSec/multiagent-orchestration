/**
 * In-flight turn journal.
 * Purpose: persist the active turn before dispatch so a daemon restart can never resurrect a running ghost.
 * Context: written before `session/prompt` is dispatched and cleared by the single-shot turn finish path.
 * Usage: `beginTurnJournal` / `finishTurnJournal` / `reconcileRunningTurns`.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import {
  assertSafeNativeId,
  isMissingError,
  sessionIdPattern,
} from './common.ts'

const TurnJournalEntrySchema = z.object({
  turnId: z.string().min(1),
  clientMessageId: z.string().min(1),
  nativeId: z.string().min(1),
  startedAt: z.number().int().nonnegative(),
  status: z.literal('running'),
})

export type TurnJournalEntry = z.infer<typeof TurnJournalEntrySchema>

const TurnJournalFileSchema = z.object({
  version: z.literal(1),
  turns: z.array(TurnJournalEntrySchema),
})

const writeLanes = new Map<string, Promise<void>>()

function queue<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeLanes.get(key) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(fn)
  writeLanes.set(
    key,
    next.then(
      () => undefined,
      () => undefined,
    ),
  )
  return next
}

function journalPath(appDataDir: string, nativeId: string): string {
  assertSafeNativeId(nativeId)
  return join(
    appDataDir,
    'paseo-checkpoints',
    'sessions',
    `${nativeId}.turn-journal.json`,
  )
}

async function readEntries(
  appDataDir: string,
  nativeId: string,
): Promise<TurnJournalEntry[]> {
  if (!sessionIdPattern.test(nativeId)) return []
  try {
    const parsed = TurnJournalFileSchema.safeParse(
      JSON.parse(await readFile(journalPath(appDataDir, nativeId), 'utf8')),
    )
    return parsed.success ? parsed.data.turns : []
  } catch (error) {
    if (isMissingError(error)) return []
    throw error
  }
}

async function writeEntries(
  appDataDir: string,
  nativeId: string,
  turns: readonly TurnJournalEntry[],
): Promise<void> {
  const path = journalPath(appDataDir, nativeId)
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify({ version: 1, turns }))
  await rename(temp, path)
}

/** Record a turn as running. Must complete before `session/prompt` is dispatched. */
export async function beginTurnJournal(
  appDataDir: string,
  entry: TurnJournalEntry,
): Promise<void> {
  if (!sessionIdPattern.test(entry.nativeId)) return
  await queue(entry.nativeId, async () => {
    const existing = await readEntries(appDataDir, entry.nativeId)
    const next = existing.filter((turn) => turn.turnId !== entry.turnId)
    next.push(entry)
    await writeEntries(appDataDir, entry.nativeId, next)
  })
}

/** Clear a turn from the journal. Safe to call more than once. */
export async function finishTurnJournal(
  appDataDir: string,
  nativeId: string,
  turnId: string,
): Promise<void> {
  if (!sessionIdPattern.test(nativeId)) return
  await queue(nativeId, async () => {
    const existing = await readEntries(appDataDir, nativeId)
    const next = existing.filter((turn) => turn.turnId !== turnId)
    if (next.length === existing.length) return
    await writeEntries(appDataDir, nativeId, next)
  })
}

/** Remove the journal with the rest of a disposable session's artifacts. */
export async function removeTurnJournal(
  appDataDir: string,
  nativeId: string,
): Promise<void> {
  if (!sessionIdPattern.test(nativeId)) return
  // Queue behind in-flight writes; a bare rm can race a pending rename and lose the file.
  await queue(nativeId, async () => {
    await rm(journalPath(appDataDir, nativeId), { force: true }).catch(
      () => undefined,
    )
  })
}

/**
 * Reconcile leftovers after a restart: every surviving `running` record is returned and cleared.
 * Callers must emit a `failed` terminal for each returned entry.
 */
export async function reconcileRunningTurns(
  appDataDir: string,
  nativeId: string,
): Promise<TurnJournalEntry[]> {
  if (!sessionIdPattern.test(nativeId)) return []
  return queue(nativeId, async () => {
    const existing = await readEntries(appDataDir, nativeId)
    const running = existing.filter((turn) => turn.status === 'running')
    if (running.length > 0) await writeEntries(appDataDir, nativeId, [])
    return running
  })
}
