---
doc_id: DOCS_DEV_RULES_INDEX
status: CURRENT
name: dev-rules
version: 1.0.0
last_verified: 2026-11-07
language: en-US
description: Branch index for coding and runtime-driver rules. Routes only, no facts.
type: DOCS_BRANCH_INDEX
parent_node: ../INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/_conventions.md]
---

# [0] ROOT: DEV RULES INDEX

## [1] ROUTES
- [1.1] [script-standards](script-standards.md) :: [LOAD_IF: task writes or reviews a script]
- [1.2] [bot-group-orchestration](bot-group-orchestration.md) :: [LOAD_IF: group-chat relay, step and round rules]
- [1.3] [orchestrator-mcp-usage](orchestrator-mcp.md) :: [LOAD_IF: host-internal orchestrator MCP usage rules; the wire spec is under protocols]
- [1.4] [ndjson-pool](ndjson-pool.md) :: [LOAD_IF: Claude runtime driver or NDJSON process pool]
- [1.5] [web-parser-and-studio](web-parser-and-studio.md) :: [LOAD_IF: Claude stream parser or partner studio]
- [1.6] [ipc-and-sqlite](ipc-and-sqlite.md) :: [LOAD_IF: a doc cites IPC streams or SQLite delta sharding; storage truth is in MEMORY]
