# magpie-agy-bridge vs paseo-agy-acp — source-level lifecycle comparison

Target: `https://github.com/gitxm/yce-magpie-agy` (MIT, JavaScript ESM, default branch `main`, 40 files, `index.mjs` = 7,227 lines / 312 KB).
Ours: `paseo-agy-acp/` (or `$PROJECT_ROOT/paseo-agy-acp/`); prior audit `docs/research/agy-acp-stale-run-audit.md`; peer survey `docs/research/acp-peer-survey.md` (this repo was absent there — this is an extension, not a duplicate).

Evidence tags: `[VERIFIED repo/index.mjs:151]`, `[VERIFIED paseo-agy-acp/server/session.ts:1385-1397]`, `[INFERRED]`, `UNKNOWN`.
**Line-number caveat (affects every citation into `index.mjs` ≥ 1001):** GitHub's blob view renders only lines 1–1000 of this file and `raw.githubusercontent.com` carries no numbering. Lines ≤ 1000 are quoted contiguously and are exact; below that, sites are cited by **function/method anchor** plus the verbatim line to grep. Do not read a bare `index.mjs` citation as a line number.

---

## 1 What this repo is and why it is directly comparable

A Magpie plugin (`package.json` provider id `antigravity-bridge`) that exposes an **Anthropic-shaped HTTP API** (`/v1/messages`, `count_tokens`) to the Magpie host and implements it by spawning **`agy acp`** and speaking ACP over stdio `[VERIFIED repo/index.mjs — loader→fetch entry, `fetch: async (fetchInput, init = {}) => {`]`. It is a *provider adapter*, not an ACP client SDK: it translates between HTTP/SSE on one side and `session/new|load|resume|prompt|update`, plus an MCP tool channel back to the client, on the other `[VERIFIED repo/index.mjs — `STOP_REASONS`, `class Proc`, `acceptMcpCall`]`.

Why this is not an analogy: every constant in scope governs **the same `agy acp` binary's silence behavior** that our `server/transport.ts` + `server/session.ts` govern. `AGY_BRIDGE_TURN_TIMEOUT_MS` is not "a timeout they chose"; it is the only known implementation of a turn-liveness clock for this exact CLI.

Shape of the code: one giant module holding constants → error classes → pool/park/resume → `class Proc` (one `agy acp` child) → `class Turn` (one `session/prompt`, which may span several HTTP responses) → MCP server → HTTP surface. Siblings: `accounts.mjs` (multi-account switch), `tool-schema.mjs`, `opencode*.mjs` adapters, `testkit.mjs`, `test-*.mjs` (≈400 KB of tests aimed at the HTTP/provider surface — i.e., precisely the layer our audit found untested in `tests/`).

Structural fact that matters for us: **a `Turn` outlives its HTTP response.** The comment at the top of `Turn` states one `session/prompt` can cover several HTTP responses (tool round-trips, late tool results) while ACP reports a single accumulated usage `[VERIFIED repo/index.mjs — `class Turn` constructor comment]`. That is the architectural inverse of our defect: we tie turn liveness to the single `session/prompt` promise and have nothing that owns the turn when the response is gone.

---

## 2 Turn silence watchdog (`AGY_BRIDGE_TURN_TIMEOUT_MS`)

Constants (contiguous, exact):
`AGY_BRIDGE_MAX_PROCS` → `maxProcs()` returns `packageConfig.maxProcs ?? positiveTimeout(process.env.AGY_BRIDGE_MAX_PROCS, 16)` `[VERIFIED repo/index.mjs:138]`; `AGY_BRIDGE_DETACHED_EVICT_MS` default `30_000` `[VERIFIED repo/index.mjs:146]`; `AGY_BRIDGE_TURN_TIMEOUT_MS` default `5 * 60 * 1000` `[VERIFIED repo/index.mjs:151]`; `AGY_BRIDGE_TOOL_TIMEOUT_MS` default `30 * 60 * 1000` `[VERIFIED repo/index.mjs:152]`; `AGY_BRIDGE_IDE_CALL_DEADLINE_MS` default `150_000` `[VERIFIED repo/index.mjs:162]`; `AGY_BRIDGE_RESUME_TTL_MS` default `6h` `[VERIFIED repo/index.mjs:155]`.

| Question | Answer | Evidence |
|---|---|---|
| Where is the timer? | `Turn.rearm()` — single timer per turn: `clearTimeout(this.timer)`, pick budget, compute `deadlineAt`, `this.timer = setTimeout(...)`, `timer.unref?.()` | `[VERIFIED repo/index.mjs — `Turn.rearm()`]` |
| What resets it? | **Parsed ACP notifications, not stdout bytes.** `Proc.#onNotification` returns unless `method === "session/update" && params.sessionId === this.sessionId`, then calls `turn.arm()` **before** dispatching the update. `arm()` = `lastProgressAt = Date.now()` + `rearm()` | `[VERIFIED repo/index.mjs — `Proc.#onNotification`, `Turn.arm()`]` |
| Every line? | No. Raw stdout lines, stderr output, JSON-RPC responses to our own requests, and keepalives do **not** arm the turn. Only a `session/update` for this session (or a new MCP tool call, §3) does | `[VERIFIED repo/index.mjs — `#onNotification` guard]` |
| Only model output? | No. Any `session/update` variant counts (message chunks, tool-call updates, plan/usage/thought updates) — the handler arms before it inspects `params.update` | `[VERIFIED repo/index.mjs — `const update = params.update ?? {}; turn.arm()`]` |
| Which budget? | `waitingForTools = this.hasPendingMcp()`; `timeout = waitingForTools ? TOOL_RESULT_TIMEOUT_MS : TURN_TIMEOUT_MS`; `deadlineAt = (waitingForTools && !this.attached ? this.clientProgressAt : now) + timeout` | `[VERIFIED repo/index.mjs — `Turn.rearm()`]` |
| Is a turn waiting on a client tool exempt? | **No — re-budgeted to 30 min, and re-anchored to client contact when detached.** While detached (`attached === false`) the deadline base is `clientProgressAt`, refreshed only by `touchClient()` (`acceptMcpCall`, `attach()`, `detach()`); `touchClient` re-arms only when `this.timer && !done && !finalized && hasPendingMcp()` | `[VERIFIED repo/index.mjs — `Turn.rearm()`, `Turn.touchClient()`, `Turn.detach()`]` |
| On expiry | `setTimeout` → `proc.timeoutTurn(turn, new Error(\`agy bridge: timed out ${what} after ${timeout}ms; stderr tail: ${stderrTail}\`))`; `timeoutTurn` = `turn.fail(error)` + `dropFromPool(this)` + `this.stop()`. Error text names the phase (`reading agy output` vs `waiting for a client tool result`) | `[VERIFIED repo/index.mjs — `Turn.rearm()`, `Proc.timeoutTurn`]` |
| Kill / fail / resume? | All three of fail+kill, **no resume**. `turn.fail` sets `done`, clears the timer, rejects `lateWaiters`, pushes `{type:"error", error}`, then schedules `cleanupTimer = setTimeout(() => proc.abandonTurn(turn), idleMs())`. `timeoutTurn` has already dropped the proc from the pool and stopped it, so nothing is parked and the next request starts a fresh agy session | `[VERIFIED repo/index.mjs — `Turn.fail`, `Proc.timeoutTurn`]` |
| Terminal idempotency | `Turn.complete`/`Turn.fail` both guard on `this.done`; `fail` also guards `finalized`; both `clearTimeout(this.timer)` | `[VERIFIED repo/index.mjs — `Turn.complete`, `Turn.fail`]` |

Two consequences worth importing:

1. The watchdog is **armed at turn start** (`acceptMcpCall` → `turn.arm()`; `Turn.attach()` → `touchClient()`), so a prompt that is accepted and then goes completely silent fails at 5 min even though no byte ever arrived.
2. Expiry is a **triple** (fail the turn, remove from pool, stop the process) rather than an error emission. There is no state left in which a superviser could still believe the turn runs, because the proc that would have to make progress is gone `[INFERRED from the three consecutive statements]`.

Ours: no counterpart. `session/prompt` is the only ACP call outside `transport.request()` and therefore has no timeout `[VERIFIED paseo-agy-acp/server/session.ts:2410, server/transport.ts:332]`; the session-level transcript poller self-disables while a turn is active `[VERIFIED paseo-agy-acp/server/session.ts:709]`; the only stall clocks run after the RPC returns `[VERIFIED paseo-agy-acp/server/brain.ts:991-1003]`.

---

## 3 Client-tool wait and late results (`AGY_BRIDGE_TOOL_TIMEOUT_MS`, `AGY_BRIDGE_IDE_CALL_DEADLINE_MS`)

Mechanism, in order:

| Step | Mechanism | Evidence |
|---|---|---|
| 1 | agy issues an MCP tool call on the bridge's MCP server → `Proc.acceptMcpCall(message, socket)`. Rejects if no turn, `turn.cancelRequested`/`steering`, or `!turn.promptInFlight`; validates name against `this.tools` | `[VERIFIED repo/index.mjs — `acceptMcpCall`]` |
| 2 | Record `call = {id: "toolu_"+uuid24, name, arguments, mcpSeen:true, mcpResponded:false, deferred:false, lateDelivered:false, deadline:null, stillRunning:0, ...}`, `turn.calls.push(call)`, `turn.push({type:"tool", call})`, `turn.arm()` | `[VERIFIED repo/index.mjs — `acceptMcpCall`]` |
| 3 | Placeholder clock: `call.deadline = setTimeout(() => this.#deferCall(turn, call), ideCallDeadline())` — **150 s**, chosen because "agy fails an ide-tools MCP call after a fixed three minutes" | `[VERIFIED repo/index.mjs:158-162, `acceptMcpCall`]` |
| 4 | `#deferCall`: sets `call.deferred = true`, `call.stillRunning++`, and answers agy **successfully** with `stillRunningText(call)` = `${name} is still running in the client; no result yet. To keep waiting, call ${name} again with exactly the same arguments. That waits for this run and does not start it twice.` | `[VERIFIED repo/index.mjs — `#deferCall`, `stillRunningText`]` |
| 5 | The model (agy) is thus instructed to re-issue the **same** call. `acceptMcpCall` looks for `calls.find(call => call.deferred && !call.lateDelivered && call.name === name && stableJSON(call.arguments) === signature)`; on a hit it calls `#acceptWait` instead of creating a new call | `[VERIFIED repo/index.mjs — `acceptMcpCall` dedupe predicate]` |
| 6 | `#acceptWait`: if `target.result` already exists → `lateDelivered = true` and reply immediately. Otherwise register `{socket, target, reply, timer}` in `turn.awaitCalls` with its own 150 s timer that replies `stillRunningText` again; comment: "A repeat waits for the original result, without renewing the client clock." Self-polling is separately capped (`#selfPollCapped` / `#capSelfPoll`, `SELF_POLL_LIMIT` 8, `SELF_POLL_IDLE_TIMEOUT_MS` 20 min, note `SELF_POLL_NOTE`) | `[VERIFIED repo/index.mjs:191-192, `#acceptWait`]` |
| 7 | When the real client result finally arrives on the original socket, `continueWith` sees `call.deferred`, calls `turn.touchClient()`, and re-enters the **same turn** with `renderLateResultParts` → `"Client tool calls that were still running have finished. Their real results:"` + `[tool result for NAME call_id=…]` | `[VERIFIED repo/index.mjs — `continueWith`, `renderLateResults`, `renderLateResultParts`]` |

How a late result rejoins the same turn: the turn is not scoped to the HTTP response. It owns `calls`, `awaitCalls`, `lateWaiters`, `hasLatePrompt` and an accumulated-usage ledger, and `finalizeTurn` only runs when the ACP prompt actually completes (`if (!this.stopping && !this.retiring) park(this)`) `[VERIFIED repo/index.mjs — `finalizeTurn`]`. So the late result is delivered as a continuation prompt inside the same `session/prompt`; the client sees one turn, not two.

Can it double-execute a tool? **Byte-identical repeats: no.** The identity test is `name` + `stableJSON(arguments)`, and a hit is answered from the original call's result or parked in `awaitCalls` — the client socket is never asked twice `[VERIFIED repo/index.mjs — `acceptMcpCall`, `#acceptWait`]`. **Mutated-argument repeats: yes, possible.** A re-issue with any argument difference fails the `stableJSON` comparison, creates a fresh `call` with a new `toolu_` id, and is forwarded to the client while the original is still executing; `hasPendingMcp()` counts both, so the only bound is the 30-min tool budget `[INFERRED from the dedupe predicate; no argument-drift guard exists in `acceptMcpCall`, `#acceptWait`, or `hasPendingMcp`]`.

Ours: no placeholder protocol at all. A tool with no result at turn end is force-terminalized as `completed` `[VERIFIED paseo-agy-acp/server/mapping.ts:796-799]`; a superseded call becomes `canceled` `[VERIFIED paseo-agy-acp/server/brain-projector.ts:728-733]`. There is no path by which a late result re-enters a turn that has already emitted its terminal.

---

## 4 Error discrimination

Two distinct channels, both in-band text.

**Channel A — banner classifier (module scope).**
`AGENT_RETRY_BODY_PREFIXES = ["Encountered retryable error from model provider", "API error (attempt "]`, tested by `isAgentRetryLine(line)` (prefix match). `AGENT_TERMINAL_ERROR_PREFIXES` = 13 exact prefixes including `"Agent execution terminated due to error."`, `"You have exhausted your quota on this model."`, `"Your AI credits balance is too low to continue."`, `"Authentication expired. Please log back in."`, `"Mid-stream error"`. `AGENT_ALL_BANNER_PREFIXES` = union; `AGENT_BANNER_HOLD_LIMIT = 16 * 1024` `[VERIFIED repo/index.mjs — module constants above `class AgentTurnError`]`.

**Channel B — the decision is deferred to end-of-text, not to first sight.**
`Turn.pushText(chunk)` buffers: when a line starts with `"⚠ "` (or `"\n⚠ "`), the line is classified and, if it is a retry line, `this.droppingRetryLine = true` is set and the text is swallowed; if it is a terminal prefix, it is parked in `heldTerminal` / `heldText` and `agentError`/`agentErrorMessage` are set; if the line is an incomplete prefix of a known banner (`AGENT_ALL_BANNER_PREFIXES.some(prefix => prefix.startsWith(body))`), the chunk is held until more bytes arrive. `endText()` and `flushText()` re-evaluate the held text: retry body → dropped and never emitted; terminal prefix → keep as terminal and let the turn fail; otherwise → release as ordinary model text `[VERIFIED repo/index.mjs — `Turn.pushText`, `Turn.endText`, `Turn.flushText`]`. This is exactly the README's "treated as failure only when the turn really ends": a 429 retry warning that is followed by a successful answer never reaches the client and never fails the turn, while an "Agent execution terminated due to error." line that survives to end-of-text does.

**Real-cause extraction.** On that terminal path `Proc.#agentError(turn)` = `lastAgentError(this.logPath, turn.logOffset)` → `#formatAgentError(detail, turn.agentErrorMessage)` `[VERIFIED repo/index.mjs — `#agentError`]`. `lastAgentError(file, offset)` reads the agy log from `max(offset, size - LOG_TAIL_BYTES)`, scans lines with `/\] (?:agent executor error|failed to construct executor): (.+)$/`, keeps the last match, cuts everything up to the literal `"generating and executing: "`, returns `trim().slice(0, 1000)` `[VERIFIED repo/index.mjs — `lastAgentError`]`. `#formatAgentError` then classifies: cloak-429 system-prompt rejection → `AgentTurnError(msg, "invalid_request_error")`; `QUOTA_EXHAUSTED|RESOURCE_EXHAUSTED|MODEL_CAPACITY_EXHAUSTED|RATE_LIMIT_EXCEEDED|code 429|exhausted your quota|experiencing high traffic|currently overloaded` → `AgentTurnError(msg, "rate_limit_error", quotaKind)` with `quotaKind ∈ {"capacity","account",null}`; `UNAUTHENTICATED|invalid_grant|refresh token expired/revoked|login required|authentication expired` sets `error.authenticationFailed = true` `[VERIFIED repo/index.mjs — `#formatAgentError`]`. `AgentTurnError` sets `keepProcess = true` `[VERIFIED repo/index.mjs — `class AgentTurnError`]`.

**Would this have caught our `step_type=17`-when-settled class?** **No.** Their entire error authority is stream text and the agy log tail; there is no SQLite read anywhere in `index.mjs` `[INFERRED from the absence of any `steps`/`sqlite` channel in the turn path; `gen_metadata` is read for billing only]`. A failure that surfaces *only* as a SQLite step and never as a banner is invisible to them too. What they do close, and we do not, is the *neighbouring* hole: there is no rule in their turn path that says "the inbox settled, therefore discard the error evidence". Our `server/brain.ts:978` drops the step precisely because `node.isSettled(inbox)` `[VERIFIED paseo-agy-acp/server/brain.ts:974-980]`. Their posture is "decide once, at the end, from all held evidence", not "decide early and discard".

---

## 5 Stale-run prevention (client loss, detached eviction, pool 503)

| Concept | Mechanism | Evidence |
|---|---|---|
| Attach/detach | `Turn.attach()` throws `BusyError` if `finalized` or already `attached`, else `attached = true; touchClient()`. `Turn.detach()` sets `attached = false` and calls `touchClient()` if it was attached | `[VERIFIED repo/index.mjs — `attach`, `detach`]` |
| What a disconnect does | The turn keeps running, `attached` becomes false, and `clientProgressAt` is refreshed at the moment of detach. Nothing is failed on disconnect itself | `[VERIFIED repo/index.mjs — `detach`]` |
| Immediate kill only for a dead MCP socket | In `acceptMcpCall`, `socket.once("close", …)`: if `!call.mcpResponded && !this.stopping` → `turn.fail("agy bridge: MCP helper disconnected during <name>")`, `dropFromPool(this)`, `this.stop()` | `[VERIFIED repo/index.mjs — `acceptMcpCall`]` |
| Staleness verdict | `staleTurnVerdict(proc, turn, now)` ladder: `cancelRequested`→not stale; `attached`→not stale; `steering`→not stale; `finalized`/`dead`/`done`→stale; `deadlineAt != null && now >= deadlineAt`→`"expired"`; else `pendingCallCount ? "pending_tool" : "running"` | `[VERIFIED repo/index.mjs — `staleTurnVerdict`]` |
| Detached eviction | `evictLRU()` pass 2: only `proc.retiring === false && turn && !turn.attached && !turn.cancelRequested && !turn.steering`; `since = turn.clientProgressAt ?? turn.lastProgressAt`; eligible when `staleTurnVerdict(...).stale || now - since >= detachedEvictMs()`; picks the oldest `since`; logs `"evicted"/"pool_pressure_detached"` with `detached_evict_ms`; then `reclaimStaleTurn(...)`. `evictIdle()` runs every `60_000` ms and only takes turns with `!proc.turn` | `[VERIFIED repo/index.mjs:146, `evictLRU`, `setInterval(() => { evictIdle() … }, 60_000)`]` |
| Reclaim | `reclaimStaleTurn(proc, turn, note)`: `turn.closeNote = note`, `retiring = true`, `historyInvalid = true`, `dropFromPool`, `unpark`, `turn.fail(new Error(note))`, `abandonTurn`, then `Promise.race([proc.stop(), 10s])` (`RECLAIM_STOP_TIMEOUT_MS` 10 000) | `[VERIFIED repo/index.mjs:177, `reclaimStaleTurn`]` |
| Pool pressure | `acquireProcLocked`: `while (allProcs.size >= maxProcs()) { if (!(await evictLRU())) throw new BusyError(\`agy bridge: ${maxProcs()} agy processes are running and all have unfinished responses\`) }` | `[VERIFIED repo/index.mjs — `acquireProcLocked`]` |
| 503 | `class BusyError extends Error { constructor(message){ super(message); this.statusCode = 503 } }`; the HTTP entry's final catch is `jsonError(error.statusCode ?? 502, error.message, error.code, { noRetry: error.noRetry })` | `[VERIFIED repo/index.mjs — `class BusyError`, loader→fetch final catch]` |
| Conflict, not guess | `class ConflictError` → `statusCode = 400`, `noRetry = true`; thrown when a request carries a pending tool call but no matching result (`"…this request carries the pending tool call but no matching result. Stop resending it…"`) | `[VERIFIED repo/index.mjs — `class ConflictError`, `acquireProcLocked`]` |

**What state does a turn end in when its client disconnects?** Not a `running` record: the turn either (a) fails immediately because the MCP socket that was executing the tool closed, or (b) continues detached and is terminated by the first of: the 30-min tool budget, the 30-s detached-eviction clock *under pool pressure*, or the self-poll cap (8 polls / 20 min) — each ending in `turn.fail(...)` + `proc.stop()` `[VERIFIED repo/index.mjs — `acceptMcpCall`, `rearm`, `evictLRU`, `#selfPollCapped`]`.

**Can any "running" record survive client loss?** No record survives indefinitely; the longest survivor is bounded by the 30-minute `TOOL_RESULT_TIMEOUT_MS` because a detached tool wait anchors its deadline at `clientProgressAt`, which stops advancing the moment the client is gone `[VERIFIED repo/index.mjs — `rearm` deadline base + `detach`]`. That 30-minute window is the residual: nothing shorter than pool pressure (30 s, conditional) or the self-poll cap forces a detached tool turn to end, so a client that disconnects during a tool call leaves up to ~30 min of "running" — bounded, but not small. This is our exact defect class, and the difference is category-level: they have a clock; we have none `[VERIFIED paseo-agy-acp/server/session.ts:2410 vs server/transport.ts:332]`.

---

## 6 Resume and replay

Their persisted record is richer than the brief states. `park(proc)` writes `{key, sessionId, historyHash, historyHashSansInputs, toolUseIdentitiesHash, instructionsHash, workDir, appDataDir, at, account?, instructionsInSession?, calibration?}` into `$XDG_STATE_HOME/magpie-agy-bridge/sessions.json` (`sessionStateFile()` = `path.join(base, "magpie-agy-bridge", "sessions.json")`), capped at `MAX_PARKED = 32`, written under `withStateLock` `[VERIFIED repo/index.mjs:149, `park`, `sessionStateFile`, `MAX_PARKED`]`. No message text, ever — the comment on the calibration field says "Never any text."

`peekParked(convKey, opts)` — the resume gate — returns `null` (→ fresh session) unless **all** of the following hold `[VERIFIED repo/index.mjs — `peekParked`]`:

| Gate | Rule |
|---|---|
| Account | `entry.account === currentAccountKey()` (unless no switch has occurred) |
| State era | `entry.appDataDir === bridgeAppDataDirName()` |
| TTL | `Date.now() - entry.at <= resumeTtlMs()` (6 h) |
| Working dir | `entry.workDir === opts.workDir` |
| Instructions | `entry.instructionsHash === digest(instructionsIdentity(opts.instructions))` |
| History | `entry.historyHash === digest(historyKey(opts.history))`, **or** the sans-inputs fallback: tool_use ids/names still line up (`toolUseIdentitiesHash` matches) and `historyHashSansInputs` matches — tolerating a client that canonicalized `tool_use.input` |
| Placement | a session holding appended instructions cannot serve an inline-placement model |

**Hashes do not match → `resume = null` → `acquireProcLocked` constructs a new `Proc` with no `resume`, `session/new` is issued, and the full history is replayed inside the prompt** (`renderTurnMessage`, byte budget `AGY_BRIDGE_MAX_PROMPT_BYTES` 112 KiB) `[VERIFIED repo/index.mjs — `acquireProcLocked` (`const resume = forceNew || isFreshConversation ? null : peekParked(...)`), `renderTurnMessage`]`. Resume failure classes are separated in `resumeFailureReason`: `session_gone` (ACP `SESSION_GONE_CODES` or `SESSION_GONE_RE`) is the only class that **consumes** the parked record; `process_dead` (`/connection is closed|agy exited/i`) and `timeout` are transient `[VERIFIED repo/index.mjs — `resumeFailureReason`]`.

**"A new tool added mid-turn forces replay in a new session" — not corroborated as a tool-triggered rule.** `instructionsIdentity(text) = compactIdentity(stripVolatileSystem(text))` and takes only text, so tools are not in any hash `[VERIFIED repo/index.mjs — `instructionsIdentity`]`; the compatibility predicate lists workDir, instructions, account, minimal-agent, appDataDir, history — **tools are absent** `[VERIFIED repo/index.mjs — `acquireProcLocked` `compatible` expression]`; a changed tool set is handled by `updateTools(tools)` → compare `stableJSON` → `#announceTools()` (i.e., a live `tools/list_changed`) `[VERIFIED repo/index.mjs — `Proc.updateTools`]`. What *does* produce a mid-turn replay is lineage: `lineageVerdict` returns `"fork"` when the incoming history's prefix no longer matches `turn.baseHistory` and the request does not carry the pending `tool_use` ids → `reclaimStaleTurn(..., SUPERSEDED_NOTE)` + a new `Proc` + `replay_started`; `"conflict"` when it does carry them → HTTP 400 `noRetry` `[VERIFIED repo/index.mjs — `lineageVerdict`, `recoverStaleTurn`, `acquireProcLocked`]`. So the observable behavior ("a tool-change mid-turn ends up replaying in a fresh session") is most plausibly the `history` mismatch or `fork` path, not a tool-list rule `[INFERRED]`. See §10 UNKNOWN-2.

Ours:
- `beginTurnJournal` writes `{turnId, clientMessageId, nativeId, startedAt, status:'running'}` **before** `session/prompt` is dispatched; `finishTurnJournal` removes it; `reconcileRunningTurns` returns every surviving record and clears the file, and callers must emit a `failed` terminal `[VERIFIED paseo-agy-acp/server/turn-journal.ts:85-140]`. Semantics: a ghost turn is *falsified into a failed terminal*, never resumed.
- Resume exists only as an in-process reload: `reloadSessionSilently` dispatches `opts.useResume ? resumeSession({...sessionId}) : loadSession({...sessionId})` `[VERIFIED paseo-agy-acp/server/session.ts:1385-1397]`, gated on `agentCapabilities.loadSession` `[VERIFIED paseo-agy-acp/server/session.ts:1452, :1465]`, and is reachable only from `doRelaunch` inside a live process `[VERIFIED paseo-agy-acp/server/session.ts:1442-1479]`. After an exit the session is poisoned: `if (state.failed) throw new Error('ACP runtime has exited; reopen the session')` `[VERIFIED paseo-agy-acp/server/session.ts:1447-1448]`; same at `:2094-2095`, `:1800-1801`, `:1390-1391` per the audit.
- Net difference: they persist **session identity + hash triple** and can *continue* a conversation across a daemon restart; we persist **turn liveness** and can only *falsify* it. Those are complementary, not competing — we are missing the session-identity half.

---

## 7 Retry posture

**No auto-resend of a failed prompt — stated in source, not just README.** `afterAgentErrorResponse(proc, turn, error)` early-returns unless `quotaKind === "account"` or `authenticationFailed`, and even then: `turn.settled.then(() => setTimeout(…))` with the comment "Never replay this request: the client receives its original 429/error event exactly once." Its only action is account cooldown bookkeeping (`recordCooldowns`) and `scheduleAccountSwitch({reason:"quota_error", modelFamily, generation})` `[VERIFIED repo/index.mjs — `afterAgentErrorResponse`]`. `AgentTurnError` carries `keepProcess = true`, so the agy child is kept but the request is not re-issued `[VERIFIED repo/index.mjs — `class AgentTurnError`]`. Client-side retry is additionally discouraged with `NO_RETRY_HEADERS = { "x-should-retry": "false" }`, attached only to `status === 400 && noRetry` responses `[VERIFIED repo/index.mjs:196, `jsonError`]`.

**Retry-banner filtering.** Two prefixes are dropped: `"Encountered retryable error from model provider"` (older builds) and `"API error (attempt "` (agy 1.5.x, whose line begins `"\n⚠ API error (attempt N): …\n"`), matched by `isAgentRetryLine` after the `"⚠ "` / `"\n⚠ "` header is stripped `[VERIFIED repo/index.mjs — `AGENT_RETRY_BODY_PREFIXES`, `isAgentRetryLine`, `Turn.pushText`, `Turn.endText`, `Turn.flushText`]`. The state machine handles chunk boundaries explicitly: `droppingRetryLine` carries the "we are inside a retry line" state across `pushText` calls; a bare trailing `"⚠"` or `"\n⚠"` is held; a partial body that is a prefix of any known banner is held (`AGENT_ALL_BANNER_PREFIXES.some(prefix => prefix.startsWith(body))`); `endText()` clears `droppingRetryLine` and re-checks held text so a retry banner can never leak as model text.

Ours: retry warnings are *classified* (`isRetryWarning`) and *timestamped* rather than *suppressed* — `server/brain-io.ts:229-245` detects them and `server/brain-io.ts:248` sets the 900 s retry deadline that `server/brain-projector.ts:1151-1156` enforces; a retry line that later produces output is still ordinary transcript text for the projector. We likewise never resend a prompt `[VERIFIED paseo-agy-acp/server/session.ts:327-447 — no retry input exists, per audit §5.3]`.

---

## 8 Delta table

Only mechanisms where the two bridges actually differ. Cost: S ≈ <1 day, M ≈ 1–3 days, L ≈ >3 days of work in our repo.

| # | Mechanism | Theirs (constant; site) | Ours (`path:line`) | Gap | Cost |
|---|---|---|---|---|---|
| 1 | Turn liveness clock | `TURN_TIMEOUT_MS` 300 000 ms, re-armed on every `session/update`, expiry = `fail` + `dropFromPool` + `stop()` [`index.mjs:151`, `Turn.rearm`, `Proc.timeoutTurn`] | none; `session/prompt` outside `transport.request()` [`server/session.ts:2410` vs `server/transport.ts:332`] | **Critical** — the reported defect, unbounded | M |
| 2 | Client-tool budget | switches to `TOOL_RESULT_TIMEOUT_MS` 1 800 000 ms when `hasPendingMcp()`; detached base = `clientProgressAt` [`index.mjs:152`, `Turn.rearm`] | tool wait is "progress": `isWaitingOnUser` resets `lastActivity` [`server/brain.ts:994`] | **Critical** — no bound at all | M |
| 3 | Detached-client eviction | `DETACHED_EVICT_MS` 30 000 ms, pool-pressure only, oldest `clientProgressAt` first, then `reclaimStaleTurn` + `proc.stop()` [`index.mjs:146`, `evictLRU`] | a disconnected HTTP client has no effect on the turn; no eviction concept | **High** — a lost client leaves the turn alive on the transcript clocks only | M |
| 4 | Late tool result rejoining the turn | 150 s `IDE_CALL_DEADLINE_MS` placeholder + `#deferCall`/`#acceptWait` + `renderLateResultParts` continuation on the same turn [`index.mjs:162`, `acceptMcpCall`, `continueWith`] | turn ends at `session/prompt` return; unterminated tool is force-`completed` [`server/mapping.ts:796-799`] | **High** — we fabricate success instead of continuing | M |
| 5 | Tool double-execution guard | identical-arg repeats attach to the original call (`stableJSON`), reply from its result; mutated args are unguarded | superseded call → `canceled`, no re-issue protocol at all [`server/brain-projector.ts:728-733`] | Medium — only matters once #4 exists | S |
| 6 | Error evidence retained until end-of-turn | banner held up to 16 KiB, retry vs terminal decided in `endText`/`flushText` [`index.mjs`, `Turn.pushText`] | SQLite error discarded when `isSettled(inbox)` [`server/brain.ts:978`] | **High** — evidence-dropping by design | S |
| 7 | Real-cause extraction | `lastAgentError` regex `/\] (?:agent executor error\|failed to construct executor): (.+)$/` from the log tail after `turn.logOffset`, then quota/auth classification [`index.mjs`, `lastAgentError`, `#formatAgentError`] | `error-inspection.ts` reads SQLite steps only; no log-tail regex, no `invalid_request_error` vs `rate_limit_error` split [`server/error-inspection.ts:249-308`, `:311-331`] | Medium — error text quality and quota typing | S |
| 8 | Durable resume across restarts | `park`/`peekParked` with `historyHash` + `historyHashSansInputs` + `toolUseIdentitiesHash` + `instructionsHash`, TTL 6 h, `session/resume` [`index.mjs:155`, `peekParked`] | journal persists only `{turnId, clientMessageId, nativeId, startedAt, status}` [`server/turn-journal.ts:13-19`]; resume only in-process [`server/session.ts:1385-1397`]; post-exit poison [`server/session.ts:1447-1448`] | **High** — we cannot continue a conversation after a restart | L |
| 9 | Pool ceiling / 503 | `MAX_PROCS` 16, `evictLRU` then `BusyError → statusCode 503` [`index.mjs:138`, `acquireProcLocked`, `class BusyError`] | one transport per session, no pool, no saturation signal | Low — different deployment model (we are embedded, not multi-tenant) | L |
| 10 | Conflict instead of guess | `ConflictError` 400 + `noRetry` when the request carries a pending `tool_use` with no result [`index.mjs`, `class ConflictError`, `acquireProcLocked`] | prompt is accepted and the mismatch surfaces as a fabricated/completed tool or a dropped error | Medium — silent corruption vs loud refusal | S |
| 11 | Retry-banner suppression from user-visible text | `isAgentRetryLine` + banner hold + `droppingRetryLine` state machine [`index.mjs`, `AGENT_RETRY_BODY_PREFIXES`] | `isRetryWarning` classifies and sets a 900 s deadline; text is not suppressed [`server/brain-io.ts:229-248`] | Low — cosmetic + duplicate-line noise | S |

Rows deliberately omitted because behavior is equivalent: idempotent terminal funnel (`Turn.complete`/`fail` `done` latch vs `finishTurnOnce` `server/session.ts:638-660`); abort → canceled mapping; usage accounting.

---

## 9 Most transferable idea

**Make the turn, not the HTTP response, the unit of liveness — and give it a deadline that is re-armed by the protocol's own heartbeat, with expiry implemented as fail-and-forget rather than fail-and-hope.** Concretely: one `Turn` object owns `lastProgressAt`, `clientProgressAt`, `deadlineAt`, `timer`, `calls`, `awaitCalls`; every parsed `session/update` calls `arm()` (so `lastProgressAt` advances only on real ACP progress, never on raw stdout noise); a pending client tool switches the budget from **5 min** to **30 min** and, while the client is detached, anchors the deadline at **`clientProgressAt`** so a vanished client cannot keep renewing it; a tool that outlives **150 s** gets a *successful* placeholder whose text instructs the model to re-call with identical arguments (dedupe on `name`+`stableJSON(args)` guarantees it "does not start it twice", while the real result later re-enters the same turn); and on expiry `timeoutTurn` performs **fail + dropFromPool + stop()** in that order, so no supervisor, host, or parked record can still believe the turn is running. The three numbers to copy into `paseo-agy-acp` are 300 000 / 1 800 000 / 30 000 ms plus the 150 000 ms placeholder, and the single structural rule that makes them safe: the deadline is recomputed on every state change, and its expiry always ends in a terminal event *and* removal of the thing that could make progress.

---

## 10 Confidence and unknowns

High confidence (quoted verbatim, contiguous where line numbers are given): all constants `index.mjs:138-200`; `Turn` lifecycle (`arm`, `rearm`, `touchClient`, `complete`, `fail`, `attach`, `detach`, `hasPendingMcp`); `Proc.#onNotification`, `timeoutTurn`, `acceptMcpCall`, `#acceptWait`, `#deferCall`, `updateTools`; `lastAgentError`, `#formatAgentError`, `class AgentTurnError`, `class BusyError`, `class ConflictError`; `park`/`unpark`/`peekParked`/`consumeParked`/`resumeFailureReason`; `staleTurnVerdict`/`lineageVerdict`/`replayHistoryProblem`/`reclaimStaleTurn`/`recoverStaleTurn`/`evictLRU`/`acquireProcLocked`; `afterAgentErrorResponse`; banner prefix tables and `pushText`/`endText`/`flushText`; our `turn-journal.ts:85-140` and `session.ts:1358-1479`.

Method limits: the repo is a single 7,227-line module; GitHub's blob view serves only lines 1–1000 and raw text has no gutter, so **line numbers for anything past line 1000 could not be verified** and are given as method anchors. `grep -n` on the verbatim strings quoted above resolves them exactly. No build or test was run; nothing in our repo was modified.

UNKNOWN / not proven:
1. **`LOG_TAIL_BYTES`** value and the tail-read cost per failed turn — referenced in `lastAgentError`, defined outside the slices read.
2. **The README's "a new tool added mid-turn forces replay in a new session."** Source shows tools are excluded from every compatibility hash and `updateTools` merely announces `tools/list_changed`; the replay we can prove comes from `lineageVerdict === "fork"` or `why: "history"`. Whether `#announceTools` itself can force a rebuild (e.g., agy rejecting a mid-turn tool-set change) is not visible.
3. **`instructionsPlacement`** body (inline vs session-level instruction placement) — only call sites read; it gates `peekParked` and `modeSwitch` rebuilds.
4. **Where `detach()` is invoked** (presumably the HTTP/SSE abort path) and whether a mid-stream abort has any other side effect on the turn.
5. **`#runTurn`'s exact terminal sequence** after `turn.agentError` (ordering of `AgentTurnError` throw vs `finalizeTurn`/`park`) — the call site `if (detail) throw this.#formatAgentError(detail)` was visible, the full `catch` was past the read window.
6. **`#selfPollCapped` / `#capSelfPoll`** bodies — the constants (8 polls, 20 min) and `SELF_POLL_NOTE` are verified; the exact counter reset rule is not.
7. Our-side line numbers taken from `docs/research/agy-acp-stale-run-audit.md` (§3/§5) were not re-read in this pass; they were cited as-is.
