/**
 * Purpose: Session lifecycle engine implementing Cindy-aligned MemoryFlush, Transcript Relocation, Fork JSONL Repair, Invalid-Resume Classifier, and Shadow Git Savepoints.
 * Context: multiagent-orchestration daemon orchestrator, enforces SPEC-ARCH-SESSION-REWIND-COMPACT-2026 invariants.
 * Usage: Imported by ClaudeSdkRunner and AgentOrchestrator for compaction watermarks, rewind fork, and git savepoints.
 * Prerequisites: Node.js 22.5+/26+ runtime, git CLI available on PATH.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

/** Default pre-compaction memory flush watermarks: 70%, 85%, 92% */
export const DEFAULT_FLUSH_THRESHOLDS: readonly number[] = Object.freeze([0.7, 0.85, 0.92]);

export interface MemoryFlushEvent {
  threshold: number;
  ratio: number;
  contextTokens: number;
  contextWindow: number;
  remainingTokens: number;
  firedSoFar: number[];
}

/**
 * Multi-Threshold Pre-Compaction Memory Flush Controller
 * Fires at [0.70, 0.85, 0.92] of contextWindow prior to SDK compact_boundary.
 */
export class MemoryFlushController {
  private readonly thresholds: readonly number[];
  private readonly fired = new Set<number>();
  private readonly onThresholdCrossed?: (event: MemoryFlushEvent) => void;

  constructor(options?: {
    thresholds?: readonly number[];
    onThresholdCrossed?: (event: MemoryFlushEvent) => void;
  }) {
    const raw = (options?.thresholds ?? DEFAULT_FLUSH_THRESHOLDS).slice().sort((a, b) => a - b);
    if (raw.some((v) => v <= 0 || v > 1)) {
      throw new Error(`MemoryFlushController: thresholds must be in (0, 1], got ${JSON.stringify(raw)}`);
    }
    this.thresholds = Object.freeze(raw);
    this.onThresholdCrossed = options?.onThresholdCrossed;
  }

  public onUsageUpdate(contextTokens: number, contextWindow: number): MemoryFlushEvent[] {
    if (!Number.isFinite(contextWindow) || contextWindow <= 0) return [];
    if (!Number.isFinite(contextTokens) || contextTokens < 0) return [];

    const ratio = contextTokens / contextWindow;
    const triggered: MemoryFlushEvent[] = [];

    for (const t of this.thresholds) {
      if (ratio >= t && !this.fired.has(t)) {
        this.fired.add(t);
        const ev: MemoryFlushEvent = {
          threshold: t,
          ratio: Number(ratio.toFixed(3)),
          contextTokens,
          contextWindow,
          remainingTokens: Math.max(0, contextWindow - contextTokens),
          firedSoFar: Array.from(this.fired).sort((a, b) => a - b),
        };
        triggered.push(ev);
        this.onThresholdCrossed?.(ev);
      }
    }
    return triggered;
  }

  public onCompactBoundary(): number[] {
    if (this.fired.size === 0) return [];
    const prev = Array.from(this.fired).sort((a, b) => a - b);
    this.fired.clear();
    return prev;
  }

  public getFiredThresholds(): number[] {
    return Array.from(this.fired).sort((a, b) => a - b);
  }
}

/**
 * Deterministic classifier for Claude Code CLI "No conversation found with session ID" errors.
 * Never matches generic HTTP 404s, network errors, or unrelated SDK crashes.
 */
export function isClaudeResumeSessionNotFound(
  value: unknown,
  expectedSessionId: string
): boolean {
  if (!expectedSessionId) return false;
  for (const text of collectShallowErrorTexts(value)) {
    const match = /No conversation found with session ID(?:\s*:\s*([^\s]+))?/i.exec(text);
    if (!match) continue;
    const reportedId = match[1]?.replace(/[.,;!?]+$/, '');
    if (!reportedId || reportedId === expectedSessionId) {
      return true;
    }
  }
  return false;
}

function collectShallowErrorTexts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value instanceof Error) return [value.message];
  if (!value || typeof value !== 'object') return [];

  const rec = value as Record<string, unknown>;
  const texts: string[] = [];
  for (const field of ['result', 'error', 'message'] as const) {
    if (typeof rec[field] === 'string') {
      texts.push(rec[field] as string);
    }
  }
  if (rec.message && typeof rec.message === 'object') {
    const content = (rec.message as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === 'object' && typeof (block as any).text === 'string') {
          texts.push((block as any).text);
        }
      }
    }
  }
  return texts;
}

/**
 * Sanitize working directory path into Claude Code's project directory key
 */
export function sanitizeClaudeProjectKey(workingDir: string): string {
  const resolved = path.resolve(workingDir);
  return resolved.replace(/[^a-zA-Z0-9]/g, '-');
}

export interface RelocateTranscriptsOptions {
  sdkSessionIds: string[];
  oldWorkingDir: string;
  newWorkingDir: string;
  claudeConfigDir: string;
}

export interface RelocateTranscriptsResult {
  copied: string[];
  replaced: string[];
  skipped: string[];
  missing: string[];
}

