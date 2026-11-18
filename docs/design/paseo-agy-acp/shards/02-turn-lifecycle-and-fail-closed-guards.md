---
doc_id: DESIGN-PASEO-AGY-ACP-SHARD-02
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Turn Lifecycle, Two-Clock Watchdogs & Fail-Closed Guards

Parent index: [../INDEX.md](../INDEX.md)
Related shards: [01-dual-plane-and-brain-observer.md](01-dual-plane-and-brain-observer.md) · [03-subagents-checkpoints-and-steer.md](03-subagents-checkpoints-and-steer.md)

## 1. Fail-Closed Terminal Evidence Invariant

Require positive terminal proof before surfacing any parent or child turn as `completed`.
NEVER infer completion from silence, missing `stopReason` fields, or unreturned tool invocations.

| Termination Signal | Controlling Symbol & Module | Resolved `session.turn` | Evidence & Error Contract |
| :--- | :--- | :--- | :--- |
| `stopReason` in `{'end_turn', 'max_tokens', 'max_turn_requests'}` + settled Brain | `mapTerminalStopReason` (`paseo-agy-acp/server/session.ts`) + `isCompletePlannerResponse` (`brain-io.ts`) | `completed` | Requires canonical `DONE` planner response with no unsettled non-question tools or failed children. |
| `stopReason === 'cancelled'` or `AbortError` interrupt / session close | `mapTerminalStopReason` / `finishTurnOnce` (`session.ts`) | `canceled` | Drains local cancellation work and complete JSONL records once without unbounded polling. |
| `stopReason === 'refusal'` | `mapTerminalStopReason` (`session.ts`) + `buildTurnError` (`error-inspection.ts`) | `failed` | Executes read-only SQLite forensics; emits `REFUSAL` diagnostic when no DB error row exists. |
| `stopReason === undefined` or unrecognized string | `mapTerminalStopReason` (`session.ts`) | `failed` | Rejects optimistic `!== 'cancelled'` defaults; surfaces explicit unrecognized-stop diagnostic. |
| ACP process crash, `SIGKILL`, or stdio EOF mid-turn | `onExit` (`transport.ts` -> `session.ts`) -> `finishTurnOnce` | `failed` | Emits `session.runtime_failed`, aborts open turn, and emits exactly one `failed` turn via `turnFinished`. |

### 1.1 Prohibition of Fabricated Tool Success

1. **Fail-Closed Tool Terminalization (`Timeline.terminalize`)**:
   - Pass `runningFails: true` in `Timeline.terminalize` (`paseo-agy-acp/server/mapping.ts`) and child `finishTurn` (`paseo-agy-acp/server/brain.ts`) whenever a turn ends `completed` or `failed`.
   - Redline: Any tool card still tracked as `running` MUST resolve to `failed` with a non-empty diagnostic—NEVER `completed` with `error: null`.
2. **Denial & Supersession Hygiene**:
   - Mark pending tool cards `canceled` without error when a permission request is denied (`paseo-agy-acp/server/permissions.ts`) or when a later `PLANNER_RESPONSE` supersedes unlogged calls (`BrainTranscriptProjector` in `paseo-agy-acp/server/brain-projector.ts`).
3. **ACP v1 Raw-Payload Merge & Payload Budgets**:
   - Treat top-level `rawInput` / `rawOutput` `null` or omission on `tool_call_update` as "no update" preserving prior channel values (`mapping.ts`), while accepting non-null falsy values (`false`, `0`, `""`, `[]`, `{}`) as authoritative replacements.
   - Bound tool titles (`TOOL_TITLE_BUDGET = 2,000`) and raw payloads (`TOOL_RAW_PAYLOAD_BUDGET = 65,536`) and synthesize missing file diffs via `EditDiffTracker` (`paseo-agy-acp/server/tool-payload.ts`).

---

## 2. Dual-Clock Anti-Stall Watchdog

