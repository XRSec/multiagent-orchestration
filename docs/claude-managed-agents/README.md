---
id: claude-managed-agents-overview
type: specification
version: 1.0.0
parent_node: ../../AGENTS.md
child_nodes:
  - 01-multiagent-orchestration.md
  - 02-session-threads.md
  - 03-workflow-runs.md
  - 04-agent-memory.md
  - 05-dreams.md
---

# Anthropic Claude Managed Agents (托管智能体) 架构体系深度解析

> **规范版本**: `managed-agents-2026-04-01` / `dreaming-2026-04-21`  
> **所属平台**: Anthropic Claude API / Managed Agents Platform  
> **文档定位**: 官方托管多智能体平台技术全景解析与架构映射规范

---

## 1. 架构总览 (System Architecture)

Anthropic 的 **Claude Managed Agents（托管智能体）** 是一套服务端完全托管的智能体协作系统。它将智能体生命周期、跨智能体编排、长短期记忆、线程隔离与离线认知重整（梦境机制）抽象为原生云端能力。

```text
                               ┌────────────────────────────────────────────────────────┐
                               │           Claude Managed Agents Platform               │
                               └───────────────────────────┬────────────────────────────┘
                                                           │
                      ┌────────────────────────────────────┼────────────────────────────────────┐
                      │                                    │                                    │
           [1. 编排与执行引擎]                    [2. 上下文与线程模型]                  [3. 认知与记忆系统]
           ├── 多智能体编排 (Orchestration)       ├── 主线程 (Primary Thread)           ├── 记忆存储 (Memory Stores)
           │   ├── 预定义智能体 (Predefined)       ├── 会话子线程 (Session Threads)       │   ├── 命名空间分块
           │   ├── 内联智能体 (Inline)            └── 事件流驱动 (Event Streams)        │   └── 乐观并发编辑
           │   └── 子智能体委派 (Delegation)                                            └── 梦境机制 (Dreams)
           └── 动态工作流 (Workflow Runs)                                                   ├── 离线异步整合 (Consolidation)
               ├── 阶段性并行/串行编排                                                        ├── 模式与见解提取
               └── 状态机故障自愈                                                             └── 记忆精炼与冲突解决
```

---

## 2. 五大核心技术支柱解析

### 2.1 多智能体编排 (Multiagent Orchestration)
- **文档链接**: [01-multiagent-orchestration.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/claude-managed-agents/01-multiagent-orchestration.md)
- **核心定位**: 解决单一会话上下文污染与能力瓶颈，通过角色解耦实现复杂工程任务的分治。
- **三种协作形态**:
  1. **委派给子智能体 (Delegation to Subagents)**: 专为探索性、非确定性分工设计。主智能体向子智能体指派子任务，子智能体在隔离线程中自主交互并向主智能体反馈摘要。
  2. **动态工作流 (Dynamic Workflow Runs)**: 智能体自主编写多阶段工作流程序，服务端托管并发执行。适用于大范围代码审计、系统迁移、深度研究等高并行长时任务。
  3. **顾问咨询 (Session Advisor)**: 主智能体在决策关键节点（方案规划、代码终审）向高级顾问模型（如 Claude Opus）请求即时指导，不切换主执行线程。
- **预定义 (Predefined) vs 内联 (Inline)**:
  - `predefined_agents`: 显式注册的专业智能体，拥有独立的模型、系统提示词、私有工具及 MCP 服务。
  - `inline_agents`: 运行时由主智能体动态实例化的临时智能体，自动继承父级模型与工具能力。

---

### 2.2 会话线程模型 (Session Threads)
- **文档链接**: [02-session-threads.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/claude-managed-agents/02-session-threads.md)
- **核心定位**: 多智能体上下文边界控制与事件隔离机制。
- **线程层级**:
  - **主线程 (Primary Thread)**: 用户交互与顶级编排的核心生命线。
  - **会话线程 (Session Threads)**: 子智能体、工作流阶段执行的独立沙箱线程。
- **架构优势**:
  - **上下文隔离**: 避免单一会话因海量工具输出（如百兆日志、AST树）膨胀至上下文窗口上限。
  - **精细化控制**: 支持主线程对特定子线程的实时中断（`interrupt`）与按需归档（`archive`）。
  - **权限传递**: 子线程支持安全受限的工具集白名单，防止越权操作。

---

