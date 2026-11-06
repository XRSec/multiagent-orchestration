/**
 * Multi-Agent Orchestration — Database Schema Specification (SQLite)
 * Language Plane: 100% en-US
 */

export const ORCHESTRATOR_DB_SCHEMA = `
-- PRAGMA configuration for high-concurrency ACID stability
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;

-- Bot Registry Table
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  avatar TEXT,
  avatar_color TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  canonical_session_id TEXT,
  bot_dir TEXT NOT NULL,
  claude_config_dir TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Rooms / Groups Table
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  room_dir TEXT NOT NULL,
  charter_path TEXT NOT NULL,
  memory_path TEXT NOT NULL,
  single_speaker_mode INTEGER NOT NULL DEFAULT 1,
  max_consecutive_steps INTEGER NOT NULL DEFAULT 5,
  members_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Sessions Table (DM, Group Room, or Independent Thread)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  session_type TEXT NOT NULL CHECK(session_type IN ('dm', 'room', 'thread')),
  target_id TEXT NOT NULL, -- bot_id for dm, room_id for room/thread
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  cwd_path TEXT NOT NULL,
  claude_config_dir TEXT NOT NULL,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Thread DAG Nodes Table
CREATE TABLE IF NOT EXISTS thread_nodes (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  parent_message_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Linear Messages Timeline Table with Monotonic Auto-increment Sequence
CREATE TABLE IF NOT EXISTS messages (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  room_id TEXT,
  thread_id TEXT,
  sender_id TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK(sender_role IN ('user', 'assistant', 'system', 'steering', 'tool')),
  content TEXT NOT NULL,
  silent_token INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Read Cursors for Delta Message Slicing
CREATE TABLE IF NOT EXISTS member_cursors (
  member_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  last_seen_sequence INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, room_id)
);

-- Indexes for Microsecond Queries
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_messages_room_seq ON messages(room_id, sequence);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, sequence);
CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(session_type, target_id);
`;
