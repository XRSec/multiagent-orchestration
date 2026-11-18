# Antigravity ACP (`agy acp`) Ecosystem & Robustness Tracking

Date: 2026-11-18
Scope: Read-only ecosystem reconnaissance across upstream `fdkevin0/paseo-agy-acp`, `pingdotgg/t3code`, `agentclientprotocol/registry`, community `agy-acp` adapters, and ADE/client integrations (Zed, OpenCode, JetBrains).
Prior baseline: [agy-acp-upstream-0.1.3-port-assessment.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/research/agy-acp-upstream-0.1.3-port-assessment.md).

---

## 1. Upstream `fdkevin0/paseo-agy-acp` Status & Robustness Mechanisms

Repository: `https://github.com/fdkevin0/paseo-agy-acp`

### 1.1 Release & Commit Currency (Verified 2026-11-18)

No new releases, tags, or commits have landed upstream since `v0.1.3`:

| Tag | Full SHA | Published / Committed (UTC) | Notes |
|---|---|---|---|
| `v0.1.3` | `fcac026` (PR `#48`) | `2026-11-16T15:10:55Z` | Latest release (`chore(release): v0.1.3`) |
| `v0.1.2` | `c66088e` (PR `#47`) | `2026-11-16T10:12:49Z` | Release bundling `fb4a48b`, `39dd7f3`, `a8307f3`, `ef07c84` |
| `v0.1.1` | `92605da` (PR `#29`) | `2026-11-12T11:10:46Z` | Prior Paseo plugin registry release |
| `v0.1.0` | `847792e` | `2026-11-09T10:44:11Z` | Initial release |

### 1.2 Key Upstream Robustness Commits (v0.1.1..v0.1.3)

1. **`39dd7f3e694cff125373f1c966224339463ac03a` (`39dd7f3`, PR `#40`) — Runtime Epochs, Control Lane, & Bounded Interrupt/Shutdown**
   - **Files**: `server/brain-io.ts`, `server/brain-observer.ts`, `server/brain.ts`, `server/brain-projector.ts`, `server/session.ts`, `server/subagents.ts`, `server/transport.ts`, `tests/interrupt*.test.ts`.
   - **Mechanisms**:
     - Introduces `RuntimeEpoch` (`preEpochReadIds`, `ignoredMessages`, `ignoredSubagentIds`, `afterStepIndex`) and `adjustInboxForEpoch` / `postEpochSignatures` / `extractRowMessageSignatures` to fence stale deliveries across runtime reloads.
     - Adds `controlLane` / `runControl` / `waitForRuntimeReady` / `activePrompt { transport, settled }` in `server/session.ts`, decoupling interrupt shutdown from `replaceRuntime` (which prefers `resumeSession` then `loadSession`).
     - Bounds interrupt convergence: 200 ms background probe race, 350 ms cancel convergence, 100 ms slow-path cancel; transport shutdown escalation at 200 / 300 / 650 / 1100 ms; `SubagentRegistry.generation` + `forceCancel()`/`cancelAllToken`.
     - `server/transport.ts` adds `shouldRetryBusyboxPs` and `PS_TIMEOUT_MS` bounded `listProcesses` with `AbortController`.
   - **Limitation**: Turn completion remains optimistic (`cancelled ? canceled : completed`, `server/session.ts:2040-2041` in v0.1.3); no SQLite step inspection or persistent turn journal.

2. **`f254e769a6530fe62ec4ca083cfd981f0e6b2fe9` (`f254e76`, PR `#34`) & `2ac3e6d2c543736205122e0c2045db6548b018a0` (`2ac3e6d`, PR `#35`) — Brain-Level Retry Classification & `mtimeMs` Anchoring**
   - **Files**: `server/brain-io.ts`, `server/brain-observer.ts`, `server/brain-projector.ts`, `server/brain.ts`, `tests/brain-retry.test.ts`.
   - **Mechanisms**:
     - `f254e76` adds `RETRY_EXACT_MESSAGES`, `RETRY_COUNTDOWN_PREFIXES` (`Your previous response `, `There was a problem`), and `hasPositiveRetriesRemaining` (`/^Retries remaining: [1-9]\d*$/`) in `server/brain-io.ts`; updates `StepDedupe.fresh` hash to include `row.source` and `row.error`.
     - `2ac3e6d` returns `mtimeMs` from `TranscriptReader.read`, adds `initialReadDone`, preserves `retryObservedAt` across transcript rewrites/`reset()`, adds `pruneRetrySteps(snapshotStepIndices)`, and buffers observer timestamps via `observedAtByStep`.

