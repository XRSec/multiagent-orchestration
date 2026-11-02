# Cindy 伙伴私聊/群聊界面及协同交互深度调研分析报告

## 摘要

本报告针对参考源码 `extensions/cindy/apps/desktop/src/renderer/` 中与**伙伴群聊、伙伴私聊、分工计划卡（Plan）、实时状态条（LiveStatus）、输入框（Composer）、成员管理与配置抽屉（Settings Drawer）**相关的核心实现进行了深度、全维度的源码调研。调研成果涵盖五大核心板块：
1. **视觉质感与设计语言**：Tailwind 规范、暗色主题色板层次、细边框去投影质感、排版与微动效。
2. **数据结构模型体系**：消息模型、Agent/伙伴模型、群模型、分工计划模型、实时发言/执行模型。
3. **核心组件拆分与职责**：群聊主视图、时间轴行、计划卡、状态条、输入框、头像系统与抽屉组件。
4. **核心交互逻辑闭环**：`@` 点名路由与自动补全、输入/停止状态切换、计划卡生命周期状态机、进行中状态跃迁。
5. **本项目落地与模块拆解方案**：针对本项目严格单文件 `<= 600` 行规范（Cindy 原文件多处达 700~1500 行）的前端架构规划、Mock 数据驱动方案与实施路线。

---

## 1. 视觉质感与设计语言规范

Cindy 的界面设计体现了现代化生产级 AI 工作台的审美标准：**极致克制、信息高密度、层次清晰、重内容轻装饰**。

### 1.1 色彩层次与暗色主题变量（Dark Mode Palette）

Cindy 采用基于 CSS 变量和 HSL 槽位构建的系统级设计令牌（Design Tokens），在暗色模式下建立以下严密的背景与边框层次：

| 语义层级 | CSS Token | 典型渲染值 (Dark) | 视觉用途与组件映射 |
| :--- | :--- | :--- | :--- |
| **画布底色 (Canvas)** | `--surface` / `--background` | `#0f172a` ~ `#131722` | 窗口底层、聊天时间轴主背景、抽屉底色 |
| **高起卡片 (Elevated)** | `--surface-elevated` | `#1e293b` ~ `#1b2234` | 伙伴消息气泡底色、悬浮卡片、二级菜单 |
| **胶囊/小组件 (Chip)** | `--surface-chip` | `hsl(var(--surface-chip))` (半透明微白) | 负责人徽标、@所有人图标背景、附件 Chip 底色 |
| **用户气泡底色** | `--msg-user-bg` | `#172554` ~ `#1e3a8a` / 暗蓝带微透 | 用户消息气泡、强调交互区 |
| **用户气泡边框** | `--msg-user-border` | `#1d4ed8` / 强调蓝色微描边 | 用户气泡外轮廓 |
| **默认细边框** | `--border-default` | `#334155` / `hsl(var(--border))` | 卡片 1px 分隔线、时间线边框、输入框边框 |
| **强调色 (Accent)** | `--accent` / `--status-bar-accent` | `#38bdf8` (天蓝) / `#f59e0b` (橙黄) | 天蓝用于主动作按钮；橙黄专用于 Thinking 呼吸态 |
| **主文本 (Primary)** | `--text-primary` | `#f8fafc` / `#ffffff` | 消息正文、标题、输入框文字 |
| **次文本 (Secondary)** | `--text-secondary` | `#94a3b8` | 副标题、时间戳、说明文案 |
| **弱文本 (Tertiary)** | `--text-tertiary` | `#64748b` | 禁用态、微提示、折叠指示 |
| **危险色 (Danger)** | `--error-fg` / `--text-danger` | `#ef4444` / `#f87171` | 失败提示、解散群聊、移出成员 |

### 1.2 边框、阴影与圆角规范（Zero-Shadow Discipline）

