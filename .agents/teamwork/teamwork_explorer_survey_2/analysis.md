# 伙伴配置与群聊配置抽屉深度调研报告

**调研执行人**: Teamwork Explorer (Role: Cindy Settings Drawer Explorer)  
**调研日期**: 2026-11-02  
**参考基线**: `extensions/cindy/apps/desktop/src/renderer/`  
**目标工程**: `apps/desktop/src/renderer/`  

---

## 1. 调研背景与核心目标

根据任务目标与 `ORIGINAL_REQUEST.md` 要求，系统需要构建两大生产级抽屉组件（伙伴配置抽屉与群聊配置抽屉），基于 Mock 数据实现完整界面与交互闭环。
本报告深入剖析了参考源码中 `BotGroupSettingsDrawer.tsx`、`ChatGroupSettings.tsx`、`ChatGroupMembersTab.tsx`、`ChatGroupSettingsRows.tsx`、`BotSettingsDrawer.tsx`、`BotMemorySettings.tsx`、`BotCapabilitySettings.tsx` 等成熟实现，提取其高品质交互与视觉质感，并结合当前仓库的双平面隔离（Dual-Plane Isolation）架构契约与代码规范（单文件 `<= 600` 行），给出清晰的落地与重构拆分方案。

---

## 2. 抽屉 UI 视觉风格与全局交互布局

### 2.1 抽屉形态与定位 (Slide-Over Drawer)
- **绝对定位与尺寸**:
  - 采用屏幕右侧滑出抽屉形态：`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[var(--border-default)] bg-[var(--surface)]`。
  - 最大宽度固定在 `max-w-md`（28rem / 448px），确保在桌面端保持紧凑，不遮蔽主对话流的关键视区。
- **对话流非阻塞感知**:
  - 抽屉虽然有半透明遮罩（`modal-scrim fixed inset-0 z-50`），但底层会话界面依然保持挂载并可见。
  - 用户在配置伙伴参数、查看技能或调整群成员时，能够对照左侧聊天流内容，无需在页面间来回切换。

### 2.2 防误触与按键安全机制
- **遮罩点击不关闭 (Anti-Misclick)**:
  - 源码关键实现：`onPointerDownOutside={(event) => event.preventDefault()}`。
  - 用户在抽屉内编辑文本或表单时，若不小心点击了左侧背景区域，**抽屉绝不会被意外关闭**，从而避免表单未保存数据丢失。
- **IME 组合输入保护 (CJK IME Safety)**:
  - 在输入中文、日文等全角字符时，按 `Esc` 键仅取消当前的拼音/假名输入候选，不会意外关闭抽屉：
    ```tsx
    onEscapeKeyDown={(event) => {
      if (event.isComposing || event.keyCode === 229) {
        event.preventDefault();
      } else if (hasSubpage) {
        event.preventDefault();
        handleBack();
      }
    }}
    ```
- **Electron 顶栏拖拽穿透防护**:
  - 抽屉 Header 区域覆盖在桌面窗口顶栏时，容易被 Electron 的 `-webkit-app-region: drag` 吞噬点击事件。
  - 源码通过注入 `WINDOW_NO_DRAG_STYLE`（`WebkitAppRegion: 'no-drag'`），保证抽屉顶部的返回按钮、关闭按钮（`X`）始终能响应点击。

### 2.3 导航拓扑与滚动记忆
- **Header 结构与多级下钻**:
  - 高度固定为 `h-14`（56px），下边框 `border-b border-[var(--border-default)]`。
  - 布局为 `flex items-center justify-between`：
    - 左侧：若处于子页面（如编辑资料、记忆详情、技能下钻），展示 `ArrowLeft` 返回按钮；
    - 中间：页面标题 `Dialog.Title`（`text-15 font-medium truncate`）；
    - 右侧：关闭按钮 `X`（圆形 hover 高亮，圆角半径 `rounded-full`）。
