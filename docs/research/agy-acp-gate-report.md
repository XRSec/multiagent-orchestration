# ACP Turn-Termination Gate Report

CI sentinel: `moci`. Package under test: `paseo-agy-acp/`.
This file is the physical record of five adversarial gate rounds run against the P0 turn-termination invariant and the P1 two-clock follow-up. Verdicts are not upgraded between rounds.

## 1. Scope

- **P0 invariant** (manifest `## In Progress: ACP Turn Termination Invariant (P0)`): a turn MUST NOT be surfaced as `running` or `completed` without positive terminal evidence; absent positive terminal evidence the turn is `failed`. Positive evidence is an ACP terminal `stopReason`, a provider transcript terminal row, or a transport exit/EOF.
- **P1 two-clock** (follow-up to the P0 residual false-stall risk): turn-silence clock (`turnStallTimeoutMs`, default 120s) and tool clock (`toolStallTimeoutMs`, default 600s), with UI "still running" notices every `toolNoticeMs` (default 60s). While a tool runs, the turn-silence clock is frozen; the tool clock is driven by the oldest running tool.
- **Audit/gate relationship:** `docs/research/agy-acp-stale-run-audit.md` identifies the defect coordinates and insertion points; this report records whether the shipped code actually closes them. The gate verifies code, not the implementer narrative.

## 2. Round 1 — P0, first gate

**Verdict: FAIL**

Gate stages (`npm run verify`, Node v26.13.1):

| Stage | Exit | Result |
|---|---|---|
| `npm run format:check` | **1** | 3 files unformatted: `server/session.ts`, `server/turn-journal.ts`, `tests/turn-terminal-invariant.test.ts` |
| `tsc --noEmit` | 0 | clean |
| `node --test` | 0 | `tests 443 / pass 443 / fail 0` |
| `npm pack --dry-run` | 0 | 33 files, 147.0 kB |

The implementer reported `npm run check` + `npm test`, not `verify`; manifest M3 requires `verify` exit 0. Two FAIL-class defects survived:

1. **Fabricated success on the subagent path.** `server/brain.ts:1090` (`finishTurn`) called `Timeline.terminalize(state, error)` with no `runningFails`; a tracked-running tool was emitted `completed` with `error: null`. Live path: `server/subagents.ts:154-171` wires `watchBrain` for child sessions and forwards `session.turn`.
2. **Unbounded user-wait renewal.** `server/session.ts:2367-2369` (Round 1 pin) set `turnLastProgressAt = Date.now()` on every watchdog tick while `permissions.size > 0 || hasRunningChildren()`, so an unanswered approval renewed the deadline forever and the prompt await could hang.

Isolated stability of the new file `tests/turn-terminal-invariant.test.ts`: 3 runs, 6/6 pass each. Test accounting: this change contributed +6 tests; the 405 anchor was stale (HEAD already reported ≈437).

## 3. Round 2 — P0 re-gate

**Verdict: WARN**

- Gate: `format:check` 0, `tsc` 0, `node --test` 446/446, `pack` 0. Stability 111/111 x3.
- **FAIL-1 closed:** `server/brain.ts:1090-1093` passes `runningFails: state === 'completed'` + `runningError`; a running tool always resolves to `failed`, never `completed`/`error:null`. The sequence "running tool + completed planner response ⇒ tool fabricated completed" was disproved.
- **FAIL-2 closed:** `server/session.ts:2384-2389` sets `pausedAt` without touching `turnLastProgressAt`; `:2409-2414` restarts a full fresh deadline on wake; `:2391-2407` bounds a running child to one deadline.
- **WARN — predicate divergence:** `server/brain.ts:1101-1103` accepted `type === 'PLANNER_RESPONSE' && !Array.isArray(tool_calls)` instead of the canonical `isCompletePlannerResponse` (`server/brain-io.ts:90-102`), which requires `status === 'DONE'`.
- **WARN — heartbeat/liveness:** `server/session.ts:914` refreshed liveness for every notification; no absolute turn-duration cap, so keepalive traffic could sustain a zombie turn.
- **Reachability downgrade:** `server/brain-projector.ts:728-734` cancels every pending `callId` tool when a later `PLANNER_RESPONSE` is projected; `finishTool` reuses `pending.id` (`:410, :556, :770`), so `timeline.track` deletes it. The integrated weak-evidence scenario is unreachable in normal projection.

## 4. Round 3 — P0 final

**Verdict: WARN**

- **Canonical predicate confirmed:** `server/brain.ts:1101` calls `isCompletePlannerResponse(node.lastStep)`. No ad-hoc completion predicate survives in `server/`; remaining `!Array.isArray` uses are the canonical check (`server/brain-io.ts:96`) and unrelated media/record/content helpers.
- **Both-direction tests:** `tests/turn-terminal-invariant.test.ts:404-431` asserts non-`DONE` rejected, `DONE` + `tool_calls: []` accepted, `DONE` + real tool calls rejected. Reachability claim independently confirmed against the projector (see Round 2).
- **SDK member verification:** all 8 `TURN_PROGRESS_UPDATES` members exist verbatim in `node_modules/@agentclientprotocol/sdk/dist/schema/types.gen.d.ts:2854-2868` (`user_message_chunk`, `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`, `plan_update`, `plan_removed`). No misspelling; `tsc` also enforces the union.
- Gate: all stages 0, `tests 449 / pass 449`. Stability 114/114 x3.
- **Residual WARN:** a genuinely long tool with no ACP updates for `turnStallTimeoutMs` (default 120s) is falsely failed and interrupted; no tool exemption. Reachability UNKNOWN (see §7).

## 5. Round 4 — P1 first gate

**Verdict: WARN**

- **Gate:** `format` 0, `tsc` 0, `pack` 0; **`node --test` exit 1 — 453/454**. Failing test: `tests/brain.test.ts:3089` "watcher retries recover without failed events, while cancellation and exhaustion stay distinct" (assertion `:3109`, `handle.isRunning() === true`). Isolated rerun and a full rerun passed 454/454. Classified load-sensitive at the time.
- **Two-clock semantics PASS:** turn-silence refresh gated on `tools.length === 0` (`server/session.ts:2428-2435`); tool clock from the oldest `startedAt` (`:2461-2470`); turn clock restarted at a full deadline when the last tool settles (`:2500-2505`); `runningTools()` at `server/mapping.ts:778-788`; `startedAt` preserved across updates (`server/mapping.ts:764-772`).
- **Notice contract:** `notification` is a real `ProviderTimelineItem` member at `node_modules/@getpaseo/plugin/dist/server/provider.d.ts:521-525` with `level: "info" | "warning" | "error"` and `message`. Emitted via `emit`, never `update()`; unique ids; message includes tool name and elapsed. Host-side rendering not verifiable in this repo.
- **Fixture move legitimate:** `tests/mock-acp.ts:335-338` makes `hang` a genuinely tool-free turn; the P0 no-tool test (`tests/turn-terminal-invariant.test.ts:101-129`) and P1 test (`tests/two-clock-tool-budget.test.ts:252-278`) still exercise turn silence. Not a weakening.
- **WARN — progress classification:** `subagent_update` and `session_message` were classified progress though both can be metadata-only.
- **WARN — multi-tool mislabelling:** on a failed turn the tool card received the turn diagnostic (`server/session.ts:681-684` + `server/mapping.ts:805-809`); with several running tools, non-owners could carry the expired tool's name/elapsed.

