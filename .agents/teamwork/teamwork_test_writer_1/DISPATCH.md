## 2026-11-02T05:37:05Z
Your working directory is: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_test_writer_1/
Your identity is: teamwork_test_writer
Original request file: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md
Scope document: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/PROJECT.md
You MUST read ORIGINAL_REQUEST.md and PROJECT.md before starting work.

Objective:
构建端到端（E2E）测试框架与自动化验收测试脚本，覆盖项目需求中所有四大界面的契约校验、数据完整性测试、构建/打包检查以及代码行数规范校验。
输出 TEST_INFRA.md 与 TEST_READY.md。

Scope boundaries:
- 专注于测试基础设施与测试用例编写（在 tests/ 目录下编写自动化测试脚本，如 `tests/test-cindy-ui.mjs`）。
- 绝不要修改或实现具体的业务渲染组件（业务组件由实现轨的 Worker 完成）。

Tasks:
1. 按照 4-Tier 方法学设计测试用例并在 `tests/test-cindy-ui.mjs` 中实现自动化检查：
   - Tier 1 (Feature Coverage): 检查四大核心组件及 Mock 模块的导出、基础接口与契约完整性。
   - Tier 2 (Boundary & Integrity): 校验 Mock 数据的边界条件（SOUL.md / MEMORY.md 字段、已挂载技能数组、双平面沙箱路径、群成员数 >=2 保护、发言模式枚举值、分工卡步骤索引连续性等）。
   - Tier 3 (Code Quality & Line Limits): 深度扫描 `apps/desktop/src/renderer/` 下的所有源码文件，验证每一个文件行数均不超过 600 行（500 行触发预警），违规直接报错。
   - Tier 4 (Build Verification): 运行 `pnpm exec vite build` 并断言退出码为 0，确保编译打包零错误。
2. 产出 `TEST_INFRA.md` 并最终在测试套件全部就绪后产出 `TEST_READY.md`。
3. 在 `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_test_writer_1/handoff.md` 给出自包含总结，并通过 send_message 通知主调度器。
