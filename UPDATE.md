# Multiagent Orchestration 项目变更记录 (UPDATE.md)

本文档系统记录 `multiagent-orchestration` 仓库的项目级架构演进、核心能力交付与体系重构台账。

---

## 一、 项目体系定位与重构台账

### 1. 根目录与 CindyR 模块解耦重构 (2026-11-03)
- **背景**：此前根目录 `AGENTS.md`、`CLAUDE.md` 与 `UPDATE.md` 被错误软链接至子模块 `CindyR/`，导致全局项目规范与客户端去脂规范混淆。
- **改动措施**：
  - 恢复根目录项目级 `AGENTS.md`（定义多智能体编排引擎架构、双平面隔离与 AST 规范树）。
  - 恢复根目录极简引导路由器 `CLAUDE.md`。
  - 安全移除根目录错误指向 `CindyR` 的软链接（`UPDATE.md` 与 `multiagent-orchestration`），规范项目边界。
  - 将 `multiagent-orchestration-old/docs/` 完整迁回根目录 `/docs/`，恢复全部协议与开发规则的权威正本。
  - 建立统一的持久化记忆体系（`MEMORY.md` 及 Claude Code 全局记忆分片）。

---

## 二、 核心架构与功能演化里程碑

### 1. Web 前端群聊与多智能体协同完整接入 (`52efa74`)
- **交付范围**：
  - 将群聊与多智能体协同能力接入 `apps/web/`，支持房间列表管理、历史消息流展示（单调递增 sequence）。
  - 完整实现 `@伙伴` 语法触发底层真实 Agent 无头执行并实时流式渲染。
  - 通过 `vite-room-api-plugin.ts` 建立 REST + SSE 桥接中间件，打通前端与 `~/.multiagent-orchestration/groups/<room_slug>/` 存储和 `agent-driver`。
  - 经独立审计智能体验证，通过 7 组端到端/压力测试，出具 `VICTORY CONFIRMED`。

### 2. Cindy Bot Group 核心架构与控制平面精馏 (`61daf15`)
- 落地 Bot Group 多智能体协同协议与多仓挂载机制。
- 引入控制平面精馏能力（意图预检、渐进披露、Prompt Cache 保护）。

### 3. Partner Studio 与流式消息队列交互 (`e8876d9`)
- 引入 Partner 工作台，支持自然 Claude 流式排队、会话分支管理与 `@bot` 协议交互。

### 4. 初始双模编排引擎奠基 (`0e1e798`)
- 确立 `@anthropic-ai/claude-agent-sdk` 与原生 `claude` CLI 双模驱动架构。
- 确立机器动作协议 (MAP) 与双通道转向 (Dual-Channel Steering) 契约。

---

## 三、 子模块状态对照

| 模块名称 | 所在路径 | 职责定位 | 规范正本 |
| :--- | :--- | :--- | :--- |
| **Orchestration Core** | `/` & `docs/` | 多智能体编排底座、协议、进程池、群聊存储 | [AGENTS.md](AGENTS.md) / [MEMORY.md](MEMORY.md) |
| **Web Frontend** | `apps/web/` | Web 界面、群聊时间线、SSE 渲染 | [apps/web/README.md](apps/web/README.md) |
| **CindyR Client** | `CindyR/` | 深度去脂瘦身的轻量桌面客户端 (Electron) | [CindyR/AGENTS.md](CindyR/AGENTS.md) |
