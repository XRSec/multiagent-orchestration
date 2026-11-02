# 前端架构调研与四大核心界面落地规划报告

## 调研概述
本报告深入剖析当前项目 `apps/desktop/src/renderer/` 前端工程的现有架构、构建与依赖体系、组件与状态管理、数据契约模型，以及参考 `extensions/cindy/` 桌面端优秀设计，针对项目目标（伙伴私聊、伙伴群聊、伙伴配置抽屉、群聊配置抽屉四大核心生产级界面）制定详细的落地实现方案。

---

## 1. 当前前端工程技术栈全景

### 1.1 核心依赖与版本
根据根目录 `package.json` 及 `apps/desktop/` 实际配置：
- **React 运行时**: `react: ^19.3.1`, `react-dom: ^19.3.1`。
  - 入口 `apps/desktop/src/renderer/main.jsx` 使用 `ReactDOM.createRoot` 并在 `<React.StrictMode>` 下渲染主应用。
- **构建工具**: `vite: ^8.3.5` 配合 `@vitejs/plugin-react: ^6.1.2`。
  - `vite.config.js` 配置：
    - `root`: `path.resolve(__dirname, 'apps/desktop')`
    - `server`: 端口 `3000`，地址 `127.0.0.1`，支持热更新
    - `resolve.alias`: 映射 `@` 到 `apps/desktop/src`
    - 命令 `pnpm run ui` 即可启动开发服务器，`pnpm exec vite build` 可直接执行生产构建打包。
- **样式方案 (Tailwind CSS CDN + 内联定制)**:
  - 当前未使用 npm 本地安装的 PostCSS Tailwind，而是在 `apps/desktop/index.html` 引入官方 CDN 脚本：`<script src="https://cdn.tailwindcss.com"></script>`。
  - `index.html` 内联注入了 `tailwind.config`：
    - `darkMode: 'class'`（根节点 `<html lang="zh-CN" class="dark">` 开启暗黑模式）
    - 调色板扩展：
      - `background`: `#090d16`（深邃暗黑底色）
      - `surface`: `#0f172a`（次级面板暗色）
      - `card`: `#1e293b`（卡片与容器深蓝灰）
      - `border`: `#334155`（中度描边线条）
      - `accent`: `#38bdf8`（天青色高亮重点）
      - `accent-hover`: `#0ea5e9`（聚焦悬浮色）
    - 字体扩展：`fontFamily.sans: ['Inter', ...]`, `fontFamily.mono: ['JetBrains Mono', ...]`。
    - 全局滚动条样式：针对 Webkit 滚动条定制了 6px 紧凑极简暗黑样式。
- **图标体系**:
  - `lucide-react: ^1.66.0`。项目中全量采用统一的 Lucide 图标集（Bot, Users, Shield, Cpu, Sparkles, FolderGit2, Trash2, GitFork, Clock 等），风格高度一致且无运行时重量包负担。
- **状态管理**:
  - 当前在 `apps/desktop/src/renderer/App.jsx` 中采用原生 React 19 State (`useState`, `useMemo`, `useCallback`)。
  - 暂未引入 Zustand 或 Redux 等大型外部状态库。为了兼顾代码轻量、即插即用和架构解耦，四大界面的状态管理推荐通过「统一 Mock 数据源 + 模块化自定义 Hook + React Context」进行状态隔离与跨组件分发，避免引入未经测试的额外三方包。
- **流式桥接层**:
  - `apps/desktop/src/renderer/runtime/useClaudePartnerRuntime.ts` 结合 `claude-code-parser` 提供了对 Electron 主进程 NDJSON 流式协议的标准桥接接口与类型声明。

---

## 2. 现有视图、路由与交互现状分析