3. **`ef07c84` (PR `#41`) — Turn-Finish Ordering (`beforeEmit`)**
   - **Files**: `server/brain-io.ts`, `server/brain-projector.ts`, `server/brain.ts`, `server/session.ts`, `server/subagents.ts`.
   - **Mechanisms**: Defers turn finish into `finally` with `beforeEmit` hook so disposal/cleanup ordering cannot emit prematurely; injects `cancelConvergenceTimeoutMs`, `createTranscriptReader`, `readSubagents`, `hasActiveBackgroundWork`.

4. **`a8307f33d9ec119301b5cc679da6243b99c3a1f2` (`a8307f3`, PR `#42`) — Keychain Login Discovery & Bounded Usage Command**
   - **Files**: `server/preflight.ts`, `server/usage.ts`, `tests/usage.test.ts`, `tests/mock-usage.ts`.
   - **Mechanisms**: Discovers macOS keychain logins via token file, `AUTH_LOG_PATTERN` tail+head scan (`readChunkEmail` with `isContainedIn` path containment), or remembered launch; lets the CLI decide auth rather than requiring a token file; bounds `runUsageCommand` to 15 s timeout, `MAX_USAGE_STDOUT_BYTES` (1 MiB), `MAX_USAGE_STDERR_BYTES` (4 KiB), and process-group kill.

5. **`fb4a48b9981a9ae72e11c329bcfa1bc1f9cec36a` (`fb4a48b`, PR `#46`) — ACP SDK `^2.7.0` Migration & Cancel-as-Notification**
   - **Files**: `package.json`, `server/transport.ts`, `server/session.ts`, `server/mapping.ts`, `server/history.ts`, 7 test fixtures.
   - **Mechanisms**: Replaces `ClientSideConnection` with `createAcpClient()` builder + `methods` constants (`methods.agent.*`, `methods.client.*`); moves SDK types to `@agentclientprotocol/sdk/unstable`; changes `session/cancel` from RPC request to notification (`notify`) and `setSessionConfigOption` wire method to `session/setConfigOption`; bumps `@getpaseo/plugin` to `0.16.0` and CI to Node 26 / npm 12.

---

## 2. `pingdotgg/t3code` Antigravity & ACP Architecture

Repository: `https://github.com/pingdotgg/t3code` (branch `main`, pushed `2026-11-17T17:21:33Z`; latest Antigravity commit observed: `a99faf5`, `feat(antigravity): edit earlier messages with Edit from here (#38227)`).

T3 Code splits generic ACP transport/lifecycle into `packages/provider-acp` (`effect-acp` + Effect-TS) and Antigravity-specific workarounds into `apps/server/src/provider/acp/Antigravity*.ts`, `apps/server/src/provider/Drivers/AntigravityDriver.ts`, and `apps/server/src/orchestration-v2/Adapters/AntigravityAdapterV2.ts`.

### 2.1 Session Lifecycle & Process-Tree / Cgroup Isolation
- **Generic ACP Runtime** (`packages/provider-acp/src/server/AcpSessionRuntime.ts`, 3,025 lines):
  - **Linux Cgroup v2 Lease & Orphan Sweeping**: `makeLinuxCgroupController`, `wrapCommandForLinuxCgroup`, `terminateLinuxCgroupLease`, and `sweepStaleLinuxCgroupSiblings` (`t3-acp-<pid>-<uuid>`) isolate each spawned ACP agent and prevent orphaned child processes across restarts.
  - **POSIX Ownership Ledger & Windows `taskkill`**: On non-cgroup POSIX hosts, `observePosixOwnershipLedgerContinuously` + `terminatePosixOwnedProcessTree` walk `/proc/<pid>/stat` (and `ps`) across 2–8 discovery passes before `SIGTERM` → grace (`1 second`) → `SIGKILL`; Windows uses `terminateWindowsProcessTreeWithTaskkill`.
  - **Session Load Replay-Idle Gate**: `runLoadSessionWithReplayIdle` races `acp.agent.loadSession` against `waitForSessionLoadReplayIdle` (`defaultSessionLoadTimeout = 90s`, `defaultSessionLoadReplayIdleGap = 2s`) under `sessionLoadSemaphore`, preventing hangs when an agent finishes replaying history without promptly resolving the `session/load` RPC.
  - **Startup Metadata Buffering**: Buffers up to `maxStartupMetadataUpdates = 32` notifications arriving before `start()` completes.
  - **Stderr Sanitization & Enrichment**: `enrichProcessExitWithStderr` waits up to `250 millis` for stderr drain on process exit; `packages/provider-acp/src/server/stderr.ts` (`sanitizeAcpStderrExcerpt`) redacts `/pair#` URLs, `accounts.google.com` sign-in URLs, `Bearer`, `Basic`, `x-api-key`, secret tokens, and home paths within a 4,096-char tail.

