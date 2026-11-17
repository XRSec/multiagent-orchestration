---
doc_id: DOCS_PROPOSAL_SUBAGENT_ENGINE_PYRAMID
status: PROPOSED
version: 0.2.0
last_verified: 2026-11-10
language: en-US
name: subagent-engine-pyramid
description: PROPOSED dual subagent engines behind one host-owned task pyramid. Branch index and conclusion; binds nothing.
type: DOCS_BRANCH_INDEX
parent_node: ../INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [paseo-bots/server/tasks.ts, paseo-bots/server/leases.ts, paseo-bots/server/tools/bots.ts, paseo-bots/shared/handoff.ts, paseo-agy-acp/server/subagents.ts]
---

# [0] ROOT: SUBAGENT ENGINES AND THE TASK PYRAMID (PROPOSED)

## [1] ROUTES
- [1.1] [design](design.md) :: [LOAD_IF: engine matrix, three layers, the five invariants, engine granularity, not-doing]
- [1.2] [mechanism](mechanism.md) :: [LOAD_IF: task file shape, lease, hook points, defect fixes, stages, risks]
- [1.3] [cards](cards.md) :: [LOAD_IF: card contract, lead landing rule, idempotency, flush]
- [1.4] [refs](refs.md) :: [LOAD_IF: follow-up message ids, delivery verdicts, the reader window]
- [1.5] [recovery](recovery.md) :: [LOAD_IF: restart recovery, wedge, live turn, parked member, prune timing or prune gaps]
- [1.6] [archive](archive.md) :: [LOAD_IF: member death write-back, task-line receipts, state migration]
- [1.7] [native](native.md) :: [LOAD_IF: engine-A member write-back, granularity, slot and guard rules]
- [1.8] [rollout](rollout.md) :: [LOAD_IF: P0-P3 slices, acceptance, files per bot]

## [2] CONCLUSION
- [2.1] **Two Engines, One Task Line**: engine A is a single-shot native child inside one turn; engine B is a resumable chat with its own context. A task line holds any mix, and the group only sees host-composed cards. Design: [1.1].
- [2.2] **Shape Is A Host Fact**: the pyramid, the fan-out limit and the terminal state belong to the host, never to a model. A model claiming `done` settles nothing.
- [2.3] **Shipped**: an archived chat reads `archived` with no stale reply; a follow-up steers a running delegation and returns a ref; the append lock is a file lease that survives a restart and a second process; `tasks.ts` keeps one JSON file per task with a monotonic version under the same lease. Detail: [1.2], [1.3].
- [2.4] **Not Shipped**: group cards, automatic settlement, `budget.fanout` enforcement, engine-scoped tool surfaces, per-turn member write-back. Those are later stages.
- [2.5] **Size Discipline**: every leaf here stays under the leaf byte cap and this index under the index cap, measured with `git cat-file -s`.
