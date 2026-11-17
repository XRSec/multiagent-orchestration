# paseo-agy-acp: upstream v0.1.3 port assessment

Date: 2026-11-17
Scope: read-only assessment of our fork (`paseo-agy-acp`, package version 0.1.1) against upstream `fdkevin0/paseo-agy-acp` v0.1.3.
Deliverable is the only file written; no code under `paseo-agy-acp` was modified.

## Method and evidence limits

- `/tmp/agy013-src` did not exist and this environment exposes no shell, so no local clone, `git diff`, or `git merge-tree` was possible. Upstream was read through the GitHub tree/commit APIs, per-commit `.diff` endpoints, and the extracted tarballs under `/tmp/upcheck/a011|a013/package` (read-only; nothing executed).
- Consequence: line-level deltas below are exact for files I read in full, and marked UNKNOWN for files I did not enumerate. Conflict prediction is by hunk-range overlap, not by a real merge.
- Tag listing returned HTTP 404, so tag-to-sha mapping is UNKNOWN. The 14-commit scope is taken from the task and confirmed against the v0.1.3 commit list (12 commits on page 1 plus `0f3c54e` and the two release commits).

**Baseline caveat that changes the whole port question:** the fork's `package.json` says 0.1.1, but its code already carries mechanisms from upstream's Nov 13 batch. `foregroundAcp`/`ForegroundAcpSegment`, `wakeup.carriedUsage`, `pendingReplay`, `preStagedQuestion`, `suppressContinuationAcp`, and `HistoryEntry.toolAnchor` are present in our tree [VERIFIED server/session.ts:55,585,590-594,2425,2899-2903,3006-3018] [VERIFIED server/history.ts:17-23]. So "v0.1.1" is a version-string fact, not a code-baseline fact. Any estimate that treats 0.1.1 as the merge base will be wrong in both directions.

## 1. Commit-by-commit mapping (v0.1.1..v0.1.3, 14 commits)

Verdicts are about B1..B4, not about commit quality. "Already in fork" means code evidence exists in our tree; absence of such evidence is not proof of absence (only four brain files were read partially).

