---
doc_id: DESIGN-PASEO-AGY-ACP-SHARD-01
status: CURRENT
version: 1.1.0
last_verified: 2026-11-21
language: en-US
---

# Dual-Plane Architecture & Brain Transcript Observer

Parent index: [../INDEX.md](../INDEX.md)
Related shards: [02-turn-lifecycle-and-fail-closed-guards.md](02-turn-lifecycle-and-fail-closed-guards.md) · [03-subagents-checkpoints-and-steer.md](03-subagents-checkpoints-and-steer.md)

## 1. Dual-Plane Fusion Topology

Synchronize foreground ACP JSON-RPC stdio with local Antigravity Brain disk observation.
Relying on ACP stdio alone drops post-RPC Reactive Wakeups, child subagents, and external IDE turns.

| Plane | Owning Modules & Symbols | Physical Channel / Artifacts | Core Responsibility |
| :--- | :--- | :--- | :--- |
| **Foreground ACP** | `paseo-agy-acp/server/transport.ts` (`connectAcp`), `paseo-agy-acp/server/session.ts` (`sessionParams`, `promptSession`), `paseo-agy-acp/server/permissions.ts`, `paseo-agy-acp/server/questions.ts` | Child `agy acp` process stdio NDJSON stream | Dispatches `session/new`, `session/load`, `session/resume`, `session/prompt`, and `session/cancel`; streams live chunks; intercepts permissions and elicitations. |
| **Brain Observer** | `paseo-agy-acp/server/brain.ts` (`settleBrainTurn`, `watchBrain`, `hasActiveBackgroundWork`), `paseo-agy-acp/server/brain-io.ts` (`TranscriptReader`, `StepDedupe`, `readInboxState`, `readSubagents`), `paseo-agy-acp/server/brain-observer.ts` (`BrainTurnObservation`, `ModelUsageObserver`), `paseo-agy-acp/server/brain-projector.ts` (`BrainNode`, `BrainTranscriptProjector`) | `<appDataDir>/brain/<nativeId>/.system_generated/` (`logs/transcript_full.jsonl`, `subagents/*.json`, `messages/*.json`, `messages/read.json`) | Projects asynchronous Reactive Wakeup turns, correlates child subagent calls, recovers step-level context occupancy, and syncs external IDE conversations. |

### 1.1 `_meta.antigravity` Injection & Stdio Interception

1. **Additive System Prompt Default (`sessionParams`, `resolveEffectiveSystemPrompt`)**:
   - Emit `_meta.antigravity.systemPrompt` in `paseo-agy-acp/server/session.ts` as `{ append: systemPrompt }` by default.
   - Switch to `{ replace: systemPrompt }` strictly when `systemPromptMode === 'replace'` is explicitly configured.
   - When `config.systemPrompt` is empty and `env.PASEO_AGY_BOT_PROMPT_FILE` points to an existing readable file, `resolveEffectiveSystemPrompt` loads prompt content from disk and injects it via `_meta.antigravity.systemPrompt`, replacing legacy `PASEO_AGY_BOT_AGENT` so adapter sessions never collide with saved Antigravity agent names.
   - Rationale: Preserving native Antigravity tool and safety instructions prevents silent capability regressions and agent-name collisions.
2. **Multi-Root Workspace Forwarding (`workspaceRoots`)**:
   - Forward validated non-empty `additionalDirectories` strings into `_meta.antigravity.workspaceRoots` inside `sessionParams`.
   - Rationale: Grants `agy` native multi-root file and search scope without workspace symlinks.
3. **TransformStream Elicitation & Permission Interception**:
   - Intercept `elicitation/create` and `session/request_permission` on the raw stdio `TransformStream` in `paseo-agy-acp/server/transport.ts` prior to ACP SDK schema parsing.
   - Rationale: `agy` multi-select item schemas (`items: { anyOf }` omitting `type: 'string'`) fail strict ACP SDK `CreateElicitationRequest` validation.
   - Catch broken-stdin write rejections (`.catch(() => undefined)`) during process exit so readable stream teardown never aborts early.
   - Auto-approve non-question `'tool'`, `'mode'`, and `'plan'` requests with `allow_once` only in `full-access` mode (`FULL_ACCESS_MODE_ID` in `paseo-agy-acp/server/mapping.ts`) or when matched by `config.toolPolicy.preapproved`.
