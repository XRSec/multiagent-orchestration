# T3 Code Turn/Session Lifecycle — Source-Anchored Model vs `paseo-agy-acp`

Scope: how T3 Code (`pingdotgg/t3code`, MIT, public) decides a turn is over, dead, retryable, or cancelled; and where `paseo-agy-acp` diverges. Investigated 2026-11-17.

Method note (load-bearing correction to the brief's premise): `.t3/paseo-acp-system-prompt.patch` is **not** a T3 Code artifact. It is a patch against **Paseo's own host** (`packages/server/src/server/agent/providers/acp-agent.ts`, class `ACPAgentSession`, provider id `claude-acp`) adding first-turn system-prompt injection `[VERIFIED .t3/paseo-acp-system-prompt.patch:2036-2064]`. It is host-side evidence only; it contains no T3 Code internals. All T3 Code claims below come from the upstream repository `[WEB https://github.com/pingdotgg/t3code]`.

## 1. State model

### 1.1 T3 Code enums (authoritative, exact)

`docs/orchestration-v2/core-graph-and-data-model.md` `[WEB https://raw.githubusercontent.com/pingdotgg/t3code/main/docs/orchestration-v2/core-graph-and-data-model.md]`:

| Entity | Status union |
|---|---|
| `Run` | `queued \| starting \| running \| waiting \| completed \| interrupted \| failed \| cancelled \| rolled_back` |
| `RunAttempt` | `pending \| running \| completed \| interrupted \| failed \| cancelled \| superseded` |
| `RunAttempt.reason` | `initial \| steering_restart \| retry \| provider_recovery` |
| `ExecutionNode` | `pending \| running \| waiting \| completed \| interrupted \| failed \| cancelled \| rolled_back` |
| `ProviderTurn` | `pending \| running \| completed \| interrupted \| failed \| cancelled` |
| `ProviderThread` | `not_loaded \| idle \| active \| archived \| closed \| error` |
| `ProviderSession` | `starting \| ready \| running \| waiting \| stopped \| error` |
| `TurnItem` | type union (`UserMessage … Fork \| DynamicTool`); `TurnItemStatus` values are **not** defined in that document `UNKNOWN` |

Four levels are separated: `Run` (one user→agent cycle) → `RunAttempt` (execution try, may be superseded) → `ExecutionNode` (tree; `kind=root_turn` for the root) → `ProviderTurn` (provider-reported turn). `ProviderSession`/`ProviderThread` are transport-level, nested under `ProviderTurn` `[WEB core-graph-and-data-model.md]`.

### 1.2 Transitions

`[WEB https://raw.githubusercontent.com/pingdotgg/t3code/main/docs/orchestration-v2/feature-lifecycles.md]`

- `thread.message.send` → creates `ConversationMessage`, `Run(status=queued, ordinal=N)`, `root ExecutionNode(kind=root_turn, countsForRun=true)`.
- Provider accepts → `root node status=running`, `run status=running`.
- `ask_questions` → `run status=waiting`.
- Root `provider turn/completed` → finalization barrier → `root node terminal` → checkpoint capture → `run terminal`.
- Later runs after rollback → `rolled_back`.
- The doc states no general legal-transition matrix; it encodes invariants instead `[WEB feature-lifecycles.md]`.

### 1.3 Terminal ownership

- **Provider owns turn terminality.** "Provider lifecycle emits turn completion; the app reacts." `[WEB feature-lifecycles.md]`
- **Host owns run terminality, but only via the root.** "Only the root node can complete the run." "Only the selected/final attempt completes the run and creates the run checkpoint." `[WEB feature-lifecycles.md]`
- **Host must not infer terminality from an interrupt acknowledgement.** "The app should not mark the run terminal solely because the interrupt request returned." A returned interrupt command is "command acknowledged only" `[WEB feature-lifecycles.md]`.
- **Host synthesizes a failed terminal when the provider stream dies.** See §2.2 — so host owns terminality in exactly one case: transport end without provider terminal `[WEB https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/server/src/orchestration-v2/RunExecutionService.ts]`.
- Finalization barrier ordering is fixed: flush assistant buffers → close messages → finalize plans/todos → close open non-live child nodes → capture checkpoint → publish run terminal `[WEB feature-lifecycles.md]`.

### 1.4 `paseo-agy-acp` state model

No equivalent single enum is documented. Effective model is a per-prompt phase machine plus turn settlement:

- `promptPhase`: `'foreground' -> 'foreground_active' -> 'foreground_idle' -> 'woken'`, with `wokeUp` latch; resets per continuation `[VERIFIED paseo-agy-acp/docs/reference.md:76-78]`.
- Turn completion is decided by `PLANNER_RESPONSE.status === DONE` plus outstanding tools/messages/children — "never the presence of prose" `[VERIFIED paseo-agy-acp/docs/reference.md:93]`.
- Tool item statuses include running/completed/canceled/failed `[VERIFIED paseo-agy-acp/docs/reference.md:64]`.
- Session runtime stoppability is `session.can_stop_runtime` `[VERIFIED paseo-agy-acp/docs/reference.md:126]`.
- Terminal ownership is **split and implicit**: ACP prompt response, Brain transcript rows, and the stall watchdog can each end a turn `[VERIFIED paseo-agy-acp/docs/reference.md:89,93]`.

## 2. Termination detection

### 2.1 T3 Code: no watchdog. Two mechanisms only.

**(a) Provider terminal event is the normal path.** Root turn becomes terminal when a `turn.terminal` event matches `state.rootProviderTurnId`; routing sets `rootTurnEnded: true`, ingestion records `terminalEvent`, sets `rootTerminalSeen`, calls `finalizeRootRun(event)` `[WEB RunExecutionService.ts]`. Statuses: `completed | interrupted | failed | cancelled` via `isTerminalProviderTurnStatus` `[WEB RunExecutionService.ts]`.

**(b) Stream end without a terminal event is an explicit failure.** Clean stream end with no stored terminal raises `ProviderAdapterEventStreamError` with message `"Provider event stream ended without a root terminal."`, `raisedByT3: true`; the run is finalized as `failed` with failure class `"unknown"` `[WEB RunExecutionService.ts]`. This is the mechanism that converts "provider silent / EOF / empty stream" into a terminal UI state instead of a stuck spinner.

**Negative findings (searched, not assumed):**
- `ProviderEventIngestor.ts` contains **no** idle, stall, heartbeat, or terminal-timeout constants and no watchdog behavior `[WEB https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/server/src/orchestration-v2/ProviderEventIngestor.ts]`.
- `feature-lifecycles.md` states dead detection is "not defined"; nearest trigger is `"provider runtime unavailable"`; no timeout values `[WEB feature-lifecycles.md]`.
- No filename under `orchestration-v2` contains `watchdog`, `stall`, or `retry` `[WEB https://github.com/pingdotgg/t3code/tree/main/apps/server/src/orchestration-v2]`.

**(c) Missing `stopReason` is tolerated, not punished.** `terminal.reason` is optional; for `completed`, a `system_notice` titled `"Stopped by the provider"` is written only when `reason !== undefined` (`PROVIDER_STOP_REASON_SIGNAL`). For `interrupted`, `loadRunInterruptReason() ?? terminal.reason`, and the interrupt item is emitted even when the final reason is undefined `[WEB RunExecutionService.ts]`. Empty output with a proper terminal is normal finalization; there is no separate empty-output status `[WEB RunExecutionService.ts]`.

**(d) Process death is detected by persisted-state reconciliation, not a live exit hook.** `ProviderRuntimeRecoveryService.recover` → `reconcile("startup")`; shutdown → `reconcile("shutdown")`; persisted command type `provider-runtime.reconcile` `[WEB https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/server/src/orchestration-v2/ProviderRuntimeRecoveryService.ts]`. On startup/shutdown, every nonterminal entity is force-terminalized:

| Entity | Rewritten to |
|---|---|
| runtime requests | `expired` (startup) / `cancelled` (shutdown) |
| `Run` | `cancelled` + `completedAt` |
| `RunAttempt` in `pending`/`running` | `cancelled` |
| `ExecutionNode` in `pending`/`running`/`waiting` | `cancelled` |
| `ProviderTurn` in `pending`/`running` | `cancelled` |
| turn items nonterminal | `cancelled` |
| messages | `streaming: false` |
| `ProviderThread` active | `idle`, `pendingBackgroundTasks: []` |
| `ProviderSession` | `stopped` (error sessions stay `error`, `extensionStatuses: []`) |

Also `endOrphanedNativeSubagent` → `cancelled`, `endRunlessRootTurns` → `cancelled`, `rewindUnacceptedRuns` → run rewritten to `status: "starting"` with `startedAt: null` (eligible for re-dispatch). Nonterminal run statuses considered: `preparing`, `starting`, `running`, `waiting` `[WEB ProviderRuntimeRecoveryService.ts]`. Note `preparing` appears here but not in the documented `Run` union — minor doc/code drift `[INFERRED]`.

### 2.2 `paseo-agy-acp`: watchdog-driven, three clocks

| Mechanism | Value | Behavior |
|---|---|---|
| `stallTimeoutMs` | 120 s without transcript/inbox activity | turn fails with an error item and interrupts the native session "instead of hanging on an unrecognized final row" `[VERIFIED paseo-agy-acp/docs/reference.md:89]` |
| `wokenStallTimeoutMs` | 15 min per active woken-turn step | same, applied to post-wakeup steps `[VERIFIED paseo-agy-acp/docs/reference.md:89]` |
| retry silent window | 15 min after latest distinct warning step, anchored `retryObservedAt` | retry state release rules at :91 `[VERIFIED paseo-agy-acp/docs/reference.md:91]` |
| turn-flush wait | up to 2 s for agy to flush `USER_INPUT` | `[VERIFIED paseo-agy-acp/docs/reference.md:89]` |
| control RPC timeout | 30 s | `[VERIFIED paseo-agy-acp/docs/reference.md:126]` |

Contrast: `paseo-agy-acp` **does** have idle/stall detection; T3 Code **does not**. `paseo-agy-acp` lacks T3 Code's explicit "stream ended without terminal ⇒ failed" rule; its default when the transcript is missing is to complete the turn: "A missing transcript follows the same bounded waiting policy when a known retry is unresolved; otherwise it completes the turn rather than failing it" `[VERIFIED paseo-agy-acp/docs/reference.md:89]`. That is a plausible contributor to failure mode #1 (turn reported finished while provider is actually dead), as is "Root RPC cancellation or failure currently skips settling" `[VERIFIED paseo-agy-acp/docs/reference.md:110]` `[INFERRED]`.

### 2.3 Host layer (Paseo)

`ACPAgentSession.startTurn` pushes `turn_started`, then `connection.prompt(...).then(response => this.handlePromptResponse(response, turnId))`, with a parallel `failOnDisconnect = () => void this.failDisconnectedTurn(turnId, child)` `[VERIFIED .t3/paseo-acp-system-prompt.patch:294,314,322]`. A `turn_completed` event carrying `turnId` is asserted in tests `[VERIFIED .t3/paseo-acp-system-prompt.patch:26]`. The body of `failDisconnectedTurn` and its terminal-status mapping were not read `UNKNOWN`.

## 3. Retry policy

### 3.1 T3 Code

| Layer | Mechanism | Cap / backoff | Evidence |
|---|---|---|---|
| Run | `RunAttempt.reason = "retry"` exists as a first-class attempt kind; provider crashes/network loss retry only "where policy allows retry" | scope/cap/backoff omitted from docs | `[WEB feature-lifecycles.md]` |
| Runtime requests | `MAX_RESENDS = 3` | 3 | `[WEB ProviderRuntimeRecoveryService.ts]` |
| Failure finalization | retry on finalization failure | `"1 second"` exponential, capped `"30 seconds"` | `[WEB RunExecutionService.ts]` |
| Retry-warning notification | throttled `{ minutes: 10 }` | 10 min | `[WEB RunExecutionService.ts]` |
| Persistence | SQLite lock retry `Effect.retry(write, { while: isLockTimeout, times: 2 })` | 2, no delay | `[WEB ProviderEventIngestor.ts]` |
| Provider metadata | provider-supplied `retry` / `retryStartedAt` copied onto the failure turn item; "this code does not schedule the retry itself" | n/a | `[WEB ProviderEventIngestor.ts]` |
| Tool calls | **no tool-level retry found** in examined modules | — | `[WEB ProviderEventIngestor.ts]`, `[WEB RunExecutionService.ts]` |

Silent vs user-visible: `interrupted`/`failed` runs remain forkable ("fork from any finished run (even failed/limited)") `[WEB https://github.com/pingdotgg/t3code]`; usage-limit `failed` terminals create a provider-failure item, and reset-time lookup may occur when none is supplied `[WEB ProviderEventIngestor.ts]`. Claim that turns auto-resume when a usage limit resets: **not corroborated** — `docs/user/usage.md` documents only manual "Use reset" and `/usage-limits` ("does not run the agent or refresh anything") `[WEB https://raw.githubusercontent.com/pingdotgg/t3code/main/docs/user/usage.md]`. Treat auto-resume-on-reset as `UNKNOWN` (likely a release-note summary of `scheduledTasks`, not verified in source).

Turn-level attempt cap / backoff for provider failures: `UNKNOWN` — no constant located; `RunAttempt.reason = "retry"` is structural, and the decider lives in an uninspected module `[INFERRED]`.

### 3.2 `paseo-agy-acp`

- **Retry-warning observation, not retry execution.** Recognized forms: exact stream-interruption notice, `API error (attempt N)` with positive N, empty-model-output validation notice, `Your previous response ...` / `There was a problem...` ending `\nRetries remaining: N` `[VERIFIED paseo-agy-acp/docs/reference.md:91]`.
- **No structured exhaustion event** in Brain; a retry gets a bounded 15-minute silent window after the latest distinct warning step; "The 15-minute value is a local resource policy, not proof of native exhaustion" `[VERIFIED paseo-agy-acp/docs/reference.md:91]`.
- **Warnings do not trigger a resend.** No attempt cap, no backoff schedule, no idempotency guard documented for re-prompting a dead turn `[VERIFIED paseo-agy-acp/docs/reference.md:89-93]` — the plugin detects retries performed *by agy*, it does not perform them.
- Host-level model fallback exists but is scoped elsewhere: `runWithModelFallback`, `ModelFallbackExhaustedError` with `outcome: "exhausted"`, `isTeamBotEligibleForFallback`, recoverable-error set (`Unknown model ID`, `429`, `500/502/503/529`, `streamGenerateContent failed`, quota) in `paseo-bots` `[VERIFIED .t3/TASK_MANIFEST.md:92-99]`. Same-provider only. This is the only implemented retry path in the repo, and it is a **bot-layer** feature, not a turn-lifecycle guarantee.

## 4. Cancellation semantics

### 4.1 T3 Code

- Entry points: `ProviderTurnControlServiceV2.interrupt`, `steer`, `interruptAndAwaitTerminal`, `stopSubagent` `[WEB https://raw.githubusercontent.com/pingdotgg/t3code/main/apps/server/src/orchestration-v2/ProviderTurnControlService.ts]`.
- `interrupt` → `interruptTurn(..., { requestRuntimeRestart: true })`; catches `ProviderAdapterInterruptTimeoutError` → `ProviderTurnControlError` with `unresponsive: true`; settlement wait `Effect.timeoutOption("2 seconds")` `[WEB ProviderTurnControlService.ts]`.
- `interruptAndAwaitTerminal` sends interrupt without restart, then polls the projection: `for (let remaining = 1_000; remaining > 0; remaining -= 1)`, yielding via `setImmediate`. 1,000 is an iteration bound, **not** a duration `[WEB ProviderTurnControlService.ts]`.
- Settled means `providerTurn?.status !== "running" && attempt?.status !== "running"`, observed from `eventSink.stream` filtered to `provider-turn.updated` / `run-attempt.updated` `[WEB ProviderTurnControlService.ts]`.
- No live session: interrupt/restart log a warning and treat the turn as already stopped; `steer` fails with `ProviderTurnControlError` `[WEB ProviderTurnControlService.ts]`.
- Run-level: `interrupt.run(RunId)` sets "mark interrupt requested"; `run.interrupt` sends `holdQueue` — holds the queue, ends pull-request watches, drops wakes, then stops delegated tasks depth-first via `delegated-tasks.stop` and `thread.stop` `[WEB feature-lifecycles.md]`.
- Unsupported-interrupt providers: either stop the session and mark `interrupted`/`cancelled` by policy, or mark interrupt unsupported and leave the run active until provider exit `[WEB feature-lifecycles.md]`.
- Persisted state on cancel: historical graph preserved; `ProviderThread` + `nativeThreadRef` stay durable; checkpoint captured "with status reflecting terminal state" when safe, else a "missing/error checkpoint summary"; pending live requests are "not resumable"; approval callbacks fail with `not_resumable` `[WEB feature-lifecycles.md]`.
- **In-flight tool calls:** no explicit rule in the lifecycle doc. The barrier only closes "open non-live child nodes if provider marked them done" `[WEB feature-lifecycles.md]`; runtime recovery later force-cancels stale `command_execution` / `dynamic_tool` / `subagent` items `[WEB ProviderRuntimeRecoveryService.ts]`. Live-tool cancel semantics during a healthy process: `UNKNOWN`.

### 4.2 `paseo-agy-acp`

- "Cancellation is an ACP notification without a remote acknowledgement or Brain flush guarantee." Driver observes the outstanding prompt, local interruption work and queued ACP updates, then makes one serialized final read of complete records; "Writes arriving beyond that boundary are not fabricated or polled indefinitely" `[VERIFIED paseo-agy-acp/docs/reference.md:82]`.
- "A non-converging canceled RPC uses the existing bounded control-request policy and retires its owner rather than leaving another prompt on that connection" `[VERIFIED paseo-agy-acp/docs/reference.md:82]`.
- Interrupt always sends `session/cancel`; with no background tasks/unread wakeups/active subagents it completes in place without restarting the ACP process. With background work or subagents it also stops the ACP process and descendant process groups, then reloads the same native session (agy 1.5.3 leaves background tasks alive after `session/cancel`) `[VERIFIED paseo-agy-acp/docs/reference.md:124]`.
- In-flight tools: denied permissions mark stranded cards `canceled` instead of `completed`; other running tools get a completed/canceled/failed terminal snapshot before the turn ends `[VERIFIED paseo-agy-acp/docs/reference.md:64]`.
- Persisted state: explicit close stops Brain polling and terminates the ACP process "while preserving imported and prompted conversations (unless `config.persist === false`)" `[VERIFIED paseo-agy-acp/docs/reference.md:126]`.
- Shutdown ladder: snapshot descendant groups → close stdin → 500 ms graceful wait → SIGKILL groups → 2,000 ms direct child → 2,500 ms hard deadline `[VERIFIED paseo-agy-acp/docs/reference.md:126]`.
- Child turns: cancellation drains already-written child rows first, so the child timeline is complete before its canceled turn `[VERIFIED paseo-agy-acp/docs/reference.md:118]`.
- `can_stop_runtime` returns true only when no foreground turn, pending approval, running subagent watcher, active background task, or standing `IsDaemon` schedule exists `[VERIFIED paseo-agy-acp/docs/reference.md:126, paseo-agy-acp/OVERVIEW.md:27]`.

## 5. Tool-call failure handling

**T3 Code.**
- `TurnItem` kinds include `CommandExecution`, `FileSearch`, `WebSearch`, `DynamicTool` `[WEB core-graph-and-data-model.md]`.
- OOM-killed thread → failure item message `"Killed: out of memory."`, code `"oom_kill"` `[WEB ProviderEventIngestor.ts]`.
- `dismissNativeUserInputs` runs on every terminal provider-turn update and on `turn.terminal`; for failed terminals a provider-failure turn item is created `[WEB ProviderEventIngestor.ts]`.
- Empty output is not a failure signal; only the missing terminal is `[WEB RunExecutionService.ts]`.
- No tool-level retry. No per-tool failure classification found in examined modules `[WEB ProviderEventIngestor.ts]` — `UNKNOWN` at adapter level.

**`paseo-agy-acp`.**
- `GENERIC` rows: `ERROR` fails, `CANCELED`/`INTERRUPTED` cancel, other terminal statuses complete; `RUNNING`/`WAITING` register background task IDs `[VERIFIED paseo-agy-acp/docs/reference.md:101]`.
- "An outstanding child's terminal failure fails the waiting turn rather than leaving it running" `[VERIFIED paseo-agy-acp/docs/reference.md:95]`.
- Tools with no logged result when a new response supersedes them are closed as `canceled` "rather than falsely completed" `[VERIFIED paseo-agy-acp/docs/reference.md:93]`.
- Missing failure detail gets a non-empty diagnostic `[VERIFIED paseo-agy-acp/docs/reference.md:64]`.
- Validation/projection/callback failures are terminal because a partially applied fold cannot be safely replayed `[VERIFIED paseo-agy-acp/docs/reference.md:80]`.

## 6. Gap table vs `paseo-agy-acp`

| # | Mechanism | T3 Code | `paseo-agy-acp` | Gap severity |
|---|---|---|---|---|
| 1 | Terminal state authority | Explicit `ProviderTurn.status` enum, 4 terminal values, single normalized `turn.terminal` event `[WEB RunExecutionService.ts]` | Implicit: ACP response + Brain rows + watchdog; no single enum `[VERIFIED reference.md:89-93]` | High — no auditable terminal contract |
| 2 | Stream end / EOF with no terminal | Synthesized `failed`, `raisedByT3: true`, class `unknown` `[WEB RunExecutionService.ts]` | Missing transcript → **completes** the turn `[VERIFIED reference.md:89]` | High — exactly failure mode #1 |
| 3 | In-process idle watchdog | **None** `[WEB ProviderEventIngestor.ts]`, `[WEB feature-lifecycles.md]` | 120 s `stallTimeoutMs`, 15 min `wokenStallTimeoutMs` `[VERIFIED reference.md:89]` | None — paseo stronger |
| 4 | Restart/process-death reconciliation | Startup+shutdown `provider-runtime.reconcile`; force-cancels all nonterminal, rewinds unaccepted runs `[WEB ProviderRuntimeRecoveryService.ts]` | No documented startup sweep of persisted nonterminal state `UNKNOWN` | High |
| 5 | Duplicate terminal events | Not suppressed; only analytics keyed `providerInstanceId:providerTurn.id`, 4096 cap `[WEB ProviderEventIngestor.ts]` | `emittedItemStatuses` + single terminal-event guard shared between close and prompt completion `[VERIFIED reference.md:82, TASK_MANIFEST.md:112]` | paseo stronger |
| 6 | Interrupt semantics | Explicit: ack ≠ terminal; 2 s settlement; `unresponsive: true`; 1,000-iteration poll `[WEB ProviderTurnControlService.ts]` | `session/cancel` is a notification, no ack; bounded final read; retires non-converging owner `[VERIFIED reference.md:82,124]` | Comparable |
| 7 | In-flight tool calls on cancel | Unspecified live; force-cancelled only by recovery sweep `[WEB feature-lifecycles.md]` | Denied → `canceled`; terminal snapshot before turn end `[VERIFIED reference.md:64]` | paseo stronger |
| 8 | Run-level retry | `RunAttempt.reason = "retry"` / `provider_recovery`; policy lookup `UNKNOWN` `[WEB feature-lifecycles.md]` | None at turn layer `[VERIFIED reference.md:91]` | High — failure mode #2 |
| 9 | Transport/persistence retry | `MAX_RESENDS = 3`; lock retry ×2; finalize retry 1 s→30 s `[WEB ProviderRuntimeRecoveryService.ts]`, `[WEB ProviderEventIngestor.ts]`, `[WEB RunExecutionService.ts]` | Only `paseo-bots` model fallback (`runWithModelFallback`) `[VERIFIED TASK_MANIFEST.md:92-99]` | Medium |
| 10 | Tool-call retry | None found `[WEB ProviderEventIngestor.ts]` | None found `[VERIFIED reference.md:101]` | Parity (both absent) |
| 11 | Checkpoint on terminal | Captured for completed/interrupted/cancelled, not failed `[WEB RunExecutionService.ts]` | Root RPC cancel/failure **skips** settling; checkpoints visible only on replay `[VERIFIED reference.md:110]` | Medium |
| 12 | Missing `stopReason` | Optional; notice emitted only if present `[WEB RunExecutionService.ts]` | Completion by `PLANNER_RESPONSE.status` + outstanding work, never prose `[VERIFIED reference.md:93]` | Comparable |
| 13 | Idempotency / ordering | Monotonic `sequence`; `snapshotSequence` cursor; `rawEventId` correlation; no explicit idempotency keys `[WEB core-graph-and-data-model.md]` | `StepDedupe.fresh` SHA-1 over `(type, source, status, content, thinking, tool_calls, error)`; `snapshotStepIndices` gate `[VERIFIED reference.md:112-114]` | paseo stronger |
| 14 | Dead-provider → UI | `ProviderSession.stopped` / `ProviderThread.error`; failure item with reason `[WEB ProviderRuntimeRecoveryService.ts]` | `can_stop_runtime` gating only `[VERIFIED reference.md:126]` | Medium |

## 7. Mechanisms worth borrowing (ranked by cost)

1. **"Stream ended without a root terminal" ⇒ terminal failure** (low). One branch at the prompt-response / stream-close boundary: if no `PLANNER_RESPONSE`/terminal row was observed, emit a failure item with a `raisedByT3`-style flag rather than completing. Replaces the current "otherwise it completes the turn rather than failing it" default `[VERIFIED reference.md:89]`. Precedent identifiers: `ProviderAdapterEventStreamError`, `rootTerminalSeen` `[WEB RunExecutionService.ts]`.
2. **Explicit terminal-status enum + single `turn.terminal` normalization point** (low). Today terminality is inferred in ≥3 places (ACP response, Brain rows, watchdog) `[VERIFIED reference.md:89-93]`; T3 Code funnels everything through one event `[WEB RunExecutionService.ts]`.
3. **Startup/shutdown reconciliation sweep** (medium). On daemon start, rewrite every persisted `running` turn to `cancelled` + `completedAt`, set `streaming: false`, mark nonterminal tool items `cancelled`, and surface a reason. Mirrors `provider-runtime.reconcile` `[WEB ProviderRuntimeRecoveryService.ts]`. Highest value against failure mode #1 when the daemon itself restarted.
4. **`RunAttempt`-style attempt record with `reason`** (medium-high). Add `reason ∈ {initial, steering_restart, retry, provider_recovery}` and `superseded` so retries become auditable and duplicate-completion-safe `[WEB core-graph-and-data-model.md]`.
5. **Interrupt settlement contract** (low-medium). Distinguish "cancel notification sent" from "turn terminal"; add an `unresponsive` flag when the cancel does not converge within a bounded wait, mirroring `ProviderTurnControlError{unresponsive: true}` and the 2 s settlement wait `[WEB ProviderTurnControlService.ts]`.
6. **Bounded-resend counter for continuation/steer messages** (medium). `MAX_RESENDS = 3` is a concrete, cheap cap to adopt for synthetic continuation prompts `[WEB ProviderRuntimeRecoveryService.ts]`.

## 8. Confidence and unknowns

**Confidence**

| Area | Level | Basis |
|---|---|---|
| T3 Code state enums | High | Two independent upstream docs agree partially; enums quoted verbatim |
| T3 Code stream-end → failure | High | Code-level constant + message string read from `RunExecutionService.ts` |
| T3 Code absence of watchdog | Medium-high | Negative evidence across 3 files; absence is harder to prove than presence |
| T3 Code retry cap/backoff for turns | Low | Only `RunAttempt.reason` structure + unrelated constants |
| `paseo-agy-acp` behavior | High | First-party reference doc, line-cited, matches `OVERVIEW.md` |
| Parity claim in Task C | High | Manifest checklist contains no lifecycle/retry/watchdog item |

**Parity verdict.** `.t3/TASK_MANIFEST.md` Task C "T3 Code Parity" covers six P0/P1/P2 items — silent quota/API error detection (`stopReason: refusal` + SQLite `step_type = 17`, `resetAt`), hot-switch `full-access`, `_meta` security warnings, payload truncation + diff synthesis, `interaction_*` detection, isolated `TMPDIR` `[VERIFIED .t3/TASK_MANIFEST.md:40-50]`. **None addresses turn termination, no-terminal detection, or retry.** Parity was not achieved for the two failure modes in scope; the label is inaccurate `[VERIFIED .t3/TASK_MANIFEST.md:38-50]` `[INFERRED]`.

**UNKNOWNs**

1. T3 Code's actual turn-retry decision: attempt cap, backoff, and whether a retried turn is silent or user-visible. `RunAttempt.reason = "retry"` exists; the decider module was not located.
2. Whether T3 Code survives a *process-level* provider death mid-turn without a daemon restart — recovery is startup/shutdown reconciliation only, and no live exit hook was found; whether the OS-level process supervisor (`apps/server/src/process/`, uninspected) emits a synthetic terminal is unresolved.
3. `ACPAgentSession.failDisconnectedTurn` body and its terminal-status mapping; `TurnItemStatus` values; `AcpAdapterV2.ts` (404 at the expected path — the ACP adapter's real location is unresolved).
4. Whether `paseo-agy-acp` has any startup reconciliation of persisted `running` turns — undocumented; absence is assumed from the reference doc's silence, not proven.
5. Live-process in-flight tool-call cancellation semantics on both sides (T3 Code: unspecified; paseo: only permission-denial and turn-end paths documented).
