# Worker 2 Dispatch: Implementation of Iteration 2 Defect Fixes & Hardening

## Target Scope
Implement the full set of defect fixes and hardening measures across:
- `scripts/lib/room-storage.ts`
- `scripts/lib/agent-driver.ts`
- `scripts/cli-room.ts`
- `tests/test-cli-room.mjs`

References:
- `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md`
- `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/orchestrator/PROJECT.md`
- `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/orchestrator/GATE_STATUS.md`
- `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/explorer_iter2_1/handoff.md`
- `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/explorer_iter2_2/handoff.md`
- `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/explorer_iter2_3/handoff.md`

## Specific Fixes Required

### 1. `scripts/lib/room-storage.ts`
- **Path Traversal & Slug Validation**:
  Implement `sanitizeGroupId(groupId: string): string`:
  - Validate non-empty, trimmed string.
  - Regex whitelist: `/^[a-zA-Z0-9_\-]+$/`. Throw `Error` if invalid.
  - Path boundary check: ensure `path.resolve(baseDir, trimmed)` is inside `getGroupsBaseDir()` and equals `path.join(baseDir, trimmed)`. Throw `Error` if outside.
  - Apply `sanitizeGroupId` at entry of `getOrCreateRoom`, `loadRoomHistory`, `appendRoomMessage`, `getDeltaMessages`, `updateWatermark`.
- **Concurrency Serialization**:
  Implement per-room Promise queue `withRoomLock(groupId: string, fn: () => Promise<T>): Promise<T>` to serialize write operations (`appendRoomMessage`, `updateWatermark`), ensuring `Promise.all` parallel writes do not lose messages or duplicate sequences.
- **Surrogate Pair Safe Slicing**:
  Implement `safeTruncateContent(content: string, maxLen: number = 600): string` using `Array.from(content)` to avoid splitting Unicode surrogate pairs / Emojis.

### 2. `scripts/lib/agent-driver.ts`
- **Untrusted Envelope Breakout Protection**:
  Implement `sanitizeUntrustedContent(content: string): string`:
  - Escape `</untrusted-json-block>` using replacement function `() => '<\\/untrusted-json-block>'` (valid JSON escaped slash, prevents premature XML tag closure).
  - Use `sanitizeUntrustedContent` when mapping `deltas` for `deltaPayload`.

### 3. `scripts/cli-room.ts`
- **Strict CLI Argument Validation & Exit Code 2**:
  - Class `CliArgumentError extends Error` with `exitCode = 2`.
  - In `parseCliArgs`:
    - Any unrecognized flag starting with `-` or unexpected argument: throw `CliArgumentError`.
    - If `--room` is passed without value or with empty string: throw `CliArgumentError`.
    - If `--send` is passed without value or with empty string: throw `CliArgumentError`.
  - In `main()`: catch `CliArgumentError` or errors from `parseCliArgs`, print error in red, and call `process.exit(2)`.
- **Prevent Fallthrough to REPL on Empty Send**:
  - In `runCliRoom`: check `if (args.send !== undefined)` instead of truthiness `if (args.send)`. If empty, print error and return 2.
  - If `args.room !== undefined`, validate and call `sanitizeGroupId(args.room)`. If invalid, print error and return 2.

### 4. `tests/test-cli-room.mjs`
- Add tests covering the new hardening features:
  - Exit code 2 on unknown flags (`--invalid-flag`).
  - Exit code 2 on empty room slug (`--room ""`).
  - Path traversal rejection on `--room "../evil-room"`.
  - Rejection on empty `--send ""`.
  - Concurrency serialization: 10 parallel `appendRoomMessage` calls all preserved with monotonic sequence 1..10.
  - Untrusted envelope escape verification.
- Keep file line count strictly `<= 600` lines! (Refactor shared CLI spawn helper if needed).

### Verification
Run:
- `node tests/test-cli-room.mjs` (must pass 100%, exit code 0)
- `node scripts/cli-room.ts --test` (must pass, exit code 0)
- `node scripts/cli-room.ts --invalid-flag --headless` (must exit with code 2)
- `node scripts/cli-room.ts --room "" --headless` (must exit with code 2)
- `node scripts/cli-room.ts --room "../evil" --headless` (must exit with code 2)
- `node scripts/cli-room.ts --send "" --mock-run` (must exit with code 2, NOT hang)
- `wc -l scripts/lib/*.ts scripts/cli-room.ts tests/test-cli-room.mjs` (all must be <= 600 lines)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write completion report to `.agents/teamwork/worker_2/handoff.md`.


## 2026-11-02T15:51:07Z
Received dispatch from parent 6b30ea9e-f854-4e5d-a1e8-c198386ac545:
Implement the fixes and hardening across:
- `scripts/lib/room-storage.ts`
- `scripts/lib/agent-driver.ts`
- `scripts/cli-room.ts`
- `tests/test-cli-room.mjs`
Follow blueprints in DISPATCH.md and Explorer handoffs.
