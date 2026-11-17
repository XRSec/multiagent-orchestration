# AGY-ACP stale-run audit — "turn stopped, UI still running"

Target: `paseo-agy-acp/` (`server/`, `tests/`, `docs/`), `@agentclientprotocol/sdk ^1.9.0`.
All citations are relative to `paseo-agy-acp/` (or `$PROJECT_ROOT/paseo-agy-acp/`).
Read-only static audit; no source modified.

**Defect under investigation**: a turn has actually stopped, the UI still shows it running, and there is no retry.

**Headline**: the settlement state machine is gated behind the `session/prompt` RPC return. `session/prompt` is the only ACP call not routed through `transport.request()` and therefore has no timeout at all (`server/session.ts:2410` vs `server/transport.ts:332`). While it is outstanding, the session-level transcript watcher is explicitly disabled (`server/session.ts:709`). Nothing can convert that silence into a terminal event. Secondary hangs: unanswered approval (`server/brain.ts:994`) and background tasks (`server/brain.ts:991`).

---

## 1. State ownership map (host vs bridge vs provider)

| Layer | State | Definition | Mutated at | Terminal authority |
|---|---|---|---|---|
| Host (Paseo daemon/UI) | rendered turn status | not in this repo — derived from `ProviderEvent` stream | consumes `session.turn` | none; it can only render what the bridge emits |
| Bridge — session | `state.turn`, `turnAbort`, `turnFinished`, `inSettle`, `interrupting`, `failed`, `closing`, `silenced`, `loading`, `replay`, `observation` | `server/session.ts:488-537` | `server/session.ts:2125-2136`, `server/session.ts:2291-2307`, `server/session.ts:1251` | `finishTurnOnce` `server/session.ts:638-660` (single funnel) |
| Bridge — session (timers) | `idlePollTimer`, `fileWatcher`, `idleSyncInFlight` | `server/session.ts:571-573` | `server/session.ts:836-870` | none |
| Bridge — transport | `stopping`, `exitInfo`, `closed` | `server/transport.ts:132-151` | `server/transport.ts:167-186` | `onExit` → `server/session.ts:1249-1262` |
| Bridge — brain (turn) | `promptPhase`, `wokeUp`, `retrySince`, `retryStep`, `retryError`, `retryObservedAt`, `sqliteError`, `lastStep` | `server/brain-projector.ts:836-860`, `server/brain-projector.ts:1151-1164` | `server/brain-projector.ts:985-1118` | `failure()` `server/brain-projector.ts:1151-1164` |
| Bridge — child watcher | `running`, `turnId`, `lastActivity`, `turnStartedEmitted` | `server/brain.ts:1049-1056` | `server/brain.ts:1082-1098` | `finishTurn` `server/brain.ts:1082-1098` |
| Provider (agy) | `transcript_full.jsonl` rows, `conversations/<id>.db` steps, `.system_generated/subagents|messages` | read at `server/brain-io.ts:562-718`, `server/error-inspection.ts:249-308` | provider-owned | only two channels: `session/prompt` response (`stopReason`, `usage`) or process exit/EOF |

Ownership consequence: the bridge is the sole party able to emit a terminal `session.turn`. If the bridge's terminal funnel is not reached, no other layer can clear the host's running state.

---

## 2. Running-state setters