- **滚动位置记忆 (Scroll Restoration)**:
  - 使用 `useRef` 记录首页的滚动高度 `homeScroll.current`。
  - 进入二级子页面时，将滚动容器置顶（`scrollTop = 0`）；返回首页时，在 `useLayoutEffect` 中无缝恢复 `homeScroll.current`，避免用户滚动位置丢失。

### 2.4 暗色视觉质感与卡片分行体系 (SettingsRows System)
Cindy 的配置页具有极高的设计品质，其核心抽象来自于 `ChatGroupSettingsRows.tsx`：
1. **分节组件 (`SettingsSection`)**:
   - 带有标题（`text-13 font-medium text-[var(--text-secondary)]`）、计数角标（`tabular-nums`）、可选的右上角动作按钮（Action）以及底部的说明文字（Caption）。
2. **卡片容器 (`SettingsCard`)**:
   - `overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)]`。
3. **行组件 (`SettingsRow`)**:
   - 采用行高 `min-h-12 py-3 px-4`（带头像时 `min-h-[52px] py-2`）。
   - 左侧为 Lead 图标/头像，主体为 Title（14px）与 Hint（12px 浅灰说明），右侧为当前值 Value（13px）、Chevron 箭头或 Trailing 表单控件（Switch / Select / Button）。
4. **精巧行内分割线 (`SETTINGS_DIVIDER`)**:
   - 非首行元素通过伪元素添加内缩进 16px 的细分割线：
     `[&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:inset-x-4 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-[var(--border-default)]`。
     消除了外边框与行内分割线的重叠生硬感。

---

## 3. 伙伴配置数据结构与编辑状态管理

### 3.1 伙伴数据模型定义
结合当前工程 `PARTNERS` 及 Cindy 伙伴运行态，伙伴核心数据结构契约如下：

```typescript
export interface PartnerProfile {
  id: string;                    // 如 'lead-orchestrator', 'agent-architect', 'rea-partner'
  name: string;                  // 伙伴展示名
  role: string;                  // 角色定位/简述
  avatar?: string;               // 头像 URL 或图标标识
  avatarColor?: string;          // 头像背景色
  isLead?: boolean;              // 是否为主控 Lead
  status: 'idle' | 'busy' | 'offline' | 'paused';
  queueCount: number;            // 当前排队等待指令数
  skills: string[];              // 已挂载技能标识列表
  
  // 双平面隔离沙箱与路径配置
  sandbox: {
    runtimeDir: string;          // 运行时工作目录: ~/.multiagent-orchestration/partners/<id>/
    buildTimeSrc: string;        // 构建期源码目录: packages/runtime-assets/partners/<id>/
    manualPath: string;          // PARTNER_MANUAL.md 路径
    symlinkStatus: 'verified' | 'unlinked' | 'stale';
    memoryBytes: number;         // 记忆文件大小，上限 25,600 字节 (200行)
  };

  // 伙伴能力开关与工具链
  capabilities: {
    memory: boolean;             // 记忆注入总开关
    modelChain: string[];        // 主选模型及降级链条
    mcpServers: string[];        // 已授权 MCP 服务器标识
    inputHandoff: boolean;       // 协作控制权移交权限
  };
}
```

### 3.2 SOUL.md 查看与编辑状态流
- **业务定位**:
  - `SOUL.md` 是伙伴的灵魂人设（Persona）、行为准则、对话基调与协作规范。
  - 在架构规范中，`SOUL.md` 保存在伙伴沙箱目录下，并注入作为 System Prompt 的核心组成部分。
- **交互与编辑状态**:
  - **预览态**: 使用 Markdown 渲染器展示，支持标题、代码块、列表、强调语法的完整渲染。
  - **编辑态**:
    - 提供全高 Textarea / Markdown 编辑组件；
    - 统计当前字符数与预估 Token 数；
    - 采用 **本地 Draft + 失焦自动保存（Autosave）** 模式，避免用户编辑大量 Prompt 后因切换而丢失；
    - 提供“恢复默认人设（Revert to Default）”快捷按钮，便于重置到脚手架模板。

