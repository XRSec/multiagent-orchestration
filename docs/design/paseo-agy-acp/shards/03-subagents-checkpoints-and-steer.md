---
doc_id: DESIGN-PASEO-AGY-ACP-SHARD-03
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Subagent Trees, Checkpoints, Fork Revert & Steer Contract

Parent index: [../INDEX.md](../INDEX.md)
Related shards: [01-dual-plane-and-brain-observer.md](01-dual-plane-and-brain-observer.md) · [02-turn-lifecycle-and-fail-closed-guards.md](02-turn-lifecycle-and-fail-closed-guards.md)

## 1. Multi-Level Read-Only Subsession Tree (`subagents.ts`)

Project Antigravity's native subagent trajectories into nested, read-only Paseo child sessions via `SubagentRegistry` (`paseo-agy-acp/server/subagents.ts`) and `watchBrain` (`paseo-agy-acp/server/brain.ts`).
Child timelines mirror Brain artifacts without exposing independent foreground prompt control.

| Registry Map | Key -> Value | Ownership & Lifecycle Invariant |
| :--- | :--- | :--- |
| `children` | `<sessionId>:child:<nativeChildId>` -> `BrainWatchHandle` | Owns `1,000` ms child Brain pollers; child sessions advertise `['session.subsession']` only. |
| `childParents` | `childNativeId` -> `parentNativeId` | Preserves multi-level lineage (`rememberSubagents`, `canLinkChild`) so nested children mount under `<root>:child:<parentNativeId>` rather than flattening onto root. |
| `childFailures` | `childNativeId` -> `{ error, stalled? }` | Propagates unhandled child `failed` turns (`getChildFailure`) to fail the waiting parent turn instead of hanging `settleChildren`. |
| `killedChildren` | `Set<childSessionId>` | Latches `SUBAGENT_STATE_KILLED` descriptors (`syncKilledChildren` after `manage_subagents`); killed watchers cancel immediately and NEVER resume. |
| `resuming` | `Set<childSessionId>` | Single-flights watcher handoff (`resumeChild`) when `send_message` wakes a child stopped by parent interruption. |

### 1.1 Cross-Plane Tool Correlation & Live Card Visibility

1. **Verified Cross-Plane Identity (`NativeToolIdentitySource`)**:
   - Correlate ACP `invoke_subagent` and `send_message` tool cards with Brain artifacts using `sourceMetadata.tool.toolCall.id` / `stepIndex` in `.system_generated/messages/*.json` and `spawnStepIndex` in `.system_generated/subagents/*.json` (`'tool_id' | 'step_metadata' | 'acp_input'` in `paseo-agy-acp/server/brain-projector.ts`).
   - During history replay (`alignReplayTools` and `projectReplayHistory` in `paseo-agy-acp/server/history.ts`), shift `GENERIC` metadata indices past `CHECKPOINT` `+1` offsets before matching, and forbid unverified ordinal fallbacks from acting as result-merge or compaction anchors.
2. **Real-Time Running Card & Prose Emission**:
   - Emit `sub_agent` tool cards while `status === 'running'` along with accompanying `PLANNER_RESPONSE` prose immediately upon projection (`brain.ts`, `linkSubsession`).
   - Rationale: Suppressing running subagent cards behind `settleChildren` freezes Paseo UI timelines during multi-minute delegations.
3. **Drain-Safe Teardown & Resumption**:
   - Await `BrainWatchHandle.drain()` across all tracked handles in `SubagentRegistry.closeAll()` before deleting session artifacts so background pollers cannot reopen SQLite or JSONL files mid-cleanup.
   - In `resumeChild`, await `existing.cancel()` and restart `watchBrain` from `existing.resumePoint()` without replaying historical child steps.

---

## 2. Time-Machine Checkpoints, Native Fork & Revert

Support `session.revert.conversation`, `session.revert.files`, and `session.revert.both` serially on idle sessions via `revertToken` handles (`makeRevertToken`, `attachReplayRevertTokens` in `paseo-agy-acp/server/revert.ts`).

