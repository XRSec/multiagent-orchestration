---
doc_id: DOCS-INDEX
status: CURRENT
last_verified: 2026-11-07
language: en-US
---

# Documentation Index

Status values are defined in [standards/documentation-standards.md](standards/documentation-standards.md). `UNAUDITED` means the document has not been checked against code since the v4.1 changes. Third-party reference material under `claude-managed-agents/` is excluded.

| Document | Title | Language | Lines | Status |
| :--- | :--- | :--- | ---: | :--- |
| [architecture/bot-independent-mcp-plugin-isolation-architecture.md](architecture/bot-independent-mcp-plugin-isolation-architecture.md) | 独立 Bot MCP Tools 与 Plugins 物理隔离架构设计规范 | zh/en mixed | 458 | UNAUDITED |
| [architecture/cindy-chat-mechanisms-and-blackboard-system.md](architecture/cindy-chat-mechanisms-and-blackboard-system.md) | Cindy 私聊与群聊技术机制、共享黑板与防循环系统深度架构规范 | zh/en mixed | 439 | UNAUDITED |
| [architecture/collaboration-efficiency-and-cache-memory-optimization.md](architecture/collaboration-efficiency-and-cache-memory-optimization.md) | Collaboration, Cache and Prompt Optimization Catalog | en | 125 | PROPOSED |
| [architecture/companion-groupchat-blackboard-v4-production-full-spec.md](architecture/companion-groupchat-blackboard-v4-production-full-spec.md) | 基于 Claude Agent SDK 的多伙伴群聊与共享黑板协同架构生产级演进与工程全集规范 (v4.0-PRODUCTION) | zh/en mixed | 645 | UNAUDITED |
| [architecture/daemon-architecture-and-implementation-specs.md](architecture/daemon-architecture-and-implementation-specs.md) | Multi-Agent Orchestration 守护进程 (Daemon) 深度架构与实现规范 | zh/en mixed | 226 | UNAUDITED |
| [architecture/enterprise-multiagent-orchestration-architecture-compendium.md](architecture/enterprise-multiagent-orchestration-architecture-compendium.md) | Multi-Agent Orchestration 工业级多智能体协同平台：企业级深度架构全集与设计规范 | zh/en mixed | 610 | UNAUDITED |
| [architecture/moadmin-orchestration-and-agent-first-standards-deep-dive.md](architecture/moadmin-orchestration-and-agent-first-standards-deep-dive.md) | moAdmin 编排架构、用户真实需求翻译与 Agent-First 协议深度设计规范全集 | zh/en mixed | 455 | UNAUDITED |
| [architecture/multi-agent-linkage-reference-study.md](architecture/multi-agent-linkage-reference-study.md) | Multi-Agent Linkage Reference Study | en | 119 | PROPOSED |
| [architecture/multiagent_web_chat_view.md](architecture/multiagent_web_chat_view.md) | Multi-Agent Web Chat View & Execution Status Card Architecture Specifi | en | 104 | UNAUDITED |
| [architecture/paseo-architecture-and-claude-agent-sdk-integration.md](architecture/paseo-architecture-and-claude-agent-sdk-integration.md) | Paseo 前后端分离架构与 Claude Agent SDK 集成深度技术规范 | zh/en mixed | 479 | UNAUDITED |
| [architecture/prompt_distill_design.md](architecture/prompt_distill_design.md) | Claude Code 前置小模型意图提炼与多轮历史正文滚动沉淀插件 (Prompt Distill) 架构设计与工程规范 | zh/en mixed | 199 | UNAUDITED |
| [architecture/repository-architecture-overview.md](architecture/repository-architecture-overview.md) | Repository Architecture Overview | en | 162 | AUDIT (code-checked, undated) |
| [architecture/session-lifecycle-compaction-and-rewind-specs.md](architecture/session-lifecycle-compaction-and-rewind-specs.md) | Session Lifecycle, Rewind and Compaction | en | 100 | TARGET (conformance in section 6) |
| [architecture/storage-and-runtime-architecture-specs.md](architecture/storage-and-runtime-architecture-specs.md) | Multi-Agent Storage & Runtime Architecture Specification | en | 224 | MIXED (status note in section 2) |
| [architecture/unified-device-gateway-design.md](architecture/unified-device-gateway-design.md) | Multi-Agent Orchestration 网络与网关架构设计规范 (Cindy 风格) | zh/en mixed | 192 | UNAUDITED |
| [architecture.md](architecture.md) | System Architecture: Headless Subprocess Pool & Full-Duplex Stream Eng | en | 146 | HISTORICAL |
| [axioms/STANDING_ORDER.md](axioms/STANDING_ORDER.md) | [0] ROOT: AGENT-FIRST OPERATIONAL PROTOCOL (STANDING ORDER) | en | 58 | UNAUDITED |
| [dev-rules/bot-group-orchestration.md](dev-rules/bot-group-orchestration.md) | [0] ROOT: BOT GROUP & MULTI-AGENT COLLABORATION SPECIFICATION | en | 76 | UNAUDITED |
| [dev-rules/ipc-and-sqlite.md](dev-rules/ipc-and-sqlite.md) | [0] ROOT: IPC STREAM & SQLITE DELTA SHARDING SPECIFICATION | en | 38 | UNAUDITED |
| [dev-rules/ndjson-pool.md](dev-rules/ndjson-pool.md) | [0] ROOT: CLAUDE RUNTIME DRIVER & ENGINE SPECIFICATION | en | 40 | UNAUDITED |
| [dev-rules/orchestrator-mcp.md](dev-rules/orchestrator-mcp.md) | [0] ROOT: HOST-INTERNAL ORCHESTRATOR MCP SPECIFICATION | en | 29 | UNAUDITED |
| [dev-rules/script-standards.md](dev-rules/script-standards.md) | [0] ROOT: PRACTICAL SCRIPT STANDARDS & DEVELOPMENT CONVENTIONS | en | 53 | UNAUDITED |
| [dev-rules/web-parser-and-studio.md](dev-rules/web-parser-and-studio.md) | [0] ROOT: CLAUDE STREAM PARSER & PARTNER STUDIO SPECIFICATION | en | 52 | UNAUDITED |
| [protocols/dispatch-protocol.md](protocols/dispatch-protocol.md) | Concurrency Dispatch Protocol (Fan-Out & Fan-In) | en | 31 | UNAUDITED |
| [protocols/map-protocol.md](protocols/map-protocol.md) | Machine Action Protocol (MAP) Specification | en | 81 | UNAUDITED |
| [protocols/orchestrator-mcp.md](protocols/orchestrator-mcp.md) | Protocol Specification: Host-Internal Orchestrator MCP (`nexus-orchest | en | 87 | UNAUDITED |
| [protocols/p2p-protocol.md](protocols/p2p-protocol.md) | Agent-to-Agent P2P Query Protocol | en | 25 | UNAUDITED |
| [protocols/partner-contract.md](protocols/partner-contract.md) | Specification: "Folder-as-an-Agent" (Partner Contract) | en | 76 | UNAUDITED |
| [protocols/relay-protocol.md](protocols/relay-protocol.md) | Pipeline Relay Protocol (Handoff FSM) | en | 23 | UNAUDITED |
| [protocols/steering-protocol.md](protocols/steering-protocol.md) | Protocol Specification: Real-Time Mid-Flight Steering & Dual-Channel I | en | 105 | UNAUDITED |
| [reviews/DISPATCH_M3_GATEWAY_BENCHMARK.md](reviews/DISPATCH_M3_GATEWAY_BENCHMARK.md) | DISPATCH RECEIPT: M3-WORKSTREAM-GATEWAY-BENCHMARK | en | 44 | UNAUDITED |
| [reviews/DISPATCH_M4_FOUR_DIMENSIONS_INTEGRATION.md](reviews/DISPATCH_M4_FOUR_DIMENSIONS_INTEGRATION.md) | DISPATCH RECEIPT: M4-FOUR-DIMENSIONS-WEB-INTEGRATION | en | 107 | UNAUDITED |
| [reviews/DISPATCH_M4_WEB_WORKSPACE_REGULATION.md](reviews/DISPATCH_M4_WEB_WORKSPACE_REGULATION.md) | DISPATCH RECEIPT: M4-WEB-WORKSPACE-MIGRATION-REGULATION | en | 49 | UNAUDITED |
| [standards/documentation-standards.md](standards/documentation-standards.md) | Documentation Standards | en | 46 | CURRENT |