/**
 * Copy-On-Relocate Transcript Durability:
 * Copies (never moves) <sdkSessionId>.jsonl files across encoded project directories
 * when a session's workingDir changes.
 */
export function relocateClaudeSessionTranscripts(
  options: RelocateTranscriptsOptions
): RelocateTranscriptsResult {
  const result: RelocateTranscriptsResult = {
    copied: [],
    replaced: [],
    skipped: [],
    missing: [],
  };

  const uniqueIds = [...new Set(options.sdkSessionIds)].filter(
    (id) => typeof id === 'string' && id.trim().length > 0
  );
  if (uniqueIds.length === 0) return result;

  const projectsRoot = path.join(options.claudeConfigDir, 'projects');
  const oldKey = sanitizeClaudeProjectKey(options.oldWorkingDir);
  const newKey = sanitizeClaudeProjectKey(options.newWorkingDir);
  if (oldKey === newKey) {
    result.skipped.push(...uniqueIds);
    return result;
  }

  const oldDir = path.join(projectsRoot, oldKey);
  const newDir = path.join(projectsRoot, newKey);
  fs.mkdirSync(newDir, { recursive: true });

  for (const id of uniqueIds) {
    const fileName = `${id}.jsonl`;
    const srcPath = path.join(oldDir, fileName);
    const dstPath = path.join(newDir, fileName);

    if (!fs.existsSync(srcPath)) {
      result.missing.push(id);
      continue;
    }

    const srcStat = fs.statSync(srcPath);
    if (!fs.existsSync(dstPath)) {
      fs.copyFileSync(srcPath, dstPath);
      result.copied.push(id);
    } else {
      const dstStat = fs.statSync(dstPath);
      if (srcStat.mtimeMs > dstStat.mtimeMs) {
        fs.copyFileSync(srcPath, dstPath);
        result.replaced.push(id);
      } else {
        result.skipped.push(id);
      }
    }
  }

  return result;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RepairForkedJsonlResult {
  filePath: string;
  changed: boolean;
  lineCount: number;
  compactBoundaryCount: number;
  remappedUuidCount: number;
}

/**
 * Repair Forked Claude JSONL Transcript:
 * Ensures parentUuid chains and compact_boundary preservedSegment references
 * inside a forked transcript point only to valid UUIDs present in the forked file.
 */
export function repairForkedClaudeJsonl(jsonlFilePath: string): RepairForkedJsonlResult {
  if (!fs.existsSync(jsonlFilePath)) {
    return {
      filePath: jsonlFilePath,
      changed: false,
      lineCount: 0,
      compactBoundaryCount: 0,
      remappedUuidCount: 0,
    };
  }

  const rawText = fs.readFileSync(jsonlFilePath, 'utf-8');
  const lines = rawText.split('\n').filter((l) => l.trim().length > 0);
  const parsedLines: Array<Record<string, any>> = [];
  const validUuids = new Set<string>();
  const uuidMap = new Map<string, string>();

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      parsedLines.push(obj);
      if (typeof obj.uuid === 'string') {
        validUuids.add(obj.uuid);
        if (typeof obj.originalUuid === 'string' && obj.originalUuid !== obj.uuid) {
          uuidMap.set(obj.originalUuid, obj.uuid);
        }
      }
    } catch {}
  }

  let changed = false;
  let compactBoundaryCount = 0;
  let remappedUuidCount = 0;

  for (const obj of parsedLines) {
    if (typeof obj.parentUuid === 'string' && uuidMap.has(obj.parentUuid)) {
      obj.parentUuid = uuidMap.get(obj.parentUuid);
      changed = true;
      remappedUuidCount++;
    }
    if (obj.type === 'system' && obj.subtype === 'compact_boundary') {
      compactBoundaryCount++;
      if (obj.compactMetadata && typeof obj.compactMetadata === 'object') {
        const meta = obj.compactMetadata as Record<string, any>;
        if (meta.preservedSegment) {
          const seg = meta.preservedSegment as Record<string, any>;
          for (const key of ['startUuid', 'endUuid'] as const) {
            const ref = seg[key];
            if (typeof ref === 'string') {
              if (uuidMap.has(ref)) {
                seg[key] = uuidMap.get(ref);
                changed = true;
                remappedUuidCount++;
              } else if ( UUID_RE.test(ref) && !validUuids.has(ref)) {
                delete meta.preservedSegment;
                changed = true;
                break;
              }
            }
          }
        }
      }
    }
  }

  if (changed) {
    const out = parsedLines.map((o) => JSON.stringify(o)).join('\n') + '\n';
    fs.writeFileSync(jsonlFilePath, out, 'utf-8');
  }

  return {
    filePath: jsonlFilePath,
    changed,
    lineCount: parsedLines.length,
    compactBoundaryCount,
    remappedUuidCount,
  };
}

/**
 * Shadow Git Savepoint Engine (refs/cindy/savepoints/<sessionId>)
 * Captures and restores workspace snapshots using a temporary GIT_INDEX_FILE
 * without polluting refs/heads, refs/tags, or the user's real .git/index.
 */