| # | What is marked running | Site | Emitted/observable |
|---|---|---|---|
| R1 | user message accepted | `server/session.ts:2199-2209` | `timeline.item` |
| R2 | prompt accepted as a turn | `server/session.ts:2210-2215` | `session.prompt_result {type:'turn'}` |
| R3 | **turn started** | `server/session.ts:2216-2221` | `session.turn {state:'started'}` ← the host's running bit |
| R4 | internal turn ownership flag | `server/session.ts:2125-2126` (`state.turn = turnId`) | not emitted; gates `:2093`, `:709`, `:1778`, `:396` |
| R5 | child turn started (resume path) | `server/brain.ts:1071-1081` (`ensureTurnStarted`) | `session.turn {state:'started'}` |
| R6 | child turn started (new rows) | `server/brain.ts:1144-1152` | `session.turn {state:'started'}` + `turnSeq++` |
| R7 | child session container appears running | `server/subagents.ts:273-285` | `session.opened` + `session.ready` |
| R8 | tool card running (ACP path) | `server/mapping.ts:917-948` (else-branch `'running'`) | `timeline.item` |
| R9 | tool card running (transcript path) | `server/brain-projector.ts:512-529` (`startTool`) | `timeline.item` |
| R10 | running-tool registry entry | `server/mapping.ts:761-765` (`this.running.set`) | internal (feeds terminalize) |
| R11 | usage attributed to a live turn | `server/session.ts:604-613` (`turnId: state.turn`) | `session.usage` |

---

## 3. Terminal-state setters

| # | Terminal outcome | Site | Covers |
|---|---|---|---|
| T1 | `completed` / `failed` / `canceled` turn | `server/session.ts:653-659` inside `finishTurnOnce` | the only parent-turn terminal emitter; idempotent via `turnFinished` `server/session.ts:643` |
| T2 | running tools forced terminal at turn end | `server/session.ts:625-637` → `server/mapping.ts:772-802` | per-item; **`completed` is synthesized** for tools with no result (`mapping.ts:796-799`) |
| T3 | success path terminal | `server/session.ts:2627-2631` | after settle + error inspection |
| T4 | exception path terminal | `server/session.ts:2632-2656` | RPC rejection, abort, settle throw |
| T5 | abort→canceled mapping | `server/session.ts:2600-2608` (AbortError only) | interruption |
| T6 | `refusal` / upstream error → failed | `server/error-inspection.ts:311-331` + `server/session.ts:2609-2624` | stopReason `refusal`, SQLite step_type 17 |
| T7 | runtime exit | `server/session.ts:1249-1262` (`runtime_failed` + `turnAbort.abort`) | process exit, EOF, protocol error |
| T8 | close during turn → `canceled` | `server/session.ts:1873` | host-initiated close |
| T9 | session close event | `server/session.ts:318`, `:340-343` | after T8 |
| T10 | child turn terminal | `server/brain.ts:1082-1098` (`finishTurn`) | completed / failed / canceled |
| T11 | child turn canceled by registry | `server/brain.ts:1274-1285` (`cancel()`) | killed/pruned children |
| T12 | child stall → failed | `server/brain.ts:1208-1224` | 120s / 900s idle |
| T13 | parent stall → failed + error card | `server/brain.ts:661-669`, `server/brain.ts:991-1003` | post-RPC only |
| T14 | child failure recorded for parent | `server/subagents.ts:163-176` | propagates via `getChildFailure` |
| T15 | provider-boundary failure (NOT a turn terminal) | `server/provider.ts:126-141` | emits `request.failed` / `session.prompt_result{failed}` only |
| T16 | silent SQLite error → failed | `server/brain.ts:974-980`, `server/brain.ts:1229-1231` | gated on `!node.isSettled(inbox)` |
| T17 | retry-warning deadline → failed | `server/brain.ts:865-870` + `server/brain-projector.ts:1151-1156` | 900s (`server/brain-io.ts:248`) |
| T18 | orphaned/superseded tool → canceled | `server/brain-projector.ts:728-733` | new PLANNER_RESPONSE supersedes pending calls |

---

## 4. Stuck-state matrix

Columns: **Terminal?** = does a `session.turn` terminal event provably occur. **Timer?** = is there a clock that bounds it. **Orphan** = state left set.