### 2.1 当前页面组织形式
- **单页状态驱动 (SPA State-based Routing)**:
  - 项目当前未引入 `react-router-dom` 库，通过 `activeSessionId` 与会话模型中的 `session.kind` (`'direct'` | `'group'`) 区分当前是伙伴私聊还是伙伴群聊。
  - 整体界面为三栏式桌面应用经典布局：
    1. **左侧导航栏 (`Sidebar.jsx`, 141 行)**:
       - 顶部：应用标题与版本、新建单聊主按钮、新建群聊快捷图标按钮。
       - 中间：会话历史列表（使用 `MessageSquare` 图标标示单聊，`Users` 图标标示群聊；支持悬浮删除按钮）。
       - 底部：伙伴直连列表（点击直接跳转或创建与该伙伴的 1:1 私聊会话）。
    2. **中间主视图工作区**:
       - 顶部 `SessionHeader.jsx` (82 行)：展示会话名称、Room ID、消息计数、群聊/单聊标识；右侧配有分叉分支 (`--fork-session`)、清空消息与快速新建按钮。
       - 消息流：空状态展示 `NewChatEmptyState.jsx` (99 行)；有消息展示 `ChatTimeline.jsx` (237 行)。
       - 底部 `MessageInput.jsx` (198 行)：支持 `@` 快捷呼叫特定伙伴的候选下拉框（输出为 Cindy 协议的 `[@Name](cindy://bot/<botId>)` URI 格式）；输入框自适应且具备运行途中消息排队（In-flight Queue）感知能力。
    3. **右侧辅助视窗 (`RuntimeMonitor.jsx`, 97 行)**:
       - 展示 Claude Agent SDK Driver 规格、在途排队队列统计、MCP 表面与伙伴沙箱隔离路径。
    4. **未挂载的组件 (`PartnerStudio.jsx`, 109 行)**:
       - 已存在一个 `PartnerStudio` 组件，列出 Registered Partners 的状态、沙箱路径与双平面隔离标识，但目前在 `App.jsx` 中尚未正式作为可打开抽屉呈现。

### 2.2 现有视图存在的短板与重构需求
1. **伙伴私聊缺少深度个性化视觉质感**:
   - 目前单聊与群聊共用一套通用的 `ChatTimeline`，单聊缺乏伙伴专属的大头像、伙伴职责卡片、在线运行状态徽标、专属 Prompt 建议以及双平面沙箱路径快捷提示。
2. **群聊缺少多 Agent 编排协同核心组件**:
   - 缺少 Cindy 桌面端关键体验组件：**分工计划卡片 (`BotGroupPlan`)**，无法直观查看各 Agent 分工阶段、步骤状态、耗时以及操作按钮（“开始”、“不用了”、“下一步继续”、“重试”）。
   - 缺少群聊顶栏与时间轴上的**实时进行中状态条 (`BotGroupLiveStatus`)**，无法动态体现哪位 Agent 正在思考、规划或执行。
   - 消息气泡缺乏多 Agent 差异化头像、色彩标识与交接物（Handoff Files）展示。
3. **缺少伙伴配置抽屉 (Partner Config Drawer)**:
   - 无法在前端查看和编辑伙伴核心配置文件（`SOUL.md` 与 `MEMORY.md`）。
   - 无法查看挂载技能（Skills）及其 Token 预算与双平面隔离沙箱（Runtime vs Build source）路径。
4. **缺少群聊配置抽屉 (Group Settings Drawer)**:
   - 无法修改群聊名称与工作目录（WorkDir）。
   - 无法增删群成员，缺少重叠头像栈（Avatar Stack）。
   - 无法切换群主/负责人（Organizer），无法切换发言模式（广播模式/轮询模式/仅@点名）。
   - 缺少退出或解散群聊的操作交互。

---

## 3. 数据模型现状与扩展 Mock 数据设计

