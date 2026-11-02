## 2026-11-02T05:45:01Z
Your working directory is: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_worker_m1_1/
Your identity is: teamwork_worker (Role: M1 Implementation Worker)
Original request file: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md
Scope document: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/PROJECT.md
You MUST read ORIGINAL_REQUEST.md and PROJECT.md before starting work.

Milestone: M1 基础 Mock 数据体系与公共原子组件

Explorer findings to reference:
- Mock 数据结构及原型模板：`/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_1/handoff.md` 与 `proposed_*.js`
- 公共抽屉与原子组件规范：`/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_2/handoff.md`
- 模块导出契约与行数预算规范：`/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_3/handoff.md`

Exclusive Write Ownership (独占写所有权):
你独占以下文件，绝不要改动其他文件：
- `apps/desktop/src/renderer/mock/mockPartners.js`
- `apps/desktop/src/renderer/mock/mockGroupSessions.js`
- `apps/desktop/src/renderer/mock/mockPlanData.js`
- `apps/desktop/src/renderer/mock/index.js`
- `apps/desktop/src/renderer/components/common/SlideOverDrawer.jsx`
- `apps/desktop/src/renderer/components/common/AvatarStack.jsx`
- `apps/desktop/src/renderer/components/common/RoleStatusBadge.jsx`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implementation Requirements:
1. 实现 3 大 Mock 数据文件及统一导出入口 `mock/index.js`，包含伙伴完整配置（SOUL/MEMORY/技能/双平面隔离沙箱）、群聊会话（成员、角色、工作目录、发言模式、消息历史）与 Cindy 风格分工计划卡模型（步骤、负责人、状态、产出文件）。
2. 实现 3 大公共原子组件：
   - `SlideOverDrawer.jsx` (448px 宽，右侧滑出，暗黑遮罩，onPointerDownOutside 拦截防丢失，ESC IME 拼音输入保护，header/body/footer 布局)。
   - `AvatarStack.jsx` (-ml-2 叠放，border-2 border-surface 底色描边物理切割，溢出 +N 胶囊)。
   - `RoleStatusBadge.jsx` (Leader/Reviewer/Worker 角色色彩方案，提供在线/思考呼吸脉冲/离线状态指示灯)。
3. 所有文件单文件行数严格控制在 <= 250 行（绝对禁止超过 500 行预警与 600 行红线）。
4. 实现后必须运行构建命令（如 `pnpm exec vite build`）与测试检验，确保无报错、打包正常。
5. 在 `handoff.md` 中记录实施详情、运行的构建与测试命令输出，并通过 send_message 通知主调度器。