### 3.3 MEMORY.md 长期记忆分级管理 (基于 BotMemorySettings)
Cindy 源码中的 `BotMemorySettings.tsx` 提供了目前业界最完善的桌面端 Agent 记忆管理实现：
1. **三态视图流转**:
   - `List` (列表态) $\to$ `Detail` (详情态) $\to$ `Edit` (编辑态)。
2. **列表态特性**:
   - 顶部提供记忆启用总开关（`Switch`）与“关于我”（`aboutMe / userContextSource`）多行文本框。
   - 搜索栏（带 200ms 防抖查询），支持根据关键词实时过滤记忆项。
   - 记忆分类分组（`BOT_MEMORY_TYPES`）：`learned`（自主学得）、`fact`（客观事实）、`preference`（偏好约束），分组卡片化展示。
3. **编辑态与并发冲突解决 (Conflict Resolution)**:
   - 自动保存定时器（800ms 防抖）：用户停止输入 800ms 后自动提交保存；
   - 离开守卫（`leaveRef / backRef`）：若编辑器存在脏数据，拦截返回或关闭抽屉，弹出确认弹窗；
   - 冲突对比处理：若底层文件在编辑期间被外部进程修改，展示差异卡片，提供“使用最新版本”和“保留当前修改”选项。

### 3.4 已挂载技能 (Skills) 标签与卡片管理 (基于 BotCapabilitySettings)
- **技能分层体系**:
  1. **Core Guide (核心协议)**: 只读，标记为“始终启用（Always On）”，解释多 Agent 消息路由与控制流；
  2. **System Skills (系统技能)**: 如 `dispatch`、`relay`、`p2p-route`，带独立开关与已开启统计；
  3. **Installed / Domain Skills (领域业务技能)**: 如 `elf-audit`、`memory-trace`、`scaffold-partner`，采用卡片列表展示，右侧带详情跳转与启用开关；
  4. **MCP 扩展服务器**: 展示挂载的 MCP 服务器连接状态。
- **折叠展示策略 (`FOLD = 4`)**:
  - 每个分组默认只展开前 4 项，多余项显示折叠条“展开其余 N 项”，避免过长垂直滚动。

### 3.5 双平面隔离沙箱路径展示 (Dual-Plane Isolation)
- **展示要素**:
  - **运行时工作目录 (Runtime CWD)**: 高亮显示 `~/.multiagent-orchestration/partners/<id>/`；
  - **构建期物理路径 (Build-Time Plane)**: `/packages/runtime-assets/partners/<id>/`；
  - **软链接映射卡片**: `PARTNER_MANUAL.md` $\to$ `CLAUDE.md`（展示“软链接已校验”绿灯指示器）；
  - **内存注入防御边界**: 提示当前记忆注入限制为“前 200 行 / $\le 25,600$ 字节”，杜绝超大上下文溢出。
- **交互动作**:
  - 一键复制绝对路径；
  - “在访达/资源管理器中定位”按钮（调用 Electron `shell.openPath`）。

---

## 4. 群聊配置数据结构与表单交互

### 4.1 群聊数据模型定义
结合 `BotGroupSettingsDrawer.tsx` 与 `ChatGroupSettings.tsx`，群聊数据结构契约如下：

```typescript
export interface BotGroupSummary {
  id: string;                    // 如 'grp_orchestration_demo'
  name: string;                  // 群聊名称
  topic?: string;                // 群主题/短目标
  description?: string;          // 群长描述 (上限 2000 字)
  organizerBotId: string;        // 负责人/主控 Agent ID (如 'lead-orchestrator')
  projectDir: string | null;     // 群协同绑定的项目工作目录
  
  // 发言与回复协作模式
  replyMode: 'all' | 'mentioned';        // 'all': 所有人接话 | 'mentioned': 仅被 @ 时接话
  speakingMode: 'auto' | 'sequential';   // 'auto': 动态抢答协作 | 'sequential': 严格顺序发言
  autoContinue?: boolean;                // 是否开启自动流水线推进
  
  // 成员列表
  members: BotGroupMemberView[];
}

export interface BotGroupMemberView {
  botId: string;                 // 伙伴标识
  name: string;                  // 伙伴名称
  role: 'owner' | 'admin' | 'member'; // 角色权限
  isLead?: boolean;              // 是否为主控 Agent
  status: 'active' | 'paused' | 'unavailable';
  isSelf?: boolean;
}
```

