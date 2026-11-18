---
doc_id: DOCS-CATALOGUE
status: CURRENT
version: 3.0.0
last_verified: 2026-11-18
language: en-US
---

# Documentation Catalogue

Authoritative registry of all repository documentation, organized into **Project Documentation** and **Design Documentation** under the `agent-first-docs` micro-kernel & shards standard ([project/shards/05-agent-first-docs-standard.md](project/shards/05-agent-first-docs-standard.md)). Agents start lookups at [INDEX.md](INDEX.md).

---

## Part I: Project Documentation

### 1. Root Manuals & Master Routers
| Document | Title | Language | Lines | Status |
| :--- | :--- | :--- | ---: | :--- |
| [../AGENTS.md](../AGENTS.md) | AGENTS.md | en-US | 96 | CURRENT |
| [../MEMORY.md](../MEMORY.md) | Multi-Agent Orchestration — Architectural Memory (Micro-Kernel) | en-US | 35 | CURRENT |
| [INDEX.md](INDEX.md) | Documentation Router (Micro-Kernel) | en-US | 35 | CURRENT |
| [README.md](README.md) | Documentation Catalogue | en-US | 121 | CURRENT |

### 2. Project Governance, Philosophy & Standards (`project/`)
| Document | Title | Language | Lines | Status |
| :--- | :--- | :--- | ---: | :--- |
| [project/INDEX.md](project/INDEX.md) | Project Documentation Router (Micro-Kernel) | en-US | 31 | CURRENT |
| [project/shards/01-repository-overview.md](project/shards/01-repository-overview.md) | Repository Overview & Physical Topology | en-US | 115 | CURRENT |
| [project/shards/02-agent-philosophy.md](project/shards/02-agent-philosophy.md) | 10 Core Agent Engineering Principles | en-US | 154 | CURRENT |
| [project/shards/03-bot-fleet-and-teams.md](project/shards/03-bot-fleet-and-teams.md) | 14-Bot Fleet Matrix, Teams & Closed-Loop Workflow | en-US | 147 | CURRENT |
| [project/shards/04-delivery-and-verification.md](project/shards/04-delivery-and-verification.md) | Multi-Agent Delivery, Handoff Contracts & Verification Gates | en-US | 136 | CURRENT |
| [project/shards/05-agent-first-docs-standard.md](project/shards/05-agent-first-docs-standard.md) | Agent-First Documentation Standard (`agent-first-docs`) | en-US | 108 | CURRENT |
| [project/shards/06-script-and-git-standards.md](project/shards/06-script-and-git-standards.md) | Script Engineering, Safe Deletion & Git Hygiene Standards | en-US | 109 | CURRENT |

### 3. Package Overviews (Active Cores: `paseo-agy-acp`, `paseo-bots` · Paused: `paseo-sidecar`)
| Document | Title | Language | Lines | Status |
| :--- | :--- | :--- | ---: | :--- |
| [../paseo-agy-acp/README.md](../paseo-agy-acp/README.md) | paseo-agy-acp | zh/en | 101 | CURRENT |
| [../paseo-agy-acp/OVERVIEW.md](../paseo-agy-acp/OVERVIEW.md) | Antigravity ACP | en-US | 27 | CURRENT |
| [../paseo-bots/README.md](../paseo-bots/README.md) | paseo-bots | en-US | 205 | CURRENT |
| [../paseo-bots/OVERVIEW.md](../paseo-bots/OVERVIEW.md) | OVERVIEW.md | en-US | 29 | CURRENT |
| [../paseo-sidecar/README.md](../paseo-sidecar/README.md) | SidecarMCP | en-US | 33 | CURRENT |

---

## Part II: Design Documentation

### 4. Design Router
| Document | Title | Language | Lines | Status |
| :--- | :--- | :--- | ---: | :--- |
| [design/INDEX.md](design/INDEX.md) | Design Documentation Router (Micro-Kernel) | en-US | 34 | CURRENT |

