/**
 * Purpose: Inspect silent upstream quota/provider errors from stopReason and SQLite steps.
 * Context: Invoked on turn completion in Paseo agy ACP sessions.
 * Usage: Import inspectConversationError, parseGoDurationMs, and buildTurnError.
 * Prerequisites: Node >= 22.18.0 with node:sqlite DatabaseSync.
 * Size: ~589 lines (500-800 band) because payload parsing, blob sanitization and read-only SQLite inspection stay co-located.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ProviderError } from '@getpaseo/plugin/server/provider'
import { record, str } from './common.ts'

export const ERROR_STEP_TYPE = 17
/** agy persists retry attempts as step_type = 17 rows that are NOT terminal failures. */
export const AGY_STEP_TYPE_USER_INPUT = 14
export const AGY_STEP_TYPE_PLANNER_RESPONSE = 15
/** `steps.status` agy records for a completed step (retry-attempt rows and terminal responses). */
const AGY_STEP_STATUS_DONE = 3
/** Maximum steps scanned after a step_type = 17 row when no USER_INPUT row closes the turn. */
const ATTEMPT_WINDOW_STEPS = 200

export interface UpstreamQuotaError {
  message: string
  code?: string
  quotaExhausted: boolean
  resetAt?: string
  retryAfterMs?: number
  retryable: boolean
  stepIndex?: number
}

const GO_DURATION_UNIT_MS: Readonly<Record<string, number>> = {
  ns: 1e-6,
  us: 1e-3,
  µs: 1e-3,
  μs: 1e-3,
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
}

const GO_DURATION_TOKEN = /(\d+(?:\.\d+)?)(ns|us|µs|μs|ms|s|m|h)/g

const ERROR_SIGNAL =
  /error|failed|failure|UNAVAILABLE|RESOURCE_EXHAUSTED|capacity|quota|rate limit|\b429\b|\b503\b|high traffic|try again|timeout|timed out|\bEOF\b/gi
/**
 * Canonical retryable upstream-error vocabulary. The `agy` wrapper mirrors this list in
 * `RETRYABLE_TOKENS`; keep both sides in sync.
 */
export const RETRYABLE_ERROR_TOKENS: readonly string[] = [
  'UNAVAILABLE',
  'RESOURCE_EXHAUSTED',
  '\\b503\\b',
  '\\b429\\b',
  'rate limit',
  'capacity',
  'high traffic',
  'try again',
]
const RETRYABLE_TEXT = new RegExp(RETRYABLE_ERROR_TOKENS.join('|'), 'i')
const UUID_RUN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_RUN = /^[0-9a-f]{8,}$/i
const UUID_ANYWHERE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
/** Protobuf step suffix glued after a trajectory UUID (`-<step>-2010`, `-115`). */
const STEP_TAIL = /^(?:-\d{1,6}){1,2}/
/**
 * Characters that can be protobuf varint debris glued before a UUID: digits, `+`, `-`, `,`.
 * A `(` is handled separately (only when glued to a digit at the UUID boundary), and `.`,
 * `:`, `)` and letters are never consumed. `,` stays because real blobs glue `server2,<uuid>`.
 */
