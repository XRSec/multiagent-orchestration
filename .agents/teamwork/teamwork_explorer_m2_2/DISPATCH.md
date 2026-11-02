## 2026-11-02T06:23:18Z

Your working directory is: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m2_2/
Your identity is: teamwork_explorer (Role: M2 Plan Card & Live Status Explorer)
Original request file: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md
Scope document: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/PROJECT.md
Survey reports:
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_1/handoff.md
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_3/handoff.md
You MUST read ORIGINAL_REQUEST.md and PROJECT.md before starting work.

Milestone: M2 伙伴私聊与群聊核心视图
Objective:
制定 Cindy 风格分工计划卡与实时状态条的完整实现规范与设计方案：
1. `apps/desktop/src/renderer/views/group-chat/BotGroupPlanCard.jsx`:
   - 完整复刻 Cindy `BotGroupPlan.tsx` 的精髓：计划卡标题与折叠/展开、负责人胶囊（`BotGroupOrganizerTag`，显示 Organizer 名字与徽标）。
   - 步骤列表：步骤状态图标（序号待办 / Sparkles 橙色呼吸灯执行中 / Check 绿色完成 / Alert 红色失败 / Dashed 虚线取消）。
   - 步骤执行人分配下拉选择、步骤操作（删除/重试）。
   - 交接文件药丸列表（`BotGroupHandoffFiles`，带 FileText 图标与文件名胶囊）。
   - 计划完成度进度条与跟进行（「N 步已全部完成」分割线、「下一步·继续」「重试」按钮）。
2. `apps/desktop/src/renderer/views/group-chat/BotGroupLiveStatus.jsx`:
   - 实时进行中状态条：3 秒延迟就地展示（`BotGroupSpeakingLine`）向浮动条跃迁（超过 3 秒或进入多 Agent 协作时跃迁为固定在输入框上方的浮动进度条）。
   - 思考中状态（Thinking Orange 呼吸脉冲、正在发言 Agent 头像与名称、已耗时动态计数器、一键「停止」按钮交互）。
3. 严格遵循单文件行数规范（每个文件预估 <= 280 行，远低于 500 行预警与 600 行红线）。
4. 输出至 analysis.md 与 handoff.md，并通过 send_message 回传。
