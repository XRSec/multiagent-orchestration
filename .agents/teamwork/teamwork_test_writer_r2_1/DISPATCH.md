# Dispatch Task: E2E Testing Track - Control Plane Helper Test Suite & TEST_READY.md

## Task Description
作为 E2E 测试架构师（teamwork_test_writer），请基于用户原始需求与测试方法论（4-Tier: Feature Coverage, Boundary & Corner Cases, Cross-Feature Interactions, Real-World Mock Scenarios），独立设计并构建 E2E 测试套件，产出 `TEST_INFRA.md` 与 `TEST_READY.md`。

## Objectives
1. 编写根目录下 `TEST_INFRA.md`，定义测试哲学、特性清单矩阵、4-Tier 覆盖阈值。
2. 编写 `tests/test-agent-control-plane-e2e.mjs`：
   - 基于 Node.js 原生 `node:test` + `node:assert/strict`。
   - 实现以 Claude ID `2efe9e50-4306-497b-8b76-c112ffbd5d78` 轨迹特征为基准的 7 轮连续 Mock 会话测试场景。
   - 验证顺延词 0ms 直通、KV Cache 锁定尾部注入、三层渐进披露（Layer 2 ≤ 180 字符）、Step=6 周期阶梯衰减、Prompt 客套去噪、Schema 瘦身、元工具折叠与 Skill 强哈希缓存。
   - 保证全程零真实云端大模型 API 调用，可独立运行。
3. 测试套件设计完成后，在项目根目录生成 `TEST_READY.md`，汇总各 Tier 测试用例数量与运行命令。

## Mandatory References
- 原始需求：`/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md`
- 项目全局索引：`/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/PROJECT.md`
- 勘测报告：
  - `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_r2_2/handoff.md`
  - `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_r2_3/handoff.md`

## Output Requirements
- `/Users/xr/IDEA.localized/multiagent-orchestration/TEST_INFRA.md`
- `/Users/xr/IDEA.localized/multiagent-orchestration/tests/test-agent-control-plane-e2e.mjs`
- `/Users/xr/IDEA.localized/multiagent-orchestration/TEST_READY.md`
- 在你的工作目录输出 `handoff.md` 并向协调器汇报。

## 2026-11-02T06:06:39Z
你被指派为 E2E 测试架构师（teamwork_test_writer）。请为控制平面 Helper 构建系统底座 E2E 测试套件，产出 TEST_INFRA.md、tests/test-agent-control-plane-e2e.mjs 以及 TEST_READY.md。
