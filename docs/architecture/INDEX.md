---
doc_id: DOCS_ARCHITECTURE_INDEX
status: CURRENT
name: architecture
version: 1.2.0
last_verified: 2026-11-07
language: en-US
description: Branch index for owner architecture docs; each doc's status is in docs/README.md. Routes only, no facts.
type: DOCS_BRANCH_INDEX
parent_node: ../INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/_conventions.md, docs/README.md]
---

# [0] ROOT: ARCHITECTURE INDEX

## [1] ROUTES
- [1.1] [repository-architecture-overview](repository-architecture-overview.md) :: [LOAD_IF: subsystem boundaries of daemon, gateway, orchestration, persistence or web as implemented]

## [2] DESIGN EVIDENCE: ORCHESTRATION AND RUNTIME
- [2.1] [companion-groupchat-blackboard-full-spec](companion-groupchat-blackboard-v4-production-full-spec.md) :: [LOAD_IF: a leaf cites the blackboard FSM, quality ladder or stall detection design]
- [2.2] [cindy-chat-mechanisms](cindy-chat-mechanisms-and-blackboard-system.md) :: [LOAD_IF: a leaf cites the Cindy chat, blackboard or anti-loop reference design]
- [2.3] [daemon-architecture](daemon-architecture-and-implementation-specs.md) :: [LOAD_IF: a leaf cites the daemon design]
- [2.4] [storage-and-runtime](storage-and-runtime-architecture-specs.md) :: [LOAD_IF: a leaf cites the storage and runtime layout design]
- [2.5] [bot-mcp-plugin-isolation](bot-independent-mcp-plugin-isolation-architecture.md) :: [LOAD_IF: a leaf cites per-bot MCP and plugin isolation design]
- [2.6] [moadmin-orchestration](moadmin-orchestration-and-agent-first-standards-deep-dive.md) :: [LOAD_IF: a leaf cites moAdmin orchestration or agent-first standards design]

## [3] DESIGN EVIDENCE: GATEWAY, WEB AND REFERENCE
- [3.1] [unified-device-gateway](unified-device-gateway-design.md) :: [LOAD_IF: a leaf cites network or gateway design]
- [3.2] [multiagent-web-chat-view](multiagent_web_chat_view.md) :: [LOAD_IF: a leaf cites web chat view or execution status card design]
- [3.3] [prompt-distill](prompt_distill_design.md) :: [LOAD_IF: a leaf cites the prompt distill plugin design]
- [3.4] [paseo-sdk-integration](paseo-architecture-and-claude-agent-sdk-integration.md) :: [LOAD_IF: a leaf cites the Paseo or Claude Agent SDK integration reference]
- [3.5] [architecture-compendium](enterprise-multiagent-orchestration-architecture-compendium.md) :: [LOAD_IF: a leaf cites the enterprise architecture compendium]

## [4] DESIGN: SESSIONS AND EFFICIENCY
- [4.1] [session-lifecycle](session-lifecycle-compaction-and-rewind-specs.md) :: [LOAD_IF: resume, rewind, fork, compaction or crash-recovery design]
- [4.2] [collaboration-efficiency](collaboration-efficiency-and-cache-memory-optimization.md) :: [LOAD_IF: prompt cache, memory, loop budget or review-pairing design]
- [4.3] [multi-agent-linkage](multi-agent-linkage-reference-study.md) :: [LOAD_IF: teamwork, goal mode or Claude primitive reference for bot linkage]