### 5. Antigravity ACP Bridge Specifications (`design/paseo-agy-acp/`)
| Document | Title | Language | Lines | Status |
| :--- | :--- | :--- | ---: | :--- |
| [design/paseo-agy-acp/INDEX.md](design/paseo-agy-acp/INDEX.md) | Paseo Antigravity ACP Bridge (`paseo-agy-acp`) Design Index | en-US | 33 | CURRENT |
| [design/paseo-agy-acp/shards/01-dual-plane-and-brain-observer.md](design/paseo-agy-acp/shards/01-dual-plane-and-brain-observer.md) | Dual-Plane Architecture & Brain Transcript Observer | en-US | 136 | CURRENT |
| [design/paseo-agy-acp/shards/02-turn-lifecycle-and-fail-closed-guards.md](design/paseo-agy-acp/shards/02-turn-lifecycle-and-fail-closed-guards.md) | Turn Lifecycle, Two-Clock Watchdogs & Fail-Closed Guards | en-US | 132 | CURRENT |
| [design/paseo-agy-acp/shards/03-subagents-checkpoints-and-steer.md](design/paseo-agy-acp/shards/03-subagents-checkpoints-and-steer.md) | Subagent Trees, Checkpoints, Fork Revert & Steer Contract | en-US | 112 | CURRENT |

### 6. Paseo Bots Orchestration Plugin Specifications (`design/paseo-bots/`)
| Document | Title | Language | Lines | Status |
| :--- | :--- | :--- | ---: | :--- |
| [design/paseo-bots/INDEX.md](design/paseo-bots/INDEX.md) | Paseo Bots Orchestration Plugin (`@oliexe/paseo-bots`) | en-US | 35 | CURRENT |
| [design/paseo-bots/shards/01-configuration-and-storage.md](design/paseo-bots/shards/01-configuration-and-storage.md) | Shard 01: Configuration Envelope, Decoupled Assets & Zero-Pollution Storage | en-US | 114 | CURRENT |
| [design/paseo-bots/shards/02-seat-blackboard-and-prompts.md](design/paseo-bots/shards/02-seat-blackboard-and-prompts.md) | Shard 02: Managed Seats, Session Blackboard & Six-Block Prompt Assembly | en-US | 102 | CURRENT |
| [design/paseo-bots/shards/03-workflow-engine-and-routing.md](design/paseo-bots/shards/03-workflow-engine-and-routing.md) | Shard 03: Three-Tier Routing, Declarative Workflow DAG & Resilient Execution | en-US | 125 | CURRENT |
| [design/paseo-bots/shards/04-task-pyramid-and-settlement.md](design/paseo-bots/shards/04-task-pyramid-and-settlement.md) | Shard 04: Task Pyramid, File Leases & Idempotent Card Settlement | en-US | 115 | CURRENT |
| [design/paseo-bots/shards/05-fallback-routines-and-surfaces.md](design/paseo-bots/shards/05-fallback-routines-and-surfaces.md) | Shard 05: Same-Provider Model Fallback, Routines, Analytics & Client Surfaces | en-US | 99 | CURRENT |
| [design/paseo-bots/shards/06-client-ui-and-cds.md](design/paseo-bots/shards/06-client-ui-and-cds.md) | Shard 06: Client UI, CDS Tokens, Motion & Edge Guards | en-US | 80 | CURRENT |

