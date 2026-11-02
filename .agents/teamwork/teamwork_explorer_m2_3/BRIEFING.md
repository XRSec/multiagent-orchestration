# BRIEFING — 2026-11-02T06:28:30Z

## Mission
制定群聊主容器 (BotGroupChatView) 与输入框（含 @ 点名选择器 BotGroupComposer）的实现规范与设计方案，确保符合设计系统、单文件行数规范（<=300行）并无缝集成时间轴和分工卡片。

## 🔒 My Identity
- Archetype: explorer
- Roles: M2 Composer & Mention Picker Explorer
- Working directory: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m2_3/
- Original parent: 055cf08c-c994-4908-9bde-8a188fef6514
- Milestone: M2 伙伴私聊与群聊核心视图

## 🔒 Key Constraints
- Read-only investigation — do NOT implement source code directly
- Think and respond in Chinese
- Strict call budgets, act first, explore later
- No Archaeology
- Safe delete
- Output analysis.md and handoff.md in working directory
- Strict single-file limit: <= 300 lines (far below 500 warning / 600 hard limit)

## Current Parent
- Conversation ID: 055cf08c-c994-4908-9bde-8a188fef6514
- Updated: 2026-11-02T06:28:30Z

## Investigation State
- **Explored paths**:
  - `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupChatView.tsx` (1548 lines)
  - `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupComposer.tsx` (779 lines)
  - `extensions/cindy/apps/desktop/src/renderer/features/bots/useBotGroupMentionPicker.tsx` (293 lines)
  - `extensions/cindy/packages/maker-shared/src/botGroupMentions.ts` (297 lines)
  - `apps/desktop/src/renderer/components/common/AvatarStack.jsx`
  - `apps/desktop/src/renderer/components/common/RoleStatusBadge.jsx`
  - `apps/desktop/src/renderer/mock/mockGroupSessions.js`
- **Key findings**:
  - Cindy 原版通过高度拆解的纯函数实现了稳定的 `@` 查询解析（前置非邮箱字符检测、query<=32、不含空白符、前缀与包含匹配排序、末尾补空格防连词）。
  - 输入框必须严密支持拼音输入法守卫（`isComposing` 与 `keyCode === 229`），杜绝拼音上屏误发消息。
  - 通过拆解，群聊主容器 `BotGroupChatView.jsx`（约 190 行）与复合输入框 `BotGroupComposer.jsx`（约 250 行）均可完全控制在 300 行以内，远离 500 行警戒线。
- **Unexplored areas**:
  - 真实 Electron 主进程下 WebSocket/NDJSON 事件推送与 optimistic message rollbacks（本阶段由 Mock 数据体系驱动闭环）。

## Key Decisions Made
- 确定三段式布局：顶栏（群名+AvatarStack+群主+工作目录+设置按钮） -> 中间主时间轴（内嵌 PlanCard 与 TimelineItem，平滑吸底） -> 底部停靠区（LiveStatus + Composer）。
- `@` 点名菜单首项固定为「所有人」全体广播，支持键盘上下光标无缝移动，Enter/Tab 选中并自动追加空格。
- 「+」菜单注入「安排分工计划」蓝色胶囊标签，支持动态切换为发送/停止状态。

## Artifact Index
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m2_3/DISPATCH.md — Received task dispatch
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m2_3/progress.md — Execution heartbeat
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m2_3/analysis.md — Detailed analysis report & code prototypes
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m2_3/handoff.md — 5-Component handoff report
