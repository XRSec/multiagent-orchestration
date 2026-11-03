# Multiagent Orchestration 核心架构记忆 (MEMORY.md)

本文档是 `multiagent-orchestration` 仓库的项目级记忆索引，为所有智能体与开发者提供统一的顶层架构认知。

---

## 1. 仓库定位与架构边界

- **项目定位**：`multiagent-orchestration` 是多智能体编排引擎与协同框架系统工程，涵盖群聊时间线、多 Agent 拓扑、无头 CLI 进程池、流式解析与进程内编排 MCP。
- **CindyR 关系**：`CindyR/` 是作为配套使用的深度去脂桌面客户端（基于 Cindy 官方客户端改造），收敛为 Claude Code 单运行时。
- **根目录规范独立性**：根目录的 `AGENTS.md`、`CLAUDE.md`、`UPDATE.md` 以及 `docs/` 属于全局项目级规范，**严禁软链接至子模块 CindyR**。

---

## 2. 核心协作拓扑与协议规范

系统支持六大协作拓扑与状态机，所有交互契约详见 `docs/protocols/`：

1. **群聊时间线 (Group Chat Timeline)**：
   - 消息以严格单调自增 `sequence` 顺序持久化。
   - 数据存储于用户目录 `~/.multiagent-orchestration/groups/<room_slug>/`，不污染业务代码仓。
   - 支持通过 `@伙伴名` 定向唤醒并驱动对应 Agent。
2. **机器动作协议 (MAP Envelope)**：
   - 无头子进程通过 `<!-- CINDY_MAP:BEGIN -->...<!-- CINDY_MAP:END -->` 传递强类型 JSON 动作，杜绝非结构化纯文本传递。
3. **P2P 隔离查询 (P2P Query)**：
   - Agent 之间使用临时命名空间 `p2p_*` 进行私有技术假设核验，递归深度严格限制 $CallDepth \le 3$。
4. **管道接力 (Pipeline Relay)**：
   - 顺序串行状态机（如 `researcher -> coder -> reviewer`），移交时上游智能体挂起。
5. **并发分发 (Fan-Out / Fan-In Dispatch)**：
   - 任务并行拆解、异步子进程并发驱动与栅栏同步聚合。
6. **双通道实时动态转向 (Dual-Channel Steering)**：
   - **软转向**：通过 `PreToolUse` Hook 内存信箱注入 `additionalContext` 或阻断调用，保留 5 分钟 Prompt Cache。
   - **硬转向**：向 stdin 派发 `control_request: interrupt` 帧中止阻塞，防止假死挂起。

---

## 3. 运行时驱动与进程内 MCP

- **Primary Driver**：`@anthropic-ai/claude-agent-sdk`，在 Electron / Node.js 主进程以流式 NDJSON 运行。
- **Secondary Driver**：原生 `claude` CLI headless 子进程（`--print --input-format stream-json --output-format stream-json --dangerously-skip-permissions`）。
- **进程内 MCP 服务 (`nexus-orchestrator-mcp`)**：
  - 仅挂载至 `Lead Orchestrator`。
  - 提供 `dispatch_and_queue_partners`、`await_partner_queue`、`steer_or_repair_partner` 三大编排元工具。

---

## 4. 根文档地图 (`docs/`)

- `docs/architecture.md`：总架构设计与进程生命周期
- `docs/axioms/STANDING_ORDER.md`：全局 AST 树拓扑与规范法则
- `docs/protocols/`：MAP、转向、MCP、Partner 合约、分发、接力、P2P 协议全集
- `docs/dev-rules/`：Bot Group 存储、NDJSON 进程池、IPC/SQLite、脚本规范、Web Parser
- `docs/claude-managed-agents/`：Anthropic 官方托管 Agent 规范对齐与本地映射

---

## 5. 开发纪律与底线

1. **安全删除**：严禁使用 `rm`，必须使用 `/opt/xrsec/.env/rmfile`。
2. **代码修改**：单文件行数 $\le 600$ 行；CindyR 代码禁用一律使用 `/* [Disabled: ...] */` 注释包裹，严禁物理删除。
3. **Git 交付**：推送前必须 squash 零散 commit。
4. **语言要求**：全局中文思考与回复。