### 2.3 工作流运行机制 (Workflow Runs)
- **文档链接**: [03-workflow-runs.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/claude-managed-agents/03-workflow-runs.md)
- **核心定位**: 工业级长时自动化流程的状态机引擎。
- **状态流转图**:
  ```text
  [pending] ──> [running] ──> [succeeded]
                   │
                   ├──> [cancelled] (用户主动中断 / 预算超限)
                   └──> [failed]    (未捕获异常 / 重试耗尽)
  ```
- **核心能力**:
  - **确定性与异步化**: 主会话发起工作流后无需同步阻塞挂起，服务端负责拉起各阶段任务并调度智能体。
  - **状态自愈与重连重建**: 客户端断开或崩溃后，可通过 `Workflow Run ID` 重建运行快照并无缝恢复事件流订阅。
  - **预算与成本守卫**: 原生注入 Session Budget，精确限制并行智能体的 Token 吞吐与运行成本上限。

---

### 2.4 智能体记忆存储 (Agent Memory)
- **文档链接**: [04-agent-memory.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/claude-managed-agents/04-agent-memory.md)
- **核心定位**: 跨会话的持久化知识资产沉淀。
- **设计特征**:
  - **独立存储生命周期**: 记忆存储（Memory Store）解耦于具体智能体会话，可在多个会话、多个同类智能体之间挂载共享。
  - **结构化原子条目**: 记忆并非无结构的字符串黑盒，而是具有显式 Key、类别及版本号的命名实体。
  - **乐观并发控制 (Optimistic Concurrency Control)**: 借助 `etag` / 版本检查，杜绝多个并行会话覆写冲突问题。

---

### 2.5 梦境认知重整 (Dreams)
- **文档链接**: [05-dreams.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/claude-managed-agents/05-dreams.md)
- **核心定位**: 借鉴人类睡眠期间海马体到大脑皮层的记忆固化过程，实现离线长程知识提炼与去冗。
- **运行机理**:
  ```text
  [输入记忆存储] + [1 ~ 100 个历史会话记录]
                    │
                    ▼  (异步后台流水线 / 梦境管道)
  ┌─────────────────────────────────────────────────┐
  │   1. 语义去重 (De-duplication)                   │
  │   2. 冲突消解 (Conflict Resolution with recency) │
  │   3. 模式洞察提取 (Cross-Session Pattern Mining) │
  └─────────────────┬───────────────────────────────┘
                    │
                    ▼
            [全新优化后的输出记忆存储]
            (不可变设计：输入存储保持完好，支持人工审计与灰度切换)
  ```
- **适用场景**:
  - 长期运维或开发伴随式智能体：消除因局部会话片段积累的矛盾规则与陈旧假设。
  - 团队最佳实践提炼：从多位工程师或智能体的百次交互中自动总结领域 SOP。

---

## 3. 本地编排体系与 Claude Managed Agents 映射对照表

本项目 (`multiagent-orchestration`) 遵循相同的现代智能体操作系统理念，两者在设计理念上的映射关系如下：

| 维度 | Anthropic Claude Managed Agents | 本地多智能体编排体系 (`multiagent-orchestration`) |
| :--- | :--- | :--- |
| **执行载体** | 服务端全托管 Managed Agent 容器 | 本地独立进程 (`claude` CLI / Subprocess NDJSON) |
| **编排核心** | `multiagent_20261001` 编排块 | `nexus-orchestrator-mcp` + `Lead Coordinator` |
| **智能体定义** | Predefined (YAML/JSON) + Inline | Folder-as-an-Agent (`partners/<id>/`) |
| **线程沙箱** | Session Threads (`thread_id`) | 独立工作区 `workspace/` + 独立 NDJSON 流 |
| **动态干预** | API Interrupt / Resume | 双通道实时转向协议 (PreToolUse Hook + Control Interrupt) |
| **记忆存储** | 云端托管 Memory Store | `MEMORY.md` 索引 + `memories/topics/*.md` 分片 |
| **认知提炼** | 云端异步 Dreams Pipeline | 阶段性记忆蒸馏 SOP (`nmem-memory-distill` / Standing Order) |

---

## 4. 目录索引

1. [多智能体编排规范与指南](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/claude-managed-agents/01-multiagent-orchestration.md)
2. [会话线程模型与生命周期](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/claude-managed-agents/02-session-threads.md)
3. [动态工作流状态机与运行机制](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/claude-managed-agents/03-workflow-runs.md)
4. [智能体记忆持久化与并发控制](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/claude-managed-agents/04-agent-memory.md)
5. [梦境离线知识整合与模式挖掘](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/claude-managed-agents/05-dreams.md)