## 6. Round 5 — P1 final, serial

**Verdict: WARN (safe to ship alongside P0)**

- **Per-tool attribution PASS:** `server/session.ts:2485-2489` stores `turnToolFailure = { id, error }` naming the owner's own name + elapsed; `server/session.ts:686-697` gives the owner `failure.error` and every other running tool exactly `"Turn ended while this tool was still running"`; no marker falls back to prior turn-level behavior. `server/mapping.ts:832-838` applies the resolver. Test `tests/two-clock-tool-budget.test.ts:224-283` uses two genuinely concurrent tools (`tests/mock-acp.ts:339-362`: alpha first, beta +50ms, both `in_progress`) and asserts no cross-contamination. P0 single-tool message unchanged.
- **Classification PASS:** `server/session.ts:143-160` makes `subagent_update` and `session_message` liveness-only and keeps `session_message_chunk` as progress, with the rule stated once (a member is progress only if its payload cannot be empty of work). Test `tests/two-clock-tool-budget.test.ts:285-312` uses metadata-only `subagent_update` traffic (`tests/mock-acp.ts:363-380`) and asserts failure at the turn clock. Trade-off: excluding `session_message` risks a false stall if agy delivers work exclusively as a complete `session_message`.
- **Test-change integrity PASS:** `tests/brain.test.ts:3105` retry budget 80→500ms, assertion `:3109` unchanged, and `:3127-3144` still asserts exact recover/cancel/exhaust terminal states and no error item. `tests/interrupt.test.ts:298-315` polls for a specific `cancel` log event; assertions (one start, at least one cancel, no load) unchanged; cancel remains notification + bounded convergence.
- **Causation verdict SOUND:** `server/brain.ts:1083-1113` `finishTurn` is fully synchronous (`terminalize`, `some`, `isCompletePlannerResponse`, `emit`); no await/IO; journal writes live in `server/session.ts`. P0/P1 added no async work to the brain watcher.

Determinism (serial, nothing else running):

| Run | Exit | Tests | Pass | Fail |
|---|---|---|---|---|
| `npm run verify` (format/check/test/pack) | 0 / 0 / **1** / 0 | 456 | 455 | 1 |
| Full `npm test` #1 | 0 | 456 | 456 | 0 |
| Full `npm test` #2 | 0 | 456 | 456 | 0 |
| Full `npm test` #3 | 0 | 456 | 456 | 0 |

The single verify-run failure was `tests/transport.test.ts:12` (assertion `:59`, "detached command must not execute after ACP shutdown"). `server/transport.ts` is untouched by P0/P1; three subsequent serial full-suite runs passed 456/456. Five-file stability set (`two-clock-tool-budget`, `turn-terminal-invariant`, `interrupt`, `mapping`, `brain`) x3: 121/121 each.

Touched set confirmed: modified `server/brain.ts`, `server/mapping.ts`, `server/preflight.ts`, `server/session.ts`, `tests/brain.test.ts`, `tests/interrupt.test.ts`, `tests/mapping.test.ts`, `tests/mock-acp.ts`; untracked `server/turn-journal.ts`, `tests/turn-terminal-invariant.test.ts`, `tests/two-clock-tool-budget.test.ts`. Nothing else in `paseo-agy-acp/`.

## 7. Residual risks

| # | Risk | Evidence | Reachability |
|---|---|---|---|
| R1 | A genuinely long tool with no ACP updates for `turnStallTimeoutMs` (default 120s) is falsely failed and the runtime interrupted; no tool exemption. | `server/session.ts:2389` (Round 4 pin; line shifted after Round 5 edits); exemptions only at `:2436` (permission) and `:2443` (child). | **UNKNOWN**: depends on whether agy emits `tool_call_update` during a multi-minute command. [NOT RE-VERIFIED THIS SESSION] for the current line pin. |
| R2 | No absolute turn-duration cap; keepalive `sessionUpdate` traffic can sustain a turn indefinitely. | `server/session.ts:914` (Round 3 pin; shifted by the Round 5 comment expansion) refreshes progress on every notification; `TURN_PROGRESS_UPDATES` at `server/session.ts:143-160`. | Plausible in normal traffic; depends on provider keepalive emission. |
| R3 | Excluding `session_message` from progress risks a false stall if agy delivers work only as a complete session message (no chunks). | `server/session.ts:143-160`; SDK `SessionMessage` content is optional (`types.gen.d.ts:3801-3836`). | **UNKNOWN**: depends on agy emission. |
| R4 | Settle-phase idle clock still renews while waiting on user; an unanswered permission during settle can suspend indefinitely. | `server/brain.ts:858`, `server/brain.ts:995-1001` (Round 3 pin); reached from `server/session.ts:2568` inside the turn try block. | Plausible; user-wait suspension is sanctioned by AC-1, but there is no total cap. [NOT RE-VERIFIED THIS SESSION] after the P1 edits. |

Environmental (not a P0/P1 invariant risk): the `tests/transport.test.ts:59` process-group shutdown flake, and the earlier `tests/brain.test.ts:3089` load-sensitive flake.

## 8. Evidence standard

- **Verdicts from reading code:** the invariant/fail-closed paths, watchdog and two-clock arithmetic, per-tool attribution, progress classification, journal behavior, cancel semantics, and the causation claim were established by reading the cited files.
- **Verdicts from running commands:** all gate stage exits/counts, the 3-run stability sets, and the determinism table were produced by executing `npm run verify`, `npm test`, and `node --test` in `paseo-agy-acp/`.
- **Verdicts from reasoning:** the reachability chains (projector cancellation + tool-id reuse; timer teardown) were derived by reading, not by fault injection.
- **Unverified in this session (marked rather than asserted):**
  - Host-side rendering of the `notification` timeline item. The union member is confirmed at `provider.d.ts:521-525`, but the Paseo host renderer is not in this repository.
  - agy emission behavior: whether long tools emit `tool_call_update`, and whether `subagent_update`/`session_message` are used as sole work signals. This determines R1–R3 and would be settled by a captured ACP trace of a multi-minute tool and of a long provider turn.
  - Line pins explicitly marked `[NOT RE-VERIFIED THIS SESSION]` in §7 may have shifted after later edits; the named symbols and behavior are authoritative.

## Model-Open Fallback (2026-11-17)

Verdict: **FAIL** — `isUnavailableStoredConfig` is over-broad and swallows authentication and quota/capacity errors into a silent model fallback.