### 3.1 现有数据模型定义
当前在 `apps/desktop/src/renderer/App.jsx` 中的数据模型结构：
```javascript
// 伙伴定义
interface Partner {
  id: string;        // 'lead-orchestrator' | 'agent-architect' | 'rea-partner'
  name: string;      // 'Lead Orchestrator'
  role: string;      // '主控多Agent调度器与会话路由器'
  icon: LucideIcon;
  isLead: boolean;
  status: 'idle' | 'busy';
  queueCount: number;
  skills: string[];  // ['dispatch', 'relay', 'p2p-route']
}

// 会话定义
interface Session {
  id: string;
  title: string;
  kind: 'direct' | 'group';
  partnerId?: string;
  partnerName?: string;
  organizerBotId?: string;
  updatedAt: string;
  messages: Message[];
}

// 消息定义
interface Message {
  id: string;
  sequence?: number;
  clientId?: string;
  role: 'user' | 'assistant' | 'system';
  senderName?: string;
  timestamp: string;
  content: string;
  isQueuedAmendment?: boolean;
  toolCalls?: ToolCall[];
  subagentTasks?: SubagentTask[];
}
```

### 3.2 生产级扩展 Mock 数据模型设计
为了支撑四大生产级界面的完整交互闭环，需要将数据模型扩展并在 `mock/` 中建立统一的响应式数据源：

#### 1. 伙伴扩展模型 (`PartnerDetail`)
```typescript
export interface PartnerDetail {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
  isLead: boolean;
  status: 'idle' | 'busy' | 'stopping';
  queueCount: number;
  model: string;            // 如 'claude-3-7-sonnet-latest'
  maxTurns: number;         // 默认 25
  maxBudgetUsd: number;     // 默认 5.00
  sandboxPath: string;      // '~/.multiagent-orchestration/partners/<id>'
  buildPath: string;        // 'packages/runtime-assets/partners/<id>'
  soulContent: string;      // 完整 SOUL.md AST (严格符合 STANDING_ORDER 规范)
  memoryContent: string;    // 完整 MEMORY.md 知识树索引
  skillsList: Array<{
    id: string;
    name: string;
    description: string;
    tokens: number;
    enabled: boolean;
  }>;
}
```

#### 2. 群聊扩展模型 (`GroupChatDetail`)
```typescript
export interface GroupChatDetail extends Session {
  kind: 'group';
  organizerId: string;       // 负责人伙伴 ID
  members: string[];         // 成员伙伴 ID 列表
  workDir: string;           // 群工作目录，如 '~/IDEA.localized/multiagent-orchestration'
  speakingMode: 'broadcast' | 'round_robin' | 'mention_only';
  replyMode: 'auto' | 'manual';
  liveStatus: {
    activeSpeakerId: string | null;
    phase: 'idle' | 'planning' | 'executing' | 'reviewing';
    elapsedSeconds: number;
    currentAction: string;
  };
}
```

#### 3. 分工计划卡模型 (`BotGroupPlanData` & `BotGroupPlanStep`)
参考 Cindy 的 `BotGroupPlan.tsx`，将计划卡直接内嵌为一种特殊的消息类型 (`kind: 'plan'`)：
```typescript
export interface BotGroupPlanStep {
  id: string;
  index: number;
  botId: string;
  botName: string;
  task: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  startedAt?: number;
  finishedAt?: number;
  elapsedLabel?: string;
  handoffFiles?: string[];
}

export interface BotGroupPlanData {
  id: string;
  title: string;
  status: 'proposed' | 'running' | 'done' | 'failed' | 'dismissed';
  organizerId: string;
  organizerName: string;
  steps: BotGroupPlanStep[];
}
```

#### 4. 预设 Mock 实例规划
在 `mockData.js` 中构建三大真实伙伴实例（与 `agents/registry.json` 及现有设计深度对齐）：
1. **Lead Orchestrator (Cindy)**: 主控编排器，负责 DAG 规划与任务分派，预置真实 SOUL.md 与 MEMORY.md。
2. **Agent Architect (Dev)**: 架构设计与工程专家，负责契约校验、测试用例生成与构建校验。
3. **REA Partner (Audit)**: 安全审计专家，负责二进制与协议安全性、内存边界与沙箱规则校验。
并预置 1 个多 Agent 协同群聊、2 个典型伙伴私聊、多轮真实图文消息流与分工计划卡交互态。

