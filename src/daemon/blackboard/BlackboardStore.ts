/**
 * Purpose: High-performance SQLite WAL storage engine for atomic cross-process Blackboard SSOT.
 * Context: multiagent-orchestration daemon, eliminates multi-claude.exe state amnesia.
 * Usage: Initialized in host orchestrator or standalone blackboard MCP runner.
 * Prerequisites: Node.js 22.5+ or 26+ native node:sqlite DatabaseSync module.
 */

import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  BlackboardState,
  INITIAL_BLACKBOARD_STATE,
  TOKEN_LIMITS,
} from './types';

export function compactTouchedFiles(files: string[]): string[] {
  const unique = Array.from(new Set(files.map((f) => f.trim()).filter(Boolean)));
  if (unique.length <= TOKEN_LIMITS.MAX_TOUCHED_FILES) {
    return unique;
  }
  const grouped = new Map<string, number>();
  for (const file of unique) {
    const parts = file.split('/');
    const prefix = parts.length > 2 ? `${parts[0]}/${parts[1]}/*` : parts[0];
    grouped.set(prefix, (grouped.get(prefix) || 0) + 1);
  }
  return Array.from(grouped.entries())
    .map(([prefix, count]) => `${prefix} (${count} files)`)
    .slice(0, TOKEN_LIMITS.MAX_TOUCHED_FILES);
}

export class BlackboardStore {
  private db: DatabaseSync;
  private dbPath: string;
  private projectRoot: string;

  constructor(projectRoot: string, customDataDir?: string) {
    this.projectRoot = path.resolve(projectRoot);
    const stateDir = customDataDir
      ? path.resolve(customDataDir)
      : path.join(this.projectRoot, 'data');
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    this.dbPath = path.join(stateDir, 'blackboard_ssot.db');
    this.db = new DatabaseSync(this.dbPath);

    this.initPragmasAndTables();
    this.ensureSeedRecord();
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  private initPragmasAndTables(): void {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec('PRAGMA temp_store = MEMORY;');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blackboard_ssot (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS blackboard_audit_log (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL,
        state_snapshot_json TEXT,
        created_at TEXT NOT NULL
      );
    `);

    try {
      const cols = this.db.prepare('PRAGMA table_info(blackboard_audit_log)').all() as Array<{ name: string }>;
      if (!cols.some((c) => c.name === 'state_snapshot_json')) {
        this.db.exec('ALTER TABLE blackboard_audit_log ADD COLUMN state_snapshot_json TEXT;');
      }
    } catch {}
  }

  private ensureSeedRecord(): void {
    const query = this.db.prepare('SELECT id FROM blackboard_ssot WHERE id = 1');
    const existing = query.get() as { id?: number } | undefined;
    if (!existing) {
      const initialJson = JSON.stringify(INITIAL_BLACKBOARD_STATE);
      const insert = this.db.prepare(
        'INSERT INTO blackboard_ssot (id, version, state_json, updated_at) VALUES (1, 1, ?, ?)'
      );
      insert.run(initialJson, INITIAL_BLACKBOARD_STATE.updatedAt);

      const auditStmt = this.db.prepare(
        'INSERT INTO blackboard_audit_log (version, actor, action, detail, state_snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      auditStmt.run(
        1,
        'System',
        'SEED_INIT',
        'Initialized blackboard SSOT',
        initialJson,
        INITIAL_BLACKBOARD_STATE.updatedAt
      );
    }
  }

  public readState(): BlackboardState {
    const stmt = this.db.prepare('SELECT state_json FROM blackboard_ssot WHERE id = 1');
    const row = stmt.get() as { state_json: string } | undefined;
    if (!row) {
      return JSON.parse(JSON.stringify(INITIAL_BLACKBOARD_STATE));
    }
    return JSON.parse(row.state_json) as BlackboardState;
  }

  public mutate(
    actor: string,
    action: string,
    mutator: (draft: BlackboardState) => string
  ): BlackboardState {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const current = this.readState();
      const auditDetail = mutator(current);
      current.version += 1;
      current.updatedAt = new Date().toISOString();
      const serialized = JSON.stringify(current);

      const updateStmt = this.db.prepare(
        'UPDATE blackboard_ssot SET version = ?, state_json = ?, updated_at = ? WHERE id = 1'
      );
      updateStmt.run(current.version, serialized, current.updatedAt);

      const auditStmt = this.db.prepare(
        'INSERT INTO blackboard_audit_log (version, actor, action, detail, state_snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      auditStmt.run(
        current.version,
        actor,
        action,
        auditDetail.slice(0, 500),
        serialized,
        current.updatedAt
      );

      this.db.exec('COMMIT;');
      return current;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Group Chat Rewind & Blackboard Epoch Rollback (Scenario 6):
   * Restores Blackboard state to the latest audit snapshot prior to targetTimestampMs,
   * increments version/epoch to invalidate stale in-memory bot caches, and writes blackboard_epoch.json.
   */
  public rollbackStateBefore(targetTimestampMs: number, actor: string = 'HostRewind'): BlackboardState {
    const targetIso = new Date(targetTimestampMs).toISOString();
    const priorRow = this.db
      .prepare(
        `SELECT state_snapshot_json FROM blackboard_audit_log
         WHERE created_at <= ? AND state_snapshot_json IS NOT NULL
         ORDER BY seq DESC LIMIT 1`
      )
      .get(targetIso) as { state_snapshot_json: string } | undefined;

    const nextState = this.mutate(actor, 'REWIND_EPOCH_ROLLBACK', (draft) => {
      if (priorRow && priorRow.state_snapshot_json) {
        try {
          const restored = JSON.parse(priorRow.state_snapshot_json) as BlackboardState;
          draft.rootGoal = restored.rootGoal;
          draft.kanban = restored.kanban;
          draft.environment = restored.environment;
          draft.audit = restored.audit;
          draft.slidingDigest = restored.slidingDigest;
          return `Restored blackboard state prior to ${targetIso}`;
        } catch {}
      }
      // Fallback if no prior snapshot exists: clear active task
      draft.kanban.activeTask = null;
      return `Reset active task on rewind prior to ${targetIso}`;
    });

    this.exportSnapshotFile(path.join(this.projectRoot, 'data', 'blackboard_epoch.json'));
    return nextState;
  }

  public checkpointWal(): void {
    try {
      this.db.exec('PRAGMA wal_checkpoint(RESTART);');
    } catch {
      // Ignore non-fatal lock conflicts during checkpoint
    }
  }

  public exportSnapshotFile(snapshotPath?: string): void {
    const current = this.readState();
    const targetPath = snapshotPath || path.join(this.projectRoot, 'data', 'blackboard_epoch.json');
    const parent = path.dirname(targetPath);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    fs.writeFileSync(targetPath, JSON.stringify(current, null, 2), 'utf-8');
  }

  public close(): void {
    try {
      this.db.close();
    } catch {}
  }
}
