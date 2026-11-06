import { DatabaseSync } from 'node:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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

export interface MessageRecord {
  id: string;
  sequence: number;
  session_id: string;
  room_id: string | null;
  thread_id: string | null;
  sender_id: string;
  sender_role: string;
  content: string;
  silent_token: number;
  metadata_json: string;
  created_at: number;
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
  }

  public getDbPath(): string {
    return path.join(this.globalStorageDir, 'orchestrator.db');
  }

  // --- Bot Management ---
  public registerBot(bot: BotRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO bots (
        id, name, display_name, description, avatar, avatar_color,
        status, canonical_session_id, bot_dir, claude_config_dir,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      bot.id, bot.name, bot.display_name, bot.description, bot.avatar, bot.avatar_color,
      bot.status, bot.canonical_session_id, bot.bot_dir, bot.claude_config_dir,
      bot.created_at, bot.updated_at
    );
  }

  public getBot(nameOrId: string): BotRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM bots WHERE id = ? OR name = ? LIMIT 1
    `);
    const row = stmt.get(nameOrId, nameOrId) as unknown as BotRecord | undefined;
    return row || null;
  }

  public listBots(): BotRecord[] {
    const stmt = this.db.prepare(`SELECT * FROM bots ORDER BY name ASC`);
    return stmt.all() as unknown as BotRecord[];
  }

  /**
   * Scan and register bots from user agents directory (~/.multiagent-orchestration/agents)
   * and optionally workspace Bots directory.
   */
  public scanAndRegisterAgents(projectRoot: string = process.cwd()): number {
    const scannedDirs = [
      getUserAgentsDir(),
      path.join(projectRoot, 'Customizations', 'agents'),
      path.join(projectRoot, 'Bots')
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
        if (fs.existsSync(profilePath)) {
          try {
            const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
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
                created_at: profile.created_at || Date.now(),
                updated_at: profile.updated_at || Date.now()
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
    slugOrOptions: string | { id?: string; slug?: string; name: string; members?: string[]; charterText?: string; initialMemoryText?: string },
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
      initialMemoryText = slugOrOptions.initialMemoryText || `# Group Memory & Blackboard\n\n## 1. Ground Truth\n- Initialized: ${new Date().toISOString()}`;
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
      created_at: Date.now()
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
      roomId, slug, name, roomDir, charterPath, memoryPath,
      1, 5, JSON.stringify(members), now, now
    );

    // Auto-create default canonical room session
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
      updated_at: now
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
    const charter = fs.existsSync(room.charter_path) ? fs.readFileSync(room.charter_path, 'utf-8') : '';
    const memory = fs.existsSync(room.memory_path) ? fs.readFileSync(room.memory_path, 'utf-8') : '';
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
    const current = fs.existsSync(room.memory_path) ? fs.readFileSync(room.memory_path, 'utf-8') : '';
    fs.writeFileSync(room.memory_path, current + appendix, 'utf-8');
  }

  public addMessage(params: {
    room_id: string;
    sender_id: string;
    sender_type?: string;
    content: string;
    role?: 'user' | 'assistant' | 'system' | 'steering' | 'tool';
    thread_id?: string;
    reply_to_id?: string;
    metadata?: Record<string, unknown>;
    metadata_json?: string;
  }): MessageRecord {
    const sessionId = `session_${params.room_id}`;
    const checkSession = this.db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId);
    if (!checkSession) {
      this.createSession(sessionId, 'room', params.room_id, `Room Session ${params.room_id}`, '', '');
    }

    const role = (params.role || (params.sender_type === 'bot' ? 'assistant' : 'user')) as 'user' | 'assistant' | 'system' | 'steering' | 'tool';
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
      metadata: Object.keys(meta).length > 0 ? meta : undefined,
    });
  }

  // --- Session & Message Management ---
  public createSession(
    sessionId: string,
    sessionType: 'dm' | 'room' | 'thread',
    targetId: string,
    title: string,
    cwdPath: string,
    claudeConfigDir: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions (
        id, session_type, target_id, title, status, cwd_path, claude_config_dir,
        total_tokens, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, 0, ?, ?)
    `);
    const now = Date.now();
    stmt.run(sessionId, sessionType, targetId, title, cwdPath, claudeConfigDir, now, now);
  }

  public appendMessage(
    sessionId: string,
    senderId: string,
    senderRole: 'user' | 'assistant' | 'system' | 'steering' | 'tool',
    content: string,
    options: {
      roomId?: string;
      threadId?: string;
      silentToken?: boolean;
      metadata?: Record<string, unknown>;
    } = {}
  ): MessageRecord {
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const silent = options.silentToken || content.trim() === 'NO_REPLY' ? 1 : 0;
    const metadataStr = JSON.stringify(options.metadata || {});

    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, session_id, room_id, thread_id, sender_id, sender_role,
        content, silent_token, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      msgId, sessionId, options.roomId || null, options.threadId || null,
      senderId, senderRole, content, silent, metadataStr, now
    );

    const queryStmt = this.db.prepare(`SELECT * FROM messages WHERE id = ?`);
    return queryStmt.get(msgId) as unknown as MessageRecord;
  }

  // --- Delta Message Slicing for Group Chats ---
  public getDeltaMessages(roomId: string, memberId: string): MessageRecord[] {
    // 1. Get member's last seen sequence
    const cursorStmt = this.db.prepare(`
      SELECT last_seen_sequence FROM member_cursors WHERE member_id = ? AND room_id = ?
    `);
    const cursorRow = cursorStmt.get(memberId, roomId) as { last_seen_sequence: number } | undefined;
    const lastSeen = cursorRow ? cursorRow.last_seen_sequence : 0;

    // 2. Query messages with sequence > lastSeen
    const msgStmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE room_id = ? AND sequence > ? AND silent_token = 0
      ORDER BY sequence ASC
    `);
    const delta = msgStmt.all(roomId, lastSeen) as unknown as MessageRecord[];

    // 3. Advance cursor to latest sequence
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
      WHERE room_id = ? AND sequence > ? AND silent_token = 0
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