### Predicate probe (`server/session.ts:2124`)
Requires `/model|thinking|thought_level/` AND one of `unknown model`, `model not found`, `not supported`, `unavailable`, `invalid`.

| Candidate | Result | Correct? |
|---|---|---|
| `Invalid API key for model gemini-4-hydrogen` | true | NO — auth swallowed (FAIL) |
| `permission denied for model` | false | yes |
| `billing account not enabled for model` | false | yes |
| `model capacity exhausted` | false | yes |
| `model quota exceeded` | false | yes |
| `model temporarily unavailable` | true | NO — quota/capacity swallowed (FAIL) |
| `invalid request: model parameters` | true | NO — request validation swallowed |
| `model input too long` | false | yes |
| `unsupported model output format` | false | yes |
| `ACP request timed out` | false | yes |
| `Session closed before open` | false | yes |
| `AbortError` | false | yes |
| `Unknown model ID: gemini-4-hydrogen` | true | yes |
| `model not found` | true | yes |
| `model is not supported` | true | yes |

### Checks
- G1 PASS: `applyStoredConfigOption` rethrows unless predicate matches (`:2160`); no bare catch on open path (catch{} sites are idle sync/watcher only); `formatErrorMessage` surfaces `error.data.details` (`common.ts:159`; observed `data: { details: 'ACP runtime exited during config apply' }`).
- G2 PASS: `session.configure` calls `configureSession(session, input.changes)` with no `fallbackStored`/`strictThinking`, so it is strict; the explicit-switch test rejects AND then completes a prompt turn, proving the session is usable.
- G3 PASS: entries order is model then thought_level; open passes `strictThinking:false`; unadvertised/invalid stored thinking is skipped via `:2205`/`:2209` and reported, not fatal.
- G4 PASS: `publishConfig` emits `configState(state.metadata)` populated from agy's effective `currentValue`; reload/`revert` build `previousMetadata` from the already-effective `state.metadata`, so the dead id is not re-applied from the cached copy.
- G5 PASS: notice buffered in `pendingConfigFallbacks` while `!state.opened`, flushed once after `session.opened` (`:321`); id `${id}:config-fallback:${key}:${stored}`; emitted as `timeline.item`/`notification`, never a turn/tool event; reloads carry effective config so no duplicate.
- G6 PASS: mode branch does `const applied = await ...; configChanged ||= applied` then continues, so the mode apply is not short-circuited by `||=`.
- G7 PARTIAL: mock flags reject only under their flags/matching values; tests 1 and 2 genuinely fail if production fallback is removed. Tests 3 and 4 are negative controls that pass by design. No test covers the auth/quota false-positive class.
- G8 PASS: `npm run verify` exit 0 (format:check 0, check 0, test 0 = 461/461 pass, pack 0).
- G9 PASS: 3x targeted suite 54/54 exit 0 each; full `npm test` twice 461/461 exit 0 (~30s each); no leaked `node --test` processes.
- G10 PASS within package: exactly `server/session.ts`, `tests/mock-acp.ts`, `tests/open-config-fallback.test.ts`. Monorepo-level `AGENTS.md` and `paseo-bots/*` changes are outside this package and unrelated to this change set.

Ship: **No** — constrain the predicate to genuine availability text (or explicitly exclude api key/auth/quota/request-validation errors) and add coverage for those cases first.

### Round 2 (re-verification, 2026-11-17)

Verdict: **PASS**. The predicate is now a denylist-then-phrase-match and no auth/quota/request error falls through.

Final predicate: reject if any `NON_AVAILABILITY_TERMS` substring (`api key`, `unauthorized`, `forbidden`, `permission`, `credential`, `oauth`, `sign in`, `sign-in`, `billing`, `quota`, `capacity`, `rate limit`, `429`, `resource_exhausted`, `overloaded`, `exhausted`, `invalid request`, `bad request`, `too long`, `temporarily`); otherwise match a model/thinking availability phrase. Probe executed mechanically against the final code.

| Candidate | Result | Correct? |
|---|---|---|
| `Unknown model ID: gemini-4-hydrogen` | true | yes |
| `Unrecognized model name: x` | true | yes |
| `Unsupported model: x` | true | yes |
| `model gemini-4-hydrogen not found` | true | yes |
| `model is not supported` | true | yes |
| `model does not exist` | true | yes |
| `model is no longer available` | true | yes |
| `Invalid API key for model x` | false | yes (not swallowed) |
| `Unauthorized: model access denied` | false | yes |
| `permission denied for model` | false | yes |
| `model quota exceeded` | false | yes |
| `model temporarily unavailable` | false | yes |
| `RESOURCE_EXHAUSTED: model capacity` | false | yes |
| `429 Too Many Requests for model` | false | yes |
| `invalid request: model parameters` | false | yes |
| `model parameters too long` | false | yes |
| `ACP request timed out` | false | yes |
| `Session closed before open` | false | yes |
| `AbortError` | false | yes |
| thinking: `Invalid thought_level: high` | true | yes (thinking branch) |

False-negative probes (all resolve false, blocked by denylist): `model not found in this capacity` (capacity), `model unavailable for this permission tier` (permission), `billing model unsupported` (billing), `model not found (rate limited fallback)` (rate limit). All are contrived or denote quota/entitlement conditions that should surface; dismissed as non-risks. Residual: `model temporarily removed` is blocked by `temporarily` (transient, surfacing is acceptable), and a plain `invalid model id: ...` does not match a phrase (deliberate: bare `invalid` was the Round-1 false-positive vector); noted, not a genuine account-scoped removal message.

- R2 PASS/WARN-note: `temporarily` blocks `model temporarily removed`; acceptable because transient removal should surface rather than silently substitute. `permission`/`capacity`/`429` incidental hits only occur in entitlement/quota/rate-limit messages where rethrow is correct.
- R3 PASS: each of the four negative controls asserts the original error text, zero `session.opened` events, and zero notification items (all three assertions present).
- R4 PASS: package touched set is exactly `server/session.ts`, `tests/mock-acp.ts`, `tests/open-config-fallback.test.ts`. Hunk set covers the same open/reload/notice/configure regions as Round 1; the only expansion is the predicate block. Open path, notice buffering, write-back, `||=` fix, ordering and catalog logic are unchanged (fallback branch read and verified identical).
- R5 PASS: `format:check` 0, `check` 0, `test` 0 = 466/466 pass, `pack` 0. `node --test tests/open-config-fallback.test.ts` 3x: 10/10 exit 0 each. Full `npm test` 2x: 466/466 exit 0 (~28-29s). No leaked test processes.

Ship: **Yes** — safe to ship; no auth/quota/request error is swallowed and no plausible genuine availability message is newly blocked.

## Gate Round 6 — Attempt Rows & False Failure