const FRAME_DEBRIS_CHAR = /[0-9+\-,]/
/** Maximum varint bytes stripped immediately before a UUID inside a blob run. */
const MAX_FRAME_DEBRIS = 4
/** Binary/undecodable artifacts removed before scoring; valid Unicode text is preserved. */
const BINARY_ARTIFACT =
  /[\uFFFD\u0000-\u001F\u007F-\u009F\u061C\u180E\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/g
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
/** C0/C1 controls and line/paragraph separators become spaces instead of joining words. */
const CONTROL_CHAR = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/

/** A printable byte that can be a protobuf tag (valid field number and wire type). */
function isProtoTagByte(code: number): boolean {
  const field = code >> 3
  const wire = code & 0x07
  return field >= 1 && field <= 15 && wire <= 5
}

/**
 * Remove only genuinely binary/undecodable artifacts: replacement chars, C0/C1 controls,
 * lone surrogates and zero-width/bidi controls. Valid Unicode (CJK, accents, currency)
 * survives byte-for-byte so localized provider messages are never gutted.
 */
function stripBinaryArtifacts(raw: string): string {
  return raw
    .replace(LONE_SURROGATE, '')
    .replace(BINARY_ARTIFACT, (char) => (CONTROL_CHAR.test(char) ? ' ' : ''))
}

/** Drop a trailing protobuf tag byte glued after a complete word (the next field's tag). */
function stripTrailingFrameTag(text: string): string {
  let end = text.length
  for (let stripped = 0; stripped < 2 && end > 1; stripped++) {
    if (!/[A-Z]/.test(text[end - 1])) break
    if (!/[a-z0-9]/.test(text[end - 2])) break
    if (!isProtoTagByte(text.charCodeAt(end - 1))) break
    end--
  }
  return text.slice(0, end)
}

/** Drop leading tag bytes whose trailing length byte matches the remaining payload size. */
function stripLeadingFrameBytes(text: string): string {
  for (let k = 0; k < MAX_FRAME_DEBRIS && k + 1 < text.length; k++) {
    const code = text.charCodeAt(k)
    if (code !== text.length - k - 1) continue
    if (!/[A-Z"'([]/.test(text[k + 1])) continue
    let tags = true
    for (let i = 0; i < k; i++)
      if (!isProtoTagByte(text.charCodeAt(i))) tags = false
    if (tags) return text.slice(k + 1)
  }
  return text
}

/**
 * Strip protobuf framing residue from a readable run: leading length/tag bytes, UUID
 * occurrences with their surrounding varint debris, and the numeric step tail glued
 * after a UUID. Valid Unicode text is preserved; only framing bytes are removed.
 */
function stripFrameResidue(raw: string): string {
  const text = stripBinaryArtifacts(raw)
  let result = ''
  let cursor = 0
  for (const match of text.matchAll(UUID_ANYWHERE)) {
    const start = match.index ?? 0
    let prefixEnd = start
    // Explicit UUID frame artifact: `^.{0,2}\$<uuid>` at the segment start (b$ / 3b$).
    // The stripped prefix must not itself be preceded by a word character.
    if (text[prefixEnd - 1] === '$') {
      const dollars = prefixEnd - 1 - cursor
      if (
        dollars >= 0 &&
        dollars <= 2 &&
        /^[0-9a-f]{8}-/i.test(text.slice(prefixEnd)) &&
        (cursor === 0 || !/\w/.test(text[cursor - 1]))
      )
        prefixEnd = cursor
    }
    while (prefixEnd > cursor && start - prefixEnd < MAX_FRAME_DEBRIS) {
      const char = text[prefixEnd - 1]
      // A closing paren always terminates: `(503)`/`(attempt 1)` are message text.
      if (char === ')') break
      if (char === '(') {
        // Keep the real `server2(` glue: a lone paren adjacent to the UUID after a digit.
        if (prefixEnd !== start || !/\d/.test(text[prefixEnd - 2] ?? '')) break
        prefixEnd--
        continue
      }
      if (!FRAME_DEBRIS_CHAR.test(char)) break
      // A digit glued to a decimal point belongs to a version/number, never to framing.
      if (/\d/.test(char) && text[prefixEnd - 2] === '.') break
      prefixEnd--
    }
    let kept = text.slice(cursor, prefixEnd)
    let next = start + match[0].length
    const tail = STEP_TAIL.exec(text.slice(next))
    if (tail) next += tail[0].length
    // Drop a separator dangling where the identifier was removed.
    if (/^(\s|$)/.test(text.slice(next)) && /[.,:;\-]$/.test(kept))
      kept = kept.slice(0, -1)
    result += kept
    cursor = next
  }
  result = stripTrailingFrameTag(result + text.slice(cursor))
  result = stripLeadingFrameBytes(result)
  return result.replace(/\s+/g, ' ').trim()
}

/** Reject runs that are still bare identifiers rather than human-readable text. */
function identifierRun(run: string): boolean {
  return UUID_RUN.test(run) || HEX_RUN.test(run)
}

function scoreErrorText(run: string): number {
  const matches = run.match(ERROR_SIGNAL)
  if (!matches || matches.length === 0) return 0
  let score = matches.length
  if (
    /UNAVAILABLE|RESOURCE_EXHAUSTED|high traffic|capacity|try again|timeout|\bEOF\b/i.test(
      run,
    )
  )
    score += 4
  if (/HTTP\s+\d{3}|code\s*\d{3}/i.test(run)) score += 2
  if (/\s/.test(run) && /[a-z]{3,}/i.test(run)) score += 1
  return score
}

/** Pick the most human-readable error sentence instead of the first readable blob run. */
export function selectBlobErrorText(text: string): string | undefined {
  // Unicode mode keeps astral characters (emoji) inside the same readable run.
  const runs = text.match(/[\x20-\uFFFF\u{10000}-\u{10FFFF}]{12,}/gu) ?? []
  let best: string | undefined
  let bestScore = 0
  for (const raw of runs) {
    // Safety net: a run dominated by replacement chars is binary, not text.
    const replacements = [...raw].filter((char) => char === '�').length
    if (replacements / raw.length > 0.2) continue
    const run = stripFrameResidue(raw)
    if (raw.length < 12 || run.length === 0 || identifierRun(run)) continue
    const score = scoreErrorText(run)
    if (score === 0) continue
    if (
      !best ||
      score > bestScore ||
      (score === bestScore && run.length > best.length)
    ) {
      best = run
      bestScore = score
    }
  }
  return best
}

function collectTextSignals(
  text: string,
  state: { resetAt?: string; retryAfterMs?: number },
): void {
  const retryAfter = text.match(
    /\bretry[-_ ]?after\b["']?\s*[:=]\s*"?(\d+(?:\.\d+)?)"?/i,
  )
  if (retryAfter && state.retryAfterMs === undefined) {
    const seconds = Number(retryAfter[1])
    if (Number.isFinite(seconds) && seconds > 0)
      state.retryAfterMs = Math.round(seconds * 1000)
  }
  const delay = text.match(
    /\b(?:retryDelay|quotaResetDelay)\b["']?\s*[:=]\s*"?([0-9.]+(?:ns|us|µs|μs|ms|s|m|h))"?/i,
  )
  if (delay) state.retryAfterMs ??= parseGoDurationMs(delay[1])
  const reset = text.match(
    /\bquotaResetTimeStamp\b["']?\s*[:=]\s*"?([^"\s,}]+)/i,
  )
  if (reset) state.resetAt ??= normalizeResetTimestamp(reset[1])
}

/** Parse a Go duration string (e.g. "1m30s", "500ms") into positive milliseconds. */
export function parseGoDurationMs(duration: string): number | undefined {
  const trimmed = duration.trim()
  if (!trimmed || trimmed.startsWith('-')) return undefined
  let totalMs = 0
  let matchedLength = 0
  GO_DURATION_TOKEN.lastIndex = 0
  for (const match of trimmed.matchAll(GO_DURATION_TOKEN)) {
    if (match.index !== matchedLength) return undefined
    const amount = Number(match[1])
    const unitMs = GO_DURATION_UNIT_MS[match[2]]
    if (!Number.isFinite(amount) || unitMs === undefined) return undefined
    totalMs += amount * unitMs
    matchedLength += match[0].length
  }
  if (matchedLength !== trimmed.length || totalMs <= 0) return undefined
  return Math.round(totalMs)
}

function normalizeResetTimestamp(raw: unknown): string | undefined {
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw.trim())
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const ms = raw < 1e12 ? raw * 1000 : raw
    return new Date(ms).toISOString()
  }
  return undefined
}

function collectPayloadFields(
  node: unknown,
  state: {
    texts: string[]
    codes: string[]
    quotaExhausted: boolean
    resetAt?: string
    retryAfterMs?: number
  },
  depth = 0,
): void {
  if (depth > 6 || node === null || node === undefined) return
  if (typeof node === 'string') {
    if (node.includes('QUOTA_EXHAUSTED')) state.quotaExhausted = true
    if (node.trim()) state.texts.push(node.trim())
    return
  }
  if (Array.isArray(node)) {
    for (const item of node) collectPayloadFields(item, state, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  const obj = record(node)
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'quotaResetTimeStamp' || key === 'quotaResetTimestamp') {
      state.resetAt ??= normalizeResetTimestamp(value)
    } else if (key === 'quotaResetDelay' || key === 'retryDelay') {
      if (typeof value === 'string') {
        state.retryAfterMs ??= parseGoDurationMs(value)
      }
    } else if (key === 'code' || key === 'status' || key === 'reason') {
      const code = str(value)
      if (code) {
        state.codes.push(code)
        if (code.includes('QUOTA_EXHAUSTED')) state.quotaExhausted = true
      }
    } else if (
      key === 'userErrorMessage' ||
      key === 'errorMessage' ||
      key === 'message'
    ) {
      const msg = str(value)
      if (msg) {
        state.texts.unshift(msg)
        if (msg.includes('QUOTA_EXHAUSTED')) state.quotaExhausted = true
      }
    } else {
      collectPayloadFields(value, state, depth + 1)
    }
  }
}

/** Parse an error step JSON string or object for quota exhaustion and retry timing. */
export function parseUpstreamErrorPayload(
  payload: unknown,
  nowMs = Date.now(),
): UpstreamQuotaError | undefined {
  let parsed: unknown = payload
  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    if (!trimmed) return undefined
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      parsed = trimmed
    }
  }
  const state: {
    texts: string[]
    codes: string[]
    quotaExhausted: boolean
    resetAt?: string
    retryAfterMs?: number
  } = { texts: [], codes: [], quotaExhausted: false }
  collectPayloadFields(parsed, state)
  const signalText = [
    typeof parsed === 'string' ? parsed : '',
    ...state.texts,
    ...state.codes,
  ].join('\n')
  collectTextSignals(signalText, state)
  const textRetryable = RETRYABLE_TEXT.test(signalText)
  if (
    !state.quotaExhausted &&
    !state.resetAt &&
    state.retryAfterMs === undefined &&
    state.texts.length === 0 &&
    state.codes.length === 0
  ) {
    return undefined
  }
  const resetAt =
    state.resetAt ??
    (state.retryAfterMs !== undefined
      ? new Date(nowMs + state.retryAfterMs).toISOString()
      : undefined)
  const retryable =
    state.quotaExhausted ||
    textRetryable ||
    state.retryAfterMs !== undefined ||
    resetAt !== undefined ||
    state.codes.some((c) =>
      /RESOURCE_EXHAUSTED|UNAVAILABLE|RATE_LIMIT|429|503/i.test(c),
    )
  const textCode = /RESOURCE_EXHAUSTED/i.test(signalText)
    ? 'RESOURCE_EXHAUSTED'
    : /UNAVAILABLE|high traffic/i.test(signalText)
      ? 'UNAVAILABLE'
      : /\b429\b/.test(signalText)
        ? '429'
        : /\b503\b/.test(signalText)
          ? '503'
          : undefined
  const code =
    (state.quotaExhausted ? 'QUOTA_EXHAUSTED' : undefined) ??
    state.codes[0] ??
    textCode
  const message =
    state.texts[0] ??
    (state.quotaExhausted
      ? 'Upstream quota exhausted'
      : (code ?? 'Upstream provider error'))
  return {
    message,
    ...(code ? { code } : {}),
    quotaExhausted: state.quotaExhausted,
    ...(resetAt ? { resetAt } : {}),
    ...(state.retryAfterMs !== undefined
      ? { retryAfterMs: state.retryAfterMs }
      : {}),
    retryable,
  }
}

function extractEmbeddedJsonObjects(text: string): unknown[] {
  const objects: unknown[] = []
  for (
    let start = text.indexOf('{');
    start >= 0;
    start = text.indexOf('{', start + 1)
  ) {
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (escaped) {
        escaped = false
        continue
      }
      if (inString) {
        if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') depth++
      else if (ch === '}' && --depth === 0) {
        try {
          const parsed: unknown = JSON.parse(text.slice(start, i + 1))
          if (parsed && typeof parsed === 'object') {
            objects.push(parsed)
            start = i
          }
        } catch {
          /* Ignore non-JSON brace runs in binary protobuf blobs. */
        }
        break
      }
    }
  }
  return objects
}

function parseBlobErrorPayload(
  raw: unknown,
  nowMs: number,
): UpstreamQuotaError | undefined {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw === 'string') return parseUpstreamErrorPayload(raw, nowMs)
  if (!(raw instanceof Uint8Array)) return undefined
  const text = Buffer.from(raw).toString('utf8')
  const objects = extractEmbeddedJsonObjects(text)
  if (objects.length > 0) {
    const parsed = parseUpstreamErrorPayload(objects, nowMs)
    if (parsed) return parsed
  }
  const readable = selectBlobErrorText(text)
  return readable !== undefined
    ? parseUpstreamErrorPayload(readable, nowMs)
    : undefined
}

const STEP_PAYLOAD_COLUMNS = [
  'step_json',
  'error_details',
  'step_payload',
  'metadata',
] as const

/**
 * A step_type=17 row after which agy recorded a terminal planner response in the
 * same turn is a retry-attempt record, not a terminal turn failure.
 */
function attemptFollowedByAssistant(
  db: DatabaseSync,
  idx: number,
  hasStatus: boolean,
): boolean {
  // The window always closes: at the next USER_INPUT row when one exists, otherwise after
  // a bounded number of steps, so a malformed or truncated conversation cannot scan forever.
  const windowEnd = idx + ATTEMPT_WINDOW_STEPS
  const nextUser = db
    .prepare(
      'SELECT idx FROM steps WHERE idx > ? AND idx < ? AND step_type = ? ORDER BY idx ASC LIMIT 1',
    )
    .get(idx, windowEnd, AGY_STEP_TYPE_USER_INPUT) as
    { idx?: number } | undefined
  const params: number[] = [
    idx,
    typeof nextUser?.idx === 'number' ? nextUser.idx : windowEnd,
    AGY_STEP_TYPE_PLANNER_RESPONSE,
  ]
  let sql =
    'SELECT 1 AS hit FROM steps WHERE idx > ? AND idx < ? AND step_type = ?'
  if (hasStatus) {
    sql += ' AND status = ?'
    params.push(AGY_STEP_STATUS_DONE)
  }
  sql += ' LIMIT 1'
  return Boolean(db.prepare(sql).get(...params))
}

/** Read-only inspection of conversations/<sessionId>.db for step_type = 17 errors. */
export function inspectConversationError(
  appDataDir: string,
  nativeId: string,
  minStepIndex?: number,
  nowMs = Date.now(),
): UpstreamQuotaError | undefined {
  if (!nativeId) return undefined
  const dbPath = join(appDataDir, 'conversations', `${nativeId}.db`)
  if (!existsSync(dbPath)) return undefined
  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
    const cols = new Set(
      (
        db.prepare('PRAGMA table_info(steps)').all() as Array<{ name: string }>
      ).map((c) => c.name),
    )
    if (!cols.has('idx') || !cols.has('step_type')) return undefined
    const selectCols = ['idx']
    if (cols.has('status')) selectCols.push('status')
    for (const col of STEP_PAYLOAD_COLUMNS) {
      if (cols.has(col)) selectCols.push(col)
    }
    const hasFloor =
      typeof minStepIndex === 'number' &&
      Number.isInteger(minStepIndex) &&
      minStepIndex >= 0
    const sql = hasFloor
      ? `SELECT ${selectCols.join(', ')} FROM steps WHERE step_type = ? AND idx >= ? ORDER BY idx DESC LIMIT 5`
      : `SELECT ${selectCols.join(', ')} FROM steps WHERE step_type = ? ORDER BY idx DESC LIMIT 5`
    const rows = (
      hasFloor
        ? db.prepare(sql).all(ERROR_STEP_TYPE, minStepIndex)
        : db.prepare(sql).all(ERROR_STEP_TYPE)
    ) as Array<Record<string, unknown> & { idx: number; status?: number }>
    for (const row of rows) {
      if (attemptFollowedByAssistant(db, row.idx, cols.has('status'))) continue
      for (const col of STEP_PAYLOAD_COLUMNS) {
        const parsed = parseBlobErrorPayload(row[col], nowMs)
        if (parsed) return { ...parsed, stepIndex: row.idx }
      }
      // A schema without `status` cannot distinguish attempt rows from terminal failures;
      // never drop a step_type = 17 row just because the column is missing.
      if (!cols.has('status') || row.status === AGY_STEP_STATUS_DONE) {
        return {
          message: 'Upstream provider error (step_type=17)',
          quotaExhausted: false,
          retryable: false,
          stepIndex: row.idx,
        }
      }
    }
    return undefined
  } catch {
    return undefined
  } finally {
    try {
      db?.close()
    } catch {
      /* Ignore close errors on best-effort read-only inspection. */
    }
  }
}

/** Build a structured ProviderError from stopReason and inspected SQLite error state. */
export function buildTurnError(
  stopReason: string | undefined,
  inspected: UpstreamQuotaError | undefined,
  fallbackMessage?: string,
): ProviderError | undefined {
  const isRefusal = stopReason === 'refusal'
  if (!inspected && !isRefusal) return undefined
  const message =
    inspected?.message ?? fallbackMessage ?? 'Turn refused by upstream provider'
  const code = inspected?.code ?? (isRefusal ? 'REFUSAL' : 'UPSTREAM_ERROR')
  const diagnostic = JSON.stringify({
    quotaExhausted: inspected?.quotaExhausted ?? false,
    retryable: inspected?.retryable ?? false,
    ...(inspected?.resetAt ? { resetAt: inspected.resetAt } : {}),
    ...(inspected?.retryAfterMs !== undefined
      ? { retryAfterMs: inspected.retryAfterMs }
      : {}),
    ...(isRefusal ? { stopReason: 'refusal' } : {}),
  })
  return { message, code, diagnostic }
}
