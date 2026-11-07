---
doc_id: DOCS_PROTOCOLS_INDEX
status: CURRENT
name: protocols
version: 1.0.0
last_verified: 2026-11-07
language: en-US
description: Branch index for agent and host wire protocols. Routes only, no facts.
type: DOCS_BRANCH_INDEX
parent_node: ../INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/_conventions.md]
---

# [0] ROOT: PROTOCOLS INDEX

## [1] ROUTES
- [1.1] [dispatch-protocol](dispatch-protocol.md) :: [LOAD_IF: concurrent fan-out and fan-in dispatch]
- [1.2] [relay-protocol](relay-protocol.md) :: [LOAD_IF: pipeline handoff between agents]
- [1.3] [p2p-protocol](p2p-protocol.md) :: [LOAD_IF: one agent querying another directly]
- [1.4] [steering-protocol](steering-protocol.md) :: [LOAD_IF: mid-flight steering or intervention]
- [1.5] [map-protocol](map-protocol.md) :: [LOAD_IF: machine action protocol format]
- [1.6] [orchestrator-mcp](orchestrator-mcp.md) :: [LOAD_IF: host-internal orchestrator MCP wire spec]
- [1.7] [partner-contract](partner-contract.md) :: [LOAD_IF: folder-as-an-agent partner contract]