### 2.2 Cancel & Interrupt Serialization
- **Antigravity Override** (`apps/server/src/provider/acp/AntigravityAcpSupport.ts:144`): Sets `cancelBehavior: "wait-for-prompt"` and `resumeMethod: "resume"`.
- **Dispatch Permit Ordering** (`packages/provider-acp/src/server/AcpSessionRuntime.ts:2412-2460, 2742-2747`):
  - `cancel` waits up to `defaultCancelTimeout` (15 s) for `activePrompt.queued` so a cancel is never sent before the prompt it targets (avoiding `agy` dropping early cancels).
  - Under `cancelBehavior === "wait-for-prompt"`, `cancel` holds `promptDispatchSemaphore` while awaiting `Fiber.await(activePrompt.fiber)` (up to `cancelTimeout`), guaranteeing a subsequent prompt cannot reach `agy` ahead of the cancel and steal it.
  - If cancellation fails to converge within `cancelTimeout`, `retireRuntime` terminates the runtime and process group cleanly with `AcpTransportError`.

### 2.3 Post-Turn SQLite Error & Retry/503/429 Inspection
- **`apps/server/src/provider/acp/AntigravityTurnOutcome.ts` (216 lines)**:
  - Uses `node:sqlite` (`DatabaseSync`, `{ readOnly: true }`, `PRAGMA busy_timeout = 100`) on `<profileDirectory>/antigravity-acp/conversations/<sessionId>.db`.
  - **Inode/File Identity Guard**: `lstat` before and after the prompt checks `sameFile` (`dev` + `ino`) and captures `startIndex = lastStepIndex(db)` before dispatch so stale pre-turn errors are never re-reported.
  - **Step Type 17 Inspection**: Queries `steps` with `idx > startIndex` (`ERROR_STEP_TYPE = 17`, `MAX_ERROR_PAYLOAD_BYTES = 16_384`).
  - **Go Error & Duration Parsing**: Matches `Error (\d{3}), Message: (.+?), Status: ([A-Z_]+)`, `reason:QUOTA_EXHAUSTED`, `quotaResetTimeStamp`, `quotaResetDelay`, and `retryDelay` (parsing Go duration units `ns/us/µs/ms/h/m/s`).
  - **Classification**: `429` or `RESOURCE_EXHAUSTED` → `class: "usage_limit"`, `retryable: true`; HTTP `>= 500` → `class: "provider_error"`, `retryable: true`; `stopReason === "refusal"` without API match → non-retryable `provider_error`.

### 2.4 Model, Thought Level, & Version Negotiation
- **`apps/server/src/provider/acp/AntigravityAcpSupport.ts`**:
  - **Release Gating**: `OPEN_MODEL_ACCESS_RELEASE = [1, 5, 1]`; `isQualifiedAntigravityRelease` gates `clientFileReads` (`readTextFile: input.clientFileReads === true && !isQualifiedAntigravityRelease(version)`). `writeTextFile` is always `false` because advertising writes causes `agy` to emit whole-file `client_edit_file` instead of diff edits.
  - **Model & Legacy Family Fallback**: `applyAntigravityAcpModelSelection` preserves saved selections across cold resumes, resolves `legacyAntigravityFamily` if a model ID is unlisted in `configOptions`, and calls `setConfigOption("model", resolved, { allowUnlistedValue: true })` before falling back or failing with `invalidParams`.
  - **Thought Level**: `antigravityThinkingConfig` (`category === "thought_level"`) + `packages/provider-acp/src/server/sessionConfig.ts` (`acpProviderOptionDescriptors`) map `thought_level` to `role: "reasoning"` and deduplicate mode descriptors via `ACP_SESSION_MODE_OPTION_ID = "_t3/session-mode"`.
  - **Multimodal & Attachment Guardrails**: `buildAntigravityPrompt` enforces MIME whitelists and byte caps (20 MiB audio/video, 1 MiB text) before encoding blocks.