| Revert Scope | Orchestrated Pipeline (`revertSession` in `revert.ts`) | Fail-Closed Containment & Rollback Contract |
| :--- | :--- | :--- |
| `'files'` | `validateSessionFileCheckpoint` -> `restoreSessionFileCheckpoint` (`checkpoints.ts`) | Requires a Git workspace (`isGitWorkspace`) and recorded pre-turn shadow tree; blocks symlink escapes (`assertNoSymlinkEscape`, `hasSymlinkAncestor`). |
| `'conversation'` | `resolveCutoffStepIndex` -> `forkAgyConversationStorage` (`agy-fork.ts`) -> `session/load` or `session/resume` -> `reconcileAfterRevert` | Branches SQLite `<id>.db` and Brain directory strictly to `idx < cutoffStepIndex` (or opens a fresh native session on turn 1) and emits `session.persistence` before `request.completed`. |
| `'both'` | Shadow-Git validation -> `forkAgyConversationStorage` -> `restoreSessionFileCheckpoint` -> runtime reload | Fails closed if `forkAgyConversationStorage` fails unless `fallbackToFreshOnForkError: true` is explicitly passed; NEVER pairs rolled-back files with an unrequested empty conversation. |

### 2.1 Isolated Shadow-Git Workspace Snapshots (`checkpoints.ts`)

1. **Zero Working-Index Mutation**:
   - Capture pre-turn file snapshots (`captureTurnFileCheckpoint`) inside an isolated shadow Git directory under `<appDataDir>/paseo-checkpoints/` (`shadowGitDirForRepo`).
   - Serialize operations per session via `queueSessionOp` with `GIT_TIMEOUT_MS = 15,000` ms (`PASEO_GIT_TIMEOUT_MS`) and `GIT_DIFF_MAX_BUFFER = 32` MiB.
2. **Unborn Subrepo & Symlink Protection**:
   - Exclude nested unborn `.git` directories (`parseUnbornGitPaths`) during `captureGitTree`.
   - Enforce real directory ancestry (`ensureRealDirectory`) before writing restored blobs (`restoreGitTree`), surfacing capture failures as structured warning notifications rather than silent drops.

### 2.2 SQLite & Brain Native Storage Forking (`agy-fork.ts`)

Branch storage directly in `forkAgyConversationStorage` because `agy` exposes no native `session/fork` RPC:
1. **SQLite Trajectory Truncation**:
   - Clone `<appDataDir>/conversations/<sourceId>.db` into `<targetId>.db` via `VACUUM INTO`, delete `steps` where `idx >= cutoffStepIndex`, rewrite protobuf varint/bytes fields across `gen_metadata`, `executor_metadata`, `parent_references`, `battle_mode_infos`, and `trajectory_metadata_blob`, and sync `conversation_summaries.db` (`syncConversationSummary` / `deleteConversationSummaryRow`).
2. **Filtered Brain Clone & Watcher Reconciliation**:
   - Copy `<appDataDir>/brain/<sourceId>/` via `copyBrainDirectoryFiltered`, truncating `transcript_full.jsonl` and 100 KiB chunks at `cutoffStepIndex`, dropping post-cutoff subagents (`collectDroppedSubagentIds`), filtering `.system_generated/messages/` (`filterBrainMessages`), copying retained checkpoints (`forkSessionCheckpoints`), and closing pruned child watchers via `SubagentRegistry.reconcileAfterRevert`.

---

## 3. Non-Blocking Quota & Wrapper Account Switching

1. **Out-of-Band Quota (`AgyUsageSource` in `paseo-agy-acp/server/usage.ts`)**:
   - Run `agy -p /usage --output-format json` (`USAGE_FETCH_TIMEOUT_MS = 15,000` ms, stripping `acp` flags via `STRIPPED_ACP_FLAGS` in `usageArgs`) without starting a model turn.
   - Normalize `5h` (`18,000` s) and `weekly` (`604,800` s) `remaining_fraction` windows (`parseUsage`, warning `70%–90%`, danger `> 90%`) and resolve account labels from tail `64` KiB (`LOG_CHUNK_SIZE`) log slices (`readLoggedEmail`).
   - Security redline: NEVER read or expose `antigravity-oauth-token` contents, and return an error on unsupported print-mode directory flags instead of querying another account.
2. **Wrapper Credential Switch (`[agy-switch]`)**:
   - Parse wrapper `stderr` lines prefixed `[agy-switch] ` (`session.ts`); when `ok === true`, bump the provider credentials epoch and reload open sessions via `session/load` at the next safe turn boundary.
   - Redact Google OAuth URLs, `/pair#` links, bearer tokens, and `$HOME` paths in `sanitizeAcpStderrExcerpt` (`transport.ts`).