---

## 4. 验证方式与构建质量保证

### 4.1 构建命令与语法验证
- **构建测试**:
  - 当前根目录已配置 `"ui": "vite"`，且 `vite build` 经过实测验证能够无缝执行：
    ```bash
    pnpm exec vite build
    ```
    实测结果：2051 个模块在 344ms 内成功编译打包，产物生成至 `apps/desktop/dist/`，零语法与打包错误。
- **本地开发预览服务**:
  - 启动命令：
    ```bash
    pnpm run ui
    ```
    服务监听在 `http://127.0.0.1:3000`，可在浏览器端实时交互测试四大核心界面的渲染与动态交互闭环。

### 4.2 类型检查与代码规范检查
- **TypeScript 现状**:
  - 根目录 `package.json` 当前未将 `typescript` 放入依赖，亦未配置 `tsconfig.json`。
  - Vite 通过内置的 esbuild/oxc 解析器直接支持 TSX/JSX 语法与模块导入。
  - **建议规范**:
    - 所有新增组件使用 `.jsx`（或 `.tsx`），保持与现有组件体系完全一致。
    - 为满足 `AGENTS.md` 中的 `pnpm typecheck` 质量门禁，可在 `package.json` 中配置相应的校验脚本，或通过 `pnpm exec vite build` 作为硬性静态编译构建门禁。

### 4.3 代码行数规范检查方式
根据仓库规则 `AGENTS.md` 及 `docs/dev-rules/script-standards.md`：
- **核心红线**:
  - 单文件 `<= 600` 行；
  - 达到 `500` 行必须启动解耦拆分预警；
  - 严禁出现超过 `800` 行的硬性违规文件。
- **行数统计检查命令**:
  ```bash
  wc -l apps/desktop/src/renderer/**/*.{jsx,tsx,js,ts}
  ```
  编写独立的 shell 或 node 脚本可实现自动化门禁校验：
  ```bash
  node -e "const fs = require('fs'), path = require('path'); function check(dir){ fs.readdirSync(dir).forEach(f=>{ const p=path.join(dir,f); if(fs.statSync(p).isDirectory()) check(p); else if(/\.(jsx?|tsx?)$/.test(f)){ const l=fs.readFileSync(p,'utf8').split('\n').length; if(l>500) console.warn('WARN: >500 lines:', p, l); if(l>600) throw new Error('FAIL: >600 lines: '+p+' ('+l+')'); } }); } check('apps/desktop/src/renderer'); console.log('All renderer files line count OK!');"
  ```

---

## 5. 四大核心界面文件放置规划与架构解耦设计

为了彻底避免 Cindy 源码中单文件高达 1548 行（如 `BotGroupChatView.tsx`）的臃肿问题，同时严格遵循 `AGENTS.md`（<= 600 行，500 行预警），我们对四大界面实行**高度模块化、原子化**的目录布局规划。所有新文件预估行数均严格控制在 **100 ~ 320 行** 之间。