Enforce two mutually exclusive monotonic clocks inside `armWatchdog` (`paseo-agy-acp/server/session.ts`).
`session/prompt` bypasses the 30-second control-RPC timer (`ACP_REQUEST_TIMEOUT_MS` in `paseo-agy-acp/server/transport.ts`) and would otherwise hang forever on silent upstream stalls.

| Watchdog / Timer | Default Budget | Governing Condition | Expiry / Tick Action |
| :--- | :--- | :--- | :--- |
| **Turn-Silence Clock** (`turnStallTimeoutMs`) | `120,000` ms (2 min) | `runningTools().length === 0` and not paused on user approval or active child. | Marks turn `failed` via `finishTurnOnce` and invokes `session.interrupt()`. |
| **Tool-Execution Clock** (`toolStallTimeoutMs`) | `600,000` ms (10 min) | `runningTools().length > 0`; measured from oldest running tool's preserved `startedAt`. | Freezes `turnStallTimeoutMs`; on expiry, attributes failure to oldest tool, fails turn, and interrupts; restarts full `120,000` ms turn clock when last tool settles. |
| **Tool Running Notice** (`toolNoticeMs`) | `60,000` ms (1 min) | Repeating tick while any tool remains `running`. | Emits cosmetic `notification` (`level: 'info'`) naming oldest tool and elapsed seconds; never refreshes deadlines. |
| **Permission Approval Cap** (`permissionTimeoutMs`) | `600,000` ms (10 min) | Pending permission or `ask_question` card awaiting user selection. | Pauses clocks via `pausedAt` (preserving `turnLastProgressAt`); auto-cancels and rejects dropped approvals at `600,000` ms. |
| **Post-RPC Settle Clocks** (`stallTimeoutMs` / `wokenStallTimeoutMs`) | `120,000` ms / `900,000` ms (15 min) | Post-RPC `settleBrainTurn` & child `watchBrain` (`brain.ts`, `RETRY_IDLE_TIMEOUT_MS`). | Grants `900,000` ms to active woken generation, compaction, and distinct `isRetryWarning` steps (anchored to `mtimeMs` on initial read, `Date.now()` on poll); fails idle stalls at `120,000` ms or after `5` consecutive watcher read errors. |

### 2.1 Strict Progress vs Liveness Classification

Refresh `turnLastProgressAt` strictly on `TURN_PROGRESS_UPDATES` (`paseo-agy-acp/server/session.ts`), whose payloads guarantee non-empty model or tool work:
- **Work-Bearing Progress (`TURN_PROGRESS_UPDATES`)**:
  - `user_message_chunk`, `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`, `plan_update`, `plan_removed`, and `session_message_chunk`.
- **Liveness-Only Updates (Never Reset Deadline)**:
  - `usage_update`, `subagent_update`, `session_message`, `available_commands_update`, `current_mode_update`, `config_option_update`, `session_info_update`, `toolNoticeMs` notices, and any unknown SDK update tag (failing closed so metadata heartbeats cannot sustain zombie turns).
- **Bounded Child Wait**:
  - Suspend the parent turn clock for at most one deadline window while waiting on a linked running child (`hasRunningChildren()`) so an unlinked or silent child cannot renew parent liveness forever.

### 2.2 Per-Tool Timeout Attribution

Isolate timeout blame via `turnToolFailure = { id, error }` (`paseo-agy-acp/server/session.ts`, `paseo-agy-acp/server/mapping.ts`) when `toolStallTimeoutMs` expires across concurrent tools:
- Assign the expired oldest tool card its exact diagnostic naming that tool and elapsed duration.
- Assign every other concurrently running sibling tool `"Turn ended while this tool was still running"`, preventing cross-tool blame contamination.

---

## 3. Durability Guards & Cross-Layer Forensics

### 3.1 Write-Ahead Turn Journal (`turn-journal.ts`)