### 7. Cross-Runtime Agent Architecture Patterns (`design/patterns/`)
| Document | Title | Language | Lines | Status |
| :--- | :--- | :--- | ---: | :--- |
| [design/patterns/INDEX.md](design/patterns/INDEX.md) | Cross-Runtime Agent Architecture Patterns Index | en-US | 30 | CURRENT |
| [design/patterns/shards/01-attention-and-compaction.md](design/patterns/shards/01-attention-and-compaction.md) | Attention Degradation Dynamics & Lossy Compaction Lifecycle | en-US | 112 | CURRENT |
| [design/patterns/shards/02-cache-layers-and-instruction-budget.md](design/patterns/shards/02-cache-layers-and-instruction-budget.md) | Prompt Cache Layers, Instruction Budget & Tool Governance | en-US | 112 | CURRENT |
| [design/patterns/shards/03-groupchat-anti-loop-and-delta.md](design/patterns/shards/03-groupchat-anti-loop-and-delta.md) | Group-Chat Monotonic Cursors, Safe Delta Slicing & Anti-Loop Gates | en-US | 107 | CURRENT |
| [design/patterns/shards/04-blackboard-budget-and-arbitration.md](design/patterns/shards/04-blackboard-budget-and-arbitration.md) | Shared Blackboard Token Budgeting & Three-Tier Quality Arbitration | en-US | 109 | CURRENT |
| [design/patterns/shards/05-multiagent-roi-and-memory.md](design/patterns/shards/05-multiagent-roi-and-memory.md) | Multi-Agent ROI, Write-Set Orthogonality & Progressive Memory | en-US | 108 | CURRENT |

---

## Part III: Technical Research & External References

### 8. Source-Anchored Audits & Reconnaissance (`research/`)
| Document | Title | Language | Lines | Status |
| :--- | :--- | :--- | ---: | :--- |
| [research/INDEX.md](research/INDEX.md) | Technical Research Router (Micro-Kernel) | en-US | 34 | REFERENCE |
| [research/2026-11-16-bot-avatar-storage-architecture-and-decoupling.md](research/2026-11-16-bot-avatar-storage-architecture-and-decoupling.md) | Bot Avatar Storage Architecture & Asset Decoupling Spec | en-US | 89 | REFERENCE |
| [research/2026-11-16-companion-data-desync-analysis.md](research/2026-11-16-companion-data-desync-analysis.md) | 深度侦察报告：排查“伙伴/助手内数据不同步、慢半拍”的根因与改造方案 | zh/en | 175 | REFERENCE |
| [research/2026-11-16-paseo-agy-acp-steer-queue-mechanism.md](research/2026-11-16-paseo-agy-acp-steer-queue-mechanism.md) | Paseo 与 Antigravity ACP (agy) 消息排队 (Queue) 与引导 (Steer) 机制深度调研报告 | zh/en | 218 | REFERENCE |
| [research/2026-11-16-paseo-chat-composer-bot-switch-feasibility.md](research/2026-11-16-paseo-chat-composer-bot-switch-feasibility.md) | Paseo 主输入框 Bot 切换器与轻量交互体验可行性调研报告 | zh/en | 189 | REFERENCE |
| [research/2026-11-16-paseo-composer-pill-and-surface-slimming-recon.md](research/2026-11-16-paseo-composer-pill-and-surface-slimming-recon.md) | Paseo ComposerPill 消息路由与 BotsSurface 极简瘦身深度侦察报告 | zh/en | 151 | REFERENCE |
| [research/AI运行时元MCP动态编排架构调研.md](research/AI%E8%BF%90%E8%A1%8C%E6%97%B6%E5%85%83MCP%E5%8A%A8%E6%80%81%E7%BC%96%E6%8E%92%E6%9E%B6%E6%9E%84%E8%B0%83%E7%A0%94.md) | AI运行时元MCP动态编排架构调研 | zh/en | 327 | REFERENCE |
| [research/Claude Code 多智能体提示词方案对比.md](research/Claude%20Code%20%E5%A4%9A%E6%99%BA%E8%83%BD%E4%BD%93%E6%8F%90%E7%A4%BA%E8%AF%8D%E6%96%B9%E6%A1%88%E5%AF%B9%E6%AF%94.md) | Claude Code 多智能体提示词方案对比 | zh/en | 334 | REFERENCE |
| [research/acp-peer-survey.md](research/acp-peer-survey.md) | ACP Peer Survey — Stale Running State and Missing Retry | en-US | 81 | REFERENCE |
| [research/agy-acp-ecosystem-tracking.md](research/agy-acp-ecosystem-tracking.md) | Antigravity ACP (`agy acp`) Ecosystem & Robustness Tracking | en-US | 146 | REFERENCE |
| [research/agy-acp-gate-report.md](research/agy-acp-gate-report.md) | ACP Turn-Termination Gate Report | en-US | 651 | REFERENCE |
| [research/agy-acp-stale-run-audit.md](research/agy-acp-stale-run-audit.md) | AGY-ACP stale-run audit — "turn stopped, UI still running" | en-US | 201 | REFERENCE |
| [research/agy-acp-upstream-0.1.3-port-assessment.md](research/agy-acp-upstream-0.1.3-port-assessment.md) | paseo-agy-acp: upstream v0.1.3 port assessment | en-US | 182 | REFERENCE |
| [research/cindy-bot-model-fallback-architecture-report.md](research/cindy-bot-model-fallback-architecture-report.md) | Cindy Bot Model Fallback Architecture & Team Bot Adaptation Analysis | en-US | 171 | REFERENCE |
| [research/magpie-agy-bridge-comparison.md](research/magpie-agy-bridge-comparison.md) | magpie-agy-bridge vs paseo-agy-acp — source-level lifecycle comparison | en-US | 185 | REFERENCE |
| [research/paseo-agy-acp-local-audit.md](research/paseo-agy-acp-local-audit.md) | paseo-agy-acp: Local Codebase & Robustness Audit | en-US | 66 | REFERENCE |
| [research/paseo-plugin-agent-team-research.md](research/paseo-plugin-agent-team-research.md) | Paseo 官方插件 `gyuha/agent-team` 深度技术调研报告 | zh/en | 350 | REFERENCE |
| [research/t3-code-lifecycle.md](research/t3-code-lifecycle.md) | T3 Code Turn/Session Lifecycle — Source-Anchored Model vs `paseo-agy-acp` | en-US | 217 | REFERENCE |