| # | Abnormal termination | Terminal? | Timer that fires | Orphan / cite |
|---|---|---|---|---|
| 1 | provider process exit (crash, SIGKILL, OOM) | YES, ≤ ~30s | exit `server/transport.ts:174-186` → `fail` `:167-172` → `onExit` `server/session.ts:1249-1262` → abort → cancel branch `server/session.ts:2324-2336` (30s bound) → `server/session.ts:2655` | none; `terminalize` double-emit is idempotent (`server/session.ts:643`) |
| 2 | transport EOF / readable closed, process still alive | YES, ≤ ~30s | `server/transport.ts:254-261` (flush), `server/transport.ts:276` (`rpc.closed`) → same path as #1 | none |
| 3 | **`session/prompt` never returns; transport alive (agy hang, black-holed upstream, silent quota with no exit)** | **NO** | **none** | `state.turn` (`server/session.ts:2125`) + `turnFinished=false` (`:2127`) never cleared; observation keeps polling `server/brain-observer.ts:166` but has no settlement authority; `syncExternalTranscript` self-disables `server/session.ts:709`; `canStop` stays false `server/session.ts:1778` |
| 4 | empty stream, prompt returns `end_turn` with zero rows | YES | post-RPC stall 120s `server/brain.ts:991-1003` → `server/brain.ts:661-669` | none |
| 5 | truncated stream (partial JSONL line, no trailing LF) | YES, 120s | line held in `remainder` `server/brain-io.ts:669-671` → no rows → `lastActivity` stale → `server/brain.ts:1001` | none |
| 6 | missing `stopReason` | Terminal but **misclassified** | defaults to `completed` `server/session.ts:2425-2426` (only `cancelled` is special-cased) → then #4 logic | not a hang; a false success if the transcript looks quiet |
| 7 | `stopReason: 'refusal'` | YES | `server/error-inspection.ts:316-330` → `server/session.ts:2609-2623` | none |
| 8 | silent quota/API error, evidence in `steps` step_type=17 | YES **iff** settle runs and inbox unsettled | `server/brain.ts:974-980`; **dropped when `isSettled`** | if the transcript shows a clean completion the SQLite error is discarded (`brain.ts:978`) |
| 9 | silent error only as transcript `ERROR_MESSAGE` (non-retry) | YES, immediate | `server/brain-projector.ts:1157-1161` → `server/brain.ts:865-870` | none |
| 10 | retry warnings then provider goes silent | YES after 900s | `server/brain-projector.ts:1151-1156`, `server/brain-io.ts:248`; refreshed only by a *distinct* attempt (`brain-projector.ts:1024-1039`) | unbounded if #3 holds (RPC open) |
| 11 | tool call with no result | Terminal but **fabricated success** | turn-end `terminalize('completed')` → `server/mapping.ts:796-799` (`status:'completed'`, `error:null`) | no hang; wrong evidence in UI |
| 12 | tool call superseded by next PLANNER_RESPONSE | YES | `server/brain-projector.ts:728-733` → canceled | none |
| 13 | subagent never reports — **linked** watcher | YES, 120s | `server/brain.ts:1208-1224` → `server/subagents.ts:166-175` → parent `server/brain.ts:155-162` | none |
| 14 | subagent never reports — **unlinked** (no `childSessionId`, no watcher) | Only via parent idle clock | `settleChildren` has **no clock** (`server/brain.ts:117-248`); parent `server/brain.ts:995-1003` | 900s if `isWokenWorking()`, and suppressed entirely while `tracking` (`server/brain.ts:991-1000`) |
| 15 | approval request never answered by UI | **NO** | `isWaitingOnUser` (`server/session.ts:2481-2482`) resets `lastActivity` every poll (`server/brain.ts:994`) | `permissions` map entry + open prompt RPC (`server/session.ts:1228-1245`); indefinite |
| 16 | background task / daemon never reports | **NO** | `node.projector.hasBackground()` forces `tracking` (`server/brain.ts:991-1000`) | `background` map (`server/brain-projector.ts:141`, `:463-474`); indefinite |
| 17 | host closes session mid-turn | YES | `server/session.ts:1867-1874` → T8 | `silenced` suppresses later items by design (`server/session.ts:629`) |
| 18 | bridge relaunch fails during turn | YES | `server/session.ts:2331-2334` → `onExit` | none |
| 19 | child watcher read error (non-ENOENT) | Emits one error card only | `server/brain.ts:1236-1247` (`warned` latch) | `running` stays true; bounded only by the idle clock `server/brain.ts:1219` |

