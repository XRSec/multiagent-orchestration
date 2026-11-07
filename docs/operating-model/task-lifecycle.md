---
doc_id: DOCS_OM_TASK_LIFECYCLE
status: CURRENT
name: task-lifecycle
version: 1.4.0
last_verified: 2026-11-07
language: en-US
description: Task lifecycle tree from order to merge. Load when moving a task between stages.
type: DOCS_LEAF
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [AGENTS.md, src/daemon/transport/DaemonServer.ts]
---

# [0] ROOT: TASK LIFECYCLE

## [1] ROUTES
- [1.1] [delivery-rules](delivery-rules.md) :: [LOAD_IF: need the gate, acceptance or approval rule a stage cites]
- [1.2] [review](review.md) :: [LOAD_IF: the task is at the review stage or a verdict is disputed]
- [1.3] [roles](roles.md) :: [LOAD_IF: need who owns a stage]

## [2] TASK LIFECYCLE TREE
- [2.1] **Status**: This tree and [roles](roles.md) are process guidance; no code in `src/` implements task orders, `TERM_*` outcomes or role mapping ([doc-vs-code](doc-vs-code.md) [2.5]).
- [2.2] **Order**: moAdmin issues a task order naming Goal, Scope (paths), Forbidden, Deliverables and Acceptance (task-specific check). Any empty field -> `TERM_BLOCK(2)` back to moAdmin.
- [2.3] **Acceptance Check**: MoCI, not the implementer, commits the named check and runs it on the base. It passes untouched -> `TERM_BLOCK(2)`, rewrite acceptance; it fails -> [2.4].
- [2.4] **Build**: The implementer works in its worktree and never edits its task order; scope changes go to moAdmin -> [2.5].
- [2.5] **Gate**: Run the [delivery-rules](delivery-rules.md) [2.4] gate on the committed tree, per delivery-rules [2.4.2]. Non-zero exit -> [2.4] with the output tail and `git log --oneline -5`; a blocker (network, port clash, rate limit, missing secret) -> `TERM_BLOCK(2)`, goal stays open. Exit 0 -> [2.6].
- [2.6] **Review**: Run the procedure in [review](review.md) [2]. REVISE -> [2.4] within the REVISE cap of review [2.5]; cap reached or dispute -> review [3]. PASS -> [2.7].
- [2.7] **Merge**: Squash-merge into `main` per [delivery-rules](delivery-rules.md) [2.4.2] after gate PASS, review PASS and delivery-rules [2.6] approval -> `TERM_OK`. Approval missing -> `TERM_ESCALATE` to a human maintainer.
