---
doc_id: SPEC-SESSION-PHYSICAL-STORAGE-TOPOLOGY
status: CURRENT
version: 1.4.0
last_verified: 2026-11-13
language: en-US
---

<!--
Purpose: Physical SSOT defining multi-agent Claude session storage, disk paths, and zero-archaeology instant resolution.
Context: multiagent-orchestration storage topology, aligned with StorageManager, RuntimeEnvironment, and AgentOrchestrator.
Prerequisites: ~/.multiagent-orchestration/ initialized, SQLite db ~/.multiagent-orchestration/storage/orchestrator.db present.
-->

# Multi-Agent Claude Session Physical Storage & Resolution Topology

## 1. Core Rule & Physical Invariant
- **Rule**: NEVER run recursive grep, find, or search operations under `~/.claude` or `~/.multiagent-orchestration` to discover session files.
- **Invariant**: Every session ID, message transcript, and subagent trace resolves deterministically via mathematical string normalization of the sandbox CWD and Bot profile.

## 2. Physical Storage Coordinates Matrix

| Component | Absolute Physical Location | Role / Content |
|---|---|---|
| **Global DB** | `~/.multiagent-orchestration/storage/orchestrator.db` | SQLite WAL database (`bots`, `rooms`, `messages`, `sessions`, `bot_sessions`, `thread_nodes`, `member_cursors`). Single source for IDs, per-bot SDK session chains, thread DAG nodes, room `extra_dirs_json`, and cursors. |
| **App Settings** | `<projectRoot>/data/app-settings.json` | Persistent JSON config (`src/storage/AppSettings.ts`, `recordSessionContext` default `false`, `groupChatPostSendMode` default `'new_task'`, `ultracodeDefault` default `false`). |
| **Room Definition** | `<projectRoot>/groups/<RoomSlug>/room.json` | Room metadata (`id`, `slug`, `name`, `workspaceDir`, `extraDirs`, `members`). Synchronized bidirectionally with SQLite `rooms`. |
| **Bot Config Root** | `~/.multiagent-orchestration/agents/<BotName>/claude_config` | Dedicated `CLAUDE_CONFIG_DIR` per bot. Hosts isolated `settings.json` (`settingSources: []`). |
| **Group Sandbox CWD** | `<ProjectRoot>/sandboxes/groups/<RoomId>/<BotId>` | Physical working directory where `claude.exe` executes for group chat tasks. |
| **Direct DM Sandbox CWD** | `<ProjectRoot>/sandboxes/direct/<BotId>` | Physical working directory for 1:1 direct companion chats. |
| **Normalized CWD Segment** | Derived: replace `/` and special non-alphanumeric chars with `-` | Matches Anthropic CLI project directory hashing algorithm. |
| **Main Session Transcript** | `~/.multiagent-orchestration/agents/<BotName>/claude_config/projects/<Normalized-CWD>/<SessionId>.jsonl` | Append-only raw JSONL execution event stream for the specified session. |
| **Subagent Traces Directory** | `~/.multiagent-orchestration/agents/<BotName>/claude_config/projects/<Normalized-CWD>/<SessionId>/subagents/` | Houses `agent-<subagentId>.jsonl` for all child agents spawned by the parent turn. |

## 3. Normalized Project Path Formula

When `claude.exe` runs inside working directory `$CWD`, Anthropic CLI normalizes the path into a single folder name under `<CLAUDE_CONFIG_DIR>/projects/`:
```text
CWD: $PROJECT_ROOT/sandboxes/groups/multiagent-orchestration/bot_moadmin_director_03
Normalized Folder: -<NormalizedProjectRoot>-sandboxes-groups-multiagent-orchestration-bot-moadmin-director-03
```
*Note: Leading `/` becomes `-`. Dots (e.g. `.localized`) become `-`. Paths resolve against the active project absolute root.*

## 4. Instant Resolution Algorithm (Zero-Archaeology Formula)

Given `<BotName>`, `<RoomId>`, `<BotId>`, and `<SessionId>`:

```bash
# 1. Target Directory:
PROJECT_DIR="$HOME/.multiagent-orchestration/agents/<BotName>/claude_config/projects/<Normalized-Project-Root>-sandboxes-groups-<RoomId>-<BotId>"

# 2. Main Session Transcript (JSONL):
TRANSCRIPT_FILE="$PROJECT_DIR/<SessionId>.jsonl"

# 3. Spawned Subagents Directory:
SUBAGENTS_DIR="$PROJECT_DIR/<SessionId>/subagents"
```