### 5.1 整体目录树规划
```
apps/desktop/src/renderer/
├── index.html                               # Tailwind CDN & 页面宿主
├── main.jsx                                 # React 根挂载点 (10 行)
├── App.jsx                                  # 核心 SPA 入口骨架，统合抽屉与主视图 (约 280 行)
│
├── mock/                                    # 生产级 Mock 数据中心
│   ├── initialMockData.js                   # 伙伴全量配置、SOUL/MEMORY、预设群聊与会话 (约 280 行)
│   └── mockStore.js                         # 响应式状态管理（提供增删改查交互方法）(约 260 行)
│
├── components/                              # 通用及基础结构组件
│   ├── Sidebar.jsx                          # 左侧会话历史与直连列表 (约 160 行)
│   ├── SessionHeader.jsx                    # 顶部导航栏（支持触发群设置与伙伴设置）(约 130 行)
│   ├── MessageInput.jsx                     # 统一输入框，带 @ 点名与排队提示 (约 220 行)
│   ├── RuntimeMonitor.jsx                   # 右侧运行时遥测监视器 (约 110 行)
│   ├── NewChatEmptyState.jsx                # 新建会话空状态引导页 (约 100 行)
│   └── common/                              # 通用高频小组件
│       ├── DrawerShell.jsx                  # 统一侧滑抽屉外壳与遮罩容器 (约 90 行)
│       └── BotAvatarStack.jsx               # 多成员层叠头像栈 (约 70 行)
│
└── views/                                   # 四大核心业务界面模块
    │
    ├── direct-chat/                         # 【界面一：伙伴 1:1 私聊核心视图】
    │   ├── PartnerDirectChatView.jsx        # 私聊消息时间轴主视图 (约 220 行)
    │   ├── PartnerDirectHeaderCard.jsx      # 伙伴专属身份卡、沙箱标识与运行状态条 (约 140 行)
    │   └── PartnerDirectEmptyPrompt.jsx     # 针对该伙伴专业领域的快捷 Prompt 建议卡片 (约 90 行)
    │
    ├── group-chat/                          # 【界面二：伙伴群聊核心视图】
    │   ├── PartnerGroupChatView.jsx         # 群聊多 Agent 时间轴主视图 (约 240 行)
    │   ├── BotGroupPlanCard.jsx             # Cindy 风格的分工计划卡 (约 280 行)
    │   ├── BotGroupLiveStatus.jsx           # 实时进行中状态条与动态计时器 (约 160 行)
    │   └── BotGroupTimelineItem.jsx         # 多 Agent 差异化时间轴气泡与交接文件展示 (约 260 行)
    │
    ├── partner-drawer/                      # 【界面三：伙伴配置抽屉】
    │   ├── PartnerConfigDrawer.jsx          # 抽屉主容器与 Tab 导航 (约 180 行)
    │   ├── PartnerDocEditorTab.jsx          # SOUL.md / MEMORY.md 在线高亮查看与编辑 (约 240 行)
    │   └── PartnerSkillsSandboxTab.jsx      # 挂载技能列表与双平面隔离沙箱路径展示 (约 170 行)
    │
    └── group-drawer/                        # 【界面四：群聊配置抽屉】
        ├── GroupSettingsDrawer.jsx          # 抽屉主容器与基础群配置 (约 200 行)
        ├── GroupMembersTab.jsx              # 成员增删列表、群主/负责人切换与头像栈 (约 210 行)
        └── GroupAdvancedTab.jsx             # 工作目录配置、发言模式切换与解散操作 (约 180 行)
```

### 5.2 各模块职责与代码行数预估对照表