### 4.2 群聊基础信息与 Header 交互
- **群头像栈 (`BotGroupAvatarStack`)**:
  - 最多重叠渲染 4 位成员头像，带 2px 描边与负 margin 堆叠效果；
  - 居中展示群聊名称、成员总数统计（如 `3 位伙伴成员`）。
- **群名实时修改**:
  - `FormField` + `Input`，`maxLength={40}`；
  - 用户聚焦修改后，失焦（`onBlur`）或回车（`Enter`）时立即触发保存；
  - 输入校验：不能为空，过滤前后空白字符。

### 4.3 协作模式切换表单 (SegmentedControl)
- **回复方式 (`replyMode`)**:
  - 选项一：`all`（所有成员接话 —— 任何消息所有空闲伙伴均可分析响应）；
  - 选项二：`mentioned`（仅点名回复 —— 仅在消息中 `@` 呼叫该伙伴时才会唤醒）；
  - 底部配有一行浅灰说明文字（`SETTINGS_HINT`）。
- **发言协作模式 (`speakingMode`)**:
  - 选项一：`auto`（自动抢答协作 —— 根据语义分析自主决定发言顺序，支持并行协作）；
  - 选项二：`sequential`（按顺序发言 —— 严格按照成员排列列表依次递进输出）；
  - 对应 Cindy 界面中的分工计划卡（`BotGroupPlan`）推进模式。

### 4.4 群工作目录绑定 (`projectDir`)
- **功能意义**:
  - 群聊所有 Agent 执行文件操作、代码生成、测试套件构建时的统一根沙箱路径。
- **UI 呈现**:
  - 左侧为 `Folder` 文件夹图标；
  - 中间展示路径的 `basename`（短文件名），悬停提供 Tooltip 展示完整绝对路径；若未绑定则显示“未选择”；
  - 右侧提供“更换目录”与“清空绑定”操作按钮；
  - 点击“更换/选择”按钮时，触发系统文件夹选择框（`dialog.showOpenDirectory`）。

### 4.5 成员管理列表与权限切换 (`ChatGroupMembersTab`)
- **成员搜索**:
  - 顶部配备紧凑型搜索框（带 `Search` 图标），支持按伙伴名称拼音/字符实时模糊过滤。
- **成员行 (`MemberRow`)**:
  - 左侧：伙伴头像 `BotAvatar`（离线/暂停状态自动加半透明 `opacity-60`）；
  - 中间：伙伴名称，若为当前负责人则展示特殊的浅金/亮色 `ORGANIZER / LEAD` 徽章；
  - 右侧：
    - 若非负责人：展示“设为负责人”微型按钮（`Button size="xs" variant="secondary"`）；
    - 移出按钮：当群成员数 $> 2$（`BOT_GROUP_MIN_MEMBERS`）时，允许移出该成员；当只剩 2 人时，移出按钮禁用并展示 Tooltip“群聊至少需要保留 2 位成员”。
- **添加成员交互 (`Add Member`)**:
  - 成员列表末尾提供虚线圆圈的“+ 添加成员”行；
  - 当群成员数达到上限（如 6 人）时，按钮禁用并提示“已达成员上限”；
  - 点击后展开折叠面板，列出当前系统中尚未入群的活跃伙伴列表，点击即可加入。