---

## 4. Steer vs Queue vs Interrupt Contract

Configure Paseo Composer send behavior to **`queue`** for multi-step Antigravity workflows.
Because `agy acp` runs a strict single-turn state machine with no mid-turn steering RPC, Paseo's default **`steer`** setting triggers destructive **`Interrupt & Replace`**.

| Client Mode / Action | Execution Path | ACP & Process Mechanics | Impact on Active Turn |
| :--- | :--- | :--- | :--- |
| **`queue`** (`queue` setting or `Ctrl+Enter` / `Cmd+Enter`) | Paseo Client UI (`Composer`) | Buffers follow-up messages strictly in client state with zero network RPCs until terminal `session.turn` (`!running`) arrives, then dispatches sequentially. | **Non-destructive**: active reasoning, edits, and child subagents complete intact. |
| **`steer`** (Paseo UI default) | Host `steerOrReplaceActiveTurn` -> `replaceAdmittedForegroundTurn` | `paseo-agy-acp/server/provider.ts` omits `'prompt.steer'` and `promptSession` rejects `delivery === 'steer'`; Paseo Daemon falls back to `session.interrupt()` followed immediately by a new `session/prompt`. | **Destructive (`Interrupt & Replace`)**: cancels the running turn mid-flight and aborts unfinished tool/subagent work. |
| **`interrupt`** (Explicit Stop / `Esc`) | `session.interrupt()` (`session.ts`) + `transport.ts` teardown | Fast-path acknowledges settled sessions when `backgroundWorkWithin` (`300` ms probe; timeout fails closed as active work) finds nothing running. Otherwise sends `session/cancel`, cancels permissions/children, and—if `hasActiveBackgroundWork` holds—kills `agy` + Unix descendant process groups (`500` ms stdin EOF -> `2,000` ms group `SIGKILL` -> `2,500` ms deadline) before `doRelaunch()`. | **Clean Abort**: terminates leaked background tasks surviving native `session/cancel` while retaining conversation history. |

---

## 5. Subagent, Revert & Interrupt Edge-Case Matrix

| Edge Case | Hazard | Deterministic Safeguard |
| :--- | :--- | :--- |
| Session closed while child watcher poll is in flight | `ENOTEMPTY` or SQLite lock race during `removeSessionArtifacts`. | `SubagentRegistry.closeAll()` awaits `BrainWatchHandle.drain()` on every child handle, and cleanup serializes on `queueTurnJournalOp`. |
| Settled foreground turn still owns a background task | Fast-path `session.interrupt` no-ops, leaving orphan task running. | `backgroundWorkWithin` races a `300` ms `hasActiveBackgroundWork` probe (timeout = active work) and forces full `session/cancel` + process-group `doRelaunch()`. |
| `scope: 'both'` revert hits SQLite fork failure | Workspace files roll back while conversation resets to an empty session. | `revertSession` validates the shadow-Git checkpoint first and fails closed on `forkAgyConversationStorage` error unless `fallbackToFreshOnForkError: true` is explicit. |
| Conversation rewind prunes nested grandchild subagent | Orphaned grandchild watcher keeps emitting events onto new fork. | `reconcileAfterRevert` iteratively prunes transitive descendants missing from `childParents`, awaits `child.cancel()`, and emits `session.closed`. |
| Replay transcript contains `CHECKPOINT` compaction | Unverified ordinal tool IDs misalign ACP results or misplace compaction. | `alignReplayTools` shifts `GENERIC` indices past checkpoints (`+1`) and emits a timeless info notice when exact checkpoint position lacks verified anchors. |
| Custom ACP directory flags passed to `/usage` | `agy -p /usage` rejects ACP flags or queries default account silently. | `AgyUsageSource` strips `STRIPPED_ACP_FLAGS` via `usageArgs` and returns an explicit diagnostic error rather than reading a mismatched account. |

---

## 6. Verification & Conformance Gate

- Run `node --test paseo-agy-acp/tests/subagent-failure-propagation.test.ts paseo-agy-acp/tests/interrupt.test.ts` (exit code `0`) after modifying subagent watchers, fork/revert, or interrupt relaunch paths.
- Run `npm --prefix paseo-agy-acp run verify` (exit code `0`) as the mandatory release gate.
- Verify `paseo usage ls --json` returns valid `5h` and `weekly` windows without exposing OAuth token payloads.