4. **Symlink-Free Filesystem Containment (`resolveBrainPath`)**:
   - Resolve every Brain file path via `resolveBrainPath` (`paseo-agy-acp/server/brain-io.ts`) using `realpath` containment and `lstat` checks.
   - Security redline: NEVER traverse symlinked `appDataDir` roots or read/delete symlink leaf targets outside `<appDataDir>/brain/<nativeId>/`.

---

## 2. Asynchronous Escape & Reactive Wakeup Settlement

Hold the Paseo turn open past the `session/prompt` RPC return until `settleBrainTurn` (`paseo-agy-acp/server/brain.ts`) confirms full Brain quiescence.
`agy acp` resolves `session/prompt` as soon as synchronous foreground generation yields, leaving detached tasks running.

### 2.1 Why Pure ACP Prematurely Truncates Turns

1. **Detached Background Spawns**:
   - Background shell commands (`GENERIC` rows in `RUNNING` or `WAITING` status) and multi-level `invoke_subagent` runs outlive the initial `session/prompt` response.
2. **Silent Post-RPC Reactive Wakeup**:
   - When a background task completes, a timer fires, or a subagent invokes `send_message` after `session/prompt` has returned, `agy` resumes model execution asynchronously.
   - `agy` appends new `SYSTEM_MESSAGE`, `PLANNER_RESPONSE`, and `GENERIC` steps solely to `transcript_full.jsonl` with zero foreground ACP notifications.
3. **Two-Path `ask_question` Elicitation**:
   - **Foreground RPC Path**: Handled over stdio `elicitation/create` (`paseo-agy-acp/server/questions.ts`), surfacing a Paseo `'question'` card.
   - **Woken-Turn Path**: `agy` appends an unsettled `ask_question` tool call to `transcript_full.jsonl` without a settling `GENERIC` row; `settleBrainTurn` surfaces the `'question'` card and drives a synthetic continuation `session/prompt` (`formatQuestionAnswersText`) with `preStagedQuestion` / `handledElicitations` deduplication.
   - **Stateless Replay Boundary**: On replay, `hasPendingQuestion` (`paseo-agy-acp/server/brain-projector.ts`) treats an immediately following `USER_INPUT` with no intervening `GENERIC` or `PLANNER_RESPONSE` as that question continuation.

### 2.2 Per-Prompt Phase Machine & Foreground Reconciler

Split stream and token-occupancy ownership via `BrainPromptPhase` (`paseo-agy-acp/server/brain-projector.ts`) anchored to each turn's `USER_INPUT` step:

| `BrainPromptPhase` | Entry Condition | Stream & Occupancy Owner |
| :--- | :--- | :--- |
| `'foreground'` / `'foreground_active'` | Prompt dispatched; synchronous `PLANNER_RESPONSE` or foreground tool calls active. | **ACP Stdio** owns text, thoughts, and tool updates; Brain enriches completed tool metadata and checkpoints. |
| `'foreground_idle'` | Foreground `PLANNER_RESPONSE` finishes without pending tools, or `GENERIC` (`RUNNING`/`WAITING`) registers background work. Pure `planexecute` notices (`isPlanExecuteNotice` with `countRowMessages === 0`) stay foreground-scoped. | **Settlement Gate** awaiting full quiescence or an actionable wakeup trigger; synchronous follow-up tools return to `'foreground_active'`. |
| `'woken'` (`wokeUp = true`) | Actionable `SYSTEM_MESSAGE` arrives (`countRowMessages > 0`, excluding `MESSAGE_PRIORITY_LOW`, pure `planexecute` handoff notices, and `isRestartNotice` banners). | **Brain Projector** owns timeline items and step occupancy; if `agy` drained the continuation _inside_ the live RPC, `ForegroundReconciler` (`advanceForegroundCursor` on `foregroundAcp`) suppresses duplicate emission. |

### 2.3 Transcript Row Projection & Quiescence Predicates

Project `transcript_full.jsonl` rows deterministically in `BrainTranscriptProjector` (`paseo-agy-acp/server/brain-projector.ts`):

