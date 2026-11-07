---
doc_id: DOCS_INDEX
name: docs-index
version: 1.1.0
description: Routing root of the docs tree. Load after AGENTS.md to find the single doc that answers the task. Routes only, no facts.
type: DOCS_BRANCH_INDEX
parent_node: ../AGENTS.md
allowed-tools: []
target: LLM_PARSER_ONLY
locale: en-US
verified: 2026-11-07
sources: [AGENTS.md, MEMORY.md, docs/_conventions.md]
---

# [0] ROOT: DOCS ROUTING INDEX

## [1] ROUTES
- [1.1] [operating-model](operating-model.md) :: [LOAD_IF: task touches delivery, task orders, roles, gates, review, merge, done criteria or proof]
- [1.2] [conventions](_conventions.md) :: [LOAD_IF: task writes, moves, splits, folds or deletes a doc]
- [1.3] [standing-order](axioms/STANDING_ORDER.md) :: [LOAD_IF: task authors a SKILL.md or an agent-facing spec format]
- [1.4] [architecture-overview](architecture/repository-architecture-overview.md) :: [LOAD_IF: subsystem boundaries of daemon, gateway, orchestration, persistence or web]
- [1.5] [memory](../MEMORY.md) :: [LOAD_IF: storage layout, SQLite files, bot roster facts]
- [1.6] [script-standards](dev-rules/script-standards.md) :: [LOAD_IF: task writes or reviews a script]
- [1.7] [bot-group-orchestration](dev-rules/bot-group-orchestration.md) :: [LOAD_IF: group-chat turn rules]
- [1.8] [claude-managed-agents](claude-managed-agents/README.md) :: [LOAD_IF: upstream Anthropic platform reference]

## [2] UNINDEXED BRANCHES
- [2.1] **Legacy Directories**: `architecture/`, `dev-rules/`, `protocols/` and `reviews/` have no `INDEX.md`; list the directory and pick by filename. Each gets an `INDEX.md` when a change next touches it ([conventions](_conventions.md) [2.8]).
- [2.2] **Pre-v4.1 Spec**: `architecture.md` predates the current runtime; read it only when a doc cites it. Read `reviews/` only when a doc cites a dispatch receipt.