### 2.5 Read-Failure Repair, Edit Diff Synthesis, Elicitation, & Child Work
- **Read Repair (`makeAntigravityReadRepair` in `AntigravityProtocol.ts:253` & `AntigravityAdapterV2.ts:155-188`)**: Works around an `agy` bug where `agy` leaks the next unrelated step error into `rawOutput` of a client-served `readTextFile` call; tracks `openReads`/`earlyOutcomes` under a `Semaphore(1)` and strips `_stepError` while emitting `status: "completed"` for served reads.
- **Edit Location & Diff Synthesis (`AntigravityEditLocation.ts`, 226 lines)**: Reads pre-edit files (`PRE_EDIT_FILE_LIMIT = 1 MiB`), normalizes PascalCase/camelCase `TargetContent`/`ReplacementContent`/`ReplacementChunks`, locates `uniqueStartLine`, and synthesizes unified diff hunks (`EDIT_DIFF_BUDGET = 1_000`, `EDIT_TEXT_BUDGET = 256 KiB`), marking unplaced snippets with `" snippet, line unknown"`.
- **Elicitation Form Folding (`packages/provider-acp/src/server/elicitationForm.ts`)**: Parses `oneOf` / `items` / `enum` JSON schemas, deduplicates ambiguous labels with `JSON.stringify`, and folds `${id}__other` companion fields into single UI questions.
- **Subagent Child Work (`AntigravityChildWork.ts`, 478 lines)**: Zero-dependency protobuf wire decoder (`STEP_INVOKE_SUBAGENT = 143`, `INVOKE_SUBAGENT_STEP_TYPE = 127`, `STEP_PLANNER_RESPONSE = 20`) on `<sessionId>.db` (8 MiB scan cap, 16 children max) + tail reader for child `transcript.jsonl` (`TRANSCRIPT_BYTE_CAP = 256 KiB`).
- **MCP Bridge (`packages/provider-acp/src/server/mcpOverAcpBridge.ts`)**: Caps connections (`MAX_CONNECTIONS = 16`) and message size (`MAX_MESSAGE_BYTES = 8 MiB`), serializes `untilNegotiated` until `mcp-session-id` and `mcp-protocol-version` are established, and restores failed `disconnect` entries on error so retries/dispose can clean up. `AntigravityAdapterV2` sets `mcpOverHttp: true` to prefer HTTP MCP over stdio when advertised.

---

## 3. Other ADEs, Community Adapters, & ACP Ecosystem

### 3.1 `agentclientprotocol/registry` (`antigravity-acp`)
- **Manifest** (`https://raw.githubusercontent.com/agentclientprotocol/registry/main/antigravity-acp/agent.json`): Distributes Google's official `agy_acp_server.par` v1.5.0 binaries (`darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`, `linux-aarch64`).
- **Protocol Matrix** (`https://raw.githubusercontent.com/agentclientprotocol/registry/main/.protocol-matrix/latest.md`): `antigravity-acp` v1.5.0 passes `agent` auth probe and advertises `loadSession`, `session/list`, and `session/resume` (lacks `session/fork`, `session/stop`, `session/set_model` in the matrix probe).

