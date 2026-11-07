---
doc_id: DOCS_OPERATING_MODEL
status: CURRENT
name: operating-model
version: 2.0.1
last_verified: 2026-11-07
language: en-US
description: Branch index for how work is delivered: rules, lifecycle, review, roles, proof, gaps. Routes only, no facts.
type: DOCS_BRANCH_INDEX
parent_node: ../INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [AGENTS.md]
---

# [0] ROOT: OPERATING MODEL INDEX

## [1] ROUTES
- [1.1] [delivery-rules](delivery-rules.md) :: [LOAD_IF: facts, secrets, branches, the gate, acceptance integrity, approvals, scope or work hygiene]
- [1.2] [task-lifecycle](task-lifecycle.md) :: [LOAD_IF: task order, acceptance check, build, gate or merge stage]
- [1.3] [review](review.md) :: [LOAD_IF: review, verdict, cross-review, arbitration, retry, rejection or dispute]
- [1.4] [roles](roles.md) :: [LOAD_IF: who plans, implements, tests, reviews, merges or stewards docs; builder or reviewer name mapping]
- [1.5] [done-and-proof](done-and-proof.md) :: [LOAD_IF: done criteria, proof of works or ready, final report table]
- [1.6] [doc-vs-code](doc-vs-code.md) :: [LOAD_IF: a doc claim conflicts with code, config or another doc]
