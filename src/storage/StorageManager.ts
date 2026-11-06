import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ORCHESTRATOR_DB_SCHEMA } from './DatabaseSchema';
import { getUserStorageDir, getUserAgentsDir, ensureUserDataDirs } from './Paths';

export interface BotRecord {
  id: string;
  name: string;
  display_name: string;
  description: string;
  avatar: string;
  avatar_color: string;
  status: string;
  canonical_session_id: string;
  bot_dir: string;
  claude_config_dir: string;
  capabilities_json?: string;
  created_at: number;
  updated_at: number;
}

export interface RoomRecord {
  id: string;
  slug: string;
  name: string;
  room_dir: string;
  charter_path: string;
  memory_path: string;
  single_speaker_mode: number;
  max_consecutive_steps: number;
  members_json: string;
  created_at: number;
  updated_at: number;
}

export interface SessionRecord {
  id: string;
  session_type: 'dm' | 'room' | 'thread';
  target_id: string;
  title: string;
  status: 'active' | 'archived' | 'deleted';
  workspace_kind: 'project' | 'dialogue';
  cwd_path: string;
  project_dir: string | null;
  claude_config_dir: string;
  model: string;
  provider_id: string | null;
  effort: string;
  permission_mode: string;
  plan_mode_enabled: number;
  sdk_session_id: string | null;
  parent_session_id: string | null;
  forked_at_message_id: string | null;
  total_tokens: number;
  total_cost_usd: number;
  context_tokens: number;
  context_window: number;
  extra_dirs_json: string;
  writable_dirs_json: string;
  active_turn_started_at: number | null;
  last_turn_ended_at: number | null;
  cleared_at: number | null;
  pinned_at: number | null;
  list_preview: string | null;
  list_message_count: number | null;
  created_at: number;
  updated_at: number;
}

export type MessageSenderRole =
  | 'user'
  | 'assistant'
  | 'system'
  | 'steering'
  | 'tool'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'ask_user'
  | 'plan_review'
  | 'error'
  | 'agent_switch'
  | 'context_rebuild'
  | 'message_tombstone';

export interface MessageRecord {
  id: string;
  client_id?: string | null;
  sequence: number;
  session_id: string;
  room_id: string | null;
  thread_id: string | null;
  sender_id: string;
  sender_role: MessageSenderRole | string;
  content: string;
  tool_use_id?: string | null;
  silent_token: number;
  agent_kind?: string | null;
  agent_meta_json?: string | null;
  metadata_json: string;
  rewind_at?: number | null;
  created_at: number;
}

export interface QueuedInputItem {
  clientId: string;
  content: string;
  botId?: string;
  threadId?: string;
  files?: Array<{ path?: string; name?: string; mimeType?: string; base64?: string }>;
  enqueuedAt: number;
}

export interface InputQueueSnapshotRecord {
  session_id: string;
  client_epoch: string;
  queue_payload_json: string;
  item_count: number;
  updated_at: number;
}

export interface RewindCommitSummary {
  sessionId: string;
  targetMessageId: string;
  targetClientId: string | null;
  targetSequence: number;
  priorAssistantUuid: string | null;
  priorAssistantMessageId: string | null;
  rewoundMessageCount: number;
  rewoundSubagentCount: number;
  rewindTimestamp: number;
}

export const MAX_QUEUE_SNAPSHOT_BYTES = 16 * 1024 * 1024; // 16 MiB

export class AgentInputQueueSnapshotTooLargeError extends Error {
  readonly code = 'AGENT_INPUT_QUEUE_SNAPSHOT_TOO_LARGE';
  constructor(
    readonly sessionId: string,
    readonly itemCount: number,
    readonly payloadBytes: number
  ) {
    super(
      `agent input queue snapshot exceeds ${MAX_QUEUE_SNAPSHOT_BYTES} bytes after sanitization ` +
        `(session=${sessionId}, items=${itemCount}, bytes=${payloadBytes})`
    );
    this.name = 'AgentInputQueueSnapshotTooLargeError';
  }
}

export function computeForkSourceMessagesDigest(rows: readonly MessageRecord[]): string {
  const hash = crypto.createHash('sha256');
  for (const row of rows) {
    hash
      .update(
        JSON.stringify([
          row.client_id ?? row.id,
          row.sender_role,
          row.content,
          row.tool_use_id ?? null,
          row.agent_meta_json ?? null,
          row.agent_kind ?? 'cc',
          row.created_at,
        ])
      )
      .update('\n');
  }
  return hash.digest('hex');
}

export class StorageManager {
  private db: DatabaseSync;
  private globalStorageDir: string;
  private groupsDir: string;
  private chatsDir: string;

