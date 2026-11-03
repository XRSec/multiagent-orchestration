---
doc_id: IPC_AND_SQLITE_SPEC
version: 1.0.0
type: SPECIFICATION_TREE
parent_node: ../../AGENTS.md
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: IPC STREAM & SQLITE DELTA SHARDING SPECIFICATION

* **[1] CHILD ROUTING TABLE**
  * `- [AGENTS](../../AGENTS.md) :: [LOAD_IF: need_parent_charter]`

* **[2] I/O & GUARDRAIL CONTRACTS**
  * **[2.1] Electron IPC Channels**:
    * Main -> Renderer: `orchestration:stream:<sessionId>` (Frame types: `CHUNK`, `TOOL_CALL`, `CONTROL`, `DONE`)
    * Renderer -> Main: `orchestration:action` (Invoke actions: `dispatch`, `interrupt`, `steer`, `quote`)
  * **[2.2] SQLite Storage Topology (`orchestration.sqlite`)**:
    * Table `messages`: Persists consolidated chat turns (`id`, `chat_id`, `sender_id`, `role`, `content`, `metadata_json`, `created_at`).
    * Table `stream_deltas`: Transient buffer for raw `content_block_delta` frames (~80% stream volume).
  * **[2.3] Invariants**:
    * `[2.3.1]` Maximum IPC serialization latency: `<= 5ms`.
    * `[2.3.2]` `stream_deltas` rows older than 72 hours are purged automatically upon app launch.
  * **[2.4] Eager IPC Registration & Asynchronous Readiness Barrier**:
    * `[2.4.1]` Handlers for `maker:project-automation:*` (`pending-imports`, `reconcile`, `list-consents`, `revoke-consent`, `upsert-schedule`, `remove-schedule`) MUST register eagerly in `registerMakerIpcsAfterSplash` (`bootstrap-electron.ts`).
    * `[2.4.2]` Cold-start IPC handlers MUST wrap loader executions with a `15,000ms` asynchronous barrier (`withLoader`) waiting for scheduler/DB readiness (`0` `No handler registered` errors).
    * `[2.4.3]` Subsystem operations across `custom-mcp-registry`, `git-snapshot`, `session-archive-sync`, and `cindy-brain` MUST gate database execution behind `await whenDbReady()`.
  * **[2.5] Database Switching Race Condition Guard**:
    * `[2.5.1]` `whenDbReady` queue barrier in `current.ts` buffers concurrent SQLite calls during teardown and unblocks upon new `DbClient` assignment (`0ms` `DbClient not ready` window).
    * `[2.5.2]` `setAccountSwitchReconnect` in `authManager` ensures active SQLite readiness strictly precedes `appSessionState` emission.
    * `[2.5.3]` `pendingGhostCardReassignments` tracking in `cindy-brain` MUST execute idempotently across account switches.
  * **[2.6] Anti-Flicker Store Hydration Invariant**:
    * `[2.6.1]` `hydrateFromDatabase()` in `botStore.ts` MUST hold an in-flight synchronization promise lock to prevent false-empty companion list broadcasts during SQLite hydration.

* **[3] EXECUTION DECISION TREE**
  * **[3.1] Step 1 [STREAM INGESTION]**: Main buffers incoming NDJSON chunks; dispatches IPC frames to UI and debounces writes to `stream_deltas`.
  * **[3.2] Step 2 [TURN COMPLETION]**: Upon receiving `result` event from subagent, aggregate text into `messages` and flush active session deltas -> `TERM_OK`.