### Deterministic Sub-Second CLI Lookup
To inspect the latest events of any session without searching:
```bash
tail -n 50 "$HOME/.multiagent-orchestration/agents/moAdmin/claude_config/projects/<Normalized-Project-Root>-sandboxes-groups-multiagent-orchestration-bot_moadmin_director_03/4f446713-0dd1-4e41-85f9-6c39f5dcb854.jsonl"
```

## 5. Subagent Inspection Protocol
When an agent turn spawns subagents (e.g. `Explore` or task delegates):
1. Open `$PROJECT_DIR/<SessionId>/subagents/`.
2. Inspect `agent-<subagentId>.meta.json` for description, parent turn, status, and duration.
3. Inspect `agent-<subagentId>.jsonl` for exact tool calls (`Grep`, `Read`, `Write`) executed by the subagent.

## 6. Per-Bot `sdkSessionId` Chaining, Canonical DM Resolution & Thread Isolation
- **Chaining Without File Duplication**: Group and 1:1 DM turns record per-bot SDK session chains in SQLite table `bot_sessions` (`session_id`, `bot_id`, `room_id`, `sdk_session_id`, `prev_sdk_session_id`, `cwd_path`, `claude_config_dir`, `model`, `turn_count`, `updated_at`; defined in `src/storage/DatabaseSchema.ts`, managed via `StorageManager.ts` and `AgentOrchestrator.ts`) alongside `messages.agent_meta_json` (`sdkSessionId`). Native `.jsonl` transcripts stay single-copy in each bot's `$PROJECT_DIR`.
- **Canonical DM Session Resolution & `direct_<botId>` Preservation**:
  - `resolveOrCreateDmSession(botIdOrName, { createIfMissing })` (`src/web/server/session-storage.ts`) and `POST`/`GET /api/sessions/resolve-dm` (`src/web/server/controllers/session-controller.ts`) resolve or lazily insert a canonical `session_type = 'dm'` UUID row in `sessions` while preserving `direct_<botId>` (`session_direct_<botId>`) room/target prefixes in SQLite (`rooms`, `thread_nodes`, `messages`).
  - Frontend callers navigate strictly to `/cc-agent/:sessionId` via `dmNavigation.ts` (`resolveCanonicalDmSessionId`, `navigateToBotDm`) rather than exposing `direct_*` URLs.
- **Multi-Task Thread Isolation (`thread_nodes`, `session_<room>_thread_<tid>`, `member_cursors`)**:
  - Both group rooms (`<roomId>`) and 1v1 partner multi-task workspaces (`direct_<botId>`) isolate parallel tasks through `thread_nodes` (`id`, `room_id`, `parent_message_id`, `title`, `status`) and synthetic session keys `session_<roomId>_thread_<threadId>` in `sessions` and `bot_sessions` (`AgentOrchestrator.ts`, `StorageManager.ts`).
  - `POST /api/rooms/:slug/threads` (`rooms-controller.ts` -> `StorageManager.createRoomThread` / `ensureThreadNode`) is the single unified topic/task entry point: when `parentMessageId` is supplied without `forceNew: true`, it reuses any existing `'open'` thread matching `parentMessageId` (`reused: true`). `POST /api/sessions` (`session-controller.ts`) no longer injects `sender_role = 'system'` context summaries into `messages` under `parentRoomId`.
  - `SessionPage.resolveDispatchTarget` (`src/web/src/pages/cc-agent/SessionPage.tsx`) extracts `threadId` strictly from `session.threadId` or `session_..._thread_<tid>` / `thread_<tid>`, never falling back to `session.targetId`.
  - `member_cursors` uses composite primary key `(member_id, room_id, thread_id)` (`DatabaseSchema.ts`, auto-migrated in `StorageManager.ts`) so `getMessagesSince` and `updateMemberCursor` maintain independent unread delta slices per bot per task thread.
- **System / Error Message Persistence & Classification**:
  - `messages-controller.ts` (`handlePostMessage`) fails fast with HTTP `500` on DB unavailability or `INSERT` failure and persists/broadcasts background `dispatchOrchestratorMessage` failures via `persistAndBroadcastDispatchError` (`sender_id = 'system'`, `sender_role = 'error'`, plus `agent:turn_error` WebSocket push).
  - `messages-controller.ts` (`handleGetMessages`) and `DaemonServer.ts` (`session:history`) map `sender_role IN ('system', 'error')` or `sender_id === 'system'` to `authorKind: 'system'` (never `'user'`).
