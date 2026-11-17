---
doc_id: DOCS_REVIEWS_INDEX
status: CURRENT
name: reviews
version: 1.0.0
last_verified: 2026-11-07
language: en-US
description: Branch index for past dispatch receipts, read only when cited. Routes only, no facts.
type: DOCS_BRANCH_INDEX
parent_node: ../INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/_conventions.md]
---

# [0] ROOT: REVIEWS INDEX

## [1] ROUTES
- [1.1] [gateway-benchmark](DISPATCH_M3_GATEWAY_BENCHMARK.md) :: [LOAD_IF: a doc cites the gateway benchmark receipt]
- [1.2] [four-dimensions-integration](DISPATCH_M4_FOUR_DIMENSIONS_INTEGRATION.md) :: [LOAD_IF: a doc cites the four-dimensions web integration receipt]
- [1.3] [web-workspace-regulation](DISPATCH_M4_WEB_WORKSPACE_REGULATION.md) :: [LOAD_IF: a doc cites the web workspace migration receipt]