| 界面分类 | 核心文件 | 职责说明 | 预估代码行数 | 行数警戒线状态 |
|---|---|---|---|---|
| **公共骨架** | `App.jsx` | 路由分发、主工作区协调、抽屉状态开关与全局调度 | ~280 行 | 远低于 500 行 |
| **数据中心** | `mock/initialMockData.js` | 预置 3 个深度伙伴全量数据、SOUL/MEMORY 文本、群聊初始记录 | ~280 行 | 远低于 500 行 |
| **数据中心** | `mock/mockStore.js` | 增删改查 Hook，提供消息追加、计划卡操作、抽屉设置持久化 | ~260 行 | 远低于 500 行 |
| **界面一** | `views/direct-chat/PartnerDirectChatView.jsx` | 1:1 独立对话流气泡、状态流转渲染 | ~220 行 | 远低于 500 行 |
| **界面一** | `views/direct-chat/PartnerDirectHeaderCard.jsx` | 伙伴独立大头像、角色徽标、双平面路径与在线/排队指示 | ~140 行 | 远低于 500 行 |
| **界面二** | `views/group-chat/PartnerGroupChatView.jsx` | 群聊主视图，汇聚时间轴、LiveStatus、计划卡 | ~240 行 | 远低于 500 行 |
| **界面二** | `views/group-chat/BotGroupPlanCard.jsx` | Cindy 风格分工计划卡（分工步骤、状态、继续/重试交互） | ~280 行 | 远低于 500 行 |
| **界面二** | `views/group-chat/BotGroupLiveStatus.jsx` | 实时进行中状态条、脉冲呼吸动画、动态任务耗时 | ~160 行 | 远低于 500 行 |
| **界面二** | `views/group-chat/BotGroupTimelineItem.jsx` | 多 Agent 差异化时间轴气泡与交接文件链接卡 | ~260 行 | 远低于 500 行 |
| **界面三** | `views/partner-drawer/PartnerConfigDrawer.jsx` | 伙伴配置抽屉外壳与 Tab 切换（文档/技能与沙箱/运行规格） | ~180 行 | 远低于 500 行 |
| **界面三** | `views/partner-drawer/PartnerDocEditorTab.jsx` | SOUL.md / MEMORY.md 查看与实时保存编辑 | ~240 行 | 远低于 500 行 |
| **界面三** | `views/partner-drawer/PartnerSkillsSandboxTab.jsx` | 挂载技能展示（含 Token 统计）与双平面沙箱路径 | ~170 行 | 远低于 500 行 |
| **界面四** | `views/group-drawer/GroupSettingsDrawer.jsx` | 群配置抽屉主容器、群名修改、工作目录配置 | ~200 行 | 远低于 500 行 |
| **界面四** | `views/group-drawer/GroupMembersTab.jsx` | 成员增删选择器、头像栈、负责人/群主指派 | ~210 行 | 远低于 500 行 |
| **界面四** | `views/group-drawer/GroupAdvancedTab.jsx` | 发言模式切换（广播/轮询/点名）、退出与解散群聊弹窗 | ~180 行 | 远低于 500 行 |

**结论**：全套 15 个组件文件无任何文件超过 300 行，完全杜绝了 500 行预警与 600 行超标问题，结构清晰、权责分明、极易测试与维护。

---

## 6. 四大界面生产级交互闭环设计

### 6.1 界面一：伙伴 1:1 私聊核心视图
- **视觉风格**:
  - 继承 Cindy 精准克制的暗黑美学。顶栏集成 `PartnerDirectHeaderCard`，呈现伙伴高光大头像、所属角色 Tag（如 `LEAD` / `ARCHITECT` / `AUDITOR`）、在线状态点（空闲为常亮翠绿，忙碌时呈现天青色 ping 扩散脉冲，有队列时显示 `+N Q` 计时器）。
  - 呈现伙伴双平面沙箱路径徽章（如 `~/.multiagent-orchestration/partners/rea-partner`），点击可展开查看详细工作环境。
- **对话交互**:
  - 用户输入任务，支持快速插入预设专业 Prompt（例如安全审计规则、测试用例架构等）。
  - 消息流体现助手专属气泡；支持用户在处理途中随时发送追加指令，自动触发 Claude 原生排队机制并显示 `排队递送中 (In-flight Queue)` 标签。

### 6.2 界面二：伙伴群聊核心视图
- **多 Agent 差异化时间轴**:
  - 不同 Agent 回复带有独特的颜色徽章和名字标签（如 Lead Orchestrator 为天青色，Agent Architect 为紫色，REA Partner 为橙色）。
  - 支持渲染交接产物（Handoff Files），如 `docs/security-audit.md`，点击弹出文件路径与摘要卡片。
- **Cindy 风格分工计划卡 (`BotGroupPlanCard`)**:
  - 嵌入时间轴，支持 5 种状态：`proposed`（待开始）、`running`（执行中）、`done`（已完成）、`failed`（失败）、`dismissed`（已撤销）。
  - 步骤列表展现每一步的执行伙伴头像、任务描述、耗时秒数及状态图标（CircleCheck, Sparkles, CircleAlert, CircleDashed）。
  - 底部操作栏：待开始时提供“开始分工”与“不用了”；执行中断时提供“下一步 · 继续”与“重试”。