| # | Commit | What the diff actually changes (files / regions) | B | Verdict |
|---|---|---|---|---|
| 1 | `94c83ef` feat: Orchestrator (planexecute) + Gemini 4 Hydrogen | Adds `BrainPromptPhase = 'foreground' \| 'foreground_active' \| 'foreground_idle' \| 'woken'`, pure planexecute notice detection (`countRowMessages(row) === 0`), model-effort derivation from `availableModels` (`CANONICAL_EFFORTS low/medium/high/xhigh/max`, `parseModelEffort`), config order `model -> thought_level -> mode`. Files: brain-io, brain-projector, brain, common, mapping, permissions, session, tests. [DIFF 94c83ef] | B3/B4 substrate | OVERLAPS_PARTIALLY. It changes model/thinking ordering and makes `thought_level` re-evaluated after `model`, but has no availability fallback. Session order and `strictThinking:false` at open are already in our tree [VERIFIED server/session.ts:297-299,2251-2258]. |
| 2 | `d0f9b69` fix(brain): duplicate final replies | Adds `ForegroundCursor {index, offset}`, `ForegroundReconciler` phases `foreground -> reconciling_in_rpc -> post_rpc_wakeup`, per-turn `turnForegroundAcp`, `wakeup` only when `rowMessages > 0`. Files: brain-projector, brain, session, tests. [DIFF d0f9b69] | B1 (terminal projection) | OVERLAPS_PARTIALLY. Prevents duplicate/phantom replies, not fail-closed turns. Our tree already records foreground ACP segments and passes them to settle [VERIFIED server/session.ts:1063-1087,2899-2903]. |
| 3 | `f254e76` fix(brain): classify Retries remaining | `isRetryWarning` accepts countdown text only when type `ERROR_MESSAGE`, status `DONE`, source null/`SYSTEM`, prefix `Your previous response ` or `There was a problem`, and last line `/^Retries remaining: [1-9]\d*$/`; adds `RETRY_COUNTDOWN_PREFIXES`; `StepDedupe.fresh` hash now includes `row.source` and `row.error`. Files: brain-io, brain, tests. [DIFF f254e76] | B4 | OVERLAPS_PARTIALLY. Covers "retry warnings are not terminal errors" at the brain layer; it does not inspect `steps.step_type = 17` and does not build a `ProviderError` with `retryable`. Structurally different from our post-turn SQLite inspection. Present in our tree: UNKNOWN. |
| 4 | `87e5072` fix(brain): initial prompt cursor + question continuation | Splits sender extraction from counting (`extractRowMessageSenders`, `allowInitialSpawnPrompt`), cursor `initialPromptStep` starting at 0 or -1, `hasPendingQuestion()`, continuation-aware `USER_INPUT`. Files: brain-io, brain-observer, brain-projector, brain, history, tests. [DIFF 87e5072] | B1 (question-turn boundaries) | UNRELATED to B2-B4; partial B1 for question continuations. Our tree already has `preStagedQuestion` and continuation echo tracking [VERIFIED server/session.ts:2425,2986-3025]. |
| 5 | `23cd33d` fix(session): carried wakeup usage / zero-turn | `hasPositivePromptUsage`, `appliesCarriedWakeup` with atomic cached-read underflow check, `preserveCarriedWakeup`/`preservePendingReplay`, transport-identity relaunch reset. Files: brain-projector, brain, mapping, session. [DIFF 23cd33d] | B4 (retryability bookkeeping), B1 (pre-echo failure) | UNRELATED to B1-B3 fixes; already in fork: `settleTurnUsageAndWakeup`, `prevCarried`, `preserveCarriedWakeup` [VERIFIED server/session.ts:2526-2553,3006-3018]. |
| 6 | `2ac3e6d` fix(brain): anchor retry warnings to mtimeMs | `TranscriptReader.read` returns `mtimeMs`; `initialReadDone`; `retryObservedAt` retained across `reset()`; `pruneRetrySteps(snapshotStepIndices)`; observer `observedAtByStep` buffering. Files: brain-io, brain-observer, brain-projector, brain, tests. [DIFF 2ac3e6d] | B4 | UPSTREAM_HAS_MORE for retry-deadline correctness. Complements, does not replace, our stopReason/step inspection. Present in fork: UNKNOWN. |
| 7 | `ef07c84` refactor: trim exports + turn-finish ordering | Removes exports (`resolveBrainPath`, `shiftPendingPastCheckpoint`, `takePendingForGeneric`, private `open`), deletes `tests/context-regressions.test.ts`, defers turn finish into `finally` with `beforeEmit`, injects `cancelConvergenceTimeoutMs`, `createTranscriptReader`, `readSubagents`, `hasActiveBackgroundWork`. Files: brain-io, brain-projector, brain, session, subagents + tests. [DIFF ef07c84] | B1 (terminal ordering), B4 (bounded cancel) | OVERLAPS_PARTIALLY / UPSTREAM_HAS_MORE for disposal ordering. Not in fork: our `finishTurnOnce` emits inline and has no `beforeEmit` [VERIFIED server/session.ts:731-760]. |
| 8 | `80ee888` chore: prettier 3.10.1 | Message says dependency update; `package.json` range stays `^3.6.2` at v0.1.3 [VERIFIED /tmp/upcheck/a013/package/package.json:28]. Exact hunks not opened — likely lockfile only. | - | UNRELATED. Diff content UNKNOWN. |
| 9 | `a8307f3` fix(usage): keychain logins / CLI auth | `usage.ts` discovery accepts token file, auth log line, or remembered launch; `readLoggedEmail` tail+head with `realpath` dedupe; removes token-only `hasLogin`; `dataDirectory(..., fallbackHome)`; bounded `runUsageCommand` (15 s, 1 MiB stdout, 4 KiB stderr, process-group kill). Files: preflight, usage, tests. [DIFF a8307f3] | B3 (auth vs availability separation) | UNRELATED to B1/B2/B4. Orthogonal to B3; our `isUnavailableStoredConfig` already excludes auth/quota terms [VERIFIED server/session.ts:2165-2206]. Value is macOS keychain discovery, not model fallback. |
| 10 | `39dd7f3` fix(session): interrupt vs reload + runtime epochs | `RuntimeEpoch` (`afterStepIndex`, preEpochReadIds, ignoredMessages, ignoredSubagentIds), `captureRuntimeEpoch`/`computeRuntimeEpoch`, `activePrompt {transport, settled}`, `controlLane`/`runControl`/`waitForRuntimeReady`, `replaceRuntime` prefers `resumeSession` then `loadSession`; interrupt fast path races background probe at 200 ms, cancel convergence 350 ms, slow path cancel 100 ms; transport shutdown 200/300/650/1100 ms; `SubagentRegistry.generation`/`cancelAllToken`. Files: brain-io, brain-observer, brain-projector, brain, session, subagents, transport, tests. [DIFF 39dd7f3] | B4 (bounded interrupt), B1 (runtime fencing) | OVERLAPS_PARTIALLY on bounded interrupt ack; UPSTREAM_HAS_MORE on shutdown bounds and stale-runtime fencing. It does **not** make terminal status fail closed: upstream still computes status as `cancelled ? canceled : completed` [VERIFIED /tmp/upcheck/a013/package/server/session.ts:2040-2041]. Not in fork: no `RuntimeEpoch`, `activePrompt`, `controlLane`, `turnRunning`, or `failureError` [VERIFIED server/session.ts:559-611]. |
| 11 | `fb4a48b` chore(deps): ACP SDK ^2.7.0, plugin 0.16.0 | Replaces `ClientSideConnection` with `createAcpClient()` builder + `methods` constants, handlers via `.onNotification`/`.onRequest`, `agent.request(...)`, cancel becomes `notify`, config option becomes `session/setConfigOption`; SDK types move to `@agentclientprotocol/sdk/unstable`; Node CI 26, npm 12. Files: history, mapping, session, transport + 7 test fixtures. [DIFF fb4a48b] | - | UNRELATED to B1-B4 mechanically, but it is the dominant port cost. |
| 12 | `0f3c54e` fix(history): background GENERIC + replay ids | `HistoryEntry.toolAnchor`, pre-scan `observeRows`, checkpoint-shifted slots, `verifiedAcpId`, unverified ordinal IDs excluded from anchoring/merge. Files: brain-projector, brain, history, session, tests. [DIFF 0f3c54e] | B1 (replay ownership only) | UNRELATED to B1-B4 failure semantics. Already in fork: `toolAnchor` present [VERIFIED server/history.ts:17-23]. |
| 13 | `c66088e` chore(release): v0.1.2 | Release bookkeeping per message; exact hunks not opened — likely version/shrinkwrap. | - | UNRELATED. Content UNKNOWN. |
| 14 | `fcac026` chore(release): v0.1.3 | Release bookkeeping; v0.1.3 package manifest verified [VERIFIED /tmp/upcheck/a013/package/package.json:3]. | - | UNRELATED. Content UNKNOWN. |

