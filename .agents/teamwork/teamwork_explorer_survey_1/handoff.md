# Handoff Report — Cindy 伙伴私聊/群聊界面及交互实现全面调研

## 1. Observation (客观观察)

在本次针对 `extensions/cindy/apps/desktop/src/renderer/` 及相关模块的只读调研中，直接观察到以下事实与源码细节：

1. **群聊主视图 (`BotGroupChatView.tsx`)**:
   - 文件路径: `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupChatView.tsx` (共 1548 行)。
   - 包含顶栏（成员头像栈、群名、负责人标、实时状态文本、群设置入口）、多作者时间轴、进行中条、复合输入框。
   - 引用回复（§10）由主视图持有 `quote` 状态；乐观发送机制依赖 clientId 幂等性；分工安排卡作为消息嵌入主时间轴。

2. **分工计划卡 (`BotGroupPlan.tsx`)**:
   - 文件路径: `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupPlan.tsx` (共 573 行)。
   - 核心组件包含：`BotGroupOrganizerTag`（负责人胶囊，第 62 行）、`StepLead`（步骤状态图标，第 72 行：序号 / Sparkles 呼吸灯 / Check / Alert / Dashed）、`EditableStepRow`（下拉换人与删除步骤，第 175 行）、`BotGroupPlanCard`（安排卡主体与「开始」「不用了」操作，第 283 行）、`BotGroupHandoffFiles`（交接文件药丸列表，第 438 行）、`BotGroupPlanEndDivider`（「N 步都做完了」分割线，第 491 行）、`BotGroupPlanFollowUpRow`（「下一步·继续」「没做完·重试」跟进行，第 507 行）。

3. **实时状态条 (`BotGroupLiveStatus.tsx`)**:
   - 文件路径: `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupLiveStatus.tsx` (共 293 行)。
   - 核心组件与逻辑包含：`BOT_GROUP_PROGRESS_STRIP_DELAY_MS = 3_000`（第 49 行），发言前 3 秒由 `BotGroupSpeakingLine`（第 57 行）在时间轴末尾就地显示；超过 3 秒或有分工时跃迁至固定在输入框上方的 `BotGroupProgressStrip`（第 125 行）；顶栏状态生成函数 `botGroupHeaderStatus`（第 255 行）与带呼吸动效的 `BotGroupHeaderStatusText`（第 283 行）。

4. **输入框与 @点名选择器 (`BotGroupComposer.tsx` & `useBotGroupMentionPicker.tsx`)**:
   - 文件路径: `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupComposer.tsx` (共 779 行) 和 `useBotGroupMentionPicker.tsx` (共 293 行)。
   - 输入框具备：纯文本自动增高、Enter 发送 / Shift+Enter 换行、IME 拼音组合键拦截守卫；后台运行且输入框为空时发送按钮切换为「停止」；「+」菜单中可选「安排分工」并注入带有 `Users` 图标的「分工」蓝色胶囊标签。
   - `@` 点名选择器通过键盘上下键移动高亮、Enter/Tab 选中并定位光标，第一项固定为「所有人」。

5. **时间轴项与气泡 (`BotGroupTimelineItem.tsx` & `components/chat/ChatBubble.tsx`)**:
   - 文件路径: `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupTimelineItem.tsx` (共 633 行) 和 `components/chat/ChatBubble.tsx` (共 22 行)。
   - `CHAT_BUBBLE_COLUMN_CLASS = 'max-w-[min(720px,calc(100%-var(--chat-bubble-gutter,120px)))]'`。
   - 用户消息靠右、暗蓝底色 (`bg-[var(--msg-user-bg)]` + `border-[var(--msg-user-border)]`)；伙伴消息靠左、卡片底色 (`bg-[var(--surface-elevated)]` + `border-[var(--border-default)]`)。
   - 5 分钟内同一作者连续消息合并（隐藏头像与名称，悬停展示时间戳）。

6. **头像与头像栈 (`BotAvatar.tsx` & `BotGroupAvatars.tsx`)**:
   - 文件路径: `extensions/cindy/apps/desktop/src/renderer/features/bots/BotAvatar.tsx` (162 行) 与 `BotGroupAvatars.tsx` (133 行)。
   - `BotGroupAvatarStack` 呈现水平叠放头像（`-ml-2`），以 `border-2 border-[var(--surface)]` 形成底色描边隔离；`BotGroupSidebarAvatar` 对 3~5 人按圆周三角函数布局。

7. **群配置抽屉 (`BotGroupSettingsDrawer.tsx`)**:
   - 文件路径: `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupSettingsDrawer.tsx` (共 607 行)。
   - 包含群名输入修改、成员列表（设为负责人、移出、添加伙伴）、项目文件夹绑定、回复模式（所有/被@）、发言模式（自动并行/顺序）、解散群聊二次确认。

8. **伙伴 1:1 私聊 (`BotDirectMessageView.tsx`)**:
   - 文件路径: `extensions/cindy/apps/desktop/src/renderer/features/bots/BotDirectMessageView.tsx` (共 218 行)。
   - 包含双人头像顶栏交互（`ArrowLeftRight`）、消息流左右差异化展示。

