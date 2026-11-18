---
doc_id: DESIGN-PATTERNS-SHARD-04
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Shared Blackboard Token Budgeting & Three-Tier Quality Arbitration

Parent index: [../INDEX.md](../INDEX.md)
Related shards: [01-attention-and-compaction.md](01-attention-and-compaction.md) · [02-cache-layers-and-instruction-budget.md](02-cache-layers-and-instruction-budget.md) · [05-multiagent-roi-and-memory.md](05-multiagent-roi-and-memory.md)

## 1. Five-Scope `1,400`-Token Shared Blackboard SSOT

Coordinate multi-process agents via a dual-state host blackboard—SQLite WAL (`PRAGMA journal_mode = WAL`) synced post-commit to human-auditable `GROUP_MEMORY.md` / `.t3/TASK_MANIFEST.md`—and cap every injected projection strictly at **`<= 1,400` tokens**.
Unbounded shared state dumps thrash prompt caches and dilute model attention.

| Scope | Token Cap | Hard Field & Cardinality Bounds | Ownership & Mutation Invariant |
| :--- | :--- | :--- | :--- |
| **1. `root_objectives` (`G0`)** | `<= 150` | `objective <= 300` chars; `<= 5` `invariants` at `<= 120` chars each | Initialized once by orchestrator at turn 0 and sealed (`locked = true`); downstream calls cannot mutate `G0`, blocking goal drift. |
| **2. `kanban_view`** | `<= 350` | `activeTask` pointer + FIFO `backlog <= 5` items (`title <= 100` chars) | Verified tasks exit `kanban_view` immediately so historical backlog never consumes active budget. |
| **3. `active_task_state`** | `<= 500` | `specification <= 600` chars; `acceptanceCriteria <= 300` chars; `latestSummary <= 300` chars | Carries concrete path bounds and verification commands; forbid raw code blocks (`> 5` lines) inside `latestSummary`. |
| **4. `recent_digest`** | `<= 250` | `K = 2` FIFO sliding window (`summary <= 180` chars, `<= 5` files, `unresolved <= 100` chars) | Committing epoch $e_3$ evicts $e_1$ automatically, preserving cross-task architectural continuity at fixed cost. |
| **5. `governance_audit`** | `<= 150` | `<= 10` folded `touchedFiles` + `lastVerdict` (`reproCommand <= 150`, `errorSnippet <= 400`, `diagnosis <= 200` chars) | Exposes cumulative blast radius and the latest independent QA arbitration outcome. |

### 1.1 Role-Filtered Projections & Epoch-Gated Tail Injection

1. **Least-Privilege Role Views (`selectProjection`)**:
   - `coder_view`: `rootGoal`, `activeTask`, `environment`, `lastFailure` (only when `REJECTED`), and `slidingDigest.slice(-1)`.
   - `qa_view`: `rootGoal.invariants`, `activeTask`, `touchedFiles`, and `previousRejections`.
   - `distiller_view` / `scribe_view`: `rootGoal`, `activeTask`, `backlog`, and `slidingDigest`.
2. **Epoch-Gated Tail Placement (`C1`)**:
   - Exclude blackboard state from Tier 1/2 static prefixes completely.
   - Append the projected slice as a Tier 3 tail block strictly when blackboard `version` / `epoch` advanced since that agent's prior turn, preserving upstream KV-cache hits.

---

## 2. Path Bucket Folding & Host-Owned Versioning

### 2.1 Directory-Prefix Bucket Folding (`compactTouchedFiles`)

Compress cumulative `touchedFiles` deterministically whenever modified paths exceed `MAX_TOUCHED_FILES = 10` so wide refactors never breach Scope 5's `150`-token ceiling:
1. **Normalize & Deduplicate**:
   - Convert path separators to POSIX `/`, strip leading `./`, deduplicate exact strings, and sort lexicographically.
2. **Prefix Bucket Reduction**:
   - Group sibling paths sharing a two-segment directory prefix (such as `paseo-agy-acp/server/*`).
   - Collapse the largest multi-file buckets into `prefix/* (N files)` summary entries until total entries satisfy `<= 10`, retaining standalone root files verbatim.

### 2.2 Transparent Server-Side Version Increment & Unidirectional FSM

Strip optimistic-locking fields (`expectedVersion`, `casToken`) from LLM-facing MCP tool schemas and enforce concurrency + state transitions inside host SQLite `BEGIN IMMEDIATE` transactions:
1. **Zero LLM Lock Bookkeeping**:
   - Rationale: LLMs frequently hallucinate or replay stale integer lock counters, causing avoidable CAS retry loops; the host executes `version = version + 1` transparently on commit.
2. **Unidirectional State Machine**:
   - Enforce `TODO -> IN_PROGRESS -> IN_REVIEW -> VERIFIED` in host TypeScript guards.
   - Redline: Block backward transitions (`VERIFIED -> TODO`) and NEVER permit an implementer role (`bot-mocode`) to mark its own task `VERIFIED`.

---

## 3. Three-Tier Quality Ladder & Deadlock Circuit Breaker

