/**
 * Purpose: Bound ACP tool call payloads and synthesize missing edit diffs.
 * Context: Used by Timeline.update and session.ts tool call lifecycle handlers.
 * Usage: Import boundToolCallPayload, synthesizeUnifiedDiff, and EditDiffTracker.
 * Prerequisites: Node >= 22.18.0 fs/promises.
 */
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { record, setBounded, str } from './common.ts'

export const TOOL_TITLE_BUDGET = 2000
export const TOOL_RAW_PAYLOAD_BUDGET = 65_536
export const TOOL_CONTENT_ITEM_BUDGET = 65_536
export const TOOL_CONTENT_ITEMS_LIMIT = 32
export const TOOL_META_BUDGET = 16_384
export const EDIT_SNAPSHOT_MAX_BYTES = 262_144
const EDIT_SNAPSHOT_MAP_LIMIT = 64
const DIFF_MAX_LINES = 2000
const TRUNCATED_SUFFIX = '... [truncated]'

function boundString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  const keep = Math.max(0, maxChars - TRUNCATED_SUFFIX.length)
  return `${value.slice(0, keep)}${TRUNCATED_SUFFIX}`
}

const DATA_IMAGE_URI_RE = /^data:image\//i

function isInlineImagePayloadField(
  obj: Record<string, unknown>,
  key: string,
): boolean {
  if (obj.type === 'image' && (key === 'data' || key === 'blob')) return true
  if (
    key === 'blob' &&
    typeof obj.mimeType === 'string' &&
    obj.mimeType.startsWith('image/')
  ) {
    return true
  }
  return false
}

function boundJsonBudget(value: unknown, budget: number, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    if (DATA_IMAGE_URI_RE.test(value)) return undefined
    return boundString(value, budget)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (depth >= 6) return '[truncated]'
  if (Array.isArray(value)) {
    const out: unknown[] = []
    let remaining = budget
    for (const item of value) {
      if (remaining <= 64) {
        out.push('... [truncated]')
        break
      }
      const bounded = boundJsonBudget(
        item,
        Math.min(remaining, budget),
        depth + 1,
      )
      if (bounded === undefined) continue
      const size = JSON.stringify(bounded)?.length ?? 4
      out.push(bounded)
      remaining -= size + 1
    }
    return out
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    let remaining = budget
    for (const [k, v] of Object.entries(obj)) {
      if (remaining <= 64) {
        out._truncated = true
        break
      }
      if (isInlineImagePayloadField(obj, k)) continue
      const itemBudget = Math.max(256, Math.floor(remaining / 2))
      const bounded = boundJsonBudget(v, itemBudget, depth + 1)
      if (bounded === undefined) continue
      const size = (JSON.stringify(bounded)?.length ?? 4) + k.length + 4
      out[k] = bounded
      remaining -= size
    }
    return out
  }
  return value
}

function boundContentArray(content: unknown): unknown {
  if (!Array.isArray(content)) return content
  const limited = content.slice(0, TOOL_CONTENT_ITEMS_LIMIT)
  return limited
    .map((item) => boundJsonBudget(item, TOOL_CONTENT_ITEM_BUDGET))
    .filter((item) => item !== undefined)
}

/** Bound title, rawInput, rawOutput, content, and _meta on stored tool call snapshots. */
export function boundToolCallPayload<T extends Record<string, unknown>>(
  tool: T,
): T {
  const next: Record<string, unknown> = { ...tool }
  if (typeof next.title === 'string') {
    next.title = boundString(next.title, TOOL_TITLE_BUDGET)
  }
  if (next.rawInput !== undefined) {
    next.rawInput = boundJsonBudget(next.rawInput, TOOL_RAW_PAYLOAD_BUDGET)
  }
  if (next.rawOutput !== undefined) {
    next.rawOutput = boundJsonBudget(next.rawOutput, TOOL_RAW_PAYLOAD_BUDGET)
  }
  if (next.content !== undefined) {
    next.content = boundContentArray(next.content)
  }
  if (next._meta !== undefined) {
    next._meta = boundJsonBudget(next._meta, TOOL_META_BUDGET)
  }
  return next as T
}

function computeLineOps(
  oldLines: readonly string[],
  newLines: readonly string[],
): Array<{ type: ' ' | '-' | '+'; line: string }> {
  const m = oldLines.length
  const n = newLines.length
  if (m === 0) return newLines.map((line) => ({ type: '+', line }))
  if (n === 0) return oldLines.map((line) => ({ type: '-', line }))
  if (m * n > DIFF_MAX_LINES * DIFF_MAX_LINES) {
    return [
      ...oldLines.map((line) => ({ type: '-' as const, line })),
      ...newLines.map((line) => ({ type: '+' as const, line })),
    ]
  }
  const dp: Uint32Array[] = Array.from(
    { length: m + 1 },
    () => new Uint32Array(n + 1),
  )
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        oldLines[i] === newLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: Array<{ type: ' ' | '-' | '+'; line: string }> = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: ' ', line: oldLines[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: '-', line: oldLines[i++] })
    } else {
      ops.push({ type: '+', line: newLines[j++] })
    }
  }
  while (i < m) ops.push({ type: '-', line: oldLines[i++] })
  while (j < n) ops.push({ type: '+', line: newLines[j++] })
  return ops
}

