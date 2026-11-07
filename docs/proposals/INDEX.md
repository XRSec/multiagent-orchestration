---
doc_id: DOCS_PROPOSALS_INDEX
status: CURRENT
name: proposals
version: 1.2.0
last_verified: 2026-11-07
language: en-US
description: Branch index for our proposals awaiting an owner ruling; owner proposals sit in architecture/. Routes only, no facts.
type: DOCS_BRANCH_INDEX
parent_node: ../INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/_conventions.md]
---

# [0] ROOT: PROPOSALS INDEX

## [1] ROUTES
- [1.1] [cross-review-v2](cross-review-v2.md) :: [LOAD_IF: designing the review ladder, arbitration, fingerprints or reviewer sandbox in code]
- [1.2] [cross-review-v2-changes](cross-review-v2-changes.md) :: [LOAD_IF: code changes or doc updates the proposed review ladder implies]
- [1.3] [session-policy](session-policy.md) :: [LOAD_IF: designing session lanes, locks, loop bound, resume guard, abort or bot isolation in code]
- [1.4] [docs-linking](docs-linking.md) :: [LOAD_IF: designing doc layers, precedence, bot doc routing or a docs check]
