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

* **[3] EXECUTION DECISION TREE**
  * **[3.1] Step 1 [STREAM INGESTION]**: Main buffers incoming NDJSON chunks; dispatches IPC frames to UI and debounces writes to `stream_deltas`.
  * **[3.2] Step 2 [TURN COMPLETION]**: Upon receiving `result` event from subagent, aggregate text into `messages` and flush active session deltas -> `TERM_OK`.