Changeset: uncommitted working tree of `paseo-agy-acp/` — `server/error-inspection.ts` (+139/-6), `server/session.ts` (+14/-1), `tests/mock-acp.ts` (+62), untracked `tests/error-inspection-attempts.test.ts` (312 lines, 6 tests), `docs/reference.md` (+2). Pre-existing dirty paths outside `paseo-agy-acp/` ignored. Gate read-only on `server/`; no source file modified by this round.

**Verdict: FAIL**

### AC verdict

| AC | Verdict | Evidence |
|---|---|---|
| AC1 completed never downgraded; inspect only on `failed`/`refusal`; refusal → failed; unknown/missing stopReason → failed | PASS | `server/session.ts:3029-3041` gates inspection on `status === 'failed' \|\| result.stopReason === 'refusal'`; `mapTerminalStopReason:3087-3106` returns `completed` only for `end_turn`/`max_tokens`/`max_turn_requests`/`refusal` and `failed` otherwise; `refusal` + no inspection yields `REFUSAL` and sets `failed` (`buildTurnError` probe). Integration tests at `tests/error-inspection-attempts.test.ts:233-312` pass. |
| AC2 scoring + reject frames/bare UUIDs/hex/short/replacement runs; fallback `Upstream provider error (step_type=17)` | **FAIL (partial)** | Frame rejection works (`b$`/`3b$` absent from all 23 real blobs). But selected text still contains a **bare UUID and protobuf framing bytes** in 22/23 real blobs: `rAPI error (attempt 1): … on the server2+0a116210-035a-465f-9b50-618c1a638b58-2-2010`. Repro: `selectBlobErrorText('rAPI error (attempt 1): UNAVAILABLE (code 503): No capacity available on the server2+0a116210-035a-465f-9b50-618c1a638b58-2-2010')` returns the string unchanged. `identifierRun` only rejects runs that *are* a UUID/hex, not runs containing one. |
| AC3 retryable tokens; Retry-After/retryDelay/quotaResetDelay → retryAfterMs; diagnostic keys unchanged | PASS | Probes: `Retry-After: 30` → `retryAfterMs 30000`, `resetAt` derived; `retryDelay:"1m30s"` → `90000`; `UNAVAILABLE/503/capacity/high traffic` → `retryable:true`; EOF not in the claimed token set → `retryable:false` (test asserts this). `buildTurnError` diagnostic literal untouched by the diff (`quotaExhausted`, `retryable`, `resetAt`, `retryAfterMs`, `stopReason`). |
| AC4 skip 17 rows followed by terminal 15/status=3 before next 14 | PASS (caveats) | Probe A (17@1+15@2 status3) → `undefined`; B (15 status2) → error retained; C (17@1,14@2,15@3) → error retained; D (17@1,15@5,14@3) → error retained; F (17 only) → error retained. Window SQL uses strict `idx > ?` / `idx < upper` (no off-by-one). Caveat: when the `status` column is absent, any 15 row counts as terminal (probe E → skipped), and with no later 14 row the scan runs to end of DB. |
| AC5 interrupt fast path when settled; initial idle keeps native cancel | PASS (side effect flagged) | Guard `server/session.ts:1960-1967`: `!state.turn && state.turnFinished && !state.interrupting && permissions.size === 0 && !subagents.hasRunningChildren()`. `tests/interrupt.test.ts:271-315` proves a never-prompted session still emits native `cancel` (no relaunch). Mid-turn interrupts still relaunch (`tests/interrupt.test.ts:39-130`). See R2 for the post-settle background-work gap. |
| AC6 six coverage items | PASS (fidelity gap) | 6/6 tests present and green: attempt skip, window boundary, UUID-only fallback, 503/EOF, completed integration (233), failed integration (268). Fixture `tests/error-inspection-attempts.test.ts:35-41` stops at `uuidFrame()+CAPACITY` and omits the real protobuf tail, so the bare-UUID leak is not covered. |
| AC7 no assertion/test weakened | PASS | `git diff --stat tests/` = `tests/mock-acp.ts +62` only, purely additive; `git diff tests/interrupt.test.ts tests/mapping.test.ts` empty. Suite excluding the new file: 466/466 exit 0. |
| AC8 docs reflect semantics | **FAIL (partial)** | `docs/reference.md:98` states frames, **bare UUIDs** and hex runs "never become the user-visible message" — falsified by the real blobs above. Same paragraph says an "idle … session acknowledges immediately", contradicting the retained native-cancel path for initial idle sessions in the same change. |

### Empirical blob check (real DBs, production path `inspectConversationError` on one-row temp fixtures seeded with the actual `step_payload`)

Frame leak = `b$<uuid>`/`3b$<uuid>` present in selected message. Bare = UUID substring present.

| Session | idx | Selected text (truncated) | code | retryable | frame leak | bare UUID |
|---|---|---|---|---|---|---|
| 466f2ea4 | 2 | `rAPI error (attempt 1): UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-high on the server2+0a116210-…-2-2010` | UNAVAILABLE | true | no | **yes** |
| 466f2ea4 | 3 | same shape, attempt 2 | UNAVAILABLE | true | no | **yes** |
| 466f2ea4 | 14 | same shape, attempt 1, `…-14-2010` | UNAVAILABLE | true | no | **yes** |
| 466f2ea4 | 25 | same shape, attempt 1, `…-25-2010` | UNAVAILABLE | true | no | **yes** |
| 466f2ea4 | 26 | same shape, attempt 2, `…-26-2010` | UNAVAILABLE | true | no | **yes** |
| 466f2ea4 | 31 | same shape, attempt 1, `…-31-2010` | UNAVAILABLE | true | no | **yes** |
| 466f2ea4 | 46 | same shape, attempt 1, `…-46-2010` | UNAVAILABLE | true | no | **yes** |
| 466f2ea4 | 53 | same shape, attempt 1, `…-53-2010` | UNAVAILABLE | true | no | **yes** |
| 466f2ea4 | 115 | `API error (attempt 1): request failed: Post "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse": EOF2(0a116210-…-115` | — | false | no | **yes** |
| 3595a8a7 | 41 | `qAPI error (attempt 1): UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-low on the server2,b138b298-…-41-2010` | UNAVAILABLE | true | no | **yes** |
| 3595a8a7 | 42 | attempt 2, same tail | UNAVAILABLE | true | no | **yes** |
| 3595a8a7 | 43 | attempt 3, same tail | UNAVAILABLE | true | no | **yes** |
| 3595a8a7 | 44 | attempt 4, same tail | UNAVAILABLE | true | no | **yes** |
| 3595a8a7 | 45 | attempt 5, same tail | UNAVAILABLE | true | no | **yes** |
| 3595a8a7 | 46 | attempt 6, same tail | UNAVAILABLE | true | no | **yes** |
| 3595a8a7 | 47 | attempt 7, same tail | UNAVAILABLE | true | no | **yes** |
| 3595a8a7 | 48 | attempt 8, same tail | UNAVAILABLE | true | no | **yes** |
| 3595a8a7 | 49 | `No capacity available for model gemini-3.8-flash-low on the server` (embedded-JSON branch wins; also parses `high traffic` + `503`) | MODEL_CAPACITY_EXHAUSTED | true | no | no |
| 3595a8a7 | 55 | `qAPI error (attempt 1): … flash-low … -55-2010` | UNAVAILABLE | true | no | **yes** |
| 3595a8a7 | 56 | attempt 2 | UNAVAILABLE | true | no | **yes** |
| 3595a8a7 | 57 | attempt 3 | UNAVAILABLE | true | no | **yes** |
| 3595a8a7 | 58 | attempt 4 | UNAVAILABLE | true | no | **yes** |
| 3595a8a7 | 59 | attempt 5 (frame is `b$9a984e3a-…`; stripped) | UNAVAILABLE | true | no | **yes** |

