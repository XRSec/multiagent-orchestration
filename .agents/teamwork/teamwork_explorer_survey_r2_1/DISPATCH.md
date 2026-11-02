# Dispatch Task: Codebase Architecture & Monorepo Integration Survey

## Task Description
作为技术勘测专家（Explorer 1），请深入勘测当前仓库 multiagent-orchestration 的 monorepo 架构规范及 Claude Agent SDK / 运行时底座的现状。

## Scope & Focus
1. 检查 monorepo 结构：根目录 `package.json`、`pnpm-workspace.yaml`、`packages/**`、`apps/**` 等现有包配置。
2. 检查现有的 Claude Agent SDK 及相关模块：`@anthropic-ai/claude-agent-sdk` 的引用情况、版本、集成方式（如 `apps/desktop/src/main/cli-pool/`、`packages/steering-hook/`、`apps/desktop/src/main/orchestrator/` 等）。
3. 检查代码规范与单文件行数限制（单文件 <= 600 行，500 行预警，800 行硬拆分）以及 TypeScript / 测试构建规范（pnpm test, vitest 等）。
4. 评估控制平面 Helper 的最佳落地位置（例如在 `packages/` 下创建独立的包如 `packages/agent-control-plane` 或 `packages/sdk-helper`，或者放在已有包中）及其模块依赖关系。

## Inputs
- `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md`
- `/Users/xr/IDEA.localized/multiagent-orchestration/AGENTS.md`
- 仓库源码与配置文件

## Output
在 `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_r2_1/handoff.md` 输出勘测报告。必须包含：
- 仓库现有架构与 Claude Agent SDK 使用分析
- 控制平面 Helper 的包定位与目录结构建议
- 单文件行数、TypeScript 配置、测试运行机制规范
- 任何潜在的技术风险与依赖边界


## 2026-11-02T05:59:39Z
Received dispatch from dbf02e0c-b5f1-48f7-bdf7-6fb480aab20c:
你被指派为技术勘测专家（Explorer 1）。请深入勘测当前仓库 multiagent-orchestration 的 monorepo 架构规范及 Claude Agent SDK / 运行时底座现状。
勘测重点：
1. 仓库 monorepo 结构（packages/ 与 apps/，package.json，pnpm-workspace.yaml，tsconfig，vitest/jest 配置）。
2. `@anthropic-ai/claude-agent-sdk` 在项目中的现有使用方式或集成现状（如 cli-pool, steering-hook, orchestrator 等）。
3. 评估为 8 项控制平面 Helper 设立独立模块或包的最佳方式（如 packages/agent-control-plane），确保各原子能力解耦且满足单文件 <= 600 行限制。
4. 在你的工作目录下输出完整的勘测报告 handoff.md。并在完成后通过 send_message 向协调器汇报。