- **Direct Lookup by `sdkSessionId`**:
  - `GET /api/sessions/:id` (`session-controller.ts`, `session-storage.ts`) resolves `bot_sessions.sdk_session_id`, `sessions.sdk_session_id`, and `messages.agent_meta_json`.
  - `GET /api/sessions/:id/messages` (`session-messages-controller.ts`) accepts `sdkSessionId` directly, reading clean user/assistant turns from the resolved `.jsonl` with SQLite epoch fallback.
  - `GET /api/sessions/:id/context-snapshot` and `GET /api/rooms/:slug/context-snapshot` (`session-context-service.ts`) resolve context snapshots directly by `sdkSessionId` or `bot_sessions` mapping.

## 7. Opt-In Context Snapshot (`recordSessionContext`)
- **Configuration SSOT**: Persisted in `<projectRoot>/data/app-settings.json` (`src/storage/AppSettings.ts`, `DEFAULT_APP_SETTINGS.recordSessionContext = false`, `DEFAULT_APP_SETTINGS.groupChatPostSendMode = 'new_task'`), exposed via `GET/PUT /api/config/settings` (`src/web/server/controllers/settings-controller.ts`, `SettingsPage.tsx`) and daemon RPC (`config:settings:get`, `config:settings:update` in `DaemonServer.ts` and `src/daemon/gateway/allowlist.ts`).
- **Single-Line JSONL Injection**: When `recordSessionContext` is `true`, `ClaudeSdkRunner.executeTurn` (`src/daemon/orchestrator/ClaudeSdkRunner.ts`) calls `recordSessionContextSnapshotToJsonl()` (`src/daemon/orchestrator/SessionContextSnapshot.ts`) on turn completion to append a single deduplicated `type: "mo-context-snapshot"` JSONL line into the same active `.jsonl` transcript (compatible with `claude --resume`).
- **Snapshot Payload**: `JsonlContextSnapshotRecord` captures `systemInstruction`, `toolDeclarations` (`name`, `signature`, `description`, `inputSchema`), and `firstUserMessage` (User #1), surfaced by `<SessionContextInspector />` (`src/web/src/components/session/SessionContextInspector.tsx`).

## 8. Full Room/Partner Clear vs. Single-Thread Deletion
- **Execution Pipeline**: `POST /api/rooms/:slug/clear` (`src/web/server/controllers/rooms-controller.ts`) and daemon RPC `room:clear` (broadcasting `room:cleared` via `DaemonServer.ts`, permitted in `allowlist.ts`) invoke `AgentOrchestrator.clearRoomHistory(roomId, threadId?)` -> `StorageManager.clearRoomHistoryAndSessions(roomIdOrSlug, threadId?)` -> `deletePhysicalJsonlFiles(targets)` (`src/daemon/orchestrator/SessionContextSnapshot.ts`).
- **Full Room / Partner Workspace Clear (`threadId` omitted)**:
  - Clears all `messages`, `sessions`, `bot_sessions`, `thread_nodes`, and `member_cursors` rows matching all normalized room aliases (including `direct_<botId>` for 1v1 partner workspaces).
  - Aborts active runs, clears in-memory runners and circuit breakers in `AgentOrchestrator`, and unlinks every referenced `<sdkSessionId>.jsonl` and `<sdkSessionId>/` subagent directory inside validated `claudeConfigDir` paths via `deletePhysicalJsonlFiles()`.
- **Single-Thread Deletion (`DELETE /api/rooms/:slug/threads/:threadId`)**:
  - `StorageManager.deleteRoomThread(roomIdOrSlug, threadId)` invokes `clearRoomHistoryAndSessions(roomIdOrSlug, threadId)` scoped strictly to that `threadId`, removing only that `thread_nodes` row, `session_<roomId>_thread_<threadId>` records, matching `(member_id, room_id, thread_id)` cursors, and that thread's physical `.jsonl` / subagent artifacts while preserving sibling threads in the same room or `direct_<botId>` workspace.

## 9. Multi-Workspace Folders & Runner Mount Topology (TASK-120)
- **Room Configuration & SQLite Column**:
  - `rooms.extra_dirs_json` column in SQLite (`src/storage/DatabaseSchema.ts`, `StorageManager.ts`) stores serialized JSON `Array<{ path: string, mode: 'ro' | 'rw' }>`.
  - Persisted to physical disk under `<projectRoot>/groups/<RoomSlug>/room.json` (`extraDirs` array).
  - Managed via `GET /api/rooms/:slug` and `PATCH/PUT /api/rooms/:slug` (`rooms-controller.ts`).
- **ClaudeSdkRunner Mounting & Tool Discovery**:
  - `ClaudeSdkRunner` constructor accepts `options.extraDirs`.
  - Automatically merges auxiliary paths into `this.mountedDirs` (`options.mountedDirs || [this.cwd]`).
  - Passes mounted directories into Claude Agent SDK options (`additionalDirectories` / `mountedDirs`), granting subagents and built-in tools (`Read`, `Edit`, `Grep`, `Glob`, `Bash`) direct access to multi-repo workspaces according to configured access modes (`'ro'` read-only vs `'rw'` read-write).

## 10. Ultra Code (Ultracode) Mode & Runtime Settings Injection (TASK-120)
- **Persistent Global Default**:
  - Persisted in `<projectRoot>/data/app-settings.json` (`AppSettings.ultracodeDefault: boolean`, default `false`).
  - Read fresh on every turn via `loadAppSettings()` and updated via `PUT /api/config/settings` (`AppSettings.ts`, `settings-controller.ts`).
- **ClaudeSdkRunner Options & Effort Escalation**:
  - When `ultracode: true` is enabled (either defaulted or toggled per session via `ModelAndEffortPicker`):
    - `ClaudeSdkRunner.getSettings()` emits:
      ```json
      {
        "ultracode": true,
        "enableWorkflows": true,
        "workflowKeywordTriggerEnabled": true
      }
      ```
    - `ClaudeSdkRunner.buildSdkOptions()` passes `settings` into SDK query parameters.
    - `ClaudeSdkRunner.getEffectiveEffort()` automatically escalates reasoning effort to `'xhigh'` for `'low'`, `'medium'`, and `'high'` thinking levels, while preserving `'max'` if explicitly set.

## 11. Partner 3-Way System Prompt Strategy & Workspace Injection (TASK-120)
- **Strategy Definition & SQLite Schema**:
  - Stored in SQLite `bots.capabilities_json` (`systemPromptMode: 'append' | 'override' | 'claude_md'`), editable via `PUT /api/bots/:id/capabilities` (`bots-controller.ts`).
- **Runtime Execution Modes (`ClaudeSdkRunner.ts`, `RuntimeEnvironment.ts`)**:
  - `'append'`: Default mode. Injects custom partner instructions as an extension after the standard platform runtime baseline (`default-system-prompt.md` + `default-global-prompt.md`).
  - `'override'`: Bypasses default runtime prompts, applying the custom soul definition as the sole system instruction.
  - `'claude_md'`: Invokes `ClaudeSdkRunner.ensureClaudeMdSynced()`, writing or updating `<cwd>/CLAUDE.md` directly inside the bot's physical working directory (unless the CWD is project root). Claude Code CLI natively reads the file during session startup, preventing context envelope bloat while maintaining strict local engineering guidelines.

## 12. Dynamic Context Slimming, Incremental Blackboard Diffing & Idempotency (TASK-120)
- **Context Slimming (`RuntimeEnvironment.assembleTurnDynamicEnvelope`)**:
  - On initial turn (`isSessionResuming === false`): Injects full `<group_room_charter>` and full `<blackboard_memory>`.
  - On resuming turns (`isSessionResuming === true`): Completely suppresses the static `<group_room_charter>`, preventing repetitive context token overhead.
- **Incremental Blackboard Diffing (`computeBlackboardIncrementalDelta`)**:
  - Resuming turns compare current blackboard memory with `previousBlackboardMemory`.
  - If memory is unchanged: Both `<blackboard_memory>` and `<blackboard_delta>` are completely omitted (0 token overhead).
  - If memory has evolved: Computes line-level additions/modifications and injects only the delta within `<blackboard_delta>...</blackboard_delta>`.
- **In-Flight Turn Safety & HTTP Idempotency**:
  - `AgentOrchestrator.handleChat`: Execution is wrapped in `try ... finally` to ensure `inFlightChats.delete(chatKey)` executes regardless of success or runner rejection, preventing leaked unresolved promises and process termination crashes.
  - `messages-controller.ts` (`handlePostMessage`): Implements a 180-second idempotency check on `clientId`. Duplicate requests triggered by HTTP retry or timeout return existing message records with `{ deduplicated: true }` immediately, preventing dual-turn execution.
  - `WebGatewayClient.ts`: Extends `agent:chat` timeout to 300 seconds (`300,000ms`), ensuring deep reasoning turns complete without premature HTTP fallback retry storms.