Cindy 遵守严格的 **"Zero-Shadow on Content"（内容去投影）** 准则：
- **卡片无阴影**：时间轴消息气泡、分工计划卡、任务卡均采用 **1px 细边框 (`border border-[var(--border-default)]`) + 卡片高起底色 (`bg-[var(--surface-elevated)]`)**，避免使用模糊阴影造成视觉浑浊。
- **圆角梯度**：
  - 外层面板/抽屉：`rounded-xl` (12px) 或 `rounded-2xl` (16px)。
  - 消息气泡 (`ChatBubble`)：统一使用 `rounded-xl` (12px)。
  - 标签与按钮 (`Tag / Button / Chip`)：统一使用 `rounded-full` (9999px) 胶囊圆角。
- **浮层与弹窗**：仅 `@` 点名候选菜单、右键上下文菜单、抽屉遮罩保留柔和投影与 `backdrop-blur-md` 模糊。

### 1.3 排版与微动效规范

- **正文字号与行高**：
  - 聊天正文：`text-15 font-normal leading-[1.6]` (`CHAT_BODY_CLASS`)，极大优化长文本可读性。
  - 作者名字与标题：`text-13 font-medium leading-5`。
  - 时间戳与辅助标签：`text-11 leading-tight tabular-nums`（等宽数字防止跳动）。
  - 代码与等宽字符：`font-mono text-14 leading-normal`。
- **呼吸动画（Thinking Orange）**：
  - 伙伴思考、执行任务时，采用带有 `session-status-breathing` 类的 `Sparkles` 图标（时长 2400ms 柔和循环呼吸），并且动画仅挂载于纯包装 DOM 节点上，保持 GPU Compositor-only 渲染，杜绝重排抖动。

---

## 2. 核心数据结构模型体系

Cindy 的多 Agent 群聊系统定义在 `shared/botGroupChat.ts` 和 `packages/maker-shared/src/botGroupChat.ts`，为多 Agent 协同建立了标准的数据契约。

### 2.1 消息模型 (`BotGroupMessageView`)

```typescript
export interface BotGroupMessageView {
  id: string;                         // 消息唯一 ID (UUID 或稳定序号)
  sequence: number;                   // 本地有序自增序号
  serverSequence?: string;            // 服务端或持久化稳定序号
  kind: BotGroupMessageKind;          // 'message' | 'round-end' | 'notice' | 'plan' | 'plan-end'
  authorKind: 'user' | 'bot' | 'system';
  authorBotId: string | null;         // 发言伙伴 ID（用户或系统消息为 null）
  authorName: string;                 // 发言快照名称
  isSelf?: boolean;                   // 是否是当前用户自己
  content: string;                    // Markdown 正文
  mentions: BotGroupMention;          // @点名元数据 { all: boolean; allBots?: boolean; botIds: string[] }
  quote?: BotGroupQuoteView;          // 引用回复的消息快照
  task?: BotGroupTaskCardView;        // 关联的任务卡（如伙伴独立发起的异步任务）
  planId: string | null;              // 若该消息属于分工（安排卡/交接/结束），记录 planId
  files: string[];                    // 步骤交接产生的文件路径列表（相对工作目录）
  attachments: BotGroupAttachment[];  // 用户消息所附带的图片/文件/文档列表
  reactions?: Array<{ emoji: string; count: number; me: boolean }>;
  noticeCode: BotGroupNoticeCode | null; // 系统通知码（如 member-joined, workdir-unavailable）
  runtimeFailureCode?: BotGroupRuntimeFailureCode; // 运行时错误码
  createdAt: number;                  // 毫秒时间戳
  pending?: boolean;                  // 是否处于本地发件箱乐观发送中
}
```

### 2.2 伙伴 / Agent 模型 (`BotGroupMemberView`)