  constructor(customStorageDir?: string) {
    if (!customStorageDir) {
      ensureUserDataDirs();
      this.globalStorageDir = getUserStorageDir();
    } else {
      this.globalStorageDir = customStorageDir;
    }
    this.groupsDir = path.join(path.dirname(this.globalStorageDir), 'groups');
    this.chatsDir = path.join(path.dirname(this.globalStorageDir), 'chats');

    fs.mkdirSync(this.globalStorageDir, { recursive: true });
    fs.mkdirSync(this.groupsDir, { recursive: true });
    fs.mkdirSync(this.chatsDir, { recursive: true });

    const dbPath = path.join(this.globalStorageDir, 'orchestrator.db');
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(ORCHESTRATOR_DB_SCHEMA);
    this.migrateExistingColumns();
  }

  /**
   * Ensure older orchestrator.db files seamlessly gain new v4.1 columns
   */
  private migrateExistingColumns(): void {
    const ensureColumns = (table: string, cols: Array<[string, string]>) => {
      try {
        const info = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        const existing = new Set(info.map((c) => c.name));
        for (const [colName, colDef] of cols) {
          if (!existing.has(colName)) {
            this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colDef}`);
          }
        }
      } catch {
        // Ignore if table not yet created
      }
    };

    ensureColumns('bots', [['capabilities_json', 'TEXT']]);
    ensureColumns('sessions', [
      ['workspace_kind', "TEXT NOT NULL DEFAULT 'project'"],
      ['project_dir', 'TEXT'],
      ['model', "TEXT NOT NULL DEFAULT 'claude-opus-4-6'"],
      ['provider_id', "TEXT DEFAULT 'cpa'"],
      ['effort', "TEXT NOT NULL DEFAULT 'high'"],
      ['permission_mode', "TEXT NOT NULL DEFAULT 'auto'"],
      ['plan_mode_enabled', 'INTEGER NOT NULL DEFAULT 0'],
      ['sdk_session_id', 'TEXT'],
      ['parent_session_id', 'TEXT'],
      ['forked_at_message_id', 'TEXT'],
      ['total_cost_usd', 'REAL NOT NULL DEFAULT 0'],
      ['context_tokens', 'INTEGER NOT NULL DEFAULT 0'],
      ['context_window', 'INTEGER NOT NULL DEFAULT 200000'],
      ['extra_dirs_json', "TEXT NOT NULL DEFAULT '[]'"],
      ['writable_dirs_json', "TEXT NOT NULL DEFAULT '[]'"],
      ['active_turn_started_at', 'INTEGER'],
      ['last_turn_ended_at', 'INTEGER'],
      ['cleared_at', 'INTEGER'],
      ['pinned_at', 'INTEGER'],
      ['list_preview', 'TEXT'],
      ['list_message_count', 'INTEGER'],
    ]);
    ensureColumns('messages', [
      ['client_id', 'TEXT'],
      ['tool_use_id', 'TEXT'],
      ['agent_kind', "TEXT DEFAULT 'cc'"],
      ['agent_meta_json', 'TEXT'],
      ['rewind_at', 'INTEGER'],
    ]);
  }

  public getDbPath(): string {
    return path.join(this.globalStorageDir, 'orchestrator.db');
  }

  public getStorageDir(): string {
    return this.globalStorageDir;
  }

  // --- Bot Management ---
  public registerBot(bot: BotRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO bots (
        id, name, display_name, description, avatar, avatar_color,
        status, canonical_session_id, bot_dir, claude_config_dir, capabilities_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      bot.id,
      bot.name,
      bot.display_name,
      bot.description,
      bot.avatar,
      bot.avatar_color,
      bot.status,
      bot.canonical_session_id,
      bot.bot_dir,
      bot.claude_config_dir,
      bot.capabilities_json ?? null,
      bot.created_at,
      bot.updated_at
    );
  }

  public getBot(nameOrId: string): BotRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM bots WHERE id = ? OR name = ? OR LOWER(name) = LOWER(?) LIMIT 1
    `);
    const row = stmt.get(nameOrId, nameOrId, nameOrId) as unknown as BotRecord | undefined;
    return row || null;
  }

  public listBots(): BotRecord[] {
    const stmt = this.db.prepare(`SELECT * FROM bots ORDER BY name ASC`);
    return stmt.all() as unknown as BotRecord[];
  }

  public scanAndRegisterAgents(projectRoot: string = process.cwd()): number {
    const scannedDirs = [
      getUserAgentsDir(),
      path.join(projectRoot, 'Customizations', 'agents'),
      path.join(projectRoot, 'Bots'),
    ];
    let count = 0;
    const seenIds = new Set<string>();

    for (const baseDir of scannedDirs) {
      if (!fs.existsSync(baseDir)) continue;
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        const botDir = path.join(baseDir, entry.name);
        const stat = fs.statSync(botDir, { throwIfNoEntry: false });
        if (!stat || !stat.isDirectory()) continue;

        const profilePath = path.join(botDir, 'profile.json');
        const capPath = path.join(botDir, 'capabilities.json');
        if (fs.existsSync(profilePath)) {
          try {
            const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
            const capsRaw = fs.existsSync(capPath) ? fs.readFileSync(capPath, 'utf-8') : undefined;
            if (profile.id && !seenIds.has(profile.id)) {
              seenIds.add(profile.id);
              this.registerBot({
                id: profile.id,
                name: entry.name,
                display_name: profile.display_name || entry.name,
                description: profile.description || '',
                avatar: profile.avatar || '',
                avatar_color: profile.avatar_color || '#6366f1',
                status: profile.status || 'online',
                canonical_session_id: profile.canonical_session_id || `session_${profile.id}`,
                bot_dir: botDir,
                claude_config_dir: path.join(botDir, 'claude_config'),
                capabilities_json: capsRaw,
                created_at: profile.created_at || Date.now(),
                updated_at: profile.updated_at || Date.now(),
              });
              count++;
            }
          } catch {
            // Skip invalid json
          }
        }
      }
    }
    return count;
  }

  // --- Room & Group Management ---
  public createRoom(
    slugOrOptions:
      | string
      | {
          id?: string;
          slug?: string;
          name: string;
          members?: string[];
          charterText?: string;
          initialMemoryText?: string;
        },
    nameArg?: string,
    membersArg?: string[],
    charterTextArg?: string,
    initialMemoryTextArg?: string
  ): RoomRecord {
    let roomId: string;
    let slug: string;
    let name: string;
    let members: string[];
    let charterText: string;
    let initialMemoryText: string;

    if (typeof slugOrOptions === 'object') {
      slug = slugOrOptions.slug || slugOrOptions.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      roomId = slugOrOptions.id || `room_${slug}_${Date.now()}`;
      name = slugOrOptions.name;
      members = slugOrOptions.members || [];
      charterText = slugOrOptions.charterText || `# ${name} Charter\nMission and rules.`;
      initialMemoryText =
        slugOrOptions.initialMemoryText ||
        `# Group Memory & Blackboard\n\n## 1. Ground Truth\n- Initialized: ${new Date().toISOString()}`;
    } else {
      slug = slugOrOptions;
      name = nameArg || slug;
      roomId = `room_${slug}_${Date.now()}`;
      members = membersArg || [];
      charterText = charterTextArg || `# ${name} Charter`;
      initialMemoryText = initialMemoryTextArg || `# Group Memory & Blackboard`;
    }

    const roomDir = path.join(this.groupsDir, slug);
    fs.mkdirSync(roomDir, { recursive: true });

    const charterPath = path.join(roomDir, 'GROUP_CHARTER.md');
    const memoryPath = path.join(roomDir, 'GROUP_MEMORY.md');
    const roomJsonPath = path.join(roomDir, 'room.json');

    fs.writeFileSync(charterPath, charterText, 'utf-8');
    fs.writeFileSync(memoryPath, initialMemoryText, 'utf-8');

    const roomData = {
      id: roomId,
      slug,
      name,
      members,
      created_at: Date.now(),
    };
    fs.writeFileSync(roomJsonPath, JSON.stringify(roomData, null, 2), 'utf-8');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO rooms (
        id, slug, name, room_dir, charter_path, memory_path,
        single_speaker_mode, max_consecutive_steps, members_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    stmt.run(
      roomId,
      slug,
      name,
      roomDir,
      charterPath,
      memoryPath,
      1,
      5,
      JSON.stringify(members),
      now,
      now
    );

    const canonicalSessionId = `session_${roomId}`;
    this.createSession(canonicalSessionId, 'room', roomId, `${name} Main Session`, roomDir, '');

    return {
      id: roomId,
      slug,
      name,
      room_dir: roomDir,
      charter_path: charterPath,
      memory_path: memoryPath,
      single_speaker_mode: 1,
      max_consecutive_steps: 5,
      members_json: JSON.stringify(members),
      created_at: now,
      updated_at: now,
    };
  }

  public getRoom(slugOrId: string): RoomRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM rooms WHERE id = ? OR slug = ? LIMIT 1
    `);
    const row = stmt.get(slugOrId, slugOrId) as unknown as RoomRecord | undefined;
    return row || null;
  }

  public readBlackboard(roomIdOrSlug: string): { charter: string; memory: string } {
    const room = this.getRoom(roomIdOrSlug);
    if (!room) {
      throw new Error(`Room not found: ${roomIdOrSlug}`);
    }
    const charter = fs.existsSync(room.charter_path)
      ? fs.readFileSync(room.charter_path, 'utf-8')
      : '';
    const memory = fs.existsSync(room.memory_path)
      ? fs.readFileSync(room.memory_path, 'utf-8')
      : '';
    return { charter, memory };
  }

  public updateBlackboardMemory(roomIdOrSlug: string, newMemoryContent: string): void {
    const room = this.getRoom(roomIdOrSlug);
    if (!room) {
      throw new Error(`Room not found: ${roomIdOrSlug}`);
    }
    fs.writeFileSync(room.memory_path, newMemoryContent, 'utf-8');
  }

  public appendToBlackboard(roomIdOrSlug: string, appendix: string): void {
    const room = this.getRoom(roomIdOrSlug);
    if (!room) {
      throw new Error(`Room not found: ${roomIdOrSlug}`);
    }
    const current = fs.existsSync(room.memory_path)
      ? fs.readFileSync(room.memory_path, 'utf-8')
      : '';
    fs.writeFileSync(room.memory_path, current + appendix, 'utf-8');
  }

  public addMessage(params: {
    room_id: string;
    sender_id: string;
    sender_type?: string;
    content: string;
    role?: MessageSenderRole;
    thread_id?: string;
    reply_to_id?: string;
    client_id?: string;
    agent_meta?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    metadata_json?: string;
  }): MessageRecord {
    const sessionId = `session_${params.room_id}`;
    const checkSession = this.db
      .prepare(`SELECT id FROM sessions WHERE id = ?`)
      .get(sessionId);
    if (!checkSession) {
      this.createSession(
        sessionId,
        'room',
        params.room_id,
        `Room Session ${params.room_id}`,
        '',
        ''
      );
    }

    const role = (params.role ||
      (params.sender_type === 'bot' ? 'assistant' : 'user')) as MessageSenderRole;
    let meta: Record<string, unknown> = params.metadata ? { ...params.metadata } : {};
    if (params.reply_to_id && !meta.reply_to_id) {
      meta.reply_to_id = params.reply_to_id;
    }
    if (params.metadata_json) {
      try {
        meta = { ...meta, ...JSON.parse(params.metadata_json) };
      } catch {}
    }

    return this.appendMessage(sessionId, params.sender_id, role, params.content, {
      roomId: params.room_id,
      threadId: params.thread_id,
      clientId: params.client_id,
      agentMeta: params.agent_meta,
      metadata: Object.keys(meta).length > 0 ? meta : undefined,
    });
  }

  // --- Session & Dual-ID Lifecycle Management ---
  public createSession(
    sessionId: string,
    sessionType: 'dm' | 'room' | 'thread',
    targetId: string,
    title: string,
    cwdPath: string,
    claudeConfigDir: string,
    extra?: {
      model?: string;
      providerId?: string;
      effort?: string;
      permissionMode?: string;
      sdkSessionId?: string | null;
      parentSessionId?: string | null;
      forkedAtMessageId?: string | null;
      contextWindow?: number;
    }
  ): SessionRecord {
    const existing = this.getSession(sessionId);
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (
        id, session_type, target_id, title, status, workspace_kind, cwd_path,
        claude_config_dir, model, provider_id, effort, permission_mode,
        sdk_session_id, parent_session_id, forked_at_message_id,
        total_tokens, total_cost_usd, context_tokens, context_window,
        active_turn_started_at, last_turn_ended_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'project', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      sessionId,
      sessionType,
      targetId,
      title,
      existing?.status || 'active',
      cwdPath,
      claudeConfigDir,
      extra?.model || existing?.model || 'claude-opus-4-6',
      extra?.providerId ?? existing?.provider_id ?? 'cpa',
      extra?.effort || existing?.effort || 'high',
      extra?.permissionMode || existing?.permission_mode || 'auto',
      extra?.sdkSessionId !== undefined ? extra.sdkSessionId : existing?.sdk_session_id ?? null,
      extra?.parentSessionId !== undefined
        ? extra.parentSessionId
        : existing?.parent_session_id ?? null,
      extra?.forkedAtMessageId !== undefined
        ? extra.forkedAtMessageId
        : existing?.forked_at_message_id ?? null,
      existing?.total_tokens ?? 0,
      existing?.total_cost_usd ?? 0,
      existing?.context_tokens ?? 0,
      extra?.contextWindow ?? existing?.context_window ?? 200000,
      existing?.active_turn_started_at ?? null,
      existing?.last_turn_ended_at ?? null,
      existing?.created_at ?? now,
      now
    );
    return this.getSession(sessionId)!;
  }

  public getSession(sessionId: string): SessionRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM sessions WHERE id = ? LIMIT 1`);
    const row = stmt.get(sessionId) as unknown as SessionRecord | undefined;
    return row || null;
  }