---

## 2. Logic Chain (推理链)

1. **从观察 1、4、5、7 到架构瓶颈判断**：
   - 观察到 Cindy 的原文件 `BotGroupChatView` 为 1548 行、`BotGroupComposer` 为 779 行、`BotGroupTimelineItem` 为 633 行、`BotGroupSettingsDrawer` 为 607 行。
   - 本项目根规则 `AGENTS.md` 明确规定代码行数规范：单文件 `<= 600` 行，`500` 行预警，`800` 行硬拆分。
   - 因此，**绝不可直接将 Cindy 原组件源码单文件原样移植**，必须在保持其视觉规范和交互契约的前提下，将其拆解为多个 `<= 350` 行的聚焦子组件。

2. **从观察 2、3 到多 Agent 协同核心交互提炼**：
   - 观察到 Cindy 的核心协同设计在于 `BotGroupPlan`（分工卡）和 `BotGroupLiveStatus`（实时状态条）。
   - 这两个组件分别处理了多 Agent 编排的静态契约（谁做什么步骤、产出什么交接文件）与动态契约（当前谁在执行、已耗时多久、随时停止）。
   - 因此，落地伙伴群聊界面的核心就在于完整复现 `BotGroupPlanCard`（含步骤切换、跟进行、交接文件）与 `BotGroupProgressStrip`（含 3 秒跃迁、Thinking 呼吸态、停止控制）。

3. **从观察 5、6 到设计语言统一**：
   - 观察到 Cindy 采用纯粹的 1px 细边框 (`border-default`)、卡片高起底色 (`surface-elevated`)、零阴影（Zero-Shadow）、圆角胶囊 (`rounded-full`) 以及 Thinking Orange (`status-bar-accent`)。
   - 当前项目已在 `index.html` 中配置了 Tailwind，具备良好的暗色模式支持。
   - 因此，复用 Cindy 的关键类名规范与色彩层次即可完美达成高保真质感对齐。

---

## 3. Caveats (局限与前提)

1. **只读调研**：本任务为严格只读分析，未改动或新增任何业务源码文件。
2. **运行时协议依赖解耦**：Cindy 源码底层重度依赖 Electron IPC (`window.electronAPI.maker.chatServer`) 和复杂的本地发件箱 (`BotGroupOutbox`)。在本项目落地阶段，需基于 Mock 数据（如 `mockGroupSessions` 与 `mockPlanData`）建立独立的状态驱动，避免引入无关的底层依赖。
3. **语言国际化 (i18n)**：Cindy 广泛使用 `useTranslation`（`t('bots.groupChat...')`）。本项目若暂未全面集成相应多语言 key，应直接采用清晰的中文语义常量渲染。

---

## 4. Conclusion (结论与落地路线)

1. **完整产出**：已在 `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_1/analysis.md` 中输出完整的调研报告，覆盖视觉质感、数据模型、组件结构、交互逻辑与拆解方案。
2. **模块拆解路线图**：
   - `types/`：统一沉淀 `chatModels.ts`、`botModels.ts`、`planModels.ts`。
   - `mock/`：构建自包含的 `mockPartners.ts`、`mockGroupSessions.ts`、`mockPlanData.ts`。
   - `components/chat/`：通用卡片与原子组件（`ChatBubble`, `BotAvatar`, `BotAvatarStack`, `MentionPickerMenu`, `HandoffFileChip`）。
   - `features/chat-group/`：将超长群聊视图拆解为 6 个精巧子组件（`BotGroupChatView`, `BotGroupTimelineItem`, `BotGroupPlanCard`, `BotGroupPlanFollowUp`, `BotGroupLiveStatus`, `BotGroupComposer`），每个文件均在 350 行以内。
   - `features/chat-direct/`：解耦私聊视图（`BotDirectMessageView`, `BotDirectHeader`）。
   - `features/settings-drawer/`：解耦伙伴配置抽屉（`PartnerConfigDrawer`）与群聊配置抽屉（`GroupSettingsDrawer`, `GroupMembersList`）。

---

## 5. Verification Method (独立验证方法)

1. **查看产出的分析报告与自包含性**：
   - 检查文件存在与行数：
     ```bash
     test -f /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_1/analysis.md
     test -f /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_1/handoff.md
     ```
2. **验证参考源文件位置与事实引用准确性**：
   - 检查 `BotGroupChatView.tsx`、`BotGroupComposer.tsx`、`BotGroupTimelineItem.tsx`、`BotGroupPlan.tsx`、`BotGroupLiveStatus.tsx`、`BotAvatar.tsx`、`BotGroupSettingsDrawer.tsx` 等对应行数和关键引用是否真实无误。
3. **失效条件 (Invalidation Conditions)**：
   - 若参考源码路径变更或 Cindy 架构重构；
   - 若项目单文件行数规范由 `<= 600` 行发生调整。