| Transcript Row | Projection & State Mutation Contract |
| :--- | :--- |
| `USER_INPUT` | Anchors turn boundaries and strips `<USER_REQUEST>` / media hints via `normalizeUserText` (`brain-io.ts`). |
| `PLANNER_RESPONSE` | Emits thoughts, assistant prose, and initially `running` tool cards; cancels prior unlogged tool calls on the node. |
| `GENERIC` | Matches pending tools by `stepIndex`, then first non-`ask_question` call, then FIFO; tracks `RUNNING`/`WAITING` tasks (`IsDaemon: true` tracked separately); `manage_task` `kill` clears killed task IDs. |
| `SYSTEM_MESSAGE` | Anchors `sender=<id>` headers to correlate background task results and child messages while ignoring pure `planexecute` handoff notices. |
| `CHECKPOINT` | Shifts pending tool `stepIndex` references (`>= checkpoint` by `+1`); emits one compaction item on first `DONE` per step identity. |
| `ERROR_MESSAGE` | Classifies transient `isRetryWarning` steps (`RETRY_IDLE_TIMEOUT_MS`) versus immediate terminal error items. |

Keep `settleBrainTurn` (`BrainTurnObservation` polling at `200` ms) active and block `session.can_stop_runtime` (`hasActiveBackgroundWork`) until all four predicates hold:
1. `readSubagents` (`paseo-agy-acp/server/brain-io.ts`) shows zero owned `SUBAGENT_STATE_ALIVE` descendants producing transcript/inbox activity, and `SubagentRegistry.hasRunningChildren()` is `false`.
2. `readInboxState` confirms zero unread actionable messages (`unconsumedHighPriority.length === 0` against `messages/read.json`).
3. Zero non-daemon background tasks remain running (`IsDaemon: true` schedules allow foreground turns to settle while blocking idle `session.can_stop_runtime` shutdown).
4. Post-wakeup echo suppression (`wakeup.pendingReplay` and `carriedWakeupUsage` in `paseo-agy-acp/server/session.ts`) is recorded so `agy`'s automatic replay of wakeup steps on the next `session/prompt` is muted until the new `user_message_chunk` boundary arrives.

---

## 3. `transcript_full.jsonl` Reader & External Desync Prevention

### 3.1 `O_TRUNC` Rewrite Recovery & SHA-1 Step Deduplication

1. **In-Place Rewrite Detection (`TranscriptReader`)**:
   - `agy` periodically truncates and rewrites `transcript_full.jsonl` in place (`O_TRUNC`, same inode) during status transitions or compaction.
   - `TranscriptReader` (`paseo-agy-acp/server/brain-io.ts`) validates file size, leading bytes, and pre-offset bytes on every read, throwing `SyntaxError` with `code: 'ERR_TRANSCRIPT_SYNTAX'` on torn mid-rewrite lines.
2. **Atomic Rollback vs Byte-0 Reset**:
   - On `ERR_TRANSCRIPT_SYNTAX`, roll back byte cursor, UTF-8 remainder buffer, and candidate snapshot indices with zero emitted rows so partial rewrites never poison state.
   - On confirmed `O_TRUNC` truncation, reset byte cursor to `0` and trigger projector `reset` to rebuild state cleanly.
3. **SHA-1 Digest Deduplication (`StepDedupe`)**:
   - Hash `(type, source, status, content, thinking, tool_calls, error)` with SHA-1 in `StepDedupe.fresh` (`paseo-agy-acp/server/brain-io.ts`) so re-reads re-emit only genuinely mutated steps.
   - Ignore rewrite-only `PENDING`, `QUEUED`, and `GENERATING` rows; prune deleted step digests and `retryObservedAt` entries (`pruneRetrySteps`) strictly after a complete newline-terminated replacement snapshot (`snapshotStepIndices`).

### 3.2 Idle External Transcript Watcher & Cache-Busting Reload