Eliminate ghost `running` turns across daemon restarts via `<appDataDir>/paseo-checkpoints/sessions/<nativeId>.turn-journal.json` (`paseo-agy-acp/server/turn-journal.ts`):
1. **Serialized Write Lanes (`queueTurnJournalOp`)**:
   - Chain all per-session journal mutations in `writeLanes`, deleting settled promises in `finally` to prevent daemon memory leaks.
   - Persist updates atomically via `${path}.${process.pid}.${randomUUID()}.tmp` followed by `rename`.
2. **Pre-Prompt Write & Single-Shot Clear**:
   - Await `beginTurnJournal` (`{ turnId, clientMessageId, nativeId, startedAt, status: 'running' }`) before dispatching `session/prompt`.
   - Call idempotent `finishTurnJournal` inside `finishTurnOnce`.
3. **Startup Orphan Reconciliation & Cleanup Ordering**:
   - Invoke `reconcileRunningTurns` on session open to sweep surviving `running` entries and immediately emit `failed` terminals—NEVER resurrecting crashed turns as `running` or `completed`.
   - Serialize disposable session cleanup (`removeSessionArtifacts` in `session.ts` and `removeTurnJournal`) through `queueTurnJournalOp` so late fire-and-forget journal writes NEVER recreate deleted session files.

### 3.2 Replay-Idle Session Load Gate

Wrap all `session/load` and `session/resume` calls in `runLoadSessionWithReplayIdle` (`paseo-agy-acp/server/session.ts`):
- Enforce a `2,000` ms replay-notification idle gap and a `90,000` ms hard timeout so hung historical replays cannot block session readiness indefinitely.

### 3.3 Read-Only Post-Turn SQLite Forensics (`error-inspection.ts`)

Run `inspectConversationError` (`paseo-agy-acp/server/error-inspection.ts`) against `<appDataDir>/conversations/<nativeId>.db` strictly when a turn is already `failed` or returned `refusal`—NEVER downgrading a verified `completed` turn:
1. **Read-Only Busy Retry & Inode Verification**:
   - Open `DatabaseSync` read-only with `PRAGMA busy_timeout = 100` and up to `3` bounded `SQLITE_BUSY` spin retries.
   - Compare pre-turn and post-turn `(dev, ino)` via `getFileIdentity` / `sameFile`; reset `minStepIndex = -1` if `agy` rotated or replaced the DB file mid-turn.
2. **Step Watermark Isolation**:
   - Capture pre-turn `startIndex` (`readLastStepIndexFromDb`), inspect `steps` where `step_type = 17` (`ERROR_STEP_TYPE`) and `idx > startIndex`, and advance `session.state.lastKnownStepIndex` on failure so prior `429`/`500` rows never bleed into subsequent turns.
3. **Transient Attempt Suppression (`attemptFollowedByAssistant`)**:
   - Skip any `step_type = 17` row followed by a terminal `PLANNER_RESPONSE` (`AGY_STEP_TYPE_PLANNER_RESPONSE = 15`, `AGY_STEP_STATUS_DONE = 3`) before the next `USER_INPUT` (`AGY_STEP_TYPE_USER_INPUT = 14`) within `ATTEMPT_WINDOW_STEPS = 200` steps (retaining the error when legacy DBs omit `status`).
4. **Protobuf & UUID Sanitization (`selectBlobErrorText`)**:
   - Reject runs exceeding `20%` U+FFFD replacement chars; strip C0/C1/bidi controls while preserving valid UTF-8/CJK/RTL/emoji bytes.
   - Strip `b$<uuid>`/`3b$<uuid>` frame prefixes, leading length tags, glued `-<step>-<code>` tails, and bare UUIDs plus up to `4` preceding `[0-9+,-]` varint debris chars (`MAX_FRAME_DEBRIS = 4`, stopping at `.` decimals and `)` closing parens so `1.2.3` and `(503)` remain intact).
   - Score readable runs against error signals (fallback `"Upstream provider error (step_type=17)"`) and extract `RETRYABLE_ERROR_TOKENS`, `retryAfterMs` (`parseGoDurationMs`), and `resetAt` via `buildTurnError`.