```typescript
export interface BotGroupMemberView {
  botId: string;                      // 伙伴唯一标识符
  name: string;                       // 伙伴展示名称
  avatar: string;                     // 预设 URI、图片地址或 emoji
  avatarColor: string;                // 专属色调 (red, orange, green, teal, blue, violet, graphite 等)
  role?: 'owner' | 'admin' | 'member' | 'guest'; // 群角色
  status: 'active' | 'paused' | 'error' | 'archived' | 'missing';
  isSelf?: boolean;                   // 是否代表当前登录人
  isOwned?: boolean;                  // 是否由本机/当前主控直接管理
  displayName?: string;               // 别名或带主人的展示名
}
```

### 2.3 群聊房间模型 (`BotGroupSummary` / `BotGroupDetail`)

```typescript
export interface BotGroupSummary {
  id: string;                         // 群聊 ID
  name: string;                       // 群聊名称 (最多 40 字符)
  topic?: string;                     // 群主题
  description?: string;               // 群描述
  members: BotGroupMemberView[];      // 成员列表 (限制 2~6 人)
  organizerBotId: string | null;      // 负责人 (Organizer) 伙伴 ID，负责拆解任务
  projectDir: string | null;          // 绑定的项目本地工作目录路径
  replyMode: 'all' | 'mentioned';     // 回复模式：未@时所有人可回复 / 仅回复被@的消息
  speakingMode: 'auto' | 'sequential';// 发言模式：第一圈并行思考 / 严格按顺序发言
  autoContinue?: boolean;             // 分工计划是否自动推进下一步，无需手动点“继续”
  speakingBotIds: string[];           // 当前正在发言的伙伴 ID 列表
  planningBotId: string | null;       // 当前正在规划分工的负责人 ID
  openPlan: BotGroupOpenPlanSummary | null; // 群内当前进行中的分工摘要
  createdAt: number;
  updatedAt: number;
}
```

### 2.4 分工计划模型 (`BotGroupPlanView` & `BotGroupPlanStepView`)

```typescript
export type BotGroupPlanStatus =
  | 'proposed'    // 负责人已拟定分工，等待用户点击“开始”
  | 'running'     // 某一步骤正在执行中
  | 'waiting'     // 步骤完成或失败，停下等待用户点击“继续”或“重试”
  | 'done'        // 所有步骤全部圆满完成
  | 'stopped'     // 用户中途手动停止
  | 'dismissed'   // 用户放弃执行（“不用了”）
  | 'superseded'; // 被后续新的分工取代

export interface BotGroupPlanStepView {
  position: number;                   // 步骤序号 (0-based)
  botId: string;                      // 分配给哪位伙伴执行
  botName: string;                    // 伙伴名称快照
  task: string;                       // 步骤任务具体描述 (最多 80 字符)
  status: 'pending' | 'running' | 'done' | 'failed';
  resultMessageId?: string | null;    // 该步骤对应的交接结果消息 ID
}

export interface BotGroupPlanView {
  id: string;
  status: BotGroupPlanStatus;
  organizerBotId: string;             // 负责拆解任务的负责人 ID
  organizerName: string;              // 负责人名称
  steps: BotGroupPlanStepView[];      // 步骤列表 (最多 6 步)
  currentStep: number | null;         // 当前正在运行或刚结束的步骤下标
  workDir: string | null;             // 分工执行的隔离工作目录
  autoContinue?: boolean;             // 是否开启步间自动续推
  createdAt: number;
  updatedAt: number;
}
```

### 2.5 实时状态与 Speaker 模型 (`BotGroupRoundView` & `BotGroupLiveSpeaker`)

```typescript
export interface BotGroupLiveSpeaker {
  member: BotGroupMemberView;         // 伙伴信息
  displayName: string;                // 显示名称
  sessionId: string | null;           // 关联的底层执行会话 ID
  activity: 'reply' | 'planning' | 'step'; // 正在聊天回复 / 正在规划分工 / 正在执行计划步骤
  startedAt?: number;                 // 开始时间戳（用于秒数计时）
  stopping?: boolean;                 // 是否处于正在取消/停止中
  executionStatus?: 'queued' | 'running' | 'needs_input' | 'stopping';
}

export interface BotGroupRoundView {
  status: 'idle' | 'running';         // 整个群轮次是否处于运行中
  speakers: BotGroupLiveSpeaker[];    // 正在发言/思考的伙伴集合（并行时可有多个）
  canContinue: boolean;               // 自然结束后是否支持“继续对话”
}
```

