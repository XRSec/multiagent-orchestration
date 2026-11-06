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

  constructor(projectRoot: string) {
    const stateDir = path.join(projectRoot, '.claude');
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    this.dbPath = path.join(stateDir, 'blackboard_ssot.db');
    this.db = new DatabaseSync(this.dbPath);

    this.initPragmasAndTables();
    this.ensureSeedRecord();
  }

  private initPragmasAndTables(): void {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
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
        created_at TEXT NOT NULL
      );
    `);
  }

  private ensureSeedRecord(): void {
    const query = this.db.prepare('SELECT id FROM blackboard_ssot WHERE id = 1');
    const existing = query.get() as { id?: number } | undefined;
    if (!existing) {
      const insert = this.db.prepare(
        'INSERT INTO blackboard_ssot (id, version, state_json, updated_at) VALUES (1, 1, ?, ?)'
      );
      insert.run(
        JSON.stringify(INITIAL_BLACKBOARD_STATE),
        INITIAL_BLACKBOARD_STATE.updatedAt
      );
    }
  }

  public readState(): BlackboardState {
    const stmt = this.db.prepare('SELECT state_json FROM blackboard_ssot WHERE id = 1');
    const row = stmt.get() as { state_json: string } | undefined;
    if (!row) {
      return INITIAL_BLACKBOARD_STATE;
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

      const updateStmt = this.db.prepare(
        'UPDATE blackboard_ssot SET version = ?, state_json = ?, updated_at = ? WHERE id = 1'
      );
      updateStmt.run(current.version, JSON.stringify(current), current.updatedAt);

      const auditStmt = this.db.prepare(
        'INSERT INTO blackboard_audit_log (version, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?)'
      );
      auditStmt.run(
        current.version,
        actor,
        action,
        auditDetail.slice(0, 500),
        current.updatedAt
      );

      this.db.exec('COMMIT;');
      return current;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  public checkpointWal(): void {
    try {
      this.db.exec('PRAGMA wal_checkpoint(RESTART);');
    } catch {
      // Ignore non-fatal lock conflicts during checkpoint
    }
  }

  public exportSnapshotFile(snapshotPath: string): void {
    const current = this.readState();
    const parent = path.dirname(snapshotPath);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    fs.writeFileSync(snapshotPath, JSON.stringify(current, null, 2), 'utf-8');
  }

  public close(): void {
    try {
      this.db.close();
    } catch {}
  }
}

