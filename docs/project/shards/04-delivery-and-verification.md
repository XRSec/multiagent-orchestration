---
doc_id: PROJ-DELIVERY-VERIFICATION
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Multi-Agent Delivery, Handoff Contracts & Verification Gates

End-to-end execution lifecycle, wire-level brief/handoff schemas, QA gatekeeper rules, and bounded repair governance across `paseo-bots/`. Parent router: [../INDEX.md](../INDEX.md). Fleet definitions: [03-bot-fleet-and-teams.md](03-bot-fleet-and-teams.md).

## 1. End-to-End Task Lifecycle & Pure Orchestrator Boundary

Drive every multi-step engineering request through an explicit 6-phase state machine while keeping orchestration physically separated from code mutation:

| Phase | Owner | Mandatory Action & Exit Gate |
| :--- | :--- | :--- |
| 1. **Order & Manifest** | `bot-moadmin` | Decompose goal, authorized paths, forbidden paths, and DoD into session blackboard `TASK_MANIFEST.md` (plus `<projectRoot>/.t3/TASK_MANIFEST.md` when repo-backed). Missing scope or acceptance check returns `TERM_BLOCK(2)` |
| 2. **Recon & Vacuity** | `bot-modeep` / `bot-moci` | Sample 1 live record or probe target schemas before coding (`AGENTS.md` §1.1); verify new acceptance checks fail on the untouched base before implementation |
| 3. **Surgical Build** | `bot-mocode` | Edit strictly within authorized scope; run local build/syntax checks; emit structured `<worker_handoff>` |
| 4. **Independent Gate** | `bot-moci` | Audit `git status`/`git diff` and execute test, typecheck, and lint suites independently; issue `PASS`, `WARN`, or `FAIL` |
| 5. **Arbitration & Repair** | `bot-moadmin` | Evaluate 3 review gates (Scope Diff, DoD Proof, Integrity); dispatch `<repair_brief>` on failure (`<= 3` rounds) or approve write-back |
| 6. **Write-Back & Squash** | `bot-modoc` / `bot-mogit` | Co-update affected `docs/` shards in-place, curate `MEMORY.md`, settle manifest (`settleTask` in `paseo-bots/server/tasks.ts`), and squash commits before push |

### Pure Orchestrator Redline (`ORCHESTRATOR_WORKFLOW_PROTOCOL`)
- `bot-moadmin` MUST NEVER edit application source files, execute ad-hoc build commands, or synthesize unverified test outputs (`paseo-bots/shared/workflows.ts`).
- Delegate every file inspection, code edit, test execution, documentation write-back, and Git operation to its designated `bot-*` specialist.
- Enforce bounded autonomous turns (`<= 20` turns per task, `AGENTS.md` §4.4) before requesting an operator checkpoint.

---

## 2. Structured Brief & Handoff Wire Contracts

Construct stage prompts via `buildStageBriefPrompt` and parse worker replies via `extractWorkerHandoffBlock` and `parseWorkerHandoff` in `paseo-bots/shared/workflows.ts`. Workers carry zero implicit parent chat history and rely solely on these deterministic envelopes.

### 2.1 Initial Dispatch (`<task_brief>`)
```xml
<task_brief>
- WORKFLOW: <workflow_name>
- STAGE_ID: <stage_id>
- STAGE_NAME: <stage_name>
- SESSION_BOARD: <session_board_dir>
- TASK_MANIFEST: <session_board_dir>/TASK_MANIFEST.md
- WORKFLOW_INPUT:
<self_contained_user_goal_and_constraints>
- UPSTREAM_CONTEXT:
<distilled_upstream_handoffs_capped_at_2000_chars_plus_cold_file_paths>
- SPECIFICATION:
<stage_instructions_authorized_paths_and_dod>
</task_brief>
```

### 2.2 Worker Return Contract (`<worker_handoff>`)
Conclude every worker turn with a closed `<worker_handoff>` outside inline backticks (`extractWorkerHandoffBlock` scans backwards from the last closing tag so inline code mentions do not corrupt extraction):
```xml
<worker_handoff>
STATUS: PASS | PARTIAL | BLOCKED | FAILED
SUMMARY: <1-3 concise bullets of changes or findings>
TOUCHED_FILES: <exact repo-relative paths or "None">
VERIFICATION_PROOF: <exact command, exit code, and 3-10 line raw output excerpt>
DOD_CHECKLIST: <itemized pass/fail mapping against stage DoD>
OPEN_ISSUES: <"None" or exact blocker description>
</worker_handoff>
```

### 2.3 Surgical Retry Dispatch (`<repair_brief>`)
On `attempt > 1`, `buildStageBriefPrompt` prepends `<repair_brief>` ahead of `<task_brief>`:
```xml
<repair_brief>
- WORKFLOW: <workflow_name>
- STAGE_ID: <stage_id> (<stage_name>)
- ATTEMPT: <attempt>/<max_attempts>
- PREVIOUS_FAILURE: <exact_gate_error_or_rejection_reason>
- INSTRUCTION: Diagnose the failure above, apply only the minimal surgical fix required without rewriting working parts, and re-verify.
</repair_brief>
```

### 2.4 Inline Slicing & Proof Preservation (`MAX_INLINE_UPSTREAM_CHARS = 2000`)
- When an upstream stage output exceeds `2000` characters, `buildStageBriefPrompt` writes the full output to `handoffFilePath` on the Session Blackboard and appends a cold path citation.
- If the `<worker_handoff>` block itself exceeds `2000` characters, the slicer preserves the head (`30%`) and tail (`70%`, housing `VERIFICATION_PROOF` and `OPEN_ISSUES`) so downstream auditors never lose exit-code evidence.