### Mechanism contrast (why "upstream fixed it" is often false)

- Upstream turn end is optimistic: any stop reason other than `cancelled` becomes `completed` [VERIFIED /tmp/upcheck/a013/package/server/session.ts:2040-2041]. Our `mapTerminalStopReason` fails closed on `undefined` or unknown reasons [VERIFIED server/session.ts:3115-3135], and the turn journal converts leftovers to `failed` on open [VERIFIED server/session.ts:322-336,731-760].
- Upstream ownership is a per-prompt phase machine: `BrainPromptPhase` + `ForegroundReconciler` decide whether a planner row belongs to the live RPC or a post-RPC wakeup [DIFF 94c83ef, d0f9b69]. Ours has foreground segments too, but terminal truth is decided after the turn by inspecting SQLite step rows [VERIFIED server/error-inspection.ts:14-21,3038-3075].
- Upstream retry classification is brain-level JSONL classification (`isRetryWarning`, `StepDedupe` hashing) [DIFF f254e76, 2ac3e6d]. Ours is post-turn SQLite inspection of `step_type = 17` attempt rows plus stopReason [VERIFIED server/error-inspection.ts:14-21]. They are complementary, not substitutes: upstream classifies warnings as retryable; ours decides whether a failed turn's attempt rows are terminal and recovers upstream error text.
- Upstream B1-adjacent work (39dd7f3) is runtime fencing, not terminal-evidence fencing. It prevents stale transports/subagents from delivering results; it does not assert that a turn has terminal evidence. Our B1 remains uncovered by 0.1.3.

## 2. Our six files with no upstream counterpart

