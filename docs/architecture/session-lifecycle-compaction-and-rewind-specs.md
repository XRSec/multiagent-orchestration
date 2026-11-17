---
doc_id: SPEC-ARCH-SESSION-REWIND-COMPACT-2026
status: TARGET
version: 0.2.0
last_verified: 2026-11-07
language: en-US
---

# Session Lifecycle, Rewind and Compaction

Target contract. Section 6 lists what has a matching symbol in code. Reference implementation: Cindy `maker-core`, and the desktop `localDb`, `maker-ipc/rewind`, `git-snapshot` modules.

## 1. Invariants

1. Runtime state such as running, idle or stalled lives in memory. `sessions.status` stores only `active`, `archived` or `deleted`.
2. `sessions.id` never changes. `sessions.sdk_session_id` points at the current Claude transcript and rotates on fork, rebuild or recovery.
3. Clear `sdk_session_id` only by compare-and-swap, and only after the CLI reports "No conversation found" for that exact id. An HTTP 404 or a crash never clears it.
4. Never `DELETE` messages in normal operation. Rewind stamps `rewind_at`. A deleted message becomes `message_tombstone` with empty content and keeps `(session_id, client_id)`, so an importer cannot bring it back.
5. Rewind restores conversation and files together, or reports that files were not restored.
6. `compact_boundary` arrives after compaction. Act on usage before it.
7. Durability comes from SQLite WAL, not an exit-time backup.
8. On `workingDir` change, copy transcripts and never move them.

## 2. Storage

Schema owner: `src/storage/DatabaseSchema.ts`. Do not copy DDL into docs.

| Table | Columns this spec relies on |
| :--- | :--- |
| `sessions` | `sdk_session_id`, `parent_session_id`, `forked_at_message_id`, `active_turn_started_at`, `last_turn_ended_at`, `context_tokens`, `context_window` |
| `messages` | `client_id`, `rewind_at`, `agent_meta_json`, `sender_role` including `context_rebuild` and `message_tombstone` |
| `agent_input_queue_snapshots` | One row per session, 16 MiB cap |
| `subagent_runs` | `rewind_at` |
| `member_cursors` | `last_seen_sequence` per member and room |

Open issue: `client_id` uniqueness is enforced in application code only. Add a unique index on `(session_id, client_id)` if races appear.

## 3. Rewind

1. **Preview.** Ask the SDK for `rewindFiles(userUuid)` as a dry run. If the checkpoint id is missing, return `canRewind: false` and offer a conversation-only rewind.
2. **Commit.** Flush pending persistence, fence subagent observations, restore files, close the query, stamp `rewind_at` on the target and later rows and on later subagent runs, clamp room cursors, and record `pendingRewindTo` as the prior assistant uuid. A first-turn rewind has no anchor, so clear `sdk_session_id`.
3. **Next send forks.** Start the query with resume, resume-at the anchor, and fork. Then repair compaction references in the forked transcript and store the new id.

Anchors: `client_id` is assigned before sending and passed as the user uuid. The prior assistant uuid is the last visible assistant row before the target.

**Shadow savepoints** cover runs without native checkpoints. They live under a hidden ref namespace `refs/cindy/savepoints/<sessionId>`, built with an isolated temporary git index, so branches and `git status` stay clean. If two sessions run on one repository, record a rewind gap instead of crediting a peer's edits. The local engine enforces per-command timeouts only. Cindy's budget of 10,000 files, 256 MiB and 5 seconds is a reference.

**Fork.** Copy visible rows up to the anchor, verify with a digest, and set the parent and fork point.

**Delete.** Tombstone the row and write a hidden `context_rebuild` handoff that the next send consumes once.

**Goal.** Rewind pauses an active goal and fork cancels it. See the linkage study.

## 4. Compaction

| Layer | Mechanism |
| :--- | :--- |
| Watermarks | `MemoryFlushController` emits an event at 0.70, 0.85 and 0.92 of the context window. What to do with it is a host choice. Reset on `compact_boundary` |
| Continuity hooks | `PreCompact` exports `blackboard_epoch.json`. `SessionStart` for compact re-anchors goal, task and digest |
| Distillation | Independent of compaction. Values come from the plugin config. Fail-open, see `prompt_distill_design.md` |
| Bridge compaction | `/compact` runs as its own turn. The `queuedBridgeTurns` counter hides its terminal event and keeps the turn running until the real user turn ends. A rewind preview must not drop a pending compact |

## 5. Scenarios

Values marked target are not implemented locally.

| # | Scenario | Required behavior |
| :--- | :--- | :--- |
| 1 | Mid-turn steer | Soft steer through a hook between tool calls. Hard steer through interrupt. Keep the interrupt flag until the interrupted result is drained |
| 2 | Input queued while busy, then crash | Persist the queue per session through serialized writes. Strip inline images over the cap. Fail rather than drop. Restore as a paused queue |
| 3 | Unclean crash | A turn that started after the last end is interrupted. Offer resume or dismiss, and dismiss stamps the end time |
| 4 | Fork | See section 3 |
| 5 | `workingDir` change | Copy transcripts to the new project key. Skip when the key is unchanged |
| 6 | Rewind in a group room | Stamp rows, clamp every member cursor, roll back blackboard tasks created after the target, bump the blackboard epoch. The last two are target |
| 7 | Invalid resume | Clear by compare-and-swap, build a handoff from visible rows, start a fresh session |
| 8 | Silent stall | Kill after 45 s without output, or 180 s during a long tool call, then resume. Never send a blind continue during a preparatory turn. Values are target |
| 9 | Slow client or reconnect | Reject a send at 64 MiB buffered. Evict a silent connection at the lease timeout. Replay by last seen sequence is target |
| 10 | Database growth or corruption | Slim in a worker after a free-space check of twice the database size plus 64 MiB. On corruption, restore the last migration backup. Both are Cindy reference |

## 6. Conformance

Symbol lookup on 2026-11-07. A match does not prove runtime wiring.

| Element | Symbol | Note |
| :--- | :--- | :--- |
| CAS clear | `StorageManager.compareAndClearSdkSessionId` | |
| Crash detection | `markTurnStarted`, `markTurnEnded`, `listInterruptedSessions` | Orchestrator wiring unchecked |
| Rewind, tombstone, handoff, fork | `rewindToMessage`, `tombstoneMessage`, `consumePendingContextRebuildHandoff`, `forkSessionAtMessage` | Rewind also clamps cursors and subagent runs |
| Queue snapshot | `saveInputQueueSnapshot`, `loadInputQueueSnapshot`, `clearInputQueueSnapshot` | Cap unchecked |
| File rewind, bridge compact | `ClaudeSdkRunner.previewRewindFiles`, `commitRewindFiles`, `scheduleBridgeCompaction` | |
| Watermarks, relocate, repair, savepoints, fence | `SessionLifecycleEngine` exports | `AutoCompactController` and the persist-queue drain exist only in Cindy |
| Gateway channels | `session:compact`, `session:fork`, `session:tombstone`, `session:relocate`, `session:interrupted`, `session:queue:*`, `rewind:preview`, `rewind:commit` | Allowlist only |
| Group blackboard rollback on rewind | Not checked | |

```bash
grep -nE "^\s+public [a-zA-Z]+\(" src/storage/StorageManager.ts
grep -nE "^export (class|function|const)" src/daemon/orchestrator/SessionLifecycleEngine.ts
grep -nE "'(session|rewind):" src/daemon/gateway/allowlist.ts
grep -rnE "markTurnStarted|rewindToMessage|saveInputQueueSnapshot" src/daemon
```