---

## 3. QA Gatekeeping, Integrity & Proof Triad

Audit every engineering deliverable with zero trust (`bot-moci` and `bot-moadmin`):

### 3.1 MoCI 3-Tier Verdict (`PASS` / `WARN` / `FAIL`)
| Verdict | Handoff `STATUS` | Criteria & Downstream Effect |
| :--- | :--- | :--- |
| `PASS` | `PASS` | All required tests, typechecks, and linters exit `0`; `TOUCHED_FILES` stays strictly inside authorized scope; advances to `moadmin-review` |
| `WARN` | `PASS` | All functional and safety gates exit `0`, with non-blocking residual advisories itemized in `OPEN_ISSUES`; advances for `moAdmin` sign-off |
| `FAIL` | `FAILED` (or `BLOCKED`) | Any failing assertion, non-zero exit code, unauthorized diff, `TODO` stub, or missing proof (`BLOCKED` if gated by external credentials/ports); triggers repair or escalation |

### 3.2 `moadmin-review` Three-Gate Arbitration
1. **Scope Diff Check**: Compare `git status --short` / `TOUCHED_FILES` against authorized task paths; reject any drive-by refactor or out-of-scope mutation.
2. **DoD Proof Check**: Verify every `DOD_CHECKLIST` item maps to a concrete command with `exit_code == 0` in `VERIFICATION_PROOF`.
3. **Acceptance Integrity Check**: Confirm zero weakened assertions, zero `.skip` / `@ts-ignore` / mock bypasses, and zero unfinished `TODO` placeholders.

### 3.3 Acceptance Integrity & Vacuity Check
- **Acceptance Integrity**: The implementer (`bot-mocode`) MUST NEVER delete, weaken, skip, or rewrite the acceptance test or linter config judging its own task. If an existing test is defective, halt and escalate to `bot-moadmin` so `bot-moci` fixes the test in an isolated step.
- **Vacuity Check (Fail-Before-Pass)**: Execute every new regression test or acceptance script against the unpatched baseline (or reproduce the fault) before accepting the fix. A check that passes on an unmodified tree is vacuous (`TERM_BLOCK(2)`) and must be rewritten.

### 3.4 Proof Triad for Runtime & Service Deliverables
Plans, markdown updates, or bare `"build succeeded"` logs never prove runtime readiness. Claiming `"works"` or `"ready"` on a daemon, plugin, or adapter task requires all three items in `VERIFICATION_PROOF`:
1. **Real Session Diff**: Non-empty `git diff --stat` / `git status` matching the implementation scope.
2. **Live Process / Binding**: OS-level process or transport evidence (owning PID + bound port, or active ACP stdio session handshake).
3. **Valid End-to-End Payload**: Real request/RPC execution returning parsed domain data (`401`, `403`, `502`, login redirect, empty body, or `--help` output is a failure).

---

## 4. Bounded Repair & Git Tree Hash Stagnation Escalation

1. **In-Session Repair Cap (`MAX_REPAIR_ROUNDS = 3`)**:
   - Route `FAIL` verdicts back to the active worker session (`send_message` or `runWorkflowDag` stage retry) for at most `3` surgical repair rounds (`AGENTS.md` §4.4).
   - Reuse the existing worktree/session context so diagnostic history remains hot without repeating cold codebase reconnaissance.
2. **Git Tree Hash Stagnation Detection**:
   - Track real state transitions across repair rounds via `git write-tree` (or `HEAD^{tree}` + working-tree diff digest) rather than hashing LLM summary text.
   - Rewording `<worker_handoff>` prose while producing an identical file tree (`stagnationCount >= 2`) or failing `3` consecutive times on the same target trips the 3-Fail Circuit Breaker (`AGENTS.md` §1.1).
3. **Operator Escalation (`TERM_ESCALATE`)**:
   - Upon exhausting `MAX_REPAIR_ROUNDS = 3`, hitting Git tree stagnation, or encountering an unsatisfiable spec dispute, stop autonomous retries immediately and report to the operator with: (a) exact failing command and stderr tail, (b) touched-file diff summary, and (c) concrete resolution options.

---

## 5. Parsed Handoff Status Routing Matrix (`parseWorkerHandoff`)

`paseo-bots/server/workflow-runner.ts` (`waitForStageWithHeartbeat` and `reconcileOrphanWorkflows`) evaluates `ParsedWorkerHandoff.status` deterministically:

| `ParsedWorkerHandoff.status` | Stage Transition | Retry / Escalation Behavior |
| :--- | :--- | :--- |
| `PASS` | `done` | Persists output & `handoffFilePath`, unlocks downstream `readyStages`, updates Task Card |
| `PARTIAL` | `failed` (retryable) | Increments `retries`; dispatches `<repair_brief>` if `retries <= maxRetries`, else fails workflow |
| `FAILED` | `failed` (retryable) | Increments `retries` with `computeBackoffMs`; dispatches surgical `<repair_brief>` up to cap |
| `BLOCKED` | `failed` (environment/guardrail) | Surfaces `OPEN_ISSUES` blocker (missing secret, permission, external outage) for operator intervention |
| `UNKNOWN` (no `<worker_handoff>` block) | Backward-compatible `done` on clean turn exit | Accepted for legacy free-form bots only; rejected during `moadmin-review` in `wf-moadmin-closed-loop` |
