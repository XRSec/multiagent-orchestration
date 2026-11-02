# Dispatch Task: M1 Exploration - Helper 1, 2, 5 (Intent, KV Lock, Prompt Distill)

## Task Description
作为 M1 勘测专家 1，请针对以下 3 项原子能力进行详尽的实现策略设计与单测方案设计（严禁直接创建/修改业务源码，仅输出技术设计与规划报告）：
1. **Helper 1 (IntentPreflightHelper)**: 毫秒级意图预检，包含顺延词（"ok", "继续", "好", "yes", "proceed"等）0ms 旁路直通、最小必要能力集（FILE_READ, FILE_WRITE, COMMAND_RUN, MCP_GATEWAY, SKILL_LOAD）计算。
2. **Helper 2 (PromptCacheLockHelper)**: System Prompt 绝对静态化保证，SHA-256 基座哈希锁定，变动指令严格采用尾部注入规范（Tail Injection: `=== [EPHEMERAL_TAIL_CONTEXT] ===`），锁定 95%+ KV 缓存命中率。
3. **Helper 5 (PromptDistillationHelper)**: 冗余客套词精炼过滤，冷热分离（Cold 规则指令 vs Hot 动态参数），维护确定性前缀哈希 LRU 缓存。

## Target Files to Plan
- `packages/agent-control-plane/helpers/intent-preflight/IntentPreflightHelper.mjs`
- `packages/agent-control-plane/helpers/prompt-cache-lock/PromptCacheLockHelper.mjs`
- `packages/agent-control-plane/helpers/prompt-distillation/PromptDistillationHelper.mjs`
- `tests/unit/test-intent-preflight.mjs`
- `tests/unit/test-prompt-cache-lock.mjs`
- `tests/unit/test-prompt-distillation.mjs`

## Requirements
- 每个模块代码行数严格控制在 150-300 行（单文件 <= 600 行）。
- 原生 Node.js ESM (`.mjs`)，零第三方无用依赖。
- 在你的工作目录输出 `handoff.md`，并在完成后通过 send_message 向协调器汇报。


## 2026-11-02T06:07:09Z
[Message] sender=dbf02e0c-b5f1-48f7-bdf7-6fb480aab20c priority=MESSAGE_PRIORITY_HIGH
你被指派为 M1 勘测专家 1（Helper 1, 2, 5）。请针对 IntentPreflightHelper, PromptCacheLockHelper, PromptDistillationHelper 展开详尽的技术实现方案与自动化单测设计。

工作目录：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_r2_1/
请首先阅读：
1. 原始需求：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md
2. 任务指示：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_r2_1/DISPATCH.md
3. 项目全局索引：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/PROJECT.md
4. 前期勘测报告：
   - /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_r2_2/handoff.md

注意：你作为 Explorer 严禁直接编写或修改项目源码，仅在工作目录下产出技术方案 handoff.md 并通过 send_message 汇报。