| File | Purpose (code evidence) | Functional equivalent in 0.1.3? | Verdict |
|---|---|---|---|
| `server/error-inspection.ts` (~589 lines) | Read-only SQLite inspection of `steps` after a turn: `ERROR_STEP_TYPE = 17`, `AGY_STEP_TYPE_USER_INPUT = 14`, `AGY_STEP_TYPE_PLANNER_RESPONSE = 15`, status `DONE = 3`; parses Go durations, sanitizes protobuf blobs, builds `ProviderError` with `retryable`/`resetAt` [VERIFIED server/error-inspection.ts:1-60]. | None. Nearest is brain-level `isRetryWarning` + `StepDedupe` in `brain-io.ts` [DIFF f254e76]. No SQLite step-type/status logic exists in 0.1.3 (94c83ef explicitly adds no step types; no DB reads in retry diffs). | **KEEP.** It is the only implementation that answers "was this turn actually terminal?" from persisted evidence. Upstream's replacement candidate cannot express it. |
| `server/turn-journal.ts` | Persists `{turnId, clientMessageId, nativeId, startedAt, status:'running'}` before `session/prompt` dispatch; `finishTurnJournal` clears; `reconcileRunningTurns` fails leftovers on open [VERIFIED server/turn-journal.ts:1-30] [VERIFIED server/session.ts:2847-2857]. | None. Upstream `RuntimeEpoch`/`activePrompt` are in-memory and only fence reloads inside one process [VERIFIED /tmp/upcheck/a013/package/server/session.ts:493-500,1121-1134]. No on-disk journal, no restart reconciliation. | **KEEP.** This is the daemon-restart half of B1; upstream structurally cannot cover it. |
| `server/tool-payload.ts` | Bounds tool payloads (`TOOL_TITLE_BUDGET 2000`, `TOOL_RAW_PAYLOAD_BUDGET 65536`, item limits) and synthesizes missing edit diffs via `EditDiffTracker` [VERIFIED server/tool-payload.ts:1-30]. | None. `mapping.ts` has only `TOOL_SNAPSHOT_LIMIT = 1024` for timeline snapshots and no payload budgets or filesystem diff synthesis [VERIFIED /tmp/upcheck/a013/package/server/mapping.ts:153,164-402]. | **KEEP.** Independent of ACP version; direct hunk insertion in `session.ts` update path. |
| `server/revert.ts` | Session revert orchestration: token validation, conversation forking, Git file rollback, scopes `files|conversation|both` [VERIFIED server/revert.ts:1-30]. | None. Upstream 0.1.3 `handle()` has no `session.revert` branch [VERIFIED /tmp/upcheck/a013/package/server/session.ts:338-421] and the session surface exposes no `revert` [VERIFIED /tmp/upcheck/a013/package/server/session.ts:1293-1556]. | **KEEP.** Product differentiator; not a bug fix to trade away. |
| `server/checkpoints.ts` | Per-turn shadow-Git workspace checkpoints, hashing, symlink/file restore [VERIFIED server/checkpoints.ts:1-30]. | None. | **KEEP.** Only dependency is `session.ts` prompt/revert call sites. |
| `server/agy-fork.ts` | Low-level SQLite conversation forking: `VACUUM INTO`, protobuf metadata trimming, `.system_generated` filtering, `conversation_summaries.db` sync; explicitly written against agy 1.5.9 because there is no native fork RPC [VERIFIED server/agy-fork.ts:1-30]. | None. Upstream still has no fork/revert RPC in 0.1.3 [VERIFIED upstream session.ts:1293-1556]. | **KEEP.** Remove only if agy ships a native fork/revert RPC. |

All six are new files, so they cannot conflict textually in a rebase; the conflict is in their `session.ts` import block and call sites [VERIFIED server/session.ts:38-82,432-465,1757-1950].

## 3. Divergence size

Measured, not estimated:

| File | Upstream 0.1.3 | Our fork | Delta |
|---|---|---|---|
| `server/session.ts` | 77,344 bytes, 2,278 lines [TREE v0.1.3] [VERIFIED /tmp/upcheck/a013/package/server/session.ts:2278] | 3,159 lines [VERIFIED server/session.ts:3159] | **+881 lines, +38.7%** |
| `server/transport.ts` | 14,506 bytes, 447 lines [TREE v0.1.3] [VERIFIED /tmp/upcheck/a013/package/server/transport.ts:447] | 371 lines [VERIFIED server/transport.ts:371] | **-76 lines, -17.0%** (upstream grew shutdown/builder code; ours kept 1.9 connection) |
| `server/error-inspection.ts` | absent | ~589 lines [VERIFIED server/error-inspection.ts:6] | +589 |
| `server/turn-journal.ts`, `tool-payload.ts`, `revert.ts`, `checkpoints.ts`, `agy-fork.ts` | absent | 5 files, sizes not enumerated (UNKNOWN) | +5 files |