### 3.4 Stored Configuration Availability Fallback

Apply session options sequentially in `model -> thought_level -> mode` order (`configureSession` in `paseo-agy-acp/server/session.ts`), rolling back earlier applied keys if a later key rejects:
- On `session.open`, permit fallback to `agy`'s effective default (emitting a buffered `config-fallback` notification) ONLY when `isUnavailableStoredConfig` passes the `NON_AVAILABILITY_TERMS` denylist (`api key`, `unauthorized`, `forbidden`, `permission`, `credential`, `oauth`, `sign in`, `billing`, `quota`, `capacity`, `rate limit`, `429`, `resource_exhausted`, `overloaded`, `exhausted`, `invalid request`, `bad request`, `too long`, `temporarily`) and matches retired-model or unsupported-thinking phrases.
- Security redline: NEVER swallow authentication, billing, or quota errors into a silent model substitution.

---

## 4. Failure-Mode Containment Matrix

| Failure Scenario | Naive Bridge Failure | Fail-Closed Guardrail |
| :--- | :--- | :--- |
| Upstream hangs `session/prompt` with open stdio | UI spinner runs forever; idle watcher disabled while `state.turn` set. | `armWatchdog` trips `turnStallTimeoutMs` (`120` s) or `toolStallTimeoutMs` (`600` s), fails via `finishTurnOnce`, and calls `session.interrupt()`. |
| Metadata-only `subagent_update` / `usage_update` spam | Resets liveness timer forever and sustains a zombie turn. | Excluded from `TURN_PROGRESS_UPDATES`; only non-empty work payloads advance `turnLastProgressAt`. |
| Concurrent tools `alpha` (expired) and `beta` (running) | Both cards display `alpha`'s timeout message and elapsed time. | `turnToolFailure` assigns timeout text solely to `alpha`; `beta` receives `"Turn ended while this tool was still running"`. |
| Daemon crashes (`SIGKILL` / OOM) mid-turn | Ghost `running` turn persists or silently vanishes on restart. | `beginTurnJournal` pre-writes `running` before RPC; `reconcileRunningTurns` sweeps leftovers to `failed` on open. |
| Mid-turn `503` `step_type = 17` followed by recovery | Post-turn DB scan falsely downgrades a `completed` turn to `failed`. | `inspectConversationError` never runs on positive `completed` turns and skips `17` rows followed by `PLANNER_RESPONSE` (`status = 3`) within `200` steps. |
| Protobuf blob glues UUID after `(503)` or `1.2.3` | Sanitizer leaks raw trajectory UUID or mangles `(503)` -> `(`. | `selectBlobErrorText` strips `b$`/`3b$` frames and UUIDs + `<= 4` `[0-9+,-]` varint bytes while halting backward scans at `)` and decimal `.`. |
| Invalid API key or `429` during `session.open` | Over-broad predicate silently substitutes another model. | `NON_AVAILABILITY_TERMS` denylist rejects auth, billing, and quota strings before `isUnavailableStoredConfig` phrase matching. |

---

## 5. Verification & Conformance Gate

- Run `node --test paseo-agy-acp/tests/turn-terminal-invariant.test.ts paseo-agy-acp/tests/two-clock-tool-budget.test.ts paseo-agy-acp/tests/open-config-fallback.test.ts paseo-agy-acp/tests/error-inspection-attempts.test.ts` (exit code `0`).
- Run `npm --prefix paseo-agy-acp run verify` (exit code `0`) before merging any lifecycle, watchdog, journal, or SQLite forensics change.
- Keep `RETRYABLE_ERROR_TOKENS` in `paseo-agy-acp/server/error-inspection.ts` synchronized with external wrapper `RETRYABLE_TOKENS`.
