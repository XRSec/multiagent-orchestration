---
doc_id: DOCS_PROPOSAL_CROSS_REVIEW_V2_CHANGES
status: PROPOSED
name: cross-review-v2-changes
version: 0.3.0
last_verified: 2026-11-07
language: en-US
description: PROPOSED code changes and doc updates for the cross-review ladder v2. Binds nothing until an owner ruling.
type: DOCS_PROPOSAL
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/proposals/cross-review-v2.md, docs/operating-model/review.md, src/daemon/orchestrator/BlackboardOrchestrator.ts, src/daemon/blackboard/blackboardMcp.ts, src/daemon/blackboard/types.ts, test/blackboard-atomic.test.ts]
---

# [0] ROOT: CROSS-REVIEW LADDER V2 CHANGES (PROPOSED)

## [1] ROUTES
- [1.1] [cross-review-v2](cross-review-v2.md) :: [LOAD_IF: need the proposed rules these changes implement]
- [1.2] [review](../operating-model/review.md) :: [LOAD_IF: need the rules that bind today and the current code facts]

## [2] STATUS
- [2.1] **Proposed**: Nothing here is in `src/` or binding; node numbers without a link point into this leaf.

## [3] PROPOSED CODE CHANGES
- [3.1] **Order**: [cross-review-v2](cross-review-v2.md) [4.1] first; then [3.2]; then the rest.
- [3.2] **Pure Decide**: New `src/daemon/blackboard/decide.ts` implementing [cross-review-v2](cross-review-v2.md) [3.8.1], with table-driven tests per row; replaces counter mutation in test 7 of `test/blackboard-atomic.test.ts`.
- [3.3] **Types**: `types.ts` `TaskStatus`, `FailureType`, `ActiveTask` gain the [cross-review-v2](cross-review-v2.md) [3.7.1] classes, its `BLOCKED_*` states, `PASS`/`REVISE`, attempt, fingerprints, `acceptancePaths`, `baseSha`, `attemptSha`; drop `crossReviewed`.
- [3.4] **Tools**: `blackboardMcp.ts` `post_review_verdict` records only and validates [cross-review-v2](cross-review-v2.md) [3.6.1]; `update_task_status` drops the summary hash and takes `commitSha` and `dispute`; new `post_arbitration`; per-role MCP servers replace `read_slice('all')`.
- [3.5] **Runner Options**: `BlackboardOrchestrator.buildRunnerOptions` sets per-role config dirs separate from the live bot's `claude_config` (today shared), `persistSession: false` and a detached worktree cwd for judgment roles, no Bash for the reviewer; separate implementer, reviewer and arbiter model options.
- [3.6] **Loop**: `runFsmLoop` ends in `BLOCKED_LOOP_CAP`, not `formatFinalDelivery`; `handleRejectionPolicy` becomes the arbitration handler, which checks the active task id and writes an `arbitration started` mark before dispatch, each in one store transaction ([review](../operating-model/review.md) [4.3.2]); attach or delete `coderStopComplianceHook`; gate the `SessionStart` hook on the compaction source, in `BlackboardOrchestrator` and `AgentOrchestrator.getOrCreateRunner`.
- [3.7] **Gate Script**: New `scripts/gate.ts` per [cross-review-v2](cross-review-v2.md) [3.4]-[3.5].

## [4] DOC UPDATES ON RULING
- [4.1] **Decision**: `docs/decisions/<date>-cross-review-v2.md` supersedes [review](../operating-model/review.md) [2.5] (REVISE-only cap), [delivery-rules](../operating-model/delivery-rules.md) [2.4.1] (no gate re-run on unchanged code) and v4 spec §2.3. It adopts the shared attempt counter and classes ([cross-review-v2](cross-review-v2.md) [3.3], [3.7.1]), the post-blocker gate re-run, reviewer independence ([3.2], [3.6]) and party separation; review, task-lifecycle, delivery-rules and roles absorb them.
- [4.2] **Handoff**: `Bots/MoCI/SOUL.md` and `Customizations/agents/MoCI/SOUL.md` describe MoCI as acceptance author and gate owner, not judge of its own acceptance; moDoc applies it under `## Doc update`.