### 3.2 Community `agy-acp` Adapters
1. **`shubzkothekar/antigravity-acp`** (`https://github.com/shubzkothekar/antigravity-acp`, 85 stars, latest `v1.2.0` @ `d10aa13`, `2026-09-27`):
   - **429 / Quota Hang Fix (`a308403`, PR `#23`)**: Independently identified `ERROR_MESSAGE_STEP_TYPE = 17` in `conversationDbPath` (`step_payload` field `{ 24: { 3: error_details } }`). Distinguishes per-minute 429 retries (`agy` handles internally) from long quota exhaustion (`QUOTA_STOP_MS = 60_000`, parsing `"Resets in 1d2h3m4s"`), and **advances `session.lastStepIdx` even when a turn fails** so subsequent prompts do not re-read stale 429 steps after quota reset.
   - **Open Robustness Issues**: `#30` (leaked SQLite handle when a conversation DB fails validation), `#25`/`#28` (ACP `session.mcpServers` dropped before launching `agy`), `#27` (`session/fork` via DB cloning), `#26` (`usage_update` emission from step payloads).

2. **`shindgew/agy-acp`** (`https://github.com/shindgew/agy-acp`, 21 stars, latest `v0.5.2` @ `b98dbc8`, `2026-08-18`):
   - **Hardening Landed (`a73b055`, `fa945ca`, `b57f405`)**: Evicts forked parent when active-session cap is full; fails conversation fork atomically when brain artifact cloning fails; surfaces `SessionStore` persist failures to callers.
   - **Open Robustness Issues**: `#142`/`#143` (`Unknown reasoningEffort` when switching to a model without effort variants — needs fallback to `"none"`), `#144` (non-unique session-store temp file per write), `#138` (`gen_metadata` decode failure for ~97% of rows on field-17 fallback), `#139` (5-minute timeout cutting off long print-mode reviews).

3. **`jiridanek/agy-acp`** (`https://github.com/jiridanek/agy-acp`, pushed `2026-06-17`): Python ACP adapter targeting JetBrains IDEs and Zed.

### 3.3 Editor & Client Integration Issues (Zed, OpenCode, JetBrains)
- **Interrupt / Bootstrap Races**: Cancelling or sending a prompt before `initialize` completes triggers unacknowledged-cancel errors (`Cannot replace agent because its active run cancellation was not acknowledged`) or state desync.
- **Dead Transport Retention (`incoming_transport_closed`)**: In Zed, unexpected `agy` exits (e.g., Exit 255 on remote hosts) leave the UI bound to a dead transport with no auto-respawn, requiring an editor restart.
- **Silent History on `session/resume`**: `agy acp` v1.5.x `session/resume` restores context state without always replaying visual conversation messages to external clients, and abrupt kills corrupt trajectory DB syncing.
- **Missing Live Quota / Usage Telemetry**: External ACP clients receive only generic `stopReason` on mid-turn rate/quota limits unless they inspect local `conversations/<id>.db` or state bars.

---

## 4. Comparison Matrix of Robustness Patterns