Ranking of severity for the observed symptom: **#3 (unbounded) > #15 (unbounded, caused by host-side drop) > #16 (unbounded) > #14 (900s) > #8/#6/#11 (wrong terminal, not stuck)**.

---

## 5. Existing retry coverage

### 5.1 What the two named test files actually cover

| File | Layer exercised | Content |
|---|---|---|
| `tests/brain-retry.test.ts` | **brain / transcript only** | `isRetryWarning` positive+negative classification `:116-226`; retry deadline + refresh semantics `:228-269`; mtime anchoring / O_TRUNC / pruning `:393-468`, `:470-587`; pre-attach buffering `:589-651`, `:803-1016`; superseded tools end canceled `:271-301`; `watchBrain` child stall + late resume `:1018-1145`; `StepDedupe` re-delivery `:777-801` |
| `tests/subagent-failure-propagation.test.ts` | **brain + registry**, not session | real `steps` BLOB parsing `:101-140`; silent step_type=17 surfaces via `settleBrainTurn`/`watchBrain` `:142-196`; parent SYSTEM_MESSAGE subagent error vs recovery `:198-246`; `watchChild` → `getChildFailure` `:248-303`; "unsettled child must not reset `lastActivity` forever" `:305-335` |

Neither file imports `server/session.ts` or `server/transport.ts`. **Zero coverage of turn-level lifecycle, the `session/prompt` RPC, transport exit, or host-facing `session.turn` emission.**

### 5.2 Retry/reconnect logic that does exist

| Mechanism | Site | Scope |
|---|---|---|
| provider-internal retry observation (not a bridge retry) | `server/brain-io.ts:229-245`, `server/brain-projector.ts:1024-1039` | transcript classification |
| retry deadline → local failure | `server/brain-projector.ts:1151-1156`, `server/brain-io.ts:248` | 900s after latest distinct attempt |
| cancel convergence re-request | `server/session.ts:2330` (`transport.request(outcome, {fatalOnTimeout:false})`) | one retry of a *canceled* prompt outcome |
| interrupt→relaunch recovery | `server/session.ts:1817-1842` | after interrupt only |
| relaunch serialization | `server/session.ts:1850-1859`, `server/session.ts:1384-1442` | config/full-access change, post-interrupt |
| transport request timeout | `server/transport.ts:332-353` (30s, fatal) | all RPCs **except `session/prompt`** |
| child watcher resume | `server/brain.ts:1271-1273`, `server/subagents.ts:203-221` | child sessions only |

### 5.3 Missing retry scope (precise)

1. **Turn-level**: no re-issue of `session/prompt` after a failed/hung turn. `SessionManager.handle` (`server/session.ts:327-447`) enumerates every supported input; there is no retry/reconnect input.
2. **Transport-level**: `fail()` (`server/transport.ts:167-172`) closes and calls `onExit` once; `connectAcp` is only re-created in `startRuntime` (`server/session.ts:1269-1283`, called at `:1297`, `:1411`). There is no reconnect loop and no backoff.
3. **Session-level**: after any exit the session is permanently poisoned — `state.failed` makes every subsequent prompt throw `ACP runtime has exited; reopen the session` (`server/session.ts:2094-2095`, `:1800-1801`, `:1390-1391`). Recovery is manual reopen.
4. **Watchdog-level**: no code path detects "turn started, no bytes for N seconds" (see §6).

---

## 6. Timers, watchdogs, heartbeats