### 4.6 危险操作区 (Danger Zone)
- **交互边界**:
  - 红色警示文字卡片：`text-[var(--text-danger)]`，Hover 时变为红色柔和背景 `hover:bg-red-500/10`；
  - 按钮文案：普通成员为“退出群聊”，群主/Lead 为“解散群聊”；
- **二次确认弹窗 (`useConfirmDialog`)**:
  - 绝不使用简陋的浏览器 `window.confirm`；
  - 弹出系统一致的模态二次确认框：
    - 标题：“确定要解散群聊‘${name}’吗？”；
    - 描述：“解散后群内历史对话将被归档，此操作不可撤销。”；
    - 确定按钮：红色高危变体（`confirmVariant: 'destructive'`）；
    - 确认后执行删除 API，并安全平滑跳转回默认会话列表。

---

## 5. 组件拆分方案与代码解耦设计 (单文件 <= 600 行)

### 5.1 痛点与规范挑战
- Cindy 原始源码存在较多大文件：
  - `BotGroupSettingsDrawer.tsx`: 607 行；
  - `BotMemorySettings.tsx`: 740 行；
  - `BotCapabilitySettings.tsx`: 503 行；
  - `BotsHomeView.tsx`: 1144 行；
- 本仓库 `AGENTS.md` 明确规定了代码行数硬指标：
  - **单文件 $\le 600$ 行**；
  - **$500$ 行发出预警并进行模块解耦**；
  - **$800$ 行禁止提交**。
- 因此，不能盲目复制 Cindy 的超长文件，必须将抽屉组件拆分为**高内聚、专一职责、易测试**的子模块。

### 5.2 抽屉组件解耦结构树
建议在 `apps/desktop/src/renderer/components/drawers/` 下组织如下模块结构：

```
apps/desktop/src/renderer/components/drawers/
├── common/                               # 通用抽屉与视觉基建 (全部 < 150 行)
│   ├── DrawerShell.jsx                   # Radix Dialog 侧边抽屉容器、遮罩与 IME 守卫 (~110 行)
│   └── SettingsRowSystem.jsx             # SettingsCard / Section / Row / Divider 基建 (~130 行)
│
├── partner-drawer/                       # 伙伴配置抽屉模块集 (全部 90 ~ 220 行)
│   ├── PartnerSettingsDrawer.jsx         # 抽屉入口、Header、Tab 路由状态分发 (~120 行)
│   ├── PartnerProfileCard.jsx            # 伙伴基本信息、头像、角色徽标展示 (~90 行)
│   ├── PartnerSoulEditor.jsx             # SOUL.md 预览与编辑组件 (~150 行)
│   ├── PartnerMemoryTab.jsx              # MEMORY.md 列表、搜索与分级卡片 (~200 行)
│   ├── PartnerSkillsTab.jsx              # 已挂载技能与 MCP 列表与开关卡片 (~180 行)
│   └── PartnerSandboxCard.jsx            # 双平面隔离沙箱路径与软链接状态卡片 (~120 行)
│
└── group-drawer/                         # 群聊配置抽屉模块集 (全部 90 ~ 210 行)
    ├── GroupSettingsDrawer.jsx           # 群抽屉入口、Header、Tab 状态管理 (~130 行)
    ├── GroupGeneralTab.jsx               # 群名称、工作目录、发言/回复模式设置 (~190 行)
    ├── GroupMembersTab.jsx               # 成员搜索列表、设为负责人、移出交互 (~170 行)
    ├── GroupMemberAddSheet.jsx           # 候选成员添加下拉/选择菜单 (~110 行)
    └── GroupDangerZone.jsx               # 退出/解散群聊二次确认区 (~80 行)
```

### 5.3 子组件职责与行数预算规划表

