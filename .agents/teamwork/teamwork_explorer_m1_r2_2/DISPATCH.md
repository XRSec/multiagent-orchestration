# Dispatch Task: M1 Exploration - Helper 3, 4, 8 (Progressive Disclosure, Step Scrubber, Skill Capsule)

## Task Description
作为 M1 勘测专家 2，请针对以下 3 项原子能力进行详尽的实现策略设计与单测方案设计（严禁直接创建/修改业务源码，仅输出技术设计与规划报告）：
1. **Helper 3 (ProgressiveDisclosureHelper)**: 上下文去脂与三层渐进披露：
   - Layer 1: 0成本元数据折叠 `[ResourceFolded: {id} | lines: {n} | bytes: {b} | tag: {t}]`
   - Layer 2: 高密微胶囊 Capsule，硬约束长度 `<= 180` 字符
   - Layer 3: 按需深挖切片窗口 `[Lines {start}-{end} of {total}]`
2. **Helper 4 (StepScrubberHelper)**: 针对大型工具输出，采用固定步长周期（Chunk-aligned step=6）阶梯衰减，保留前 6 行与后 6 行，中间折叠，防雪球效应与 Cache 击穿。
3. **Helper 8 (SkillCapsuleHelper)**: 巨型技能（类似 superpowers）首次读取后渐进蒸馏为 `<= 180` 字符微胶囊，建立强 SHA-256 哈希校验落盘缓存与热更新感知。

## Target Files to Plan
- `packages/agent-control-plane/helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs`
- `packages/agent-control-plane/helpers/step-scrubber/StepScrubberHelper.mjs`
- `packages/agent-control-plane/helpers/skill-capsule/SkillCapsuleHelper.mjs`
- `tests/unit/test-progressive-disclosure.mjs`
- `tests/unit/test-step-scrubber.mjs`
- `tests/unit/test-skill-capsule.mjs`

## Requirements
- 每个模块代码行数严格控制在 150-300 行（单文件 <= 600 行）。
- 原生 Node.js ESM (`.mjs`)，零第三方无用依赖。
- 在你的工作目录输出 `handoff.md`，并在完成后通过 send_message 向协调器汇报。

## 2026-11-02T06:07:14Z
[Message] sender=dbf02e0c-b5f1-48f7-bdf7-6fb480aab20c priority=MESSAGE_PRIORITY_HIGH
你被指派为 M1 勘测专家 2（Helper 3, 4, 8）。请针对 ProgressiveDisclosureHelper, StepScrubberHelper, SkillCapsuleHelper 展开详尽的技术实现方案与自动化单测设计。

工作目录：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_r2_2/
请首先阅读：
1. 原始需求：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md
2. 任务指示：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_r2_2/DISPATCH.md
3. 项目全局索引：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/PROJECT.md
4. 前期勘测报告：
   - /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_r2_2/handoff.md

注意：你作为 Explorer 严禁直接编写或修改项目源码，仅在工作目录下产出技术方案 handoff.md 并通过 send_message 汇报。