File counts: upstream has 15 files under `server/` [TREE v0.1.3]; ours has those 15 (all imported somewhere in the read files) plus the 6 unique files = 21. Unmeasured per-file line deltas: UNKNOWN (no shell). Upstream byte sizes for the likely-conflicting shared files: `brain.ts` 46,142; `brain-projector.ts` 37,309; `mapping.ts` 29,713; `brain-io.ts` 26,111; `usage.ts` 17,389; `history.ts` 13,891; `brain-observer.ts` 11,474; `preflight.ts` 5,170 [TREE v0.1.3].

Textual conflict forecast (hunk-range overlap, not a real merge):

- `server/session.ts` — **certain, severe**. `39dd7f3` alone touches 36 hunk regions across the file, including the exact areas we modified: interrupt, prompt lifecycle, reload, and turn finish [DIFF 39dd7f3]. `94c83ef` adds 14 more regions; `0f3c54e`, `fb4a48b`, and `ef07c84` add more. Our B1-B4 edits live at 1974-2043 (interrupt) and 2370-3158 (prompt/termination), i.e. inside upstream's rewrite.
- `server/transport.ts` — **certain**. `39dd7f3` changes 4 regions and `fb4a48b` replaces the connection construction entirely [DIFF fb4a48b]. Our 1.9 `ClientSideConnection` block [VERIFIED server/transport.ts:264-276] has no surviving context.
- `server/brain.ts`, `brain-projector.ts`, `brain-observer.ts`, `brain-io.ts`, `history.ts` — **high**. Touched by 39dd7f3, 0f3c54e, 94c83ef, d0f9b69, f254e76, 2ac3e6d in overlapping functions (`settleBrainTurn`, `ingest`, `watchBrain`, `reset`, `pruneRetrySteps`, `projectReplayHistory`).
- `server/mapping.ts` — **high** (94c83ef effort mapping + fb4a48b unstable import). `usage.ts`/`preflight.ts` — **medium** (a8307f3). `subagents.ts` — **high if porting 39dd7f3** (generation/cancel tokens). `common.ts`, `permissions.ts` — **low**. `provider.ts`, `questions.ts` — likely clean (no hunks in the read diffs; UNKNOWN for release commits).
- Our six unique files — **no textual conflict**, but their imports/call sites inside `session.ts` are in rewritten regions.

## 4. SDK migration surface (ours on 1.9, upstream on 2.7)

### Concrete call sites on our side