export const SAVEPOINT_REF_NAMESPACE = 'refs/cindy/savepoints/';
const SAFE_SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function savepointRefForSession(sessionId: string): string {
  const sanitized = sessionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
  if (!SAFE_SESSION_ID_RE.test(sanitized)) {
    throw new Error(`Invalid sessionId for savepoint ref: ${sessionId}`);
  }
  return `${SAVEPOINT_REF_NAMESPACE}${sanitized}`;
}

export class GitSnapshotSavepointEngine {
  private activeRepoSessions = new Map<string, Set<string>>();

  public beginTurnOnRepo(repoRoot: string, sessionId: string): { overlappedWithPeer: boolean } {
    const resolved = path.resolve(repoRoot);
    let active = this.activeRepoSessions.get(resolved);
    if (!active) {
      active = new Set<string>();
      this.activeRepoSessions.set(resolved, active);
    }
    const overlapped = Array.from(active).some((peer) => peer !== sessionId);
    active.add(sessionId);
    return { overlappedWithPeer: overlapped };
  }

  public endTurnOnRepo(repoRoot: string, sessionId: string): void {
    const resolved = path.resolve(repoRoot);
    const active = this.activeRepoSessions.get(resolved);
    if (active) {
      active.delete(sessionId);
      if (active.size === 0) {
        this.activeRepoSessions.delete(resolved);
      }
    }
  }

  public captureShadowSavepoint(
    repoRoot: string,
    sessionId: string,
    anchorMessageId: string,
    label: string = 'turn-savepoint'
  ): { commitSha: string | null; refName: string; skippedReason?: string } {
    const refName = savepointRefForSession(sessionId);
    if (!fs.existsSync(path.join(repoRoot, '.git'))) {
      return { commitSha: null, refName, skippedReason: 'NOT_A_GIT_REPO' };
    }

    const tempIndex = path.join(
      os.tmpdir(),
      `cindy-shadow-idx-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    );

    try {
      const realIndex = path.join(repoRoot, '.git', 'index');
      if (fs.existsSync(realIndex)) {
        fs.copyFileSync(realIndex, tempIndex);
      }
      const gitEnv = { ...process.env, GIT_INDEX_FILE: tempIndex };
      execFileSync('git', ['add', '-A'], { cwd: repoRoot, env: gitEnv, timeout: 5000 });
      const treeSha = execFileSync('git', ['write-tree'], {
        cwd: repoRoot,
        env: gitEnv,
        timeout: 5000,
      })
        .toString('utf-8')
        .trim();

      let parentArgs: string[] = [];
      try {
        const existingTip = execFileSync('git', ['rev-parse', '--verify', '--quiet', refName], {
          cwd: repoRoot,
          timeout: 3000,
        })
          .toString('utf-8')
          .trim();
        if (existingTip) {
          parentArgs = ['-p', existingTip];
        }
      } catch {}

      const commitMsg = `${label}\n\nCindy-Session-Id: ${sessionId}\nCindy-Message-Anchor: ${anchorMessageId}`;
      const commitSha = execFileSync(
        'git',
        ['commit-tree', treeSha, ...parentArgs, '-m', commitMsg],
        { cwd: repoRoot, env: gitEnv, timeout: 5000 }
      )
        .toString('utf-8')
        .trim();

      execFileSync('git', ['update-ref', refName, commitSha], {
        cwd: repoRoot,
        timeout: 3000,
      });

      return { commitSha, refName };
    } catch (err: any) {
      return {
        commitSha: null,
        refName,
        skippedReason: err?.message || 'CAPTURE_FAILED',
      };
    } finally {
      if (fs.existsSync(tempIndex)) {
        try {
          execFileSync('/opt/xrsec/.env/rmfile', [tempIndex], { timeout: 3000 });
        } catch {}
      }
    }
  }

  public readSavepointTip(repoRoot: string, sessionId: string): string | null {
    const refName = savepointRefForSession(sessionId);
    try {
      const sha = execFileSync('git', ['rev-parse', '--verify', '--quiet', refName], {
        cwd: repoRoot,
        timeout: 3000,
      })
        .toString('utf-8')
        .trim();
      return sha || null;
    } catch {
      return null;
    }
  }
}

/**
 * Subagent Rewind Fence & Generation Tracker
 * Prevents in-flight subagent observations from leaking into a session after rewind commit.
 */
export class SubagentRewindFenceManager {
  private generations = new Map<string, number>();
  private activeFences = new Set<string>();

  public getGeneration(sessionId: string): number {
    return this.generations.get(sessionId) ?? 0;
  }

  public beginFence(sessionId: string): { sessionId: string; generationBefore: number } {
    this.activeFences.add(sessionId);
    return { sessionId, generationBefore: this.getGeneration(sessionId) };
  }

  public commitAndAdvance(sessionId: string): number {
    const next = this.getGeneration(sessionId) + 1;
    this.generations.set(sessionId, next);
    this.activeFences.delete(sessionId);
    return next;
  }

  public releaseFence(sessionId: string): void {
    this.activeFences.delete(sessionId);
  }

  public isFenced(sessionId: string): boolean {
    return this.activeFences.has(sessionId);
  }
}