| Timer | Site | Period | Can it turn a silent hang into a terminal state? |
|---|---|---|---|
| ACP control-request timeout | `server/transport.ts:332-353` (`ACP_REQUEST_TIMEOUT_MS` `:65`) | 30s | Yes for wrapped RPCs — **`session/prompt` is not wrapped** (`server/session.ts:2410-2415`) |
| shutdown grace / SIGKILL / deadline | `server/transport.ts:301-315` | 500ms / 2s / 2.5s | no (teardown only) |
| stderr drain | `server/transport.ts:177-180`, `:256-259` | 50ms | no |
| `waitForCommands` | `server/session.ts:584-597` | 1000ms | no |
| `drain()` tick | `server/session.ts:599-603` | setTimeout 0 | no |
| **idle transcript poller** | `server/session.ts:836-841` | 800ms | **no — returns early while `state.turn` is set** (`server/session.ts:709`) |
| `fs.watch` on logs dir | `server/session.ts:843-855` | event | same early return |
| turn observation poller | `server/brain-observer.ts:165-171` | 200ms | no settlement authority; only usage/rows (`:2388-2407` callbacks) |
| child watcher poller | `server/brain.ts:1250-1253` | 1000ms | **yes** — `server/brain.ts:1208-1224` |
| parent stall deadline | `server/brain.ts:991-1003` | 120s / 900s | yes, **but only reached after the RPC returns** (`server/session.ts:2430`) |
| retry deadline | `server/brain-projector.ts:1151-1156` | 900s | same post-RPC gate |
| `AbortController` (turn) | `server/session.ts:2114`, abort listeners `:2286`, `:2320` | — | only on interrupt/close/exit; nothing aborts on silence |
| heartbeat / keepalive on ACP stream | — | — | **absent** |

**Answer to AC-4**: no timer can convert a hung `session/prompt` into a terminal state. The only two stall clocks (`server/brain.ts:991-1003`, `server/brain.ts:1208-1224`) are unreachable for the parent turn while the RPC is outstanding, and the session-level poller that could observe the same evidence is disabled by its own guard at `server/session.ts:709`.

---

## 7. Minimal insertion points (hooks only, no code)

| # | Site | Hook | State that must be tracked |
|---|---|---|---|
| P1 | `server/session.ts:2410-2415` | race the prompt promise against a per-turn liveness deadline; on expiry call `finishTurnOnce(turnId,'failed',…)` then `session.interrupt()` | `turnId`, `lastActivityAt`, `phase` |
| P2 | `server/session.ts:488-537` (state schema) | add `turnStartedAt` / `turnLastActivityAt` to the single mutable turn record; `turnFinished` (`:532`) is already the idempotency latch | monotonic timestamps, not wall clock |
| P3 | `server/session.ts:2222-2333` | heartbeat sources: `client.sessionUpdate` (`server/session.ts:1140-1141`), observation `onItem`/`onUsage` (`:2390-2405`), and `BrainTurnObservation.revision` (`server/brain-observer.ts:91-95`) | a single `lastActivityAt` refreshed by all three |
| P4 | `server/session.ts:709` | remove/scope the `state.turn` early-return so idle transcript sync can run (or add a watchdog-only read path) | why the guard exists: replay/turn races — must stay read-only while a turn is live |
| P5 | `server/session.ts:2481-2482` + `server/brain.ts:994` | bound `isWaitingOnUser`: a pending approval or running child must not reset the stall clock indefinitely | approval deadline per `permissionId` (`server/session.ts:1228-1230`) |
| P6 | `server/transport.ts:332-353` | route `prompt` through `request()` (or add a non-fatal per-turn timeout so the transport is not killed) | `fatalOnTimeout` policy per request kind |
| P7 | `server/brain.ts:836-870` | if the fix lives at the brain layer, the settlement loop must run **concurrently** with `waitPrompt`, not after it | same `lastActivityAt` as P1–P3 |
| P8 | `server/provider.ts:126-141` | the provider boundary emits `request.failed` / `session.prompt_result{failed}` but never `session.turn`; a terminal must be guaranteed at this boundary too | `turnId` association for the failed input |
| P9 | `server/session.ts:327-447` | no retry/reconnect input exists; a bridge-side retry needs a new handled input type plus a transport that can be re-created after `fail()` (`server/transport.ts:167-172`) | none today |