| Location | API used | 2.7 status |
|---|---|---|
| `server/transport.ts:14-18` | `ClientSideConnection`, `ndJsonStream`, `Client` from `@agentclientprotocol/sdk` | Removed from root in 2.7; use `client`/`agent` builders from `/unstable` [DIFF fb4a48b] [VERIFIED /tmp/upcheck/a013/package/server/transport.ts:10-26] |
| `server/transport.ts:193-196` | `ndJsonStream(Writable.toWeb(stdin), Readable.toWeb(stdout))` | Survives, import path changes |
| `server/transport.ts:264-276` | `new ClientSideConnection(callback, {readable, writable})`, `rpc.closed` | Replaced by `createAcpClient().onNotification(...).onRequest(...).connect(...)` and `connection.closed` [VERIFIED upstream transport.ts:291-302] |
| `server/transport.ts:205-227` | Manual `elicitation/create` JSON-RPC interception (SDK 1.9 `anyOf` validation workaround) | Upstream still keeps the manual interceptor at 232-255 [VERIFIED upstream transport.ts:232-255]; 2.7 also exposes typed `methods.client.elicitation.create` in fixtures [DIFF fb4a48b] |
| `server/transport.ts:229-251` | Manual `session/request_permission` interception and raw `result.models` capture (`nativeModelsSchema`) | Permission interceptor survives upstream at 256-268; raw model capture survives at 269-277 [VERIFIED upstream transport.ts:256-278] — no standalone model-list API change |
| `server/session.ts:8-19` | Types from SDK root (`PROTOCOL_VERSION`, `Usage`, `McpServer`, ...) | Move to `@agentclientprotocol/sdk/unstable` [VERIFIED upstream session.ts:7-17] |
| `server/session.ts:249,253` | `rpc.resumeSession`, `rpc.loadSession` (open) | Still present in 2.7 facade (`methods.agent.session.resume`/`.load`) [VERIFIED upstream transport.ts:307-310] |
| `server/session.ts:262` | `rpc.newSession` | `methods.agent.session.new` [VERIFIED upstream transport.ts:305-306] |
| `server/session.ts:1441-1452` | `rpc.initialize` + `PROTOCOL_VERSION` | `methods.agent.initialize` [VERIFIED upstream transport.ts:303-304] |
| `server/session.ts:1487-1494` | `rpc.resumeSession`/`rpc.loadSession` (silent reload) | Same facade names, new method constants |
| `server/session.ts:1780` | `rpc.newSession` (revert fresh session) | Same facade shape; our revert path is ours to keep |
| `server/session.ts:1843,2078` | `rpc.closeSession` | `methods.agent.session.close` [VERIFIED upstream transport.ts:313-314] |
| `server/session.ts:2016-2019` | `rpc.cancel(...)` awaited via `request(..., {timeoutMs: 5000})` | **Semantic break**: 2.7 makes cancel a notification, `connection.agent.notify(...)`, no response [VERIFIED upstream transport.ts:319-320]. Our bounded-ack logic must be re-expressed as notify + prompt settlement race |
| `server/session.ts:2150-2155` | `rpc.setSessionConfigOption` | `methods.agent.session.setConfigOption` (wire name `session/setConfigOption`) [VERIFIED upstream transport.ts:315-316] |
| `server/session.ts:2860-2863,2999-3004` | `rpc.prompt` | `methods.agent.session.prompt` [VERIFIED upstream transport.ts:317-318] |
| `server/session.ts:266` | `session.transport.models` (legacy inventory) | Unchanged; still populated by raw capture [VERIFIED upstream session.ts:258, upstream transport.ts:219,269-273] |
| `server/history.ts:14` | `type ToolCall` from SDK root | Upstream moves this to `/unstable` [DIFF fb4a48b] |
| `server/mapping.ts:2-11` | SDK types from root | Upstream moves to `/unstable` [VERIFIED upstream mapping.ts:1-11] |

### What 1.9 -> 2.7 visibly changes

- Import surface: root exports -> `@agentclientprotocol/sdk/unstable` for `ContentBlock`, `Usage`, `UsageUpdate`, `McpServer`, `ToolCall`, and zod schemas [DIFF fb4a48b] [VERIFIED upstream session/mapping/transport imports].
- Connection construction: `ClientSideConnection`/`AgentSideConnection` -> `client()`/`agent()` builders with `.onRequest`, `.onNotification`, `.connect` [DIFF fb4a48b].
- Outbound API: `connection.agent.request(methods.agent.*)` / `.notify(...)`; `session/cancel` is a notification [VERIFIED upstream transport.ts:301-321].
- Config RPC wire name: `session/setConfigOption`; `setSessionConfigOption` remains only as the local facade method name [VERIFIED upstream transport.ts:315-316] [VERIFIED upstream session.ts:1606-1612].
- New `listSessions` facade (`methods.agent.session.list`) appears [VERIFIED upstream transport.ts:311-312].
- Model list handling: no new typed list API; upstream still scrapes `result.models` with `nativeModelsSchema` and still merges `configOptions`/`availableModels` for effort derivation [VERIFIED upstream transport.ts:269-273] [VERIFIED upstream mapping.ts:404-520].
- `@getpaseo/plugin` 0.15.4 -> 0.16.0 and Node CI 26 / npm 12; `engines.node` stays `>=22.18.0` [VERIFIED /tmp/upcheck/a013/package/package.json:26,33-37] [DIFF fb4a48b].

UNKNOWN: the exact 2.7 `Client`/`AgentConnection` type definitions and whether our local `AcpClient` structural type remains assignable without edits. No SDK `.d.ts` was read.

## 5. Three port options

### (a) Full rebase onto 0.1.3

What it means mechanically: take upstream `server/` + `tests/` at v0.1.3, re-add the six modules, and re-apply B1-B4 in the new structure.

