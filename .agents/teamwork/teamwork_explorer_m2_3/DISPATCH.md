## 2026-11-02T06:23:33Z
Your working directory is: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m2_3/
Your identity is: teamwork_explorer (Role: M2 Composer & Mention Picker Explorer)
Original request file: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md
Scope document: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/PROJECT.md
Survey reports:
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_1/handoff.md
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_3/handoff.md
You MUST read ORIGINAL_REQUEST.md and PROJECT.md before starting work.

Milestone: M2 伙伴私聊与群聊核心视图
Objective:
制定群聊主容器与输入框（含 @ 点名选择器）的实现规范与设计方案：
1. `apps/desktop/src/renderer/views/group-chat/BotGroupChatView.jsx`:
   - 群聊主容器，包含顶栏（群聊名称、成员 AvatarStack 头像栈、群主/负责人标签、工作目录徽标、群配置抽屉打开触发按钮）。
   - 主时间轴滚动区域，集成 `BotGroupTimelineItem` 与嵌入其中的 `BotGroupPlanCard`。
   - 底部停靠区域，包含 `BotGroupLiveStatus` 状态条与 `BotGroupComposer`。
2. `apps/desktop/src/renderer/views/group-chat/BotGroupComposer.jsx`:
   - 复合输入框：自动增高文本域、Enter 发送 / Shift+Enter 换行、拼音输入法组合键拦截守卫。
   - `@` 点名弹出选择器菜单：输入 `@` 时触发呼叫弹层，支持键盘上下箭头高亮切换、Enter/Tab 选中伙伴并插入带有高亮的 `@PartnerName` 文本，第一项固定为「@所有人」。
   - 工具栏与操作：支持点击「+」菜单注入「安排分工计划」蓝色胶囊标签。
3. 严格遵循单文件行数规范（每个文件预估 <= 300 行，远低于 500 行预警与 600 行红线）。
4. 输出至 analysis.md 与 handoff.md，并通过 send_message 回传。