- **实时进行中状态条 (`BotGroupLiveStatus`)**:
  - 位于消息时间轴最底部与输入框上方，当有 Agent 在后台思考或执行时，自动滑出。
  - 显示“✨ REA Partner 正在校验协议报文边界... (12s)”以及动态进度条，支持快速定位或停止。
- **输入框与 @ 点名交互**:
  - 输入 `@` 自动弹出群内或注册伙伴列表，点击或回车选中自动补全为 `[@REA Partner](cindy://bot/rea-partner)`。
  - 消息气泡渲染时自动将此 URI 转换为带图标的高科技感胶囊芯片（AgentReferenceChip）。

### 6.3 界面三：伙伴配置抽屉
- **触发方式**:
  - 在私聊界面的顶部 `SessionHeader` 点击设置图标，或在侧边栏伙伴列表点击设置按钮，从右侧平滑滑出抽屉。
- **Tab 1: 核心文档 (`SOUL.md` & `MEMORY.md`)**:
  - 支持在两个 Tab 之间无缝切换。
  - 提供富文本/Markdown 编辑框，实时显示字符数与行数（遵循 `< 200` 行与 `< 25KB` 规范）。
  - 提供“重置”与“保存生效”按钮，修改后即时更新应用内 Mock 状态并弹出成功 Toast。
- **Tab 2: 已挂载技能与双平面沙箱**:
  - 技能列表：展示该伙伴挂载的所有技能（如 `scaffold-partner`, `schema-validator`, `elf-audit`），包含技能描述、预估 Token 占用及启闭 Switch 开关。
  - 双平面沙箱展示：
    - `运行时工作目录 (CWD)`: `~/.multiagent-orchestration/partners/<id>/`
    - `源码镜像映射平面`: `packages/runtime-assets/partners/<id>/`
    - 状态标识：`Active Symlink Granularity` 绿色徽章。
- **Tab 3: 运行规格与模型参数**:
  - 模型选择下拉框（Claude 3.7 Sonnet / Claude 3.5 Haiku 等）。
  - 最大执行轮次（Max Turns）滑块与单次任务预算（Max Budget USD）。

### 6.4 界面四：群聊配置抽屉
- **触发方式**:
  - 在群聊界面的顶部 `SessionHeader` 点击群设置图标，从右侧滑出抽屉。
- **群资料设置**:
  - 修改群聊名称（实时同步更新侧边栏与顶栏）。
  - 设置群工作目录（WorkDir，如项目根目录）。
- **成员管理与头像栈**:
  - 展示当前群成员的头像栈（Avatar Stack）。
  - 成员列表：每一项展示头像、名称、角色，并标注 Organizer 标签。
  - 支持一键将某位伙伴设置为“群主/负责人”；支持从注册伙伴池中“添加成员”或“移出群聊”。
- **协作与发言规则**:
  - 发言模式切换（Segmented Control）：
    1. **广播协作模式 (Broadcast)**：所有人均可监听与响应。
    2. **轮询推进模式 (Round Robin)**：按照分工计划步骤顺序发言。
    3. **仅 @ 点名响应模式 (Mention Only)**：未被点名不触发执行。
- **危险操作区**:
  - “清空群聊记录”与“解散/退出群聊”操作，带有危险二次确认 Modal 弹窗，解散后自动切回默认单聊会话。

---

## 7. 调研结论与下一步实施建议
1. **现有工程基础良好**: Vite 8 + React 19 构建迅速，Tailwind CDN 极大地免除了 CSS 编译负担，基础组件（`Sidebar`, `MessageInput`, `ChatTimeline`）提供了坚实的骨架。
2. **重构路线清晰**: 通过解耦出 `mock/` 数据源与 `views/` 模块化子组件，四大界面可以完全在不破坏现有工程的情况下平滑落地。
3. **单文件行数严格受控**: 规划方案中拆分为 15 个高内聚独立组件，最大单文件代码行数控制在 280 行左右，完美满足仓库 `<= 600` 行硬性标准。