Effort: **6-9 engineer-days**, high variance. Decomposition: file transplant + SDK 2.7 + mock rewrite 2-3 d (7 ACP fixtures change from `ClientSideConnection` to `agent()`/`methods` [DIFF fb4a48b]); re-port B1 into the new `finally`/`activePrompt`/`RuntimeEpoch` world 2-3 d; re-port B2 watchdog 1 d; B3 fallback 0.5 d; B4 rewire 0.5-1 d; stabilization 1-2 d.

What breaks:
- B1 regresses by default: upstream's `stopReason !== 'cancelled' => completed` [VERIFIED upstream session.ts:2040-2041] silently re-admits the incident class. The journal must be reinserted in the new async `open()` and the new `finally` finish path; upstream's `finishTurnOnce` has a different signature (`beforeEmit?`) [VERIFIED upstream session.ts:637-654,2262-2271].
- B2 disappears entirely: upstream has no `toolStallTimeoutMs`/`toolNoticeMs`; its `SessionOptions` is only stall/retry/cancel-convergence/injection hooks [VERIFIED upstream session.ts:102-113]. Our two-clock loop [VERIFIED server/session.ts:2606-2744] must be transplanted around `state.turnRunning`/`activePrompt`.
- B3 disappears: upstream `configureSession` calls strict `applyNativeConfigOption` and has no availability classifier [VERIFIED upstream session.ts:1617-1709]. Our fallback and notices [VERIFIED server/session.ts:2160-2232,2310-2328] must be reinserted.
- B4 partially survives: `error-inspection.ts` is portable, but its trigger sits after `settleBrainTurn`; upstream's status/error plumbing changed (`pendingFinish`, `settlement.error`) [VERIFIED upstream session.ts:2191-2217]. The bounded interrupt ack is superseded by upstream's 200 ms probe + 350 ms convergence [VERIFIED upstream session.ts:1445-1513], which is better.
- Our revert/checkpoint code depends on `reloadSessionSilently`, which upstream replaced with `replaceRuntime`/`reloadIntoRuntime` [VERIFIED upstream session.ts:1135-1280]; the revert path must be rewritten, not merged.

Tests needed: rewrite all ACP fixtures; port upstream `brain-retry`/`interrupt` tests to our harness; add explicit B1 restart, B2 two-clock, B3 unavailable model, B4 attempt-row tests to prevent silent loss.

Regression surface in B1-B4: **B1, B2, B3 high; B4 medium.**

### (b) Stay forked, cherry-pick selected upstream commits

Recommended subset: `f254e76`, `2ac3e6d` (retry), `a8307f3` (keychain usage), optionally the transport-shutdown constants from `39dd7f3`. Defer `fb4a48b` (SDK) and the full `39dd7f3` epoch rework.

Effort: **3-5 engineer-days** for the subset. `f254e76` + `2ac3e6d` conflict in brain-io/brain/brain-observer/brain-projector and depend on `TranscriptReader.read` returning `mtimeMs`; our fork's reader call sites differ (ours constructs `BrainTurnObservation` with `(brainRoot, nativeId, id, minStep, options)` [VERIFIED server/session.ts:2820-2844], upstream passes `createTranscriptReader?.()` and epoch index [VERIFIED upstream session.ts:2019-2022]). `a8307f3` conflicts in preflight/usage and changes `dataDirectory` arity, which our session/revert/checkpoints call [VERIFIED server/session.ts:548,1084].

What breaks: `39dd7f3` cannot be partially picked cleanly — it references `controlActive`, `activePrompt`, `runtimeEpoch`, and `subagent.generation`; our session has none of those [VERIFIED server/session.ts:559-611]. Picking only the constants leaves dead code; picking the interrupt block requires the whole control-lane restructure.

Regression surface: B1-B3 untouched; B4 maybe improved by upstream retry classification, but dedupe changes can re-deliver old rows and duplicate timeline items if our projection differs.

### (c) Stay forked, hand-backport the retry/interrupt commits

Interpretation: `f254e76` + `2ac3e6d` (retry pair), and only if interrupt incidents persist, the convergence/transport bounds from `39dd7f3` without epochs.

Effort: **1.5-2.5 engineer-days** for the retry pair; **4-6 engineer-days** if the interrupt convergence block is included.