---

## 3. 核心组件拆分与职责规范

Cindy 的前端架构虽然功能极其丰富，但保持了非常纯粹的单向数据流与清晰的职责边界：

```
BotGroupChatView (群聊容器 / 视口与数据协同)
├── SessionHeader (顶栏：群名、成员头像栈、实时状态文本、群设置入口)
├── ViewportScroller (滚动视口：历史翻页、置底锚定、新消息气泡提示)
│   ├── BotGroupDateDivider (日期居中分割线)
│   ├── BotGroupTimelineItem (消息时间轴项)
│   │   ├── ChatBubble (通用气泡外壳：用户气泡 / 伙伴气泡)
│   │   │   ├── BotGroupQuoteBlock (引用原消息预览块)
│   │   │   ├── BotGroupMessageText (正文 Markdown + @ 点名高亮)
│   │   │   ├── BotGroupPlanCard (分工计划卡：步骤状态、人员切换、开始/取消)
│   │   │   ├── BotGroupHandoffFiles (步骤产出交接文件胶囊)
│   │   │   └── BotGroupMessageAttachments (多媒体附件预览)
│   │   ├── BotGroupPlanEndDivider (「N 步都做完了」分割线)
│   │   └── BotGroupPlanFollowUpRow (步间停顿「继续计划 / 重试」跟进行)
│   └── BotGroupSpeakingLine (时间轴内就地发言行)
├── BotGroupProgressStrip (固定在输入框上方的实时进度条：耗时、步骤进度、停止按钮)
└── BotGroupComposer (复合输入框)
    ├── MentionPicker (绝对定位 @ 候选弹窗)
    ├── DivisionTag (「分工」蓝色胶囊标签)
    ├── QuotePreview (输入框上方待发引用条)
    ├── ThumbnailStrip (附件缩略图托盘)
    └── ComposerFooter (「+」扩展菜单、字数提示、发送/停止切换按钮)
```

### 3.1 `BotGroupChatView`：主装配容器
- **职责**：
  - 维护页面级别状态：当前群数据、滚动位置锚定（Stick to bottom）、引用回复上下文（`quote`）。
  - 处理主聊天时间轴的乐观更新与合并（将本地待发消息与服务端/Mock 返回消息通过稳定 key 合并，杜绝重绘跳动）。
  - 控制右侧群设置抽屉的开合。

### 3.2 `BotGroupTimelineItem`：多态时间轴消息行
- **职责**：
  - 纯组件 `memo` 优化，依靠消息 ID 和快照版本防重绘。
  - **连续消息合并策略**：若同一作者在 5 分钟内连续发言，后续行不渲染头像与名称，时间戳仅在鼠标悬停时显现于左侧槽位。
  - **多态分支渲染**：
    - `round-end`：居中系统细线，提示对话轮次自然结束，提供「继续」按钮。
    - `plan-end`：居中细线，展示「N 步都做完了」。
    - `notice`：系统提示（如成员加入、退出、沙箱不可用、运行故障通知）。
    - `user message`：靠右对齐，带引用块与附件，发送中半透明展示。
    - `bot message`：靠左对齐，左侧 28px 头像、名字、负责人标签（`BotGroupOrganizerTag`）、步骤标签（`BotGroupNameTag`）、气泡卡片。

