# Original User Request

## Initial Request — 2026-11-02T05:24:06Z

全面借鉴与复用 Cindy 的 UI 视觉质感与模块划分，将其重塑并落地为四大生产级完整界面（伙伴私聊、伙伴群聊、伙伴配置抽屉、群聊配置抽屉），基于 Mock 数据实现完整界面与交互闭环。

Working directory: /Users/xr/IDEA.localized/multiagent-orchestration
Integrity mode: development

Reference material:
- Cindy 桌面端前端源码: `extensions/cindy/apps/desktop/src/renderer/`
  - 群聊视图：`features/bots/BotGroupChatView.tsx`、`BotGroupComposer.tsx`、`BotGroupTimelineItem.tsx`、`BotGroupPlan.tsx`、`BotGroupLiveStatus.tsx`
  - 群聊配置：`features/bots/BotGroupSettingsDrawer.tsx`、`ChatGroupSettings.tsx`、`ChatGroupMembersTab.tsx`
  - 伙伴相关界面：`features/bots/`、`components/chat/`
- 当前项目前端目录: `apps/desktop/src/renderer/`

## Requirements

### R1. 伙伴私聊与群聊核心视图
构建伙伴 1:1 独立私聊页面（含头像、角色徽标、状态指示器及消息气泡），以及伙伴群聊页面（包含多 Agent 时间轴气泡、Cindy 风格的分工计划卡 BotGroupPlan、实时进行中状态条及 @ 点名路由交互）。所有界面基于 Mock 数据驱动，具备完整的交互与渲染能力。

### R2. 伙伴配置与群聊配置抽屉
构建伙伴配置抽屉/页面（支持查看与编辑伙伴 SOUL.md、MEMORY.md、已挂载技能与双平面隔离沙箱路径展示），以及群聊配置抽屉/页面（支持群聊名称修改、成员增删与头像栈、群主/负责人设置、发言模式切换、群工作目录配置以及退出/解散操作）。

### R3. 工程规范与代码解耦
所有新增或重构的前端组件严格遵守仓库单文件行数规范（单文件 <= 600 行，达到 500 行进行预警和模块拆分），保持清晰的组件与状态解耦结构，且项目类型检查与构建无报错。

## Verification Resources
- 本地 Vite 开发服务器：`http://127.0.0.1:3000`（或 `pnpm dev`）
- 代码质量与规范校验命令：`pnpm typecheck`（或工程相应 lint/typecheck 脚本）及代码行数检查

## Acceptance Criteria

### 伙伴私聊与群聊视图
- [ ] 伙伴私聊页面具备独立的 1:1 对话流、伙伴头像展示、角色徽标及在线/运行状态指示器
- [ ] 伙伴群聊页面渲染多 Agent 差异化时间轴气泡与消息流
- [ ] 伙伴群聊页面包含 Cindy 风格的分工计划卡（BotGroupPlan）与任务阶段展示
- [ ] 伙伴群聊页面具备实时进行中状态条（BotGroupLiveStatus）
- [ ] 输入框（Composer）支持 @ 点名呼叫特定伙伴进行路由交互

### 伙伴配置与群聊配置抽屉
- [ ] 伙伴配置抽屉支持查看与编辑伙伴 SOUL.md 与 MEMORY.md 文本内容
- [ ] 伙伴配置抽屉展示已挂载技能列表以及双平面隔离沙箱路径
- [ ] 群聊配置抽屉支持修改群聊名称与群工作目录
- [ ] 群聊配置抽屉支持群成员增删列表与头像栈展示
- [ ] 群聊配置抽屉支持设置群主/负责人角色与发言模式切换
- [ ] 群聊配置抽屉包含退出群聊/解散群聊的操作交互

### 工程规范与构建质量
- [ ] `apps/desktop/src/renderer/` 中本次新增及修改的所有前端源码文件，单文件行数均不超过 600 行
- [ ] 前端工程通过类型检查（`pnpm typecheck`）且无编译错误
- [ ] 在 `http://127.0.0.1:3000` 本地预览环境中四大页面可正常导航、渲染并完成 Mock 数据交互闭环


## Follow-up — 2026-11-02T07:02:38Z

请检查当前工作区：所有 M2 和 M3 的 12 个组件已全部实现完毕，tests/test-cindy-ui.mjs 35 项断言全绿通过。请验证并完成最终交付收尾。
