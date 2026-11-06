/**
 * Multi-Agent Orchestration — Database Schema Specification (SQLite)
 * Aligned withSPEC-ARCH-SESSION-REWIND-COMPACT-2026 & extensions/Cindy localDb
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
  capabilities_json TEXT,
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
-- Enforces Dual-Plane State Decoupling (status: active | archived | deleted)
-- and Dual-ID Separation (id vs. mutable sdk_session_id)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  session_type TEXT NOT NULL CHECK(session_type IN ('dm', 'room', 'thread')),
  target_id TEXT NOT NULL, -- bot_id for dm, room_id for room/thread
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
  workspace_kind TEXT NOT NULL DEFAULT 'project' CHECK(workspace_kind IN ('project', 'dialogue')),
  cwd_path TEXT NOT NULL,
  project_dir TEXT,
  claude_config_dir TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'claude-opus-4-6',
  provider_id TEXT DEFAULT 'cpa',
  effort TEXT NOT NULL DEFAULT 'high',
  permission_mode TEXT NOT NULL DEFAULT 'auto',
  plan_mode_enabled INTEGER NOT NULL DEFAULT 0,
  sdk_session_id TEXT,
  parent_session_id TEXT,
  forked_at_message_id TEXT,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  context_tokens INTEGER NOT NULL DEFAULT 0,
  context_window INTEGER NOT NULL DEFAULT 200000,
  extra_dirs_json TEXT NOT NULL DEFAULT '[]',
  writable_dirs_json TEXT NOT NULL DEFAULT '[]',
  active_turn_started_at INTEGER,
  last_turn_ended_at INTEGER,
  cleared_at INTEGER,
  pinned_at INTEGER,
  list_preview TEXT,
  list_message_count INTEGER,
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

-- Linear Messages Timeline Table with Monotonic Auto-increment Sequence,
-- Checkpoint Anchors (client_id), Soft-Rewind (rewind_at), and Tombstone Roles
CREATE TABLE IF NOT EXISTS messages (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  client_id TEXT,
  session_id TEXT NOT NULL,
  room_id TEXT,
  thread_id TEXT,
  sender_id TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK(sender_role IN (
    'user',
    'assistant',
    'system',
    'steering',
    'tool',
    'tool_use',
    'tool_result',
    'thinking',
    'ask_user',
    'plan_review',
    'error',
    'agent_switch',
    'context_rebuild',
    'message_tombstone'
  )),
  content TEXT NOT NULL,
  tool_use_id TEXT,
  silent_token INTEGER NOT NULL DEFAULT 0,
  agent_kind TEXT DEFAULT 'cc',
  agent_meta_json TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  rewind_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Stable FTS Row Mapping Table (Immune to SQLite VACUUM rowid mutations)
CREATE TABLE IF NOT EXISTS messages_fts_rows (
  fts_rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL UNIQUE
);

-- Crash-Safe Pending Input Queue Snapshots (16 MiB Payload Guard)
CREATE TABLE IF NOT EXISTS agent_input_queue_snapshots (
  session_id TEXT PRIMARY KEY,
  client_epoch TEXT NOT NULL,
  queue_payload_json TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Durable Subagent Execution Records
CREATE TABLE IF NOT EXISTS subagent_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  logical_agent_id TEXT NOT NULL,
  parent_tool_use_id TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'stopped')),
  model TEXT,
  total_tokens INTEGER,
  tool_uses INTEGER,
  duration_ms INTEGER,
  summary TEXT,
  returned_result TEXT,
  rewind_at INTEGER,
  deleted_at INTEGER,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER,
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
CREATE INDEX IF NOT EXISTS idx_messages_session_visible ON messages(session_id, rewind_at, sequence);
CREATE INDEX IF NOT EXISTS idx_messages_room_seq ON messages(room_id, sequence);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, sequence);
CREATE INDEX IF NOT EXISTS idx_messages_rewind_at ON messages(rewind_at);
CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(session_type, target_id);
CREATE INDEX IF NOT EXISTS idx_sessions_sdk_id ON sessions(sdk_session_id);
CREATE INDEX IF NOT EXISTS idx_subagent_runs_session ON subagent_runs(session_id, rewind_at, deleted_at, started_at);
`;