Pre-change baseline on the same 23 blobs (old first-readable-run algorithm): the selected message was the `b$<uuid>` frame itself in 21 cases, and `$b138b298-…` in idx 49. The changeset removes the frame class, but does not remove the UUID/framing tail; the AC2 sentence "never an identifier" is therefore not met. Leaks are a strict improvement over HEAD, not a regression.

### Falsification

- **False-failure (completed turn + mid-turn 17 row):** `attempt-503-complete` (mock writes a status=3 17 row, then returns `end_turn`) → terminal `completed`, `error === undefined` (test 233-266, green). Under the old gate the same fixture invokes inspection (17 row with a `b$uuid` + capacity blob, no later 15 row) and would set `failed`; the test is a genuine detector of the old behavior.
- **Inversion (no terminal evidence):** `attempt-503-fail` returns `unknown_upstream` → terminal `failed` with the capacity message (test 268-312, green). With all 17 rows skipped (probe A/G), `buildTurnError('unknown_upstream', undefined, …)` returns `undefined` and `status` stays `failed` (mapped at `session.ts:3087-3106`); a skipped row cannot manufacture a completion.
- **Cancel:** (a) brand-new idle — native `cancel` recorded, single runtime start, no load (`tests/interrupt.test.ts:271-315`, green in both runs). (b) settled + pending permission — guard requires `permissions.size === 0`; `resetTurnState:2567` cancels permissions at turn end and `session.test.ts:158-164` proves late permissions are cancelled even in full-access mode. (c) settled + running child — guard requires `!hasRunningChildren()`. (d) mid-turn background owner — still takes the slow path and relaunches (2 runtime starts, `interrupt.test.ts:39-130`). Not silently no-op except case R2 below.
- **Parser rejection controls (direct):** `frame_b`, `frame_3b`, `bare_uuid`, `hex_run`, `short`, `replacement_heavy` all return `undefined`. Counterexample: a frame embedded mid-run after >2 prefix chars (`monthb$<uuid>API error 503 capacity`) survives selection because `stripIdentifierPrefix` is start-anchored only.

### Determinism / regression scope

| Run | Exit | Tests | Pass | Fail |
|---|---|---|---|---|
| `npm test` #1 | 0 | 472 | 472 | 0 |
| `npm test` #2 | 0 | 472 | 472 | 0 |
| `npm run verify` (format/check/test/pack) | **0** | 472 | 472 | 0 |
| `node --test` excluding new file | 0 | 466 | 466 | 0 |
| New file alone | 0 | 6 | 6 | 0 |

Delta vs 466 baseline = 6 = new file's tests exactly. No red test, no flake sample in two serial runs. No leaked test processes observed.

### Findings (severity-ranked)

1. **P1 — bare UUID + protobuf framing bytes are user-visible (AC2/AC8 falsified).** 22/23 real blobs yield `rAPI error … server2+<uuid>-<idx>-2010`. `identifierRun` does not reject a run that merely contains an identifier; the run regex cannot distinguish text from printable protobuf tag/length bytes. User-facing `error.message` contains an internal trajectory UUID and a leading length byte. Fix direction: terminate the selected run at the first protobuf tail marker (e.g. `\d{1,3}[,+]?\d*[0-9a-f]{8}-…` / `[0-9a-f]{8}-[0-9a-f]{4}-` occurrence) or validate the run as a sentence; add a fixture replaying a full real blob, not `uuidFrame()+CAPACITY`.
2. **P1 — post-settle interrupt no-ops over live background work.** Guard at `server/session.ts:1960-1967` returns before the `hasActiveBackgroundWork` probe and before `subagents.cancelRunning()`/relaunch (`:1973-2012`). `resetTurnState:2554-2570` sets `state.turn = ''` and leaves `turnFinished = true`, so the fast path is the normal post-turn state; the slow path exists precisely to stop background owners ("Native session/cancel leaves background tasks alive"). Repro path: settle any turn that left a background task, call `session.interrupt` → returns immediately, runtime is not replaced, task survives. No test covers settled-turn + background work (`interrupt.test.ts:39` interrupts mid-turn).
3. **P2 — legacy schema over-skip.** Without a `status` column, `attemptFollowedByAssistant` drops the `status = 3` predicate and any later 15 row counts as terminal (probe E). A non-terminal planner row can hide a real 17 error.
4. **P2 — window is unbounded when no later 14 row exists.** `upper === undefined` searches to end of DB, so a planner row from a later wakeup/continuation can mask a terminal error row of the current turn (probe G shows two 17 rows both suppressed by one trailing 15 row).
5. **P3 — `status = 3` magic number** at `server/error-inspection.ts:379,426`; step types are named, status is not. Dead predicate `!state.interrupting` at `server/session.ts:1963` (already returned at `:1953`).
6. **P3 — docs overstate** (`docs/reference.md:98`): bare-UUID rejection and "idle acknowledges immediately" are not accurate as written.

Ship: **No** until finding 1 is addressed (explicit gate criterion: any leaked UUID = FAIL). Findings 2-4 are correctness/containment risks to fix or document; the completed→failed downgrade itself and the unknown-stopReason invariant are sound.

### Round 6 re-gate

Round 1 FAIL findings are preserved above and not rewritten. Changeset at re-gate: `server/error-inspection.ts` +212/-7, `server/session.ts` +51/-9, `tests/error-inspection-attempts.test.ts` 9 tests (extended with verbatim hex blobs), `tests/mock-acp.ts` +62 (unchanged since Round 1), `docs/reference.md` +3/-1. Read-only on `server/`; no source file modified by this round. Node v26.13.1.

**Verdict: WARN (safe to ship; no Round-1 FAIL condition remains)**

#### C1 — empirical real-blob check (independent; working-tree `inspectConversationError` on one-row temp DBs seeded with the actual `step_payload`; `selectBlobErrorText` also run on the raw decoded text)