1. **Continuous Idle Watcher (`startIdleWatcher`)**:
   - Run an unref'd `800` ms `idlePollTimer` plus `fs.watch` on `<brainRoot>/<nativeId>/logs` in `paseo-agy-acp/server/session.ts` whenever `!state.turn && !state.inSettle`.
   - Rationale: Conversations driven directly inside the native Antigravity IDE append to `transcript_full.jsonl` with zero ACP events; `syncExternalTranscript(false)` projects those steps via `projectReplayHistory` and `attachReplayRevertTokens`, deduplicating against `emittedItemSignatures` and terminal `emittedItemStatuses`.
2. **Cache-Busting Disk Hydration (`session.refresh` / `session.sync`)**:
   - Route explicit `session.refresh` and `session.sync` requests to `syncExternalTranscript(true)`, bypassing cached `lastTranscriptMtimeMs` and `lastTranscriptSize` guards to force full disk re-hydration instead of returning stale daemon memory.
3. **Per-Step Context Window Occupancy (`ModelUsageObserver`, `resolveCompactionThresholds`)**:
   - Compute context occupancy from the latest valid `PLANNER_RESPONSE` step snapshot (`input_tokens + cache_read_tokens + cache_write_tokens + output_tokens` via `extractStepUsage` and `readLatestStepUsage`, scanning `64` KiB blocks backwards up to `8` MiB with `131,072` fallback capacity for `gpt-oss*` and `256,000` otherwise).
   - Expose threshold resolution via `resolveCompactionThresholds` (`DEFAULT_CONTEXT_WARN_THRESHOLD_TOKENS = 230_000`, `DEFAULT_CONTEXT_AUTO_COMPACT_THRESHOLD_TOKENS = 250_000` in `paseo-agy-acp/server/session.ts`).
   - Redline: NEVER mix cumulative ACP prompt token counters into context window occupancy.

---

## 4. Dual-Plane Edge-Case Resolution Matrix

| Edge Case | Failure Hazard | Deterministic Bridge Resolution |
| :--- | :--- | :--- |
| Mid-rewrite `O_TRUNC` partial JSONL line | Corrupt JSON poisons projector state or drops delivered step IDs. | `TranscriptReader` tags `ERR_TRANSCRIPT_SYNTAX` and rolls back byte cursor + UTF-8 remainder atomically with zero row emission. |
| Pure `planexecute` handoff notice mid-RPC | Falsely latches `wokeUp = true` and double-projects foreground prose. | `isPlanExecuteNotice` + `countRowMessages === 0` keeps `BrainPromptPhase` foreground-scoped while `ForegroundReconciler` deduplicates `foregroundAcp`. |
| Wakeup steps replayed by `agy` on next prompt | Duplicate assistant bubbles and double-counted prompt usage on Turn $N+1$. | `wakeup.pendingReplay` suppresses echoed chunks until the new `user_message_chunk` arrives; `carriedWakeupUsage` prevents double-billing (resetting on zero-usage `/compact` or underflow). |
| Standing `IsDaemon: true` background process | Blocks parent `settleBrainTurn` forever OR gets killed by idle GC. | `BrainTranscriptProjector` excludes `IsDaemon: true` from turn-settle blockers while `hasActiveBackgroundWork` keeps `session.can_stop_runtime === false`. |
| Antigravity IDE external conversation turns | Paseo UI stays frozen on stale daemon memory even after client Reload. | `startIdleWatcher` polls every `800` ms + `fs.watch`, and `session.refresh` / `session.sync` call `syncExternalTranscript(true)` to bypass `mtimeMs`/`size` caches. |
| Woken `ask_question` followed by stateless replay | Ambiguous `USER_INPUT` splits synthetic continuation into a fake new turn. | `hasPendingQuestion` binds an immediately following `USER_INPUT` (with no intervening `GENERIC` or `PLANNER_RESPONSE`) as the question continuation. |

---

## 5. Verification & Conformance Gate

- Run `node --test paseo-agy-acp/tests/brain.test.ts paseo-agy-acp/tests/brain-retry.test.ts` (exit code `0`) after any Brain reader, phase-machine, or idle-sync change.
- Run `npm --prefix paseo-agy-acp run verify` (exit code `0`) to enforce formatting, TypeScript strictness, full test suite determinism, and package tarball integrity.
- Verify zero symlink traversal regressions whenever modifying `resolveBrainPath` or `TranscriptReader`.