What breaks: retry pair is low blast radius but depends on `initialReadDone`/`retryObservedAt`/`pruneRetrySteps` plumbing across four brain files; our `settleBrainTurn` option surface is close but not identical (ours has `foregroundAcp`, `transcriptGraceMs`, `onQuestionSettled` [VERIFIED server/session.ts:2879-2929], upstream adds `runtimeEpoch` and drops some hooks [VERIFIED upstream session.ts:2045-2091]). Interrupt hand-port risks double-cancel or a stuck `state.interrupting` if the 350 ms convergence races our `finishTurnOnce` journal clear.

Tests needed: port `tests/brain-retry.test.ts` (33 KB upstream) with mtime fixtures; adapt `tests/interrupt*.test.ts` (18 KB + 36 KB) to 1.9 mocks; keep our B1-B4 tests green.

Regression surface: B4 low-to-medium (dedupe/re-delivery), B1 low if interrupt ack does not alter terminal status, B2/B3 none.

## 6. Recommendation

**Stay forked. Do not rebase onto 0.1.3 now. Execute a staged selective backport: retry pair first, keychain usage second, transport shutdown bounds only if incidents continue; defer the SDK 2.7 migration and the full runtime-epoch rewrite.**

Reasoning:

1. Upstream 0.1.3 does not cover our incident classes. B1 is contradicted by upstream's optimistic status mapping [VERIFIED upstream session.ts:2040-2041]; B2 and B3 have no upstream analog [VERIFIED upstream session.ts:102-113,1617-1709]; B4 is only partially covered by brain-level retry classification [DIFF f254e76, 2ac3e6d]. A full rebase would require re-implementing three of four fixes inside a rewritten prompt path — pure cost with regression exposure.
2. Our differentiators have no upstream equivalent: persistent turn journal, SQLite error inspection, tool payload bounding, revert, per-turn checkpoints, conversation forking. These are new files and survive any strategy; only their `session.ts` wiring is at risk.
3. The fork already absorbed the Nov 13 brain work (`foregroundAcp`, carried wakeup, question continuation, replay anchors), so the remaining upstream delta is narrower than "14 commits": mainly 39dd7f3, f254e76/2ac3e6d, a8307f3, ef07c84, and the SDK bump. That makes selective backport rational.
4. SDK 2.7 buys no behaviour we need; it buys upstream-compatible transport and Node 26 tooling. It is best done as its own project or as part of a future full rebase, not mixed into incident fixes. `session/cancel` becoming a notification is the one semantic break that would force a rewrite of our bounded-ack code [VERIFIED upstream transport.ts:319-320] [VERIFIED server/session.ts:2016-2019].

Suggested order:
1. Backport `f254e76` + `2ac3e6d` into brain-io/brain/brain-observer/brain-projector; keep `error-inspection.ts` as the terminal-evidence authority.
2. Backport `a8307f3` only if keychain/login discovery is a live support issue; reconcile `dataDirectory(..., fallbackHome)` with revert/checkpoints callers.
3. If interrupt remains a problem, take the bounded shutdown constants and 350 ms convergence model, but implement them in our `interrupt()` without the epoch subsystem.
4. Re-evaluate full rebase when upstream adds fail-closed terminal evidence or a persistent journal (none present in 0.1.3).

### UNKNOWNs that need a spike

1. Whether our `brain-io.ts`/`brain-observer.ts` already contain `f254e76`/`2ac3e6d` (`RETRY_COUNTDOWN_PREFIXES`, `retryObservedAt`, `initialReadDone`). Not read; grep is the first spike step.
2. The real conflict set and rerere feasibility: run `git merge-tree`/trial rebase in a disposable worktree. This assessment predicts overlap from hunk ranges only.
3. SDK 2.7 unstable type surface: `Client`/`AgentConnection` assignability for our `AcpClient`, `PROTOCOL_VERSION` export path, and whether the raw elicitation/model interceptors remain necessary.
4. `@getpaseo/plugin` 0.16.0 provider API deltas (only the version bump was read).
5. Whether `a8307f3`'s `dataDirectory(fallbackHome)` and `runUsageCommand` semantics fit our preflight/revert usage and macOS keychain setup.
6. Whether `39dd7f3` compiles standalone on our base without `ef07c84`/`fb4a48b`; chronology says it predates both, but dependency closure was not compiled.
7. Contents of the two release commits and `80ee888` (not opened); assumed bookkeeping.
8. Runtime semantics of agy `session/resume` under SDK 1.9 vs 2.7 (wire compatibility was not exercised).
9. Our current automated coverage for B1-B4 and the six modules (tests were not enumerated; only upstream test sizes are known).