### 9. External & Upstream Reference Snapshots (`references/`)
> Read-only vendor references. Upstream Paseo host docs (`55` files) are isolated under `references/paseo-upstream/` via [references/paseo-upstream/CLAUDE.md](references/paseo-upstream/CLAUDE.md).

| Document | Title | Language | Lines | Status |
| :--- | :--- | :--- | ---: | :--- |
| [references/INDEX.md](references/INDEX.md) | External & Upstream References Router (Micro-Kernel) | en-US | 24 | REFERENCE |
| [references/claude-subagents-official.md](references/claude-subagents-official.md) | 创建自定义 subagents | zh/en | 1478 | REFERENCE |
| [references/claude-managed-agents/README.md](references/claude-managed-agents/README.md) | Anthropic Claude Managed Agents (托管智能体) 架构体系深度解析 | en-US | 147 | REFERENCE |
| [references/claude-managed-agents/01-multiagent-orchestration.md](references/claude-managed-agents/01-multiagent-orchestration.md) | 多智能体编排 (Multiagent Orchestration) | en-US | 536 | REFERENCE |
| [references/claude-managed-agents/02-session-threads.md](references/claude-managed-agents/02-session-threads.md) | 会话线程 (Session Threads) | en-US | 265 | REFERENCE |
| [references/claude-managed-agents/03-workflow-runs.md](references/claude-managed-agents/03-workflow-runs.md) | 工作流运行 (Workflow Runs) | en-US | 418 | REFERENCE |
| [references/claude-managed-agents/04-agent-memory.md](references/claude-managed-agents/04-agent-memory.md) | 智能体记忆 (Memory) | en-US | 399 | REFERENCE |
| [references/claude-managed-agents/05-dreams.md](references/claude-managed-agents/05-dreams.md) | 梦境 (Dreams) | en-US | 286 | REFERENCE |
| [references/paseo-upstream/CLAUDE.md](references/paseo-upstream/CLAUDE.md) | CLAUDE.md | en-US | 205 | REFERENCE |