/** Synthesize unified diff hunks with 3 context lines for two text versions. */
export function synthesizeUnifiedDiff(
  filePath: string,
  oldText: string,
  newText: string,
): string {
  const oldLines = oldText === '' ? [] : oldText.split('\n')
  const newLines = newText === '' ? [] : newText.split('\n')
  const ops = computeLineOps(oldLines, newLines)
  const changed = ops
    .map((op, idx) => (op.type === ' ' ? -1 : idx))
    .filter((idx) => idx >= 0)
  if (changed.length === 0) return ''
  const hunks: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`]
  let idx = 0
  while (idx < changed.length) {
    const start = Math.max(0, changed[idx] - 3)
    let end = Math.min(ops.length - 1, changed[idx] + 3)
    while (idx + 1 < changed.length && changed[idx + 1] - 3 <= end + 1) {
      idx++
      end = Math.min(ops.length - 1, changed[idx] + 3)
    }
    let oldLine = 1
    let newLine = 1
    for (let k = 0; k < start; k++) {
      if (ops[k].type !== '+') oldLine++
      if (ops[k].type !== '-') newLine++
    }
    const slice = ops.slice(start, end + 1)
    const oldCount = slice.filter((o) => o.type !== '+').length
    const newCount = slice.filter((o) => o.type !== '-').length
    hunks.push(`@@ -${oldLine},${oldCount} +${newLine},${newCount} @@`)
    for (const op of slice) hunks.push(`${op.type}${op.line}`)
    idx++
  }
  return boundString(hunks.join('\n'), TOOL_RAW_PAYLOAD_BUDGET)
}

export interface PreEditSnapshot {
  filePath: string
  content?: string
  omitted?: 'binary' | 'too_large'
}

function extractEditFilePath(
  tool: Record<string, unknown>,
): string | undefined {
  const input = record(tool.rawInput)
  const fromInput = str(
    input.Path ??
      input.TargetFile ??
      input.AbsolutePath ??
      input.file_path ??
      input.path,
  )
  if (fromInput) return fromInput
  const locations = Array.isArray(tool.locations) ? tool.locations : []
  const first = record(locations[0])
  return str(first.path)
}

async function readBoundedTextFile(
  absPath: string,
): Promise<{ content?: string; omitted?: 'binary' | 'too_large' }> {
  try {
    const info = await stat(absPath)
    if (info.size > EDIT_SNAPSHOT_MAX_BYTES) return { omitted: 'too_large' }
    const buf = await readFile(absPath)
    if (buf.includes(0)) return { omitted: 'binary' }
    return { content: buf.toString('utf8') }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { content: '' }
    }
    return {}
  }
}

export function hasEditDiffData(
  tool: Record<string, unknown>,
  snapshot?: Record<string, unknown>,
): boolean {
  const merged = { ...snapshot, ...tool }
  const content = Array.isArray(merged.content) ? merged.content : []
  if (content.some((c) => record(c).type === 'diff')) return true
  const input = record(merged.rawInput)
  return (
    input.Target !== undefined ||
    input.TargetContent !== undefined ||
    input.old_string !== undefined ||
    input.oldString !== undefined ||
    input.OldString !== undefined ||
    Array.isArray(input.ReplacementChunks)
  )
}

/** Track pre-edit file snapshots and synthesize missing unified diffs on completion. */
export class EditDiffTracker {
  private snapshots = new Map<string, PreEditSnapshot>()

  async capturePending(cwd: string, toolObj: unknown): Promise<void> {
    const tool = record(toolObj)
    const callId = str(tool.toolCallId)
    if (!callId || this.snapshots.has(callId)) return
    const status = str(tool.status)
    if (status && status !== 'pending') return
    if (str(tool.kind) !== 'edit') return
    const filePath = extractEditFilePath(tool)
    if (!filePath) return
    const absPath = isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
    const read = await readBoundedTextFile(absPath)
    if (read.content === undefined && !read.omitted) return
    setBounded(
      this.snapshots,
      callId,
      { filePath, ...read },
      EDIT_SNAPSHOT_MAP_LIMIT,
    )
  }

  async synthesizeIfMissing(
    cwd: string,
    updateObj: Record<string, unknown>,
    existingSnapshot?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const callId = str(updateObj.toolCallId)
    if (!callId) return updateObj
    const pre = this.snapshots.get(callId)
    if (str(updateObj.status) !== 'completed') return updateObj
    this.snapshots.delete(callId)
    if (!pre || hasEditDiffData(updateObj, existingSnapshot)) return updateObj
    let unifiedDiff: string | undefined
    if (pre.omitted) {
      unifiedDiff = `[diff omitted: ${pre.omitted === 'too_large' ? 'too large' : 'binary'}]`
    } else {
      const absPath = isAbsolute(pre.filePath)
        ? pre.filePath
        : resolve(cwd, pre.filePath)
      const post = await readBoundedTextFile(absPath)
      if (post.omitted) {
        unifiedDiff = `[diff omitted: ${post.omitted === 'too_large' ? 'too large' : 'binary'}]`
      } else if (
        pre.content !== undefined &&
        post.content !== undefined &&
        pre.content !== post.content
      ) {
        unifiedDiff = synthesizeUnifiedDiff(
          pre.filePath,
          pre.content,
          post.content,
        )
      }
    }
    if (!unifiedDiff) return updateObj
    return {
      ...updateObj,
      _meta: {
        ...record(updateObj._meta),
        synthesizedUnifiedDiff: unifiedDiff,
      },
    }
  }
}