| 模块文件 | 核心职责 | 预计行数 | 规范合规性评估 |
|---|---|---|---|
| `DrawerShell.jsx` | 封装抽屉容器、遮罩动画、Esc IME 处理、窗口 no-drag 适配 | ~110 行 | 远低于 500 行，极度精简 |
| `SettingsRowSystem.jsx` | `SettingsSection`, `SettingsCard`, `SettingsRow`, `SETTINGS_DIVIDER` 样式抽象 | ~130 行 | 纯展示组件，高度复用 |
| `PartnerSettingsDrawer.jsx` | 伙伴配置抽屉统一外壳，处理 Tab 切换与 Mock 状态保存 | ~120 行 | 负责协调各子 Tab，无重型逻辑 |
| `PartnerSoulEditor.jsx` | SOUL.md Markdown 渲染、Textarea 编辑、实时字符统计 | ~150 行 | 职责专一，可独立单元测试 |
| `PartnerMemoryTab.jsx` | MEMORY.md 分类展示、搜索框、单项详情弹发展示 | ~200 行 | 拆分后逻辑清晰，无 Cindy 原版 740 行臃肿问题 |
| `PartnerSkillsTab.jsx` | 挂载技能卡片（Core、System、Domain、MCP）、开关切换 | ~180 行 | 逻辑分明，支持折叠前 4 项 |
| `PartnerSandboxCard.jsx` | 展示双平面隔离目录、软链接状态、打开文件管理器 | ~120 行 | 强契合本工程架构规范 |
| `GroupSettingsDrawer.jsx` | 群配置抽屉主入口，包含 Header 头像栈、Tab 切换 | ~130 行 | 状态集中，清晰无冗余 |
| `GroupGeneralTab.jsx` | 群名称 Input、发言模式/回复模式 SegmentedControl、工作目录 Picker | ~190 行 | 集中管理群通用表单状态 |
| `GroupMembersTab.jsx` | 成员模糊搜索、负责人切换、移出安全校验（最少 2 人） | ~170 行 | 聚焦列表渲染与交互操作 |
| `GroupMemberAddSheet.jsx` | 未入群伙伴列表筛选、点击直接加入（最多 6 人） | ~110 行 | 纯展示与选择事件发射 |
| `GroupDangerZone.jsx` | 解散/退出红色告警区，封装二次确认逻辑 | ~80 行 | 隔离高危逻辑，易审计 |

---

## 6. 与当前工程现有组件的集成建议

1. **入口触达**:
   - 在 `SessionHeader.jsx` 中：
     - 若当前为单聊会话，右上角增加“伙伴配置”按钮（`Sliders` / `Bot` 图标），点击打开 `PartnerSettingsDrawer`；
     - 若当前为群聊会话，右上角增加“群聊配置”按钮（`Users` / `Settings` 图标），点击打开 `GroupSettingsDrawer`。
   - 在 `PartnerStudio.jsx` 侧边栏卡片上：每个伙伴项增加快捷配置齿轮图标，点击直接唤起该伙伴的配置抽屉。
2. **Mock 数据驱动策略**:
   - 在 `App.jsx` 或专用的 `mockData.js` 中扩充伙伴与群聊的完整 Mock 数据；
   - 抽屉内的任何修改（修改群名、切换发言模式、设置负责人、增删成员、修改 SOUL.md / 技能开关）均通过回调函数就地更新 React 顶层 State，实现即时响应与双向数据流闭环。
3. **零报错与类型安全**:
   - 所有新建与修改文件需严格通过 `pnpm typecheck`（或 `pnpm test`），无未解析依赖，且单文件行数严控在 250 行以内。

---

## 7. 调研结论

Cindy 在桌面端抽屉的交互设计（右侧 Slide-over、遮罩防误触、IME 按键过滤、滚动位置还原、SettingsRows 视觉行卡片系统）极为成熟，完全能够满足本次高保真、生产级落地的需求。
通过将原本分散且庞大的单体文件重构拆分为 `common/`、`partner-drawer/` 与 `group-drawer/` 三组解耦模块，不仅能完整保留原版的所有视觉美感与高级交互能力，更能确保完全遵循仓库单文件 $\le 600$ 行的严苛规范，为后续实现团队提供最坚实、精确的落地基石。