### 3.3 `BotGroupPlan`：分工计划卡
- **职责**：
  - **安排卡本体 (`BotGroupPlanCard`)**：
    - 步骤有序列表（`ol`），通过 `StepLead` 显示步骤序号、进行中 Sparkles 呼吸灯、已完成勾选、失败叹号。
    - 步骤人员重新分派：未开始或步间等待时，点击某步骤触发 `DropdownMenu`，允许将该步骤委托给群内其他伙伴，或删除该步骤。
    - 底部操作：`actionable` 时展示「开始」CTA 按钮与「不用了」次级按钮；进行中展示「自动继续」开关（`Switch`）。
  - **交接文件 (`BotGroupHandoffFiles`)**：步骤完成后产生的文件，以圆角胶囊 (`BotGroupHandoffFileChip`) 展示，带文件类型图标，点击可直接唤起宿主打开。
  - **跟进行 (`BotGroupPlanFollowUpRow`)**：步骤完成停顿处展示下一步负责人及任务，并配有「继续计划」或「重试该步」按钮。

### 3.4 `BotGroupLiveStatus`：实时状态条
- **职责**：
  - **发言呼吸行 (`BotGroupSpeakingLine`)**：前 3 秒在时间轴末尾就地显示伙伴头像、名字、Thinking 呼吸动效。
  - **悬浮进度条 (`BotGroupProgressStrip`)**：发言持续超过 3 秒或处于计划执行阶段，将状态吸附在输入框正上方，显示耗时秒数、第几步任务详情，并提供「查看进程」与红色的「停止」按钮。
  - **顶栏状态文本 (`botGroupHeaderStatus`)**：在顶栏同步动态计算当前房间状态，如“Lead Orchestrator 正在规划分工…”或“REA Partner 正在执行第 2 步”。

### 3.5 `BotGroupComposer`：高交互输入框
- **职责**：
  - 支持多行高度自适应（`auto-grow`），Enter 发送，Shift+Enter 换行，支持原生 IME 拼音输入法守卫（组合未完成不误发）。
  - 集成 `@` 点名候选拦截（`useBotGroupMentionPicker`）。
  - 动态功能标签：在「+」菜单中点选「安排分工」后，输入框内部前置嵌入带有 `Users` 图标的「分工」蓝色胶囊标签（按 Backspace 可退格取消）。
  - 动态按钮状态切换：无文本且后台正在执行时，发送按钮自动变为「停止」；有文本时允许插话发送。

### 3.6 `BotAvatar` 与 `BotGroupAvatars`：统一头像体系
- **职责**：
  - `BotAvatar`：根据名字哈希出专属色彩（`HUE_TOKENS`），无图片时自动截取名字首字符（`botAvatarInitial`），尺寸覆盖 `xs`(20px)、`sm`(28px)、`md`(40px)、`lg`(56px)。
  - `BotGroupAvatarStack`：水平负边距重叠头像栈（`-ml-2`），用于顶栏和抽屉 Hero，以底色描边清晰切分。
  - `BotGroupSidebarAvatar`：侧边栏多人组合头像，采用三角函数沿圆周聚拢排列，极具现代感。

### 3.7 `BotGroupSettingsDrawer`：群聊配置抽屉
- **职责**：
  - 右侧滑动抽屉，遮罩锁定。
  - 包含群名称就地编辑、成员列表展示（支持设为负责人、移出、展开候选新增伙伴）、工作目录绑定与切换、回复模式（分段器）、发言模式（分段器）以及解散群聊二次确认。

---

## 4. 关键交互逻辑与事件驱动流

### 4.1 `@` 点名呼叫与自动补全机制
1. **触发检测**：监听输入框光标位置，使用 `findBotGroupMentionQuery(text, caret)` 捕捉最后一个未闭合的 `@` 符号及关键词。
2. **候选计算**：
   - 第一项固定为「所有人」（`Users` 图标）。
   - 可选「所有伙伴」。
   - 过滤排除用户自己的活跃群成员列表。