Minimal viable set: **P1 + P2 + P3** (`server/session.ts`). P4/P5 are required for full coverage of matrix rows 15/16; P6 is the cheaper structural fix but changes behaviour of every long prompt (30s default is far below legitimate model latency, so a dedicated turn timeout is needed, not the generic one).

---

## 8. Verdict: evidence-missing vs evidence-dropped

| Case | Does terminal evidence exist? | Does the bridge use it? | Class |
|---|---|---|---|
| process exit | yes — `exit` event `server/transport.ts:174` | yes → `server/session.ts:1249-1262` | used |
| transport EOF | yes — `flush`/`rpc.closed` `server/transport.ts:254-261`, `:276` | yes | used |
| `refusal` | yes — `stopReason` `server/session.ts:2410-2415` | yes — `server/error-inspection.ts:316-330` | used |
| SQLite step_type=17 | yes — `server/error-inspection.ts:249-308` | **conditionally** — discarded when `isSettled` (`server/brain.ts:978`) | **dropped (bridge)** |
| retry warning then silence | yes — transcript row | yes after 900s, **only post-RPC** | used (slow) / dropped while RPC open |
| transcript rows written while the RPC is hung | yes — on disk | **no** — observation buffers them, `consumer` is unset until `settleBrainTurn` attaches (`server/brain-observer.ts:232-233`, `server/brain.ts:820`); session-level poller is disabled (`server/session.ts:709`) | **dropped (bridge)** |
| ended turn with unterminated tool | no | bridge **fabricates** `completed` (`server/mapping.ts:796-799`) | false evidence |
| truly silent upstream stall, RPC held open, zero rows, no exit | **no** — provider emits nothing | n/a | **missing (provider-side)** — only a timeout can answer |
| approval never answered | no (host-side drop) | bridge treats the wait as legitimate progress (`server/brain.ts:994`) | missing (host), bridge can bound it |
| background task disappeared | no | `tracking` keeps the turn alive (`server/brain.ts:991-1000`) | missing (provider), bridge can bound it |

**Verdict**: the dominant class for the reported symptom is **bridge-side, not provider-side**. For every variant where the provider process is gone or the stream is closed, the bridge already produces a terminal event. The indefinite-stuck case is created by the bridge's own architecture: `session/prompt` is the only RPC without a timeout (`server/session.ts:2410` vs `server/transport.ts:332`), and the only observer that could notice the silence refuses to run while a turn is active (`server/session.ts:709`). The residual genuinely provider-side gap is narrow: an upstream stall where agy neither returns nor exits nor writes a row — no bridge code can detect that without a timer, so it collapses into the same fix.

Secondary bridge defects worth separate tickets: fabricated tool completion (`server/mapping.ts:796-799`) and discarded SQLite errors on settled inboxes (`server/brain.ts:978`).

---

## 9. Open questions

1. Does Paseo's host clear its running state on `session.runtime_failed` (`server/session.ts:1256-1261`) alone, or does it require a `session.turn` terminal? If the latter, matrix row 3 has no escape hatch even after a crash-to-hang transition.
2. Is the host willing to re-issue a prompt after `session.prompt_result{failed}` (`server/provider.ts:135-140`)? Today that event is emitted without any `session.turn` terminal, so a host that keys off turns sees nothing.
3. What is a safe turn-liveness budget given `stallTimeoutMs` defaults of 120s (`server/brain.ts:452`) and `wokenStallTimeoutMs` 900s (`server/brain.ts:453`)? `provider.ts:68-73` never overrides them, so production always runs defaults.
4. Can `agy acp` keep a `session/prompt` request open indefinitely (e.g. quota exhausted with no exit)? Not verifiable statically — no fixture in `tests/` simulates a non-returning prompt.
5. Full test inventory under `tests/` could not be enumerated (no directory listing available to this audit); only the two named files were read. Other tests may assert `session.turn` emission indirectly.
