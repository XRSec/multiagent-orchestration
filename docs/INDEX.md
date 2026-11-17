---
doc_id: DOCS_ROUTER
status: CURRENT
name: docs-index
version: 1.5.0
last_verified: 2026-11-16
language: en-US
description: Agent read-path router below the docs/README.md catalogue. Load after AGENTS.md to find the single doc that answers the task. Routes only.
type: DOCS_BRANCH_INDEX
parent_node: ../AGENTS.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [AGENTS.md, MEMORY.md, docs/README.md, docs/_conventions.md]
---

# [0] ROOT: DOCS ROUTING INDEX

## [1] ROUTES: RULES AND CURRENT TRUTH
- [1.0] [catalogue](README.md) :: [LOAD_IF: need an owner doc or its status; DOCS_* docs are absent there, their status is in front matter]
- [1.1] [operating-model](operating-model/INDEX.md) :: [LOAD_IF: delivery, task orders, roles, gates, review, cross-review, arbitration, retry, merge, done criteria, proof or doc-vs-code gaps]
- [1.2] [sessions](sessions.md) :: [LOAD_IF: whether a bot session is new or resumed, rewind or compaction, context carry-over, step or round limits, config dirs or isolation between bots, rooms and DMs]
- [1.3] [doc-standards](standards/documentation-standards.md) :: [LOAD_IF: task writes, moves, splits, folds or deletes a doc]
- [1.6] [conventions](_conventions.md) :: [LOAD_IF: same as doc-standards, plus the read path, routing budgets or which doc owns a fact]
- [1.4] [memory](../MEMORY.md) :: [LOAD_IF: storage layout, SQLite files, bot roster facts]
- [1.5] [architecture](architecture/INDEX.md) :: [LOAD_IF: subsystem boundaries of daemon, gateway, orchestration, persistence or web, or a cited design spec]

## [2] ROUTES: REFERENCE AND DESIGN
- [2.1] [standing-order](axioms/STANDING_ORDER.md) :: [LOAD_IF: task authors a SKILL.md or an agent-facing spec format]
- [2.2] [dev-rules](dev-rules/INDEX.md) :: [LOAD_IF: script standards, group-chat relay rules, runtime driver or stream parser rules]
- [2.3] [protocols](protocols/INDEX.md) :: [LOAD_IF: agent-to-agent, host wire protocols, or native sub-agent markdown specifications]
- [2.4] [proposals](proposals/INDEX.md) :: [LOAD_IF: designing a change to review, sessions or doc routing that awaits an owner ruling]
- [2.5] [claude-managed-agents](claude-managed-agents/README.md) :: [LOAD_IF: upstream Anthropic platform reference]
- [2.6] [paseo](paseo/INDEX.md) :: [LOAD_IF: Paseo bots configuration, version 4 envelope, teams, agy-agents sync, same-provider fallback models, partner settings UI, or plugin settings/data storage]

## [3] EVIDENCE
- [3.1] [reviews](reviews/INDEX.md) :: [LOAD_IF: a doc cites a dispatch receipt]
- [3.2] [legacy-architecture](architecture.md) :: [LOAD_IF: a doc cites the pre-current subprocess pool design]
- [3.3] [project-plan](../PROJECT.md) :: [LOAD_IF: a doc cites a feature id or milestone]
- [3.4] [update-ledger](../UPDATE.md) :: [LOAD_IF: a doc cites a ledger entry]
- [3.5] [test-infra](../TEST_INFRA.md) :: [LOAD_IF: a doc cites the test infrastructure notes]
- [3.6] [test-ready](../TEST_READY.md) :: [LOAD_IF: a doc cites the test readiness notes]