3. **键盘事件拦截**：
   - `ArrowDown` / `ArrowUp`：循环高亮。
   - `Enter` / `Tab`：确认点名，将 `@伙伴名 ` 插入光标处，并记录在 `tracked` 数组中，将光标自动挪至插入词之后。
   - `Escape`：仅关闭弹窗，不清理正文。
4. **正文渲染联动**：消息流中使用 CSS Custom Highlight API 或标记拆分，将 `@伙伴名` 渲染为醒目的亮色链接或胶囊，鼠标悬停时展示浮层卡片。

### 4.2 输入框「发送」与「停止」的动态切换
- **空闲时**：输入文本后，SendButton 高亮为天蓝色 Accent 状态，点击触发发送。
- **Agent 执行中**：
  - 若输入框内无文本、无附件，SendButton 原地转为带有方块图标的红色/次级「停止」按钮，点击立即触发取消当前轮次。
  - 若用户在 Agent 执行途中敲入新文本，SendButton 重新激活为「发送」，点击将新消息作为插话或排队追加消息提交，无缝压入协作流。

### 4.3 分工计划卡（Plan）状态机流转

```
[用户触发“安排分工”] 
       │
       ▼
[负责人出卡: status = 'proposed'] 
       │
       ├─► [用户修改步骤伙伴 / 调整任务]
       ├─► [用户点击“不用了” -> status = 'dismissed']
       │
       ▼ [用户点击“开始”]
[status = 'running' (Step 0)]
       │
       ▼ [Step 0 完成，且 autoContinue = false]
[status = 'waiting' (展示“下一步”跟进行)]
       │
       ├─► [用户点击“继续计划” -> 执行 Step 1]
       ├─► [若某步执行失败 -> 按钮变为“重试该步”]
       │
       ▼ [所有步骤执行完毕]
[status = 'done'] ──► 渲染 BotGroupPlanEndDivider (“N 步都做完了”)
```

### 4.4 实时状态条（LiveStatus）的 3 秒滞后跃迁
Cindy 引入了非常精妙的用户体验机制：
- Agent 刚开始发言的前 3 秒，状态只在聊天时间轴的最后一行轻量呼吸呈现（`BotGroupSpeakingLine`），避免界面频繁闪烁跳动。
- 一旦耗时超过 3000ms（或进入需要人工确认交互的阶段），状态自动提升为固定在输入框上方的常驻进度条（`BotGroupProgressStrip`），展开展示工作流细节与耗时计时器，同时开放取消操作。

---

## 5. 针对本项目的落地与模块拆解方案（单文件 <= 600 行规范）

### 5.1 Cindy 源码在规范下的挑战与痛点

在参考源码中，存在严重的单文件代码膨胀问题：
- `BotGroupChatView.tsx`：**1548 行**（严重违反 `< 600` 行规范，极难维护）
- `BotGroupComposer.tsx`：**779 行**（超标）
- `BotGroupTimelineItem.tsx`：**633 行**（超标）
- `BotGroupSettingsDrawer.tsx`：**607 行**（超标）

如果直接照搬，将直接触发本项目的规范红线（单文件 `<= 600` 行，`500` 行预警，`800` 行硬拆分）。

### 5.2 推荐的解耦拆分设计方案

为了兼顾 Cindy 的极致质感与本项目的单文件代码规范，必须对视图层、状态层、交互层进行细粒度解耦。拆解规划如下：