| Session | idx | selected / inspected message | retryable | UUID | `2+`/`server2`/`�` |
|---|---|---|---|---|---|
| 466f2ea4 | 2 | `API error (attempt 1): UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-high on the server` | true | no | no |
| 466f2ea4 | 3 | same, attempt 2 | true | no | no |
| 466f2ea4 | 14 | same, attempt 1 | true | no | no |
| 466f2ea4 | 25 | same, attempt 1 | true | no | no |
| 466f2ea4 | 26 | same, attempt 2 | true | no | no |
| 466f2ea4 | 31 | same, attempt 1 | true | no | no |
| 466f2ea4 | 46 | same, attempt 1 | true | no | no |
| 466f2ea4 | 53 | same, attempt 1 | true | no | no |
| 466f2ea4 | 115 | `API error (attempt 1): request failed: Post "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse": EOF` | false | no | no |
| 3595a8a7 | 41 | `API error (attempt 1): UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-low on the server` | true | no | no |
| 3595a8a7 | 42 | same, attempt 2 | true | no | no |
| 3595a8a7 | 43 | same, attempt 3 | true | no | no |
| 3595a8a7 | 44 | same, attempt 4 | true | no | no |
| 3595a8a7 | 45 | same, attempt 5 | true | no | no |
| 3595a8a7 | 46 | same, attempt 6 | true | no | no |
| 3595a8a7 | 47 | same, attempt 7 | true | no | no |
| 3595a8a7 | 48 | same, attempt 8 | true | no | no |
| 3595a8a7 | 49 | inspected `No capacity available for model gemini-3.8-flash-low on the server` (embedded JSON, code `MODEL_CAPACITY_EXHAUSTED`); `selectBlobErrorText` on the whole blob → `UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-low on the server` | true | no | no |
| 3595a8a7 | 55 | `API error (attempt 1): … flash-low …` | true | no | no |
| 3595a8a7 | 56 | same, attempt 2 | true | no | no |
| 3595a8a7 | 57 | same, attempt 3 | true | no | no |
| 3595a8a7 | 58 | same, attempt 4 | true | no | no |
| 3595a8a7 | 59 | same, attempt 5 | true | no | no |

`TOTAL=23, UUID_LEAKS=0, FRAME_LEAKS=0, DEBRIS_OR_REPLACEMENT=0`. idx 2 matches the claimed exact sentence. Round 1's leak is closed. Both hex fixtures are byte-identical to the real rows: `REAL_CAPACITY_HEX` 380/380 bytes, `REAL_EOF_HEX` 399/399 bytes (byte equality, not length only).

#### C2 — over-stripping (new risk)

| Input | Output | Content lost |
|---|---|---|
| Real 3595a8a7 idx 49 body (2091 chars: `Our servers are experiencing high traffic…` + `HTTP 503` + `Headers: {…}` + two JSON error objects) | `UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-low on the server` | none (headers/JSON still present in the input; selection picks the capacity sentence) |
| `Our servers are experiencing high traffic right now, please try again in a minute.` alone | unchanged | none |
| `Our servers … minute. UNAVAILABLE (code 503): No capacity available` | unchanged, both sentences retained | none |
| `Request 46471cc4-9c71-4913-8159-c6812504aecb failed with UNAVAILABLE` | `Request failed with UNAVAILABLE` | UUID removed by design; error semantics intact |
| `Failed to load ~/app-2.0.1/config.json: RESOURCE_EXHAUSTED` | unchanged | none |
| `API error: quota exceeded (code 429) after 17 retries 2026` | unchanged | none |
| `Upstream returned HTTP 503 at 12:34:56-2026` | unchanged | none |
| `model gemini-3.8-flash-highX failed` / `…highAB failed` | unchanged | none |
| `job 46471cc4-…-115-2010 timed out` | `job timed out` | step/debug suffix removed by design |
| `Trace (46471cc4-…): upstream returned 503` | `Trace ): upstream returned 503` | UUID + `(` removed, unmatched `)` left |
| `version 1.2.3-46471cc4-… rejected 503` | `version 1. rejected 503` | **`2.3-` eaten** (up to 4 non-letter chars before a UUID) |
| `Fehler: Ressource nicht verfügbar (503)` | `Fehler: Ressource nicht verf gbar (503)` | **`ü` deleted** (`NON_ASCII` is global) |

No real agy/Google message was damaged (the 23 blobs and the long body are clean). The two mangling classes are contrived/localized inputs; see residuals.

#### C3 — interrupt semantics

