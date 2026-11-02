# Dispatch Task: M1 Exploration - Helper 6, 7 & Constants / Unified Facade

## Task Description
作为 M1 勘测专家 3，请针对以下能力与公共基础进行详尽的实现策略设计与单测方案设计（严禁直接创建/修改业务源码，仅输出技术设计与规划报告）：
1. **Helper 6 (ToolSlimmingHelper)**: 工具 Schema 精炼（去除 examples, title, default 等无用元数据，压缩 description），按意图动态暴露最小集，预编译 SHA-256 哈希缓存。
2. **Helper 7 (McpMetaToolingHelper)**: 外部 MCP 接口折叠为 2 个元工具（`gateway.list_tools` + `gateway.call_tool`），工具列表快照本地内存缓存与毫秒级查询，元调用安全转发。
3. **公共常量与包门面**: `packages/agent-control-plane/constants.mjs` 与 `packages/agent-control-plane/index.mjs`。

## Target Files to Plan
- `packages/agent-control-plane/constants.mjs`
- `packages/agent-control-plane/index.mjs`
- `packages/agent-control-plane/helpers/tool-slimming/ToolSlimmingHelper.mjs`
- `packages/agent-control-plane/helpers/mcp-meta-tooling/McpMetaToolingHelper.mjs`
- `tests/unit/test-tool-slimming.mjs`
- `tests/unit/test-mcp-meta-tooling.mjs`

## Requirements
- 每个模块代码行数严格控制在 150-300 行（单文件 <= 600 行）。
- 原生 Node.js ESM (`.mjs`)，零第三方无用依赖。
- 在你的工作目录输出 `handoff.md`，并在完成后通过 send_message 向协调器汇报。

## 2026-11-02T06:07:19Z
[Message] sender=dbf02e0c-b5f1-48f7-bdf7-6fb480aab20c priority=MESSAGE_PRIORITY_HIGH
你被指派为 M1 勘测专家 3（Helper 6, 7 & Constants / Index）。请针对 ToolSlimmingHelper, McpMetaToolingHelper 以及 constants.mjs、index.mjs 展开详尽的技术实现方案与自动化单测设计。

工作目录：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_r2_3/
请首先阅读：
1. 原始需求：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md
2. 任务指示：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_r2_3/DISPATCH.md
3. 项目全局索引：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/PROJECT.md
4. 前期勘测报告：
   - /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_r2_2/handoff.md

注意：你作为 Explorer 严禁直接编写或修改项目源码，仅在工作目录下产出技术方案 handoff.md 并通过 send_message 汇报。

## 2026-11-02T06:11:50Z
[Message] sender=dbf02e0c-b5f1-48f7-bdf7-6fb480aab20c priority=MESSAGE_PRIORITY_HIGH
**Context**: M1 Helper 6, 7 & Constants / Index 勘测任务
**Content**: 请注意你的任务目标是当前新任务：为 `packages/agent-control-plane/` 设计 Helper 6 (ToolSlimmingHelper: 工具 Schema 精炼与能力最小集过滤、预编译哈希缓存)、Helper 7 (McpMetaToolingHelper: 外部 MCP 折叠为固定 2 个元工具 gateway.list_tools/call_tool 与快照缓存)、`constants.mjs` 和 `index.mjs`，并设计 `tests/unit/test-tool-slimming.mjs` 与 `tests/unit/test-mcp-meta-tooling.mjs`。不要分析旧任务的 Cindy UI 代码。请严格参考你工作目录下的 `DISPATCH.md` 与前期调研报告 `teamwork_explorer_survey_r2_2/handoff.md`。
**Action**: 请尽快更新并输出技术方案至 `handoff.md` 并向协调器汇报。