| Robustness Dimension | `fdkevin0/paseo-agy-acp` (`v0.1.3` @ `fcac026`) | `pingdotgg/t3code` (`main` @ `a99faf5`) | `shubzkothekar/antigravity-acp` (`v1.2.0`) | `shindgew/agy-acp` (`v0.5.2`) |
|---|---|---|---|---|
| **Terminal Truth / Fail-Closed** | Optimistic (`stopReason !== 'cancelled' => completed`) | `AntigravityTurnOutcome`: post-turn SQLite `step_type = 17` + `lstat` inode check | Inspects `step_type = 17` `step_payload` (`{24:{3:...}}`); advances `lastStepIdx` on failure | Tracks active turns; open issue `#140` fixed premature tool-only cutoff |
| **429 / 503 / Quota Handling** | Brain JSONL `isRetryWarning` + `mtimeMs` anchoring (`f254e76`, `2ac3e6d`) | Regex parses `Error <status>`, `QUOTA_EXHAUSTED`, Go durations (`retryDelay`/`quotaResetDelay`) | `QUOTA_STOP_MS = 60_000` threshold; formats `"Resets in ..."` + Error ID | Print-mode timeout (`#139` open); no Go-duration parser observed |
| **Cancel / Interrupt Serialization** | `controlLane` + `RuntimeEpoch` + 200 ms probe / 350 ms convergence (`39dd7f3`); SDK 2.7 `notify` (`fb4a48b`) | `cancelBehavior: "wait-for-prompt"` holds `promptDispatchSemaphore` until prompt settles (15 s timeout) | Standard ACP cancel; `lastStepIdx` advance prevents stale error replay | Active-session eviction (`a73b055`); no dispatch semaphore |
| **Process-Tree & Shutdown** | Escalating transport shutdown (200/300/650/1100 ms); `ps` timeout (`39dd7f3`) | Linux cgroup v2 leases + orphan sweeper; POSIX `/proc` ownership ledger; Windows `taskkill` | Bun child process management; open `#30` SQLite handle leak on invalid DB | Temp-file race (`#144` open) |
| **Model & `thought_level` Fallback** | `model -> thought_level -> mode` ordering; `CANONICAL_EFFORTS` (`94c83ef`); no unavailable fallback | `legacyAntigravityFamily` + `allowUnlistedValue`; `thought_level` mapped to `role: "reasoning"` | Passes model config; no legacy family fallback observed | Open `#142`/`#143`: crashes with `Unknown reasoningEffort` on non-effort models |
| **Client Read / Edit Workarounds** | `toolAnchor` replay verification (`0f3c54e`); no client-read error stripping | `makeAntigravityReadRepair` strips leaked `_stepError`; `AntigravityEditLocation` diff synthesis; `writeTextFile: false` | Native `agy` tool execution | Regular text prompt bug (`#141` open in `0.5.2`) |
| **MCP & Elicitation** | Manual `elicitation/create` interceptor (`transport.ts:232-255`) | `mcpOverAcpBridge` (16 conns, 8 MiB cap, `mcpOverHttp: true`); `elicitationForm` `__other` folding | Open `#25`/`#28`: `mcpServers` dropped before launching `agy` | Standard ACP MCP passthrough |
| **Auth & Secret Hygiene** | Keychain + auth log tail/head scan (`a8307f3`); CLI decides auth | `AntigravityAuth` + `sanitizeAcpStderrExcerpt` (redacts URLs, Bearer/Basic/API keys, `$HOME`) | Delegates to `agy` CLI auth | Delegates to `agy` CLI auth |

---

## 5. Actionable Takeaways for Our `paseo-agy-acp` Fork

1. **Keep SQLite `step_type = 17` Inspection & Add Inode/Index Guard**: Both `t3code` (`AntigravityTurnOutcome.ts`) and `shubzkothekar/antigravity-acp` (`a308403`) independently validate our fork's `server/error-inspection.ts` design. Adopt `t3code`'s `lstat` (`dev`/`ino`) `sameFile` check + pre-turn `startIndex` capture (and `shubzkothekar`'s invariant of advancing the step cursor on failed turns) so stale 429/500 rows are never re-read after a reset or DB replacement.
2. **Adopt `promptDispatchSemaphore` + `"wait-for-prompt"` Cancel Ordering**: If migrating to ACP SDK `>= 2.7.0` (where `session/cancel` is a fire-and-forget `notify`), serialize `cancel` and `prompt` dispatch like `t3code`'s `AcpSessionRuntime.ts` (`cancelBehavior: "wait-for-prompt"`) so a queued next prompt cannot steal a cancel meant for the prior turn, and retire/kill the transport if convergence exceeds the cancel timeout.
3. **Add `session/load` Replay-Idle Gate & Stderr Secret Redaction**: `t3code`'s `runLoadSessionWithReplayIdle` (2 s idle gap, 90 s cap) prevents indefinite hangs on `session/load` when `agy` finishes replaying without resolving the RPC; `sanitizeAcpStderrExcerpt` prevents leaking Google sign-in URLs or tokens in error surfaces.
4. **Guard `readTextFile` Error Leaks & `writeTextFile: false`**: Keep `writeTextFile: false` in client capabilities (preserving diff edits over whole-file `client_edit_file`), and if `readTextFile` is enabled for pre-1.5.1 `agy` releases, implement `makeAntigravityReadRepair` so `agy` does not attach unrelated step errors to served reads.
5. **Cherry-Pick Upstream `f254e76` + `2ac3e6d` (and Optionally `a8307f3`)**: Upstream `v0.1.3` remains unchanged since 2026-11-16; selectively backporting brain-level `RETRY_COUNTDOWN_PREFIXES` + `mtimeMs` anchoring complements our SQLite inspection without regressing B1–B3.