```
apps/desktop/src/renderer/
├── types/
│   ├── chatModels.ts              (~150 行) 消息、附件、点名、引用等数据类型定义
│   ├── botModels.ts               (~100 行) 伙伴、成员、角色等数据类型定义
│   └── planModels.ts              (~120 行) 分工计划、步骤、执行状态等数据类型定义
│
├── mock/
│   ├── mockPartners.ts            (~100 行) 预置的多 Agent 伙伴数据
│   ├── mockGroupSessions.ts       (~200 行) 预置的多会话流，含群聊与私聊
│   └── mockPlanData.ts            (~150 行) 预置的分工计划数据与阶段演进
│
├── components/chat/
│   ├── ChatBubble.jsx             (~60 行) 统一消息气泡容器 (User vs Assistant)
│   ├── BotAvatar.jsx              (~120 行) 伙伴头像生成与色彩哈希映射
│   ├── BotAvatarStack.jsx         (~80 行) 多人组合头像与水平堆叠栈
│   ├── MarkdownContent.jsx        (~120 行) 消息正文渲染与 @点名高亮解析
│   ├── HandoffFileChip.jsx        (~70 行) 分工交接产出文件胶囊
│   └── MentionPickerMenu.jsx      (~130 行) @ 点名绝对定位悬浮候选菜单
│
├── features/chat-group/
│   ├── BotGroupChatView.jsx       (~280 行) 群聊主装配容器与视口控制
│   ├── BotGroupTimelineItem.jsx   (~260 行) 时间轴单条消息渲染与多态分发
│   ├── BotGroupPlanCard.jsx       (~250 行) 分工计划卡主体与步骤列表
│   ├── BotGroupPlanFollowUp.jsx   (~110 行) 分工步间停顿与继续/重试跟进行
│   ├── BotGroupLiveStatus.jsx     (~220 行) 实时进行中状态条与呼吸态发言行
│   └── BotGroupComposer.jsx       (~320 行) 复合输入框（支持@点名、分工标签、发送/停止）
│
├── features/chat-direct/
│   ├── BotDirectMessageView.jsx   (~250 行) 伙伴 1:1 私聊独立视图
│   └── BotDirectHeader.jsx        (~90 行) 私聊顶栏（双人徽标、在线状态）
│
└── features/settings-drawer/
    ├── PartnerConfigDrawer.jsx    (~320 行) 伙伴配置抽屉（SOUL.md / MEMORY.md 查看与编辑、沙箱展示）
    ├── GroupSettingsDrawer.jsx    (~350 行) 群聊配置抽屉（群名、成员列表、负责人、发言模式、退出/解散）
    └── GroupMembersList.jsx       (~180 行) 抽屉内成员增删与角色变更子组件
```

**拆分收益评估**：
1. **行数全面达标**：所有组件单文件行数均严格控制在 **60 到 350 行之间**，远离 500 行警戒线，彻底规避 600 行红线。
2. **逻辑高度内聚**：
   - 将分工卡分解为 `BotGroupPlanCard`（步骤列表本体）与 `BotGroupPlanFollowUp`（跟进行与结束线）；
   - 将 `@` 点名抽离为 `MentionPickerMenu` 独立渲染；
   - 将群设置抽屉拆分为抽屉外壳与 `GroupMembersList` 子组件；
   - 将通用样式封装在 `ChatBubble` 与 `BotAvatar`。
3. **即开即用的 Mock 闭环**：基于 `mockPlanData` 和 `mockGroupSessions`，可以在完全无需后端真实 Agent 进程介入的情况下，实现四大界面（伙伴群聊、伙伴私聊、伙伴配置抽屉、群聊配置抽屉）的全交互演练。

---

## 6. 调研结论

Cindy 在桌面端前端的聊天架构为我们提供了极具参考价值的标杆设计：
1. **视觉层面**：通过极简 1px 细边框、暗色背景层次（`surface` -> `elevated` -> `chip`）与 Thinking Orange 呼吸态，营造了顶级工业级质感。
2. **交互层面**：以「分工计划卡（Plan）」与「实时状态条（LiveStatus）」为核心，完美解决了多 Agent 协同中的**任务拆解、步骤确认、步间交接、动态干预与实时反馈**。
3. **架构层面**：本项目的后续落地必须坚决贯彻**解耦拆分策略**，剔除 Cindy 历史包袱与过长单文件代码，采用清晰的组件树与 Mock 驱动，确保代码行数合法合规、界面流畅优雅、完全契合多 Agent 编排框架的核心定位。
