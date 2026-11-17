---
doc_id: DOCS_OM_REVIEW
status: CURRENT
version: 1.3.0
last_verified: 2026-11-07
language: en-US
name: review
description: Binding review and cross-review procedure, REVISE cap, dispute path, and the dormant code ladder. Load when reviewing, disputing or retrying.
type: DOCS_LEAF
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [src/daemon/orchestrator/BlackboardOrchestrator.ts, src/daemon/orchestrator/AgentOrchestrator.ts, Customizations/agents/, src/daemon/blackboard/blackboardMcp.ts, src/daemon/blackboard/lifecycleHooks.ts, src/daemon/blackboard/types.ts, src/daemon/transport/DaemonServer.ts, test/blackboard-atomic.test.ts, docs/architecture/companion-groupchat-blackboard-v4-production-full-spec.md]
---

# [0] ROOT: REVIEW AND CROSS-REVIEW

## [1] ROUTES
- [1.1] [task-lifecycle](task-lifecycle.md) :: [LOAD_IF: need the stage before or after review]
- [1.2] [roles](roles.md) :: [LOAD_IF: need who may review or decide a dispute]
- [1.3] [cross-review-proposal](../proposals/cross-review-v2.md) :: [LOAD_IF: designing the review ladder, attempt counter, reviewer independence, fingerprints, arbitration schema or reviewer sandbox]

## [2] REVIEW PROCEDURE
- [2.1] **Binding Scope**: [2] and [3] bind the human and root-session process now. No runtime path enforces them ([4.1]).
- [2.2] **Input**: The committed SHA that passed the gate, the raw gate output and the task order. The implementer's report is a claim to check, not evidence ([delivery-rules](delivery-rules.md) [2.4]).
- [2.3] **Read-Only**: The reviewer reads the whole diff first and never edits the tree it judges.
- [2.4] **Verdict**: PASS or REVISE. Claims beyond evidence, or a diff touching the tests or gate config that judge it ([delivery-rules](delivery-rules.md) [2.5]) -> REVISE.
- [2.5] **Revise Cap**: REVISE returns the task to build, at most 3 rounds, then [3.2]. A shared gate-and-review attempt counter is only proposed ([cross-review-proposal](../proposals/cross-review-v2.md) [3.3]).
- [2.6] **No Verdict**: A review that ends without a verdict is re-run alone; the build and the gate are not re-run ([delivery-rules](delivery-rules.md) [2.4.1]).
- [2.7] **Two Reviews**: Release, data migration and rewriting pushed history need 2 independent PASSes ([delivery-rules](delivery-rules.md) [2.6]); neither reviewer sees the other's verdict, and any REVISE wins.

## [3] DISPUTE AND CROSS-REVIEW TREE
- [3.1] **Dispute?**: The implementer holds the acceptance check wrong or the order unsatisfiable -> [3.2]. Otherwise follow the verdict.
- [3.2] **Escalate**: Dispute or REVISE cap -> `TERM_ESCALATE` to a human maintainer with the gate tail, the REVISE findings and the dispute. No bot role decides disputes today ([roles](roles.md) [2.8]).
- [3.3] **Test Defect Ruled**: A wrong acceptance check is fixed by MoCI as a new task ([delivery-rules](delivery-rules.md) [2.3.1], [2.5]); the human re-queues the original task afterwards -> `TERM_OK`.
- [3.4] **Spec Ruled Ambiguous**: The planner re-issues the order under a new task id -> `TERM_OK`.

## [4] DOC VS CODE
- [4.1] **Dormant Ladder**: The review ladder lives in `BlackboardOrchestrator`, which nothing constructs: `DaemonServer`, `scripts/` and `test/` construct `AgentOrchestrator` only. Live chat replies get no review step.
  - [4.1.2] **Live Path Overlap**: `AgentOrchestrator` now opens its own `BlackboardStore`, attaches the compaction hooks and the command guard, and rolls the store back on room rewind, but runs no blackboard MCP server and no verdict tool. Live `capabilities.json` files list `mcp__blackboard__read_blackboard`, a tool no server defines.
  - [4.1.1] **Spec Claim**: v4 spec §2.3 describes this ladder as live; test 7 in `test/blackboard-atomic.test.ts` sets counters via `store.mutate` and never calls `handleRejectionPolicy`.
- [4.2] **Verdict Tool**: `post_review_verdict` (`blackboardMcp.ts`) uses `VERIFIED`/`REJECTED`, not PASS/REVISE, and the 4 `FailureType` values in `types.ts`. On REJECTED it raises `rejectionCount` and sets `BLOCKED_NEED_HUMAN` at `rejectionCount >= 3` or `stagnationCount >= 2`.
  - [4.2.1] **Stagnation**: `update_task_status` hashes the trimmed summary text, not the diff, so rewording evades it.
  - [4.2.2] **No Exit From Blocked**: `update_task_status` allows no transition out of `BLOCKED_NEED_HUMAN`; `create_task` keeps the first `MAX_BACKLOG_ITEMS` backlog entries and drops the newest.
- [4.3] **Cross-Review**: `handleRejectionPolicy` runs one moAdmin run when `rejectionCount === 2` or `failureType === 'TEST_SUITE_DEFECT'`, once per task (`crossReviewed`). Its report is cut to 300 chars into `lastVerdict.testIntegrityNote`; `coder_view.lastFailure` shows it, `qa_view` omits it, and nothing binds the next step.
  - [4.3.1] **Arbiter Is Planner**: The run is moAdmin, the planner ([roles](roles.md) [2.2]), so it judges a task order its own role wrote.
  - [4.3.2] **Non-Atomic**: It reads `task` before the awaited run, then mutates `draft.kanban.activeTask` without checking the task id and sets `crossReviewed` only afterwards; a crash during the run repeats the cross-review, and a changed active task gets marked instead.
- [4.4] **Judge Runs Tests**: `runQaTurn` gives moCI `Bash` with `dontAsk`; the same LLM runs the tests and judges, against [delivery-rules](delivery-rules.md) [2.4.2].
  - [4.4.1] **Model Tiers**: Defaults: QA `haikuModel` = `claude-sonnet-4-6`, coder `sonnetModel` = `claude-opus-4-6`; the cross-review arbiter also uses `sonnetModel`, so it shares the implementer's model. Every bot falls back to `gemini-3.8-flash`, so a fallback puts all roles on one model.
- [4.5] **Loop Cap**: `runFsmLoop` caps at 15 iterations per `executeUserTurn` and then returns `formatFinalDelivery`, a "delivery complete" message, even when the task is unfinished.
  - [4.5.1] **Unattached Hook**: `coderStopComplianceHook` is defined in `lifecycleHooks.ts` and attached by neither `BlackboardOrchestrator` nor `AgentOrchestrator`, so a coder run may end without a status change at no cost.
- [4.6] **Shared Context**: One blackboard MCP server serves every role and `read_slice` accepts `all`; the `SessionStart` hook from `createCompactionGuardHooks` injects state into every session without checking the start source, now on every live `AgentOrchestrator` runner too; ladder runs use `Customizations/agents/<bot>/claude_config`, the live bot's own config dir, so moAdmin's distiller, cross-review and scribe runs share it with live moAdmin; every role runs with `cwd` = project root; actor labels in `store.mutate` are fixed strings.
