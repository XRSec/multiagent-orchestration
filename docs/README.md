---
doc_id: DOCS-INDEX
status: CURRENT
last_verified: 2026-11-16
language: en-US
---

# Documentation Index

Status values are defined in [standards/documentation-standards.md](standards/documentation-standards.md). `UNAUDITED` means the document has not been checked against code since the v4.1 changes. Third-party reference material under `claude-managed-agents/` is excluded.

| Document | Title | Language | Lines | Status |
| :--- | :--- | :--- | ---: | :--- |
| [architecture/bot-independent-mcp-plugin-isolation-architecture.md](architecture/bot-independent-mcp-plugin-isolation-architecture.md) | 独立 Bot MCP Tools 与 Plugins 物理隔离架构设计规范 | zh/en mixed | 458 | UNAUDITED |
| [architecture/cindy-chat-mechanisms-and-blackboard-system.md](architecture/cindy-chat-mechanisms-and-blackboard-system.md) | Cindy 私聊与群聊技术机制、共享黑板与防循环系统深度架构规范 | zh/en mixed | 439 | UNAUDITED |
| [architecture/cindy-ui-parity-spec.md](architecture/cindy-ui-parity-spec.md) | Cindy-Grade Web UI Parity Specification & E2E Resilience Engine | en | 932 | CURRENT |
| [architecture/claude-code-multiagent/INDEX.md](architecture/claude-code-multiagent/INDEX.md) | Claude Code Multi-Agent Architecture Shards Branch Index | en | 30 | CURRENT |
| [architecture/claude-code-multiagent/shards/01_attention_compaction_lifecycle.md](architecture/claude-code-multiagent/shards/01_attention_compaction_lifecycle.md) | Attention Dynamics, Context Rot & Compaction Lifecycle | en | 94 | CURRENT |
| [architecture/claude-code-multiagent/shards/02_instruction_hierarchy_cache_layers.md](architecture/claude-code-multiagent/shards/02_instruction_hierarchy_cache_layers.md) | Instruction Hierarchy, Cache Layers & Context Topology | en | 94 | CURRENT |
| [architecture/claude-code-multiagent/shards/03_multiagent_orchestration_patterns.md](architecture/claude-code-multiagent/shards/03_multiagent_orchestration_patterns.md) | Multi-Agent Orchestration Patterns & Enterprise Architectures | en | 115 | CURRENT |
| [architecture/claude-code-multiagent/shards/04_virtual_groupchat_progressive_memory.md](architecture/claude-code-multiagent/shards/04_virtual_groupchat_progressive_memory.md) | Virtual Group Chat, Stream Routing & Progressive Memory Pipeline | en | 112 | CURRENT |
| [architecture/claude-code-multiagent/shards/05_agent_skill_mcp_governance.md](architecture/claude-code-multiagent/shards/05_agent_skill_mcp_governance.md) | Agent Skills, MCP Governance & Runtime Isolation | en | 95 | CURRENT |
| [architecture/groupchat/INDEX.md](architecture/groupchat/INDEX.md) | Group Chat Agent Architecture Shards Branch Index | zh-CN | 28 | CURRENT |
| [architecture/groupchat/01-storage-topology-and-workspaces.md](architecture/groupchat/01-storage-topology-and-workspaces.md) | 存储拓扑与多级工作区隔离规范 (Storage Topology & Multi-Level Workspace Isolation) | zh-CN | 622 | CURRENT |
| [architecture/groupchat/02-session-channel-and-lanes.md](architecture/groupchat/02-session-channel-and-lanes.md) | 会话专线拓扑与多通道并发隔离模型规范 | zh-CN | 612 | CURRENT |
| [architecture/groupchat/03-single-speaker-and-interjection-fsm.md](architecture/groupchat/03-single-speaker-and-interjection-fsm.md) | 群聊单发言人确定性调度与插话状态机架构规范 | zh-CN | 550 | CURRENT |
| [architecture/groupchat/04-sequence-monotonicity-and-delta-injection.md](architecture/groupchat/04-sequence-monotonicity-and-delta-injection.md) | 群聊时序单调性、水位推进与增量切片注入规范 | zh-CN | 645 | CURRENT |
| [architecture/groupchat/05-shared-blackboard-and-token-budget.md](architecture/groupchat/05-shared-blackboard-and-token-budget.md) | 共享黑板系统与 1,400 Tokens 预算装配算法规范 | zh-CN | 937 | CURRENT |
| [architecture/groupchat/06-anti-loop-defense-and-silent-skip.md](architecture/groupchat/06-anti-loop-defense-and-silent-skip.md) | 五维立体防循环唤醒机制与静默退出原子规范 | zh-CN | 400 | CURRENT |
| [architecture/groupchat/07-three-tier-quality-ladder-and-arbitration.md](architecture/groupchat/07-three-tier-quality-ladder-and-arbitration.md) | 三级阶梯式质量仲裁与防死锁熔断机制规范 | zh-CN | 586 | CURRENT |
| [architecture/groupchat/08-claude-agent-sdk-harness-reality.md](architecture/groupchat/08-claude-agent-sdk-harness-reality.md) | Claude Agent SDK 底层物理真相与子进程模型架构规范 | zh-CN | 457 | CURRENT |
| [architecture/groupchat/09-lifecycle-gates-and-permission-pipeline.md](architecture/groupchat/09-lifecycle-gates-and-permission-pipeline.md) | 生命周期门禁、权限流水线与物理安全防护规范 | zh-CN | 490 | CURRENT |
| [architecture/groupchat/10-blackboard-sqlite-and-mcp-protocol.md](architecture/groupchat/10-blackboard-sqlite-and-mcp-protocol.md) | 黑板物理存储 (SQLite WAL) 与 MCP 工具协议契约规范 | zh-CN | 881 | CURRENT |
| [architecture/collaboration-efficiency-and-cache-memory-optimization.md](architecture/collaboration-efficiency-and-cache-memory-optimization.md) | Collaboration, Cache and Prompt Optimization Catalog | en | 125 | PROPOSED |
| [architecture/companion-groupchat-blackboard-v4-production-full-spec.md](architecture/companion-groupchat-blackboard-v4-production-full-spec.md) | 基于 Claude Agent SDK 的多伙伴群聊与共享黑板协同架构生产级演进与工程全集规范 (v4.0-PRODUCTION) | zh/en mixed | 645 | UNAUDITED |
| [architecture/daemon-architecture-and-implementation-specs.md](architecture/daemon-architecture-and-implementation-specs.md) | Multi-Agent Orchestration 守护进程 (Daemon) 深度架构与实现规范 | zh/en mixed | 226 | UNAUDITED |
| [architecture/enterprise-multiagent-orchestration-architecture-compendium.md](architecture/enterprise-multiagent-orchestration-architecture-compendium.md) | Multi-Agent Orchestration 工业级多智能体协同平台：企业级深度架构全集与设计规范 | zh/en mixed | 610 | UNAUDITED |
| [architecture/moadmin-orchestration-and-agent-first-standards-deep-dive.md](architecture/moadmin-orchestration-and-agent-first-standards-deep-dive.md) | moAdmin 编排架构、用户真实需求翻译与 Agent-First 协议深度设计规范全集 | zh/en mixed | 455 | UNAUDITED |
| [architecture/multi-agent-linkage-reference-study.md](architecture/multi-agent-linkage-reference-study.md) | Multi-Agent Linkage Reference Study | en | 119 | PROPOSED |
| [architecture/multiagent_web_chat_view.md](architecture/multiagent_web_chat_view.md) | Multi-Agent Web Chat View & Execution Status Card Architecture Specification | en | 347 | CURRENT |
| [architecture/paseo-architecture-and-claude-agent-sdk-integration.md](architecture/paseo-architecture-and-claude-agent-sdk-integration.md) | Paseo 前后端分离架构与 Claude Agent SDK 集成深度技术规范 | zh/en mixed | 479 | UNAUDITED |
| [architecture/prompt-topology-and-isolation.md](architecture/prompt-topology-and-isolation.md) | Prompt Topology, Plane Decoupling & Prompt Diet Architecture Spec | en | 121 | CURRENT |
| [architecture/prompt_distill_design.md](architecture/prompt_distill_design.md) | Claude Code 前置小模型意图提炼与多轮历史正文滚动沉淀插件 (Prompt Distill) 架构设计与工程规范 | zh/en mixed | 199 | UNAUDITED |
| [architecture/repository-architecture-overview.md](architecture/repository-architecture-overview.md) | Repository Architecture Overview | en | 162 | AUDIT (code-checked, undated) |
| [architecture/session-lifecycle-compaction-and-rewind-specs.md](architecture/session-lifecycle-compaction-and-rewind-specs.md) | Session Lifecycle, Rewind and Compaction | en | 100 | TARGET (conformance in section 6) |
| [architecture/session-physical-storage-topology.md](architecture/session-physical-storage-topology.md) | Multi-Agent Claude Session Physical Storage & Resolution Topology | en | 148 | CURRENT |
| [architecture/storage-and-runtime-architecture-specs.md](architecture/storage-and-runtime-architecture-specs.md) | Multi-Agent Storage & Runtime Architecture Specification | en | 224 | MIXED (status note in section 2) |
| [architecture/unified-device-gateway-design.md](architecture/unified-device-gateway-design.md) | Multi-Agent Orchestration 网络与网关架构设计规范 (Cindy 风格) | zh/en mixed | 192 | UNAUDITED |
| [architecture/unified-capabilities-api-spec.md](architecture/unified-capabilities-api-spec.md) | Unified Multi-Scope Capabilities API & Cross-Page State Convergence Specification | en | 273 | CURRENT |
| [architecture.md](architecture.md) | System Architecture: Headless Subprocess Pool & Full-Duplex Stream Eng | en | 146 | HISTORICAL |
| [axioms/STANDING_ORDER.md](axioms/STANDING_ORDER.md) | [0] ROOT: AGENT-FIRST OPERATIONAL PROTOCOL (STANDING ORDER) | en | 58 | UNAUDITED |
| [dev-rules/bot-group-orchestration.md](dev-rules/bot-group-orchestration.md) | [0] ROOT: BOT GROUP & MULTI-AGENT COLLABORATION SPECIFICATION | en | 76 | UNAUDITED |
| [dev-rules/ipc-and-sqlite.md](dev-rules/ipc-and-sqlite.md) | [0] ROOT: IPC STREAM & SQLITE DELTA SHARDING SPECIFICATION | en | 38 | UNAUDITED |
| [dev-rules/ndjson-pool.md](dev-rules/ndjson-pool.md) | [0] ROOT: CLAUDE RUNTIME DRIVER & ENGINE SPECIFICATION | en | 40 | UNAUDITED |
| [dev-rules/orchestrator-mcp.md](dev-rules/orchestrator-mcp.md) | [0] ROOT: HOST-INTERNAL ORCHESTRATOR MCP SPECIFICATION | en | 29 | UNAUDITED |
| [dev-rules/script-standards.md](dev-rules/script-standards.md) | [0] ROOT: PRACTICAL SCRIPT STANDARDS & DEVELOPMENT CONVENTIONS | en | 53 | UNAUDITED |
| [dev-rules/web-parser-and-studio.md](dev-rules/web-parser-and-studio.md) | [0] ROOT: CLAUDE STREAM PARSER & PARTNER STUDIO SPECIFICATION | en | 52 | UNAUDITED |
| [paseo/INDEX.md](paseo/INDEX.md) | Paseo Plugin Specifications Branch Index | en | 23 | CURRENT |
| [paseo/paseo-bots-configuration-and-storage.md](paseo/paseo-bots-configuration-and-storage.md) | Paseo Bots Plugin Configuration, Envelope & Storage Topology Specification | en | 169 | CURRENT |
| [paseo/paseo-bots-partner-settings-ui.md](paseo/paseo-bots-partner-settings-ui.md) | Paseo Bots Partner Settings & TeamMap UI Specification | en | 50 | CURRENT |
| [paseo/same-provider-fallback-models.md](paseo/same-provider-fallback-models.md) | Same-Provider Fallback Models Architecture & Runtime Execution Specification | en | 215 | CURRENT |
| [protocols/agent-definition-specification.md](protocols/agent-definition-specification.md) | Claude Code Native Sub-Agent Specification | en | 404 | CURRENT |
| [protocols/dispatch-protocol.md](protocols/dispatch-protocol.md) | Concurrency Dispatch Protocol (Fan-Out & Fan-In) | en | 31 | UNAUDITED |
| [protocols/map-protocol.md](protocols/map-protocol.md) | Machine Action Protocol (MAP) Specification | en | 81 | UNAUDITED |
| [protocols/orchestrator-mcp.md](protocols/orchestrator-mcp.md) | Protocol Specification: Host-Internal Orchestrator MCP (`nexus-orchest | en | 87 | UNAUDITED |
| [protocols/p2p-protocol.md](protocols/p2p-protocol.md) | Agent-to-Agent P2P Query Protocol | en | 25 | UNAUDITED |
| [protocols/partner-contract.md](protocols/partner-contract.md) | Specification: "Folder-as-an-Agent" (Partner Contract) | en | 88 | HISTORICAL |
| [protocols/relay-protocol.md](protocols/relay-protocol.md) | Pipeline Relay Protocol (Handoff FSM) | en | 23 | UNAUDITED |
| [protocols/steering-protocol.md](protocols/steering-protocol.md) | Protocol Specification: Real-Time Mid-Flight Steering & Dual-Channel I | en | 105 | UNAUDITED |
| [reviews/DISPATCH_M3_GATEWAY_BENCHMARK.md](reviews/DISPATCH_M3_GATEWAY_BENCHMARK.md) | DISPATCH RECEIPT: M3-WORKSTREAM-GATEWAY-BENCHMARK | en | 44 | UNAUDITED |
| [reviews/DISPATCH_M4_FOUR_DIMENSIONS_INTEGRATION.md](reviews/DISPATCH_M4_FOUR_DIMENSIONS_INTEGRATION.md) | DISPATCH RECEIPT: M4-FOUR-DIMENSIONS-WEB-INTEGRATION | en | 107 | UNAUDITED |
| [reviews/DISPATCH_M4_WEB_WORKSPACE_REGULATION.md](reviews/DISPATCH_M4_WEB_WORKSPACE_REGULATION.md) | DISPATCH RECEIPT: M4-WEB-WORKSPACE-MIGRATION-REGULATION | en | 49 | UNAUDITED |
| [standards/documentation-standards.md](standards/documentation-standards.md) | Documentation Standards | en | 46 | CURRENT |