Replace open-ended coder-reviewer ping-pong loops with a bounded three-tier escalation ladder.

### 3.1 L1: Bounded Local Self-Healing (`attemptCount: 0 -> 1`)

Allow at most **one** local self-healing retry on initial verification failure:
1. **Tail-40 Slicing & Linear-Time `RE2` Sanitization**:
   - Slice the trailing `<= 40` lines (`<= 8` KB) of gate output and scrub credentials, tokens, and local user paths with linear-time `RE2` regexes (preventing catastrophic regex backtracking on minified stack traces).
2. **Single Scoped Repair**:
   - Roll back broken partial workspace edits if needed, increment `attemptCount += 1`, and dispatch one targeted self-fix turn to the implementer.

### 3.2 L2: Four-Party Separated Clean-Room Arbitration

When failure persists past L1, invoke an independent **Arbiter** under strict **Four-Party Separation** (`Planner != Coder != QA != Arbiter`) inside a **read-only clean-room sandbox** (re-running checks in isolated state to separate real defects from port collisions or dirty caches):

| Canonical Verdict | Root Cause Class | Host State Transition & Quota Rule |
| :--- | :--- | :--- |
| **`CODE_DEFECT`** | Genuine implementation logic, type, boundary, or regression defect. | Set `IN_PROGRESS` with `path + symbol` repair brief; **consume `1` coder attempt** (`attemptCount += 1`). |
| **`TEST_DEFECT`** | Flaky assertion, stale mock, or defective test harness. | Hold task in `BLOCKED_WAIT_TEST_FIX`; **do not deduct coder attempt**; dispatch QA (`bot-moci`) to fix tests. |
| **`SPEC_AMBIGUOUS`** | Contradictory requirements or undefined edge-case contract. | Suspend task; **do not deduct coder attempt**; route back to orchestrator (`bot-moadmin`) for disambiguation. |
| **`ENV_BLOCKER`** | Occupied port, zombie process, missing binary, or network outage. | Set `BLOCKED_ENV`; **do not deduct coder attempt**; run host clean-room sanitizer or report infrastructure block. |

### 3.3 L3: SHA-256 Stagnation Fingerprint & Human Escalation

Compute a deterministic SHA-256 fingerprint after every failed attempt over normalized `(taskId, failureType, canonicalTopErrorSignature, sortedTouchedFilesDigest)`:
- Increment `stagnationCount` whenever consecutive attempts yield an identical SHA-256 digest (proving zero state progress).
- **Hard Circuit Breaker**: Trip immediately when `stagnationCount >= 2` or total repair attempts hit `MAX_REPAIR_ROUNDS = 3`; atomically elevate task state to `WAIT_USER_DECISION`, write a forensic snapshot, and require an authenticated human operator decision to resume.

---

## 4. Blackboard & Arbitration Anti-Pattern Matrix

| Anti-Pattern | Failure Mode | Required Host Mechanism |
| :--- | :--- | :--- |
| In-memory JS Map as multi-agent blackboard | Subagent processes exit on turn completion (`Exit Code 0`), wiping unpersisted state. | Persist SSOT in SQLite WAL (`BEGIN IMMEDIATE`) and project post-commit to `GROUP_MEMORY.md` / `.t3/TASK_MANIFEST.md`. |
| Exposing `expectedVersion` CAS argument to LLMs | Models pass stale integer versions, burning turns on optimistic-lock rejection loops. | Strip lock fields from MCP schemas; validate FSM transitions and increment `version = version + 1` on the server. |
| Author role (`bot-mocode`) verifying its own task | Shared blind spots rubber-stamp broken builds or weakened assertions. | Enforce Four-Party Separation (`Planner != Coder != QA != Arbiter`); block author transitions to `VERIFIED`. |
| Deducting coder retry quota on flaky tests or port conflicts | Exhausts `MAX_REPAIR_ROUNDS = 3` on non-code failures while leaving broken tests intact. | Run L2 Arbiter in a clean-room sandbox; route `TEST_DEFECT` to QA and `ENV_BLOCKER` to host sanitizer with `0` coder quota deduction. |
| Backtracking PCRE regexes over raw minified error logs | Catastrophic regex backtracking freezes the Node.js daemon event loop. | Slice gate output to trailing `<= 40` lines (`<= 8` KB) and sanitize strictly with linear-time `RE2` expressions. |

---

## 5. Conformance Invariants

- Assert every `selectProjection` payload (`coder_view`, `qa_view`, `distiller_view`, `scribe_view`) serializes within `<= 1,400` tokens under maximal field lengths.
- Assert `compactTouchedFiles` reduces arbitrary `100+` path sets into `<= 10` entries without mutating standalone root filenames.
- Assert `rootGoal.locked === true` rejects subsequent `create_task` root-goal mutations while preserving `G0` verbatim.
- Assert `TEST_DEFECT`, `SPEC_AMBIGUOUS`, and `ENV_BLOCKER` verdicts leave `coder.attemptCount` unchanged, and two consecutive identical SHA-256 failure fingerprints (`stagnationCount >= 2`) transition immediately to `WAIT_USER_DECISION`.
