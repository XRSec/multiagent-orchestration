# Dispatch Task: SDK Lifecycle Pipeline Orchestration & Mock Session Verification

## Task Description
作为技术勘测与测试专家（Explorer 3），请深入勘测 Claude Code Agent SDK 生命周期管道编排，设计 8 项原子能力的执行顺序流转机制，并设计基于 Claude ID `2efe9e50-4306-497b-8b76-c112ffbd5d78` 的纯模拟对话驱动验证方案。

## Scope & Focus
1. **SDK 生命周期挂载点与执行次序**:
   - 深入梳理 SDK 生命周期各个阶段：输入阶段、Context 过滤管道、Prompt 构建阶段、PreToolUse 钩子、Tool 响应截获、MCP 注册与转换等。
   - 明确 8 项能力在生命周期中的精准执行顺序与流转集成（例如：意图预检在最前；Prompt Distillation 与 Cache Locking 在 Prompt 组装期；Tools Schema Slimming 与 MCP Meta-Tooling 在 Tool 注册与暴露期；Tool Output Scrubbing 与 Context Disclosure 在响应后及轮次迭代期；Skill Distillation 在 Skill 加载期）。
   - 设计类似 cindy_help 机制的底座 Helper 静默/自动调用管道。
2. **Mock 对话测试驱动机制**:
   - 以 Claude ID `2efe9e50-4306-497b-8b76-c112ffbd5d78` 为基准配置模拟对话上下文。
   - 完全不调用云端真实大模型，完全通过模拟 SDK 事件流驱动测试。
   - 设计端到端集成测试用例，涵盖顺延词直通、KV Cache Locking、多轮 Tool Scrubbing (step=6)、三层渐进披露与元工具调用的完整流转。

## Output
在 `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_r2_3/handoff.md` 输出勘测报告。必须包含：
- 生命周期流转阶段与精准执行顺序表
- 控制平面 Helper 编排器 (Pipeline Orchestrator) 的接口与生命周期钩子集成设计
- 基于 Claude ID `2efe9e50-4306-497b-8b76-c112ffbd5d78` 的 Mock 会话驱动与测试方案
