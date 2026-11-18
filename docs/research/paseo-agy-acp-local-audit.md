# paseo-agy-acp: Local Codebase & Robustness Audit

Date: 2026-11-18
Scope: Read-only audit of `paseo-agy-acp/` (`@fdkevin/paseo-agy-acp` `0.1.1`) covering `server/*.ts`, `docs/reference.md`, and `docs/research/agy-acp-upstream-0.1.3-port-assessment.md`. No source files under `paseo-agy-acp/` were modified.

## 1. Baseline & Inventory

- **Typecheck** (`cd paseo-agy-acp && npm run check`, `tsc --noEmit`): **PASS** (exit code `0`).
- **Test suite** (`cd paseo-agy-acp && npm test`, `node --test tests/*.test.ts`): **PASS** — `486` tests, `486` passed, `0` failed, `0` skipped, `0` todo (`34,555.82 ms`).
- **Server footprint**: `15,000` total lines across `21` TypeScript modules under `paseo-agy-acp/server/`:
  - Core session & transport: `session.ts` (`3,216`), `transport.ts` (`434`), `provider.ts` (`250`), `mapping.ts` (`1,004`), `common.ts` (`167`).
  - Brain & subagent projection: `brain.ts` (`1,303`), `brain-projector.ts` (`1,203`), `brain-io.ts` (`858`), `brain-observer.ts` (`354`), `subagents.ts` (`362`), `history.ts` (`400`).
  - Hardening & differentiators: `error-inspection.ts` (`602`), `turn-journal.ts` (`143`), `tool-payload.ts` (`332`), `revert.ts` (`525`), `checkpoints.ts` (`1,317`), `agy-fork.ts` (`1,499`).
  - Permissions, preflight & quota: `permissions.ts` (`215`), `questions.ts` (`279`), `preflight.ts` (`160`), `usage.ts` (`377`).

## 2. Prioritized Robustness Gaps

### P0 — Critical (Crash, Hang, Silent Data Loss, or Teardown Races)

1. **Uncaught `writer.write()` in `TransformStream.transform` on invalid permission requests** (`paseo-agy-acp/server/transport.ts:293-305`)
   - When `session/request_permission` fails `RequestPermissionRequestSchema.safeParse`, line `299` executes `await writer.write(...)` without `try/catch` (unlike `elicitation/create` at `transport.ts:277-290`, which attaches `.catch(() => undefined)`).
   - If `child.stdin` is already closed/broken during process exit or shutdown, `writer.write()` rejects inside `transform()`, aborting the `readable` stream and masking the underlying exit error.

2. **`doRelaunch` treats `TERMINATION_DEADLINE_MS` (`2500 ms`) timeout in `transport.close()` as a fatal session failure** (`paseo-agy-acp/server/transport.ts:371-392`, `paseo-agy-acp/server/session.ts:1627-1655`)
   - `connectAcp().close()` rejects with `Error('agy did not exit after termination')` if `exited` does not resolve within `2500 ms`, even though `finally` sends `SIGKILL` to all tracked process groups (`transport.ts:388-389`).
   - `session.close()` handles this via `.then(() => true, () => false)` (`session.ts:2137-2140`), though a `false` return skips `removeSessionArtifacts` on disposable sessions (`session.ts:2141-2146`). By contrast, `doRelaunch()` awaits `currentTransport.close()` without catching (`session.ts:1627`), so a slow-exiting `agy` process triggers `onExit()` (`session.ts:1652`) and permanently sets `state.failed = true`, killing the session instead of completing the relaunch.

3. **`SubagentRegistry.closeAll()` does not await/drain child `BrainWatchHandle` polls** (`paseo-agy-acp/server/subagents.ts:300-307`, `paseo-agy-acp/server/brain.ts:1270-1274`)
   - `closeAll()` invokes the synchronous `stop()` handle (`stopped = true; clearInterval(timer)`) without awaiting `inflight` or `cancel()`.
   - An in-flight `pollOnce()` (`brain.ts:1122-1240`) can continue reading `transcript_full.jsonl` or calling `node.checkConversationError(root)` (opening SQLite `DatabaseSync`) concurrently with `removeSessionArtifacts()` during `session.close()` (`session.ts:2141-2146`).

4. **Unbounded `requestPermission` / `askUserQuestion` promises with no host-side timeout** (`paseo-agy-acp/server/session.ts:1266-1296, 1388-1405`)
   - Both `requestPermission` and `askUserQuestion` create raw promises in `permissions` with no expiry, and `armWatchdog()` intentionally suspends the turn-silence clock while `permissions.size > 0` (`session.ts:2709-2715`).
   - A dropped UI/client permission response or an orphaned `elicitation/create` leaves the turn open indefinitely until manual `interrupt()` or `close()`.

### P1 — High (State Machine Races, Silent Error Degradation, or Resource Leaks)

1. **`inspectConversationError` opens SQLite synchronously without `busy_timeout` and swallows all DB errors** (`paseo-agy-acp/server/error-inspection.ts:528-571`)
   - `new DatabaseSync(dbPath, { readOnly: true })` runs synchronously on the Node event loop without configuring `PRAGMA busy_timeout`. Concurrent WAL writes from `agy` can raise `SQLITE_BUSY`, which is swallowed by `catch { return undefined }` (`error-inspection.ts:570-571`), silently dropping structured `429`/`503`/quota diagnostics (`retryable`, `retryAfterMs`, `resetAt`).
   - Query `LIMIT 5` on `ORDER BY idx DESC` (`error-inspection.ts:545-546`) inspects at most the last 5 `step_type = 17` rows; turns with >5 retry attempts followed by other rows can miss earlier unrecovered errors.