- No-work settled ack: both integration tests (`tests/error-inspection-attempts.test.ts:376,422`) still assert `<500 ms`, green.
- Timeout = work exists: `backgroundWorkWithin` races the probe with a 300 ms timer that resolves `true`; `.catch(() => true)` also maps probe failure to `true`. A timeout therefore takes the full cancel path. On a settled session `state.turn` is empty, so `turnAbort?.abort()` and `cancelPermissions()` are no-ops; `cancelRunning()` is empty; the second `hasActiveBackgroundWork` decides relaunch. Result with a merely slow probe is one benign `session/cancel` notification, not a killed turn; with a rejecting probe it relaunches (pre-existing fail-closed behavior). No spurious turn cancel is possible because `settled` implies no foreground turn.
- Single-flight: `state.interrupting = operation` is assigned synchronously before any await can resolve (the IIFE's first await is `backgroundWorkWithin` or `Promise.all`), and `finally` clears only `if (state.interrupting === operation)`. No dropped single-flight.
- Boundedness: only the first probe is bounded by 300 ms; the second `hasActiveBackgroundWork` in the slow path is still awaited without a timeout (pre-existing; residual R6-3).
- Initial-idle native `session/cancel`: `tests/interrupt.test.ts:271-315` passes untouched (one runtime start, `cancel` recorded, no `load`).

#### C4 — test integrity

`git diff --stat tests/` = `tests/mock-acp.ts +62` only, purely additive, unchanged since Round 1. `git diff tests/interrupt.test.ts tests/mapping.test.ts` empty. New file is untracked with 9 `test(` blocks; 466 + 9 = 475. All 9 are additions, no replacements.

#### C5 — determinism

| Run | Exit | Tests | Pass | Fail |
|---|---|---|---|---|
| `npm test` #1 | 0 | 475 | 475 | 0 |
| `npm test` #2 | 0 | 475 | 475 | 0 |
| `npm run verify` (format/check/test/pack) | **0** | 475 | 475 | 0 |

#### C6 — window bound and no-status fallback

`planner +150` (inside 200-step window) → suppressed; `planner +250` (outside) → error reported; `user +250` → error reported; no-`status` base row → reported; no-`status` + planner row → suppressed (test asserts this intent). `AGY_STEP_STATUS_DONE=3` replaces the magic number.

#### Residual risks (none is a FAIL condition)

| # | Risk | Evidence | Severity |
|---|---|---|---|
| R6-1 | Global non-ASCII deletion mangles localized messages (`verfügbar` → `verfgbar`). No observed agy payload is non-ASCII. | `server/error-inspection.ts:63` `NON_ASCII` applied in `stripFrameResidue`. | P3 |
| R6-2 | Up to 4 non-letter chars before any UUID are removed, so a legit token glued to a UUID loses its tail (`1.2.3-<uuid>` → `1.`). No real-blob occurrence. | `MAX_FRAME_DEBRIS=4`, `FRAME_DEBRIS_CHAR` loop. | P3 |
| R6-3 | Second `hasActiveBackgroundWork` in the interrupt slow path is unbounded; the 300 ms bound covers only the settled pre-check. Pre-existing. | `server/session.ts:1998-2040`. | P3 |
| R6-4 | No-`status` DBs still suppress a 17 row when any later 15 row exists (cannot distinguish terminal status); intended and asserted. | `tests/error-inspection-attempts.test.ts:341-374`. | P3 |

Ship: **yes** — Round 1's leaked UUID, framing debris and greedy interrupt skip are closed with independent evidence; all four FAIL conditions (leak, real-message over-strip, spurious cancel, red/flaky test) are clear.

### Round 6 final gate

Changeset at final gate: only `server/error-inspection.ts` (+257 diff), `tests/error-inspection-attempts.test.ts` (12 tests), `docs/reference.md` changed this round; `server/session.ts` diff is byte-identical to Round 2 (`backgroundWorkWithin`, 300 ms settled probe, `state.interrupting = operation`) and `tests/mock-acp.ts` is unchanged (+62). Read-only on `server/`.

**Verdict: FAIL** — one Round-3 regression in the R6-2 fix, found by the mandated adversarial probe.

#### What passes

- **C1 localized byte-identity: PASS.** Independent probes return the input unchanged (`out === input`) for German (`Fehler: Ressource nicht verfügbar (503)`), French (`Échec de la connexion : capacité insuffisante (503)`), Chinese (`服务器繁忙，请稍后重试 (503)`), Hebrew RTL (`שגיאה: אין קיבולת זמינה (503)`) and emoji (`Connection failed 😀 please retry (503)`). Astral emoji survive because the run regex has no `u` flag, so the surrogate pair stays inside ` -￿`. `stripBinaryArtifacts` removes only U+FFFD, C0/C1 controls (as space), lone surrogates and zero-width/bidi controls; the 20% replacement guard is evaluated on `raw` before sanitization and does not touch CJK. Bidi coverage is partial, not complete: U+061C (ALM), U+180E, U+2028/U+2029 and U+FFF9-U+FFFB are not stripped (they survive, they are not mangled).
- **C2 version case: PASS.** `version 1.2.3-<uuid> rejected 503` → `version 1.2.3 rejected 503`; `version 1.2.3:<uuid>` → `version 1.2.3 rejected 503` (the colon is also trimmed as a dangling separator). `2,` / `2(` / `2+` frame debris glued after capacity text is removed.
- **C3 real blobs: PASS.** Independent re-run over both DBs: `TOTAL=23, UUID_LEAKS=0, FRAME_LEAKS=0, DEBRIS_OR_REPLACEMENT=0`; idx 2 is exactly `API error (attempt 1): UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-high on the server`, retryable true; idx 115 clean EOF, retryable false; idx 49 clean `No capacity available for model gemini-3.8-flash-low on the server`.
- **Test integrity: PASS.** `git diff --stat tests/` = `tests/mock-acp.ts +62` only; `tests/interrupt.test.ts` and `tests/mapping.test.ts` empty diffs; new file is untracked with 12 `test(` blocks; 466 + 12 = 478.
- **Determinism: PASS.** `npm test` #1 exit 0 478/478, `npm test` #2 exit 0 478/478, `npm run verify` exit 0 478/478. Interrupt/background tests green; `server/session.ts` untouched since Round 2.

#### Adversarial probe outputs (mandated, not in the author's tests)

| Probe | Input | Output | Result |
|---|---|---|---|
| a1 `(503)` glued to UUID | `rate limited (503)46471cc4-9c71-4913-8159-c6812504aecb-3-2010` | `rate limited (` | **`(503)` consumed — FAIL** |
| a2 `(attempt 1)` glued to UUID | `capacity (attempt 1)46471cc4-9c71-4913-8159-c6812504aecb-3-2010` | `capacity (attempt` | **`(attempt 1)` consumed — FAIL** |
| a3 plain `(503)` | `rate limited (503) please retry` | unchanged | pass |
| a4 plain `(attempt 1)` | `capacity (attempt 1) please retry` | unchanged | pass |
| b1 `2,` before a number | `error: retry budget 2,503 ms exceeded` | unchanged | pass |
| b2 `2(` before a number | `error: phase 2(503) attempts exhausted` | unchanged | pass |
| b3 `2,` + UUID | `error 2,503 <uuid> rejected` | `error 2,503 rejected` | pass |

Cause: `FRAME_DEBRIS_CHAR = /[0-9+\-,()]/` and `MAX_FRAME_DEBRIS = 4` walk back over `)` `3` `0` `5` before a UUID, leaving an unbalanced `(`; for `(attempt 1)` the scan eats `)` and `1` (space stops it) and leaves `(attempt `. The only guard is `digit preceded by '.'`, which does not cover a closing paren. The new test at `tests/error-inspection-attempts.test.ts:390-408` asserts `2+`/`2,`/`2(` debris and version/colon cases but never places `(503)` or `(attempt N)` immediately before a UUID, so the regression is not covered. No real blob contains this shape (all 23 are clean), but the gate condition "any consumption of `(503)` or `(attempt N)` = FAIL" is met.

#### Residual list (final)

| # | Risk | Status |
|---|---|---|
| R6-5 | Debris class `[0-9+\-,()]` eats a legitimate closing-paren group glued before a UUID (`(503)` → `(`, `(attempt 1)` → `(attempt `). | **OPEN — FAIL driver** |
| R6-3 | Second `hasActiveBackgroundWork` in the interrupt slow path still has no timeout; only the settled pre-check is bounded by 300 ms. | **STILL OPEN** (pre-existing, P3) |
| R6-6 | Bidi/zero-width coverage is partial: U+061C, U+180E, U+2028/2029, U+FFF9-FFFB not stripped. No mangling observed. | Open (P3) |
| R6-7 | The explicit `$`-frame walk consumes up to two non-space chars before `$`, so a legit `x$<uuid>` loses `x`. No real-blob occurrence. | Open (P3) |
| R6-8 | A dangling legitimate separator before a removed UUID is trimmed (`version 1.2.3:` → `version 1.2.3`). Intended by test; minor content loss. | Accepted (P3) |
| R6-4 | No-`status` DBs still suppress a 17 row when any later 15 row exists (cannot distinguish terminal status). | Open by design (P3) |

Ship: **no** until the closing-paren consumption is bounded (e.g. stop the debris scan when the char before the UUID is `)` and the run already contains an opening `(` that would become unbalanced, or restrict debris to `[0-9+,-]` and handle the paren variants in the explicit frame path). Everything else in R6-1/C1, the 23-blob sanitization, localized byte-identity and the suite is verified green.

### Round 6 verification round 2

Changeset this round: only `server/error-inspection.ts`, `tests/error-inspection-attempts.test.ts` (13 tests), `docs/reference.md`. `server/session.ts` unchanged since Round 2 (`backgroundWorkWithin`, 300 ms settled probe, single-flight preserved); `tests/mock-acp.ts` unchanged (+62). Read-only on `server/`. Node v26.13.1.

**Verdict: PASS** — no real-message mangling, no UUID/frame/debris leak, no junk run surfaced from a plausible payload, no weakened assertion, deterministic.

#### C1 — paren termination (Round 3 FAIL closed)

| Probe | Input | Output |
|---|---|---|
| a1 `)` before UUID | `error (503))46471cc4-…` | `error (503))` |
| a2 `(503)` glued | `rate limited (503)46471cc4-…-3-2010` | `rate limited (503)` |
| a3 `(attempt 1)` glued | `capacity (attempt 1)46471cc4-…-3-2010` | `capacity (attempt 1)` |
| a4 plain `(503)` | `rate limited (503) please retry` | unchanged |
| a5 real `server2(` glue | `No capacity on the server2(46471cc4-…-41-2010` | `No capacity on the server` |

`char === ')'` terminates the backward walk unconditionally; `(` is consumed only when adjacent to the UUID and preceded by a digit. The Round-3 FAIL is closed.

#### C2 — comma deviation (author's deliberate deviation)

| Probe | Input | Output | Assessment |
|---|---|---|---|
| b1 real `2,` debris | `No capacity on the server2,<uuid>-41-2010` | `No capacity on the server` | correct; matches 14 real rows |
| b2 `2,503 <uuid>` | `error 2,503 <uuid> rejected` | `error 2,503 rejected` | comma-number preserved (not UUID-adjacent) |
| b3 `12,34 <uuid>` | `item 12,34 <uuid> rejected` | `null` (no error token in the input; no truncation) | neutral |
| b4 comma-number glued | `error,503<uuid>` | `error` | contrived; see R6-9 |
| b5 `2,` before number | `error: retry budget 2,503 ms exceeded` | unchanged | correct |

#### C3 — junk-run attack on the relaxed length gate (C4)

The post-sanitize gate is now `raw.length < 12 || run.length === 0 || identifierRun(run)`; since the run regex requires `{12,}`, `raw.length < 12` is tautological and the effective filters are `run.length === 0`, identifier rejection and `score === 0`.

| Input | Output |
|---|---|
| `2,503` (alone) | `undefined` |
| `+41` (alone) | `undefined` |
| `-2010` (alone) | `undefined` |
| `1.2.3` (alone) | `undefined` |
| `<uuid>2,503` | `2,503` |
| `<uuid>+41` | `undefined` |
| `<uuid>-2010` | `undefined` (STEP_TAIL removes it) |
| `<uuid>1.2.3` | `undefined` (score 0) |
| `<uuid>503` / `<uuid>429` | `503` / `429` |
| blob-shaped `\x08\x11 \x03<uuid>503` | `503` |
| blob-shaped frame only `\x08\x11 \x03*\xcd\x01<uuid>-2-2010` | `undefined` |

The four mandated junk strings as the only readable content all return `undefined` (the 12-char run floor still excludes them). A short numeric residue can surface only when a trajectory UUID is glued directly to `503`/`429` with no separator; no real payload has that shape (real tails are `-<step>-2010`, eaten by `STEP_TAIL`, or binary bytes that break the run). Listed as R6-10, not a FAIL.

#### C4 — `$`-frame path

`b$<uuid>…`, `3b$<uuid>…`, `xb$<uuid>…` all sanitize to `API error 503 capacity`; bare `b$<uuid>` returns `undefined`; `monthb$<uuid>…` (word char before the frame) is intentionally not stripped and leaves `monthb$` (R6-12, theoretical).

#### Real blobs and localized text

- 23/23 `step_type=17` rows: `LEAKS=0` (no UUID, no `b$`/`3b$`, no `�`, no `2+`/`server2`); idx 2 byte-exact; idx 115 clean EOF (retryable false); idx 49 clean capacity sentence.
- Hex fixtures remain byte-identical to the DB rows: `REAL_CAPACITY_HEX` 380/380, `REAL_EOF_HEX` 399/399 (byte equality).
- Byte-identity (`out === input`) for German, French, Chinese, Hebrew RTL and emoji (`Connection failed 😀 please retry (503)`). The Unicode run regex now keeps astral characters in one run. Bidi/zero-width set extended to U+061C, U+180E, U+2028/2029, U+202A-202E, U+2060-206F, U+FEFF, U+FFF9-FFFB.

#### Integrity and determinism

`git diff --stat tests/` = `tests/mock-acp.ts +62` only; `tests/interrupt.test.ts` and `tests/mapping.test.ts` empty; new file 13 `test(` blocks; 466 + 13 = 479. Prior assertions (real-blob exact text, `doesNotMatch /b\$/`, localized identity, `2+`/`2,`/`2(` debris, replacement-run fallback) are intact; the new test `UUID debris never consumes a closing paren or the text before it` (`tests/error-inspection-attempts.test.ts:414`) covers the Round-3 regression.

| Run | Exit | Tests | Pass | Fail |
|---|---|---|---|---|
| `npm test` #1 | 0 | 479 | 479 | 0 |
| `npm test` #2 | 0 | 479 | 479 | 0 |
| `npm run verify` | 0 | 479 | 479 | 0 |

#### Final residual list

| # | Risk | Status |
|---|---|---|
| R6-9 | Comma retained in the debris class: a comma-number glued directly to a UUID (`error,503<uuid>`) loses the number. No real shape (real `2,` debris precedes the UUID; legitimate numbers are space-separated). | Open (P3) |
| R6-10 | Relaxed length gate is tautological; a synthetic run that is `<uuid>503`/`<uuid>429` surfaces `503`/`429`. No plausible agy payload produces it. | Open (P3) |
| R6-3 | Second `hasActiveBackgroundWork` in the interrupt slow path remains unbounded; only the 300 ms settled pre-check is raced. | **STILL OPEN** (P3, pre-existing) |
| R6-12 | `$`-frame strip requires ≤2 chars before `$` and a non-word predecessor, so `monthb$<uuid>` keeps `b$`. No real-blob occurrence. | Open (P3) |
| R6-8 | Dangling separator trim (`version 1.2.3:` → `version 1.2.3`). Intended by test. | Accepted (P3) |
| R6-4 | No-`status` DBs still suppress a 17 row when any later 15 row exists. | Open by design (P3) |

Ship: **yes** — every gate FAIL condition is clear; the remaining items are theoretical shapes absent from all 23 real payloads and from the task's mandated probes.