  public updateSessionSdkId(sessionId: string, sdkSessionId: string | null): void {
    const stmt = this.db.prepare(`
      UPDATE sessions SET sdk_session_id = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(sdkSessionId, Date.now(), sessionId);
  }

  /**
   * Atomic Compare-And-Swap clearing of sdk_session_id (Cindy SessionStorage contract).
   * Prevents stale resume failures from wiping a newly rotated sdk_session_id.
   */
  public compareAndClearSdkSessionId(sessionId: string, expectedSdkSessionId: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET sdk_session_id = NULL, updated_at = ?
      WHERE id = ? AND sdk_session_id = ?
    `);
    const result = stmt.run(Date.now(), sessionId, expectedSdkSessionId);
    return Number(result.changes) > 0;
  }

  public updateSessionContextUsage(
    sessionId: string,
    contextTokens: number,
    contextWindow?: number,
    tokensDelta: number = 0
  ): void {
    const session = this.getSession(sessionId);
    if (!session) return;
    const nextWindow = contextWindow && contextWindow > 0 ? contextWindow : session.context_window;
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET context_tokens = ?, context_window = ?, total_tokens = total_tokens + ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(contextTokens, nextWindow, tokensDelta, Date.now(), sessionId);
  }

  /**
   * Append-only turn watermarks for crash detection (active_turn_started_at > last_turn_ended_at)
   */
  public markTurnStarted(sessionId: string, timestampMs: number = Date.now()): void {
    const stmt = this.db.prepare(`
      UPDATE sessions SET active_turn_started_at = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(timestampMs, timestampMs, sessionId);
  }

  public markTurnEnded(sessionId: string, timestampMs: number = Date.now()): void {
    const stmt = this.db.prepare(`
      UPDATE sessions SET last_turn_ended_at = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(timestampMs, timestampMs, sessionId);
  }

  public listInterruptedSessions(): SessionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions
      WHERE status = 'active'
        AND active_turn_started_at IS NOT NULL
        AND (last_turn_ended_at IS NULL OR active_turn_started_at > last_turn_ended_at)
      ORDER BY active_turn_started_at DESC
    `);
    return stmt.all() as unknown as SessionRecord[];
  }

  public appendMessage(
    sessionId: string,
    senderId: string,
    senderRole: MessageSenderRole,
    content: string,
    options: {
      roomId?: string;
      threadId?: string;
      clientId?: string;
      toolUseId?: string;
      silentToken?: boolean;
      agentKind?: string;
      agentMeta?: Record<string, unknown>;
      rewindAt?: number | null;
      metadata?: Record<string, unknown>;
    } = {}
  ): MessageRecord {
    // Idempotency guard for duplicate client_id within the same session (Scenario E1)
    if (options.clientId) {
      const existing = this.db
        .prepare(`SELECT * FROM messages WHERE session_id = ? AND client_id = ? LIMIT 1`)
        .get(sessionId, options.clientId) as unknown as MessageRecord | undefined;
      if (existing) {
        return existing;
      }
    }

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const clientId = options.clientId || crypto.randomUUID();
    const now = Date.now();
    const silent =
      options.silentToken ||
      content.trim().toUpperCase() === 'NO_REPLY' ||
      content.trim() === '```NO_REPLY```'
        ? 1
        : 0;

    const agentMetaObj = options.agentMeta
      ? { uuid: clientId, ...options.agentMeta }
      : { uuid: clientId };
    const agentMetaStr = JSON.stringify(agentMetaObj);
    const metadataStr = JSON.stringify(options.metadata || {});
    const rewindAt =
      options.rewindAt !== undefined
        ? options.rewindAt
        : senderRole === 'context_rebuild'
          ? now
          : null;

    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, client_id, session_id, room_id, thread_id, sender_id, sender_role,
        content, tool_use_id, silent_token, agent_kind, agent_meta_json, metadata_json, rewind_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      msgId,
      clientId,
      sessionId,
      options.roomId || null,
      options.threadId || null,
      senderId,
      senderRole,
      content,
      options.toolUseId || null,
      silent,
      options.agentKind || 'cc',
      agentMetaStr,
      metadataStr,
      rewindAt,
      now
    );

    // Register stable FTS integer row mapping
    this.db
      .prepare(`INSERT OR IGNORE INTO messages_fts_rows (message_id) VALUES (?)`)
      .run(msgId);

    // Update session denormalized preview & count for visible user/assistant messages
    if (rewindAt === null && silent === 0 && (senderRole === 'user' || senderRole === 'assistant')) {
      const preview = content.replace(/\s+/g, ' ').trim().slice(0, 140);
      this.db
        .prepare(
          `UPDATE sessions
           SET list_preview = ?,
               list_message_count = COALESCE(list_message_count, 0) + 1,
               updated_at = ?
           WHERE id = ?`
        )
        .run(preview, now, sessionId);
    }

    const queryStmt = this.db.prepare(`SELECT * FROM messages WHERE id = ?`);
    return queryStmt.get(msgId) as unknown as MessageRecord;
  }

  public getMessageByIdOrClientId(
    sessionId: string,
    messageIdOrClientId: string
  ): MessageRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ? AND (id = ? OR client_id = ?)
      LIMIT 1
    `);
    const row = stmt.get(sessionId, messageIdOrClientId, messageIdOrClientId) as
      | MessageRecord
      | undefined;
    return row || null;
  }

  public getVisibleSessionMessages(sessionId: string): MessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
        AND rewind_at IS NULL
        AND sender_role != 'message_tombstone'
        AND silent_token = 0
      ORDER BY sequence ASC
    `);
    return stmt.all(sessionId) as unknown as MessageRecord[];
  }

  /**
   * Resolve the prior visible assistant message UUID before targetSequence (for SDK resumeSessionAt)
   */
  public findPriorAssistantAnchor(
    sessionId: string,
    beforeSequence: number
  ): { messageId: string; uuid: string } | null {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
        AND sequence < ?
        AND rewind_at IS NULL
        AND sender_role = 'assistant'
        AND silent_token = 0
      ORDER BY sequence DESC
      LIMIT 1
    `);
    const row = stmt.get(sessionId, beforeSequence) as unknown as MessageRecord | undefined;
    if (!row) return null;

    let uuid = row.client_id || row.id;
    if (row.agent_meta_json) {
      try {
        const parsed = JSON.parse(row.agent_meta_json);
        if (typeof parsed.uuid === 'string' && parsed.uuid.trim()) {
          uuid = parsed.uuid.trim();
        }
      } catch {}
    }
    return { messageId: row.id, uuid };
  }

  /**
   * Audit-Preserving Soft Rewind (SPEC-ARCH-SESSION-REWIND-COMPACT-2026 Section 3.2):
   * - Soft-marks messages with sequence >= target.sequence as rewind_at = now
   * - Soft-marks subagent_runs started at or after target.created_at
   * - Clamps group room member_cursors back to target.sequence - 1
   */
  public rewindToMessage(
    sessionId: string,
    messageIdOrClientId: string,
    options?: { requireLatestUser?: boolean }
  ): RewindCommitSummary {
    const target = this.getMessageByIdOrClientId(sessionId, messageIdOrClientId);
    if (!target || target.rewind_at !== null) {
      throw new Error(`MESSAGE_NOT_FOUND: Target message '${messageIdOrClientId}' not found in active timeline.`);
    }
    if (target.sender_role !== 'user') {
      throw new Error(`NOT_USER_MESSAGE: Rewind target must be a user message (got '${target.sender_role}').`);
    }

    if (options?.requireLatestUser) {
      const latestUser = this.db
        .prepare(
          `SELECT id FROM messages
           WHERE session_id = ? AND rewind_at IS NULL AND sender_role = 'user'
           ORDER BY sequence DESC LIMIT 1`
        )
        .get(sessionId) as { id: string } | undefined;
      if (!latestUser || latestUser.id !== target.id) {
        throw new Error(`STALE_LATEST_USER: Target '${target.id}' is no longer the latest user message.`);
      }
    }

    const priorAnchor = this.findPriorAssistantAnchor(sessionId, target.sequence);
    const now = Date.now();

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const msgRes = this.db
        .prepare(
          `UPDATE messages
           SET rewind_at = ?
           WHERE session_id = ? AND sequence >= ? AND rewind_at IS NULL`
        )
        .run(now, sessionId, target.sequence);

      const subRes = this.db
        .prepare(
          `UPDATE subagent_runs
           SET rewind_at = ?, updated_at = ?
           WHERE session_id = ? AND started_at >= ? AND rewind_at IS NULL`
        )
        .run(now, now, sessionId, target.created_at);

      if (target.room_id) {
        const clampedSeq = Math.max(0, target.sequence - 1);
        this.db
          .prepare(
            `UPDATE member_cursors
             SET last_seen_sequence = MIN(last_seen_sequence, ?), updated_at = ?
             WHERE room_id = ?`
          )
          .run(clampedSeq, now, target.room_id);
      }

      // Recompute visible message count & preview for session
      const visibleCountRow = this.db
        .prepare(
          `SELECT COUNT(*) as cnt FROM messages
           WHERE session_id = ? AND rewind_at IS NULL AND sender_role IN ('user', 'assistant') AND silent_token = 0`
        )
        .get(sessionId) as { cnt: number };

      const lastVisibleRow = this.db
        .prepare(
          `SELECT content FROM messages
           WHERE session_id = ? AND rewind_at IS NULL AND sender_role IN ('user', 'assistant') AND silent_token = 0
           ORDER BY sequence DESC LIMIT 1`
        )
        .get(sessionId) as { content: string } | undefined;

      this.db
        .prepare(
          `UPDATE sessions
           SET list_message_count = ?, list_preview = ?, context_tokens = 0, updated_at = ?
           WHERE id = ?`
        )
        .run(
          visibleCountRow?.cnt ?? 0,
          lastVisibleRow ? lastVisibleRow.content.slice(0, 140) : null,
          now,
          sessionId
        );

      this.db.exec('COMMIT;');

      return {
        sessionId,
        targetMessageId: target.id,
        targetClientId: target.client_id ?? null,
        targetSequence: target.sequence,
        priorAssistantUuid: priorAnchor?.uuid ?? null,
        priorAssistantMessageId: priorAnchor?.messageId ?? null,
        rewoundMessageCount: Number(msgRes.changes),
        rewoundSubagentCount: Number(subRes.changes),
        rewindTimestamp: now,
      };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Tombstone a single message and inject a hidden context_rebuild marker for next-send handoff
   */
  public tombstoneMessage(sessionId: string, messageIdOrClientId: string): {
    tombstonedId: string;
    handoffDigest: string;
    handoffText: string;
  } {
    const target = this.getMessageByIdOrClientId(sessionId, messageIdOrClientId);
    if (!target) {
      throw new Error(`MESSAGE_NOT_FOUND: '${messageIdOrClientId}'`);
    }

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db
        .prepare(
          `UPDATE messages
           SET sender_role = 'message_tombstone',
               content = '',
               agent_meta_json = NULL,
               metadata_json = '{}'
           WHERE id = ?`
        )
        .run(target.id);

      const surviving = this.getVisibleSessionMessages(sessionId);
      const digest = computeForkSourceMessagesDigest(surviving);
      const handoffText = this.buildConversationHandoffText(surviving, digest);

      this.appendMessage(
        sessionId,
        'system',
        'context_rebuild',
        JSON.stringify({ handoff: handoffText, digest }),
        { rewindAt: Date.now() }
      );

      this.db.exec('COMMIT;');
      return {
        tombstonedId: target.id,
        handoffDigest: digest,
        handoffText,
      };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  public consumePendingContextRebuildHandoff(sessionId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT id, content FROM messages
         WHERE session_id = ? AND sender_role = 'context_rebuild'
         ORDER BY sequence DESC LIMIT 1`
      )
      .get(sessionId) as { id: string; content: string } | undefined;
    if (!row) return null;

    try {
      const parsed = JSON.parse(row.content);
      // Convert consumed marker to tombstone so it is only consumed once
      this.db
        .prepare(`UPDATE messages SET sender_role = 'message_tombstone', content = '' WHERE id = ?`)
        .run(row.id);
      return typeof parsed.handoff === 'string' ? parsed.handoff : null;
    } catch {
      return null;
    }
  }

  public buildConversationHandoffText(
    messagesList?: MessageRecord[],
    precomputedDigest?: string
  ): string {
    const rows = messagesList || [];
    if (rows.length === 0) return '';
    const digest = precomputedDigest || computeForkSourceMessagesDigest(rows);
    const lines = rows.slice(-20).map((m) => {
      const compact = m.content.replace(/\s+/g, ' ').trim().slice(0, 500);
      return `[${m.sender_role}:${m.sender_id}] ${compact}`;
    });
    return [
      `<conversation-handoff digest="${digest}" count="${rows.length}">`,
      ...lines,
      `</conversation-handoff>`,
    ].join('\n');
  }

  /**
   * Fork a session at a specific message into a new child session with digest verification
   */
  public forkSessionAtMessage(
    sourceSessionId: string,
    newSessionId: string,
    upToMessageIdOrClientId?: string,
    newTitle?: string
  ): { session: SessionRecord; copiedMessages: number; sourceDigest: string } {
    const sourceSession = this.getSession(sourceSessionId);
    if (!sourceSession) {
      throw new Error(`SESSION_NOT_FOUND: '${sourceSessionId}'`);
    }

    let visible = this.getVisibleSessionMessages(sourceSessionId);
    let forkedAtMsgId: string | null = null;
    if (upToMessageIdOrClientId) {
      const anchor = this.getMessageByIdOrClientId(sourceSessionId, upToMessageIdOrClientId);
      if (!anchor) {
        throw new Error(`MESSAGE_NOT_FOUND: '${upToMessageIdOrClientId}'`);
      }
      forkedAtMsgId = anchor.id;
      visible = visible.filter((m) => m.sequence <= anchor.sequence);
    } else if (visible.length > 0) {
      forkedAtMsgId = visible[visible.length - 1].id;
    }

    const digest = computeForkSourceMessagesDigest(visible);

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const childSession = this.createSession(
        newSessionId,
        sourceSession.session_type,
        sourceSession.target_id,
        newTitle || `${sourceSession.title} (Fork)`,
        sourceSession.cwd_path,
        sourceSession.claude_config_dir,
        {
          model: sourceSession.model,
          providerId: sourceSession.provider_id || 'cpa',
          effort: sourceSession.effort,
          permissionMode: sourceSession.permission_mode,
          parentSessionId: sourceSession.id,
          forkedAtMessageId: forkedAtMsgId,
          contextWindow: sourceSession.context_window,
        }
      );

      for (const m of visible) {
        this.appendMessage(newSessionId, m.sender_id, m.sender_role as MessageSenderRole, m.content, {
          roomId: m.room_id || undefined,
          threadId: m.thread_id || undefined,
          toolUseId: m.tool_use_id || undefined,
          silentToken: m.silent_token === 1,
          agentKind: m.agent_kind || 'cc',
          agentMeta: m.agent_meta_json ? JSON.parse(m.agent_meta_json) : undefined,
          metadata: m.metadata_json ? JSON.parse(m.metadata_json) : undefined,
        });
      }

      this.db.exec('COMMIT;');
      return {
        session: childSession,
        copiedMessages: visible.length,
        sourceDigest: digest,
      };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  // --- Crash-Safe Pending Input Queue Snapshots (16 MiB Guard) ---
  public saveInputQueueSnapshot(
    sessionId: string,
    items: QueuedInputItem[],
    clientEpoch: string = 'epoch_default'
  ): InputQueueSnapshotRecord | null {
    if (items.length === 0) {
      this.clearInputQueueSnapshot(sessionId);
      return null;
    }

    let payloadStr = JSON.stringify(items);
    let byteLength = Buffer.byteLength(payloadStr, 'utf-8');

    // Strip inline base64 attachments if payload exceeds 16 MiB guard
    if (byteLength > MAX_QUEUE_SNAPSHOT_BYTES) {
      const sanitized = items.map((item) => ({
        ...item,
        files: item.files?.map((f) => ({
          path: f.path,
          name: f.name,
          mimeType: f.mimeType,
        })),
      }));
      payloadStr = JSON.stringify(sanitized);
      byteLength = Buffer.byteLength(payloadStr, 'utf-8');

      if (byteLength > MAX_QUEUE_SNAPSHOT_BYTES) {
        throw new AgentInputQueueSnapshotTooLargeError(sessionId, items.length, byteLength);
      }
    }

    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO agent_input_queue_snapshots (session_id, client_epoch, queue_payload_json, item_count, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           client_epoch = excluded.client_epoch,
           queue_payload_json = excluded.queue_payload_json,
           item_count = excluded.item_count,
           updated_at = excluded.updated_at`
      )
      .run(sessionId, clientEpoch, payloadStr, items.length, now);

    return {
      session_id: sessionId,
      client_epoch: clientEpoch,
      queue_payload_json: payloadStr,
      item_count: items.length,
      updated_at: now,
    };
  }

  public loadInputQueueSnapshot(sessionId: string): QueuedInputItem[] {
    const row = this.db
      .prepare(`SELECT queue_payload_json FROM agent_input_queue_snapshots WHERE session_id = ?`)
      .get(sessionId) as { queue_payload_json: string } | undefined;
    if (!row) return [];
    try {
      const parsed = JSON.parse(row.queue_payload_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public clearInputQueueSnapshot(sessionId: string): void {
    this.db
      .prepare(`DELETE FROM agent_input_queue_snapshots WHERE session_id = ?`)
      .run(sessionId);
  }

  // --- Delta Message Slicing for Group Chats ---
  public getDeltaMessages(roomId: string, memberId: string): MessageRecord[] {
    const cursorStmt = this.db.prepare(`
      SELECT last_seen_sequence FROM member_cursors WHERE member_id = ? AND room_id = ?
    `);
    const cursorRow = cursorStmt.get(memberId, roomId) as { last_seen_sequence: number } | undefined;
    const lastSeen = cursorRow ? cursorRow.last_seen_sequence : 0;

    const msgStmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE room_id = ?
        AND sequence > ?
        AND silent_token = 0
        AND rewind_at IS NULL
        AND sender_role != 'message_tombstone'
      ORDER BY sequence ASC
    `);
    const delta = msgStmt.all(roomId, lastSeen) as unknown as MessageRecord[];

    if (delta.length > 0) {
      const maxSeq = delta[delta.length - 1].sequence;
      const updateCursor = this.db.prepare(`
        INSERT INTO member_cursors (member_id, room_id, last_seen_sequence, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(member_id, room_id) DO UPDATE SET
          last_seen_sequence = excluded.last_seen_sequence,
          updated_at = excluded.updated_at
      `);
      updateCursor.run(memberId, roomId, maxSeq, Date.now());
    }

    return delta;
  }

  public getMessagesSince(roomId: string, sequence: number): MessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE room_id = ?
        AND sequence > ?
        AND silent_token = 0
        AND rewind_at IS NULL
        AND sender_role != 'message_tombstone'
      ORDER BY sequence ASC
    `);
    return stmt.all(roomId, sequence) as unknown as MessageRecord[];
  }

  public getMemberCursor(roomId: string, memberId: string): { last_seen_sequence: number } | null {
    const stmt = this.db.prepare(`
      SELECT last_seen_sequence FROM member_cursors WHERE member_id = ? AND room_id = ?
    `);
    const row = stmt.get(memberId, roomId) as { last_seen_sequence: number } | undefined;
    return row || null;
  }

  public updateMemberCursor(roomId: string, memberId: string, sequence: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO member_cursors (member_id, room_id, last_seen_sequence, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(member_id, room_id) DO UPDATE SET
        last_seen_sequence = excluded.last_seen_sequence,
        updated_at = excluded.updated_at
    `);
    stmt.run(memberId, roomId, sequence, Date.now());
  }

  public close(): void {
    this.db.close();
  }
}