2. **`turn-journal.ts` `writeLanes` leaks keys and races `removeSessionArtifacts` on disposable close** (`paseo-agy-acp/server/turn-journal.ts:32-45, 115-126`, `paseo-agy-acp/server/session.ts:761-765, 2141-2146`)
   - `writeLanes` never deletes settled entries (unlike `sessionWriteLanes` in `checkpoints.ts:86-88`), accumulating one entry per `nativeId` for the lifetime of the daemon.
   - `finishTurnOnce()` invokes `finishTurnJournal()` fire-and-forget (`session.ts:761`). On disposable session close, `removeSessionArtifacts()` does not serialize through `turn-journal.ts`'s `queue()`, allowing an in-flight `writeEntries` (`mkdir` + `writeFile` + `rename`) to recreate `<nativeId>.turn-journal.json` after cleanup.

3. **`TranscriptReader` `SyntaxError` classification & `watchBrain` non-missing poll errors** (`paseo-agy-acp/server/brain-io.ts:684-699`, `paseo-agy-acp/server/brain-observer.ts:175, 192-203`, `paseo-agy-acp/server/brain.ts:1251-1262`)
   - In `TranscriptReader.readOnce()`, if a corrupt JSONL line is encountered when `startedAtZero === true` and `stat.size` / `head` match, `racedRewrite` is `false` and `SyntaxError` is thrown. `BrainTurnObservation.read()` treats any error without a string `.code` as fatal (`this.failure = error`), permanently poisoning the observation pump (`brain-observer.ts:175`).
   - In `watchBrain()`, non-missing `pollOnce()` errors only emit a single `brain-error` timeline item (`warned = true`) and keep the `1000 ms` `setInterval` running indefinitely without failing or stopping the child watcher (`brain.ts:1251-1262`).

4. **Idle transcript watcher performs full-file O(N) re-reads and re-projections** (`paseo-agy-acp/server/session.ts:805-963`)
   - `startIdleWatcher()` pairs an `800 ms` `setInterval` with `fs.watch(logsDir)`. Whenever `mtimeMs` or `size` changes, `syncExternalTranscript()` reads the entire `transcript_full.jsonl` from byte 0 (`readTranscriptRows`), runs `projectReplayHistory` over all rows, and diffs `JSON.stringify(item)` against `emittedItemSignatures`. Long sessions incur repeated full-transcript parses while idle.

5. **Non-atomic multi-key `configureSession` and regex-coupled availability fallback** (`paseo-agy-acp/server/session.ts:2216-2258, 2285-2396`)
   - `configureSession` applies `model -> thought_level -> mode` sequentially (`session.ts:2305-2390`). If `mode` (or `relaunch(false)` when exiting `full-access`) fails, earlier `model` / `thought_level` changes remain applied on the native session without rollback.
   - `isUnavailableStoredConfig()` (`session.ts:2247-2258`) depends on English regexes (`UNAVAILABLE_MODEL_PHRASES`, `UNAVAILABLE_THINKING_PHRASES`) and `NON_AVAILABILITY_TERMS` substring exclusions; upstream error copy changes can misclassify availability vs. transient failures.

6. **Silent conversation loss fallback on `revertSession` and 5 s Git checkpoint timeout** (`paseo-agy-acp/server/revert.ts:294-303`, `paseo-agy-acp/server/checkpoints.ts:32`, `paseo-agy-acp/server/session.ts:1878-1882, 2505-2515`)
   - By default (`fallbackToFreshOnForkError !== false`), a failure in `forkAgyConversationStorage()` degrades silently to `createFreshSession()`, discarding conversation history while still rolling back workspace files when `scope === 'both'` (`revert.ts:294-303`, `session.ts:1871-1882`).
   - `GIT_TIMEOUT_MS = 5000` (`checkpoints.ts:32`) can expire on large repositories; `promptSession` swallows `captureTurnFileCheckpoint` errors (`session.ts:2511`), leaving the turn without a `checkpointId` for later file revert.

### P2 — Medium (Technical Debt & Upstream Drift)

1. **ACP SDK 1.9 workarounds in `transport.ts`** (`paseo-agy-acp/server/transport.ts:266-317`): Manual `elicitation/create` and `session/request_permission` interception plus `nativeModelsSchema` scraping couple transport to raw JSON-RPC frames and block upgrading to `@agentclientprotocol/sdk` `^2.7.0` (where `session/cancel` becomes a notification).
2. **Quota email discovery lacks macOS Keychain fallback** (`paseo-agy-acp/server/usage.ts:77-120`): Relies on scanning up to 10 `cli-*.log` / `acp-server-*.log` files and `cli.log` (64 KiB chunks); upstream `a8307f3` adds keychain/token-file discovery.
3. **Retry warning classification relies on exact English prefixes** (`paseo-agy-acp/server/brain-io.ts:213-245`): `isRetryWarning()` matches `RETRY_EXACT_MESSAGES`, `RETRY_COUNTDOWN_PREFIXES`, and `/^Retries remaining: [1-9]\d*$/`; any upstream copy drift turns retryable warnings into terminal errors or stalls.
4. **Monolithic `session.ts` (`3,216` lines)**: Co-locates `SessionManager`, transport/relaunch lifecycle, two-clock watchdog, idle watcher, permission/elicitation state, and revert orchestration, increasing merge/regression risk.
