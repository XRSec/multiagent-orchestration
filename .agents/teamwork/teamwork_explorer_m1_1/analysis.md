# M1 基础 Mock 数据体系规范与架构设计报告 (analysis.md)

## 1. 调研背景与架构目标

根据 `ORIGINAL_REQUEST.md` 与 `PROJECT.md`，本项目致力于深度借鉴与复用 Cindy 桌面端的 UI 视觉质感与模块划分，将其重塑并落地为四大生产级完整界面：
1. **伙伴私聊独立页面**（1:1 独立对话流、伙伴头像、角色徽标、状态指示器及消息气泡）；
2. **伙伴群聊多 Agent 视图**（多 Agent 差异化时间轴气泡、连续发言合并、Cindy 风格的分工计划卡 BotGroupPlan、实时运行状态条 BotGroupLiveStatus、@ 点名呼叫及输入框路由）；
3. **伙伴配置抽屉**（支持查看与编辑伙伴 `SOUL.md` 与 `MEMORY.md`、已挂载技能分类与开关、双平面隔离沙箱路径与软链接状态展示）；
4. **群聊配置抽屉**（修改群聊名称、成员增删与头像栈、群主/负责人设置、发言模式与回复模式切换、群工作目录配置以及退出/解散操作）。

为了让上述视图在无后端服务启动时具备 100% 完整的离线渲染、交互与状态流转能力，本报告对 Mock 数据模型进行全量规约设计，制定统一的数据契约。

---

## 2. 核心架构契约与设计原则

1. **双平面隔离设计（Dual-Plane Isolation）**：
   - **构建时平面（Build-Time Plane）**：源码位于仓库中（如 `/packages/runtime-assets/builtin-partners/<id>`），包含 `PARTNER_MANUAL.md`、`SOUL.md`、`manifest.json`；
   - **运行时资产平面（Run-Time Plane）**：以软链接粒度映射到 `~/.multiagent-orchestration/partners/<id>/`，包含 `workspace/`（运行沙箱）、`memories/MEMORY.md`（<= 200 行分级记忆）、`.claude/` 等；
   - 在 Mock 数据中必须真实映射 `sandboxPaths: { runtimeCwd, buildTimePlane, isSymlinked, allowedTools, disallowedTools }`。

2. **单文件行数合规（<= 600 行）**：
   - 各 Mock 文件保持高聚合但清晰拆分，每个文件行数控制在 150 - 350 行之间，杜绝单文件膨胀；
   - 导出结构清晰，支持按需解构和全量解构。

3. **Cindy 视觉与交互状态对齐**：
   - 发言模式支持：`'auto'`（自动并行思考）与 `'sequential'`（严格单人顺序发言）；
   - 回复模式支持：`'all'`（全员响应）与 `'mention'`（仅响应被 @ 的伙伴）；
   - 计划卡生命周期：`'proposed'`（提议待开始） -> `'running'`（执行中） -> `'waiting'`（等待下一步/暂停） -> `'done'`（完成）/ `'stopped'` / `'dismissed'`；
   - 步骤状态：`'pending'` -> `'running'` -> `'done'` / `'failed'`。

---

## 3. 文件一：`apps/desktop/src/renderer/mock/mockPartners.js`

### 3.1 字段规范与 JSDoc 契约

```javascript
/**
 * @typedef {Object} SkillItem
 * @property {string} id - 技能唯一标识
 * @property {string} name - 技能展示名称
 * @property {string} category - 技能分类：'orchestration' | 'scaffolding' | 'security' | 'analysis' | 'tools'
 * @property {boolean} enabled - 是否挂载/启用
 * @property {string} description - 技能用途简述
 */

/**
 * @typedef {Object} SandboxPaths
 * @property {string} runtimeCwd - 运行沙箱工作目录（真实宿主路径）
 * @property {string} buildTimePlane - 构建平面源码目录
 * @property {boolean} isSymlinked - 是否完成双平面软链接映射
 * @property {string[]} allowedTools - 允许使用的工具白名单
 * @property {string[]} disallowedTools - 禁用的工具黑名单
 * @property {boolean} statelessByDefault - 是否默认无状态
 * @property {number} maxTurns - 单次最大对话轮次
 * @property {number} maxBudgetUsd - 预算上限 (USD)
 */

/**
 * @typedef {Object} MockPartner
 * @property {string} id - 伙伴唯一标识 (如 'lead-orchestrator')
 * @property {string} name - 伙伴展示名称
 * @property {string} role - 角色定位说明
 * @property {string} avatar - 头像标识符或 Lucide 图标类型 ('Bot' | 'Cpu' | 'Shield' | 'Terminal')
 * @property {string} avatarColor - 头像与气泡强调色（如 '#38bdf8'）
 * @property {boolean} isLead - 是否为主控调度伙伴
 * @property {'idle' | 'running' | 'paused' | 'error'} status - 运行状态
 * @property {number} queueCount - 当前排队中的指令数量
 * @property {string} summaryForLead - 供主调度器参考的专长摘要
 * @property {string} soulMd - SOUL.md Markdown 正文（包含 AST 格式准则与决策树）
 * @property {string} memoryMd - MEMORY.md 分级记忆 Markdown（长效知识与事实索引）
 * @property {SkillItem[]} skills - 挂载的技能列表
 * @property {SandboxPaths} sandboxPaths - 双平面隔离沙箱配置
 */
```

### 3.2 预置伙伴数据规格

设计 3 个核心伙伴，深度映射系统真实架构：
1. **`lead-orchestrator`（群聊统筹主调度）**：
   - 角色：主控多 Agent 调度器与任务分解中枢；
   - 状态：`'idle'`；
   - 工具：仅允许主控编排 MCP（`dispatch_and_queue_partners`, `await_partner_queue`, `steer_or_repair_partner`）与 `Read`，严禁 `Bash` 与直接写代码；
   - 技能：`['dispatch-queue', 'mid-flight-steering', 'p2p-channel-router', 'context-synthesizer']`；
   - 真实 SOUL.md / MEMORY.md 植入。
2. **`agent-architect`（Agent 架构与脚手架设计伙伴）**：
   - 角色：负责 Agent 骨架生成、配置验证与运行时资产同步；
   - 状态：`'running'`（用于展示活跃状态与指示灯）；
   - 工具：`['Read', 'Write', 'Edit', 'Glob', 'Bash(mkdir -p ~/.multiagent-orchestration/partners/*)']`；
   - 技能：`['scaffold-partner', 'schema-validator', 'ast-tree-linter', 'symlink-resolver']`；
3. **`rea-partner`（REA 逆向分析伙伴）**：
   - 角色：二进制与协议安全审计专家；
   - 状态：`'idle'`；
   - 工具：`['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash(r2 *)', 'Bash(objdump *)', 'Bash(readelf *)', 'mcp__rea_bridge__*']`；严禁 `Bash(rm *)` 与 `Bash(git *)`；
   - 技能：`['elf-binary-audit', 'memory-trace-inspector', 'protocol-fuzzing', 'control-flow-graph']`。

---

## 4. 文件二：`apps/desktop/src/renderer/mock/mockGroupSessions.js`

### 4.1 字段规范与 JSDoc 契约

```javascript
/**
 * @typedef {Object} GroupMessage
 * @property {string} id - 消息唯一标识
 * @property {number} sequence - 时间线全局序号
 * @property {'message' | 'plan' | 'round-end' | 'notice' | 'plan-end'} kind - 消息类别
 * @property {'user' | 'bot' | 'system'} authorKind - 发送者类型
 * @property {string | null} authorBotId - 若为 Bot 则为 partner.id，否则为 null
 * @property {string} authorName - 发送者展示名称
 * @property {string} [authorRole] - 发送者角色
 * @property {string} [avatar] - 发送者头像图标标识
 * @property {string} [avatarColor] - 发送者颜色标记
 * @property {string} content - Markdown 正文内容
 * @property {string} createdAt - 格式化展示时间（如 '10:24:18'）
 * @property {number} timestamp - 毫秒时间戳
 * @property {{ all: boolean, botIds: string[] }} mentions - @点名伙伴列表
 * @property {string | null} [noticeCode] - 系统通知代号（如 'member-joined', 'workdir-updated'）
 * @property {string | null} [planId] - 关联的计划卡 ID
 * @property {string[]} [files] - 交接文件产物相对路径列表（如 ['docs/audit.md', 'scripts/run.sh']）
 * @property {{ messageId: string, authorName: string, textSnippet: string } | null} [quote] - 引用消息
 * @property {Array<{ id: string, name: string, category: string, size: number, url?: string }>} [attachments] - 附件列表
 */

/**
 * @typedef {Object} LiveStatus
 * @property {boolean} isRunning - 是否有 Agent 正在发言或执行
 * @property {string | null} activeSpeakerId - 正在发言的 partnerId
 * @property {string | null} speakerName - 正在发言的 partner 名称
 * @property {string | null} phase - 实时状态说明（如 '正在通过 r2 解析 ELF 头信息...'）
 * @property {number} elapsedSeconds - 持续秒数
 * @property {number} startedAt - 开始时间戳
 */

/**
 * @typedef {Object} MockGroupSession
 * @property {string} id - 群聊唯一标识
 * @property {string} name - 群聊名称
 * @property {string} leadPartnerId - 负责人 / 群主 ID（默认 'lead-orchestrator'）
 * @property {string} workdir - 群关联的工作目录绝对路径
 * @property {'auto' | 'sequential'} speakingMode - 发言模式
 * @property {'all' | 'mention'} replyMode - 回复模式
 * @property {string[]} memberIds - 群成员 partnerId 数组
 * @property {string | null} activePlanId - 当前群聊关联的活跃分工计划 ID
 * @property {LiveStatus} liveStatus - 实时状态条数据
 * @property {GroupMessage[]} messages - 消息列表（支持时间轴渲染、连续发言、计划卡嵌入）
 * @property {string} updatedAt - 最后更新时间
 */
```

### 4.2 对话流设计亮点

1. **真实多 Agent 协作工作流**：
   - 用户提出任务：“请对当前的协议解析模块进行安全审计并生成加固方案”；
   - `lead-orchestrator` 回应并拆解任务，输出一条 `kind: 'plan'` 的计划卡消息（嵌入 `planId: 'plan-001'`）；
   - `rea-partner` 启动审计，给出包含代码块与交接文件的技术报告（带有 `files: ['docs/security-audit.md', 'reports/elf-trace.json']`）；
   - `agent-architect` 承接交接文件，完成双平面沙箱策略更新与补丁设计；
   - `lead-orchestrator` 做全流程汇总；
   - 插入一条系统通知（`kind: 'notice', noticeCode: 'plan-step-completed'`）。
2. **支持连续发言与角色气泡**：相邻同发送者的消息可自动识别并合并头像。

---

## 5. 文件三：`apps/desktop/src/renderer/mock/mockPlanData.js`

### 5.1 字段规范与 JSDoc 契约（Cindy 风格 BotGroupPlan）

```javascript
/**
 * @typedef {Object} PlanStep
 * @property {number} index - 步骤序号（1-based，从 1 开始）
 * @property {string} title - 步骤名称/目标
 * @property {string} assigneeId - 负责伙伴 partnerId
 * @property {string} assigneeName - 负责伙伴展示名称
 * @property {'pending' | 'running' | 'done' | 'failed'} status - 步骤执行状态
 * @property {string} taskDescription - 具体任务指令与输入上下文
 * @property {string[]} outputFiles - 该步骤交接的文件列表
 * @property {string} [resultSummary] - 步骤完成后的执行结论总结
 * @property {string} [startedAt] - 步骤开始执行时间
 * @property {string} [completedAt] - 步骤完成时间
 * @property {number} [elapsedSeconds] - 执行耗时（秒）
 */

/**
 * @typedef {Object} MockPlan
 * @property {string} id - 计划唯一标识
 * @property {string} title - 计划标题
 * @property {string} organizerId - 发起/统筹者 partnerId
 * @property {string} organizerName - 发起者展示名称
 * @property {'proposed' | 'running' | 'waiting' | 'done' | 'stopped' | 'dismissed'} status - 计划全局状态
 * @property {number | null} currentStep - 当前正在进行或刚结束的步骤序号（1-based）
 * @property {string} workDir - 关联工作目录
 * @property {boolean} autoContinue - 是否在上一步完成后自动执行下一步
 * @property {boolean} canManage - 当前用户是否具备编辑/调优权限
 * @property {PlanStep[]} steps - 计划包含的所有步骤数组
 * @property {string} createdAt - 创建时间
 * @property {string} updatedAt - 更新时间
 */
```

### 5.2 状态组设计（覆盖全场景交互）

为了让前端各种状态无缝展示，提供 3 套完整 Mock 计划对象：
1. **`plan-running-01`（进行中计划，默认挂载到群聊）**：
   - 标题：“多Agent架构协议审计与双平面沙箱加固计划”；
   - 全局状态：`'running'`，`currentStep: 2`；
   - Step 1: `done`（负责人 `rea-partner`，产物 `['docs/audit/protocol-elf-analysis.md']`）；
   - Step 2: `running`（负责人 `agent-architect`，当前耗时 42s，产物 `['packages/runtime-assets/builtin-partners/manifest.json']`）；
   - Step 3: `pending`（负责人 `lead-orchestrator`，等待前序步骤交接）。
2. **`plan-proposed-02`（待开始提案，用于测试步骤编辑与换人）**：
   - 标题：“桌面端 IPC 通信协议基准性能压测方案”；
   - 全局状态：`'proposed'`，`currentStep: null`；
   - 步骤全为 `'pending'`，支持在 UI 上下拉切换负责人或点击“开始”按钮。
3. **`plan-done-03`（历史已归档计划，用于测试文件打开与复盘）**：
   - 标题：“Builtin-Partners 初始软链接与运行时资产初始化”；
   - 全局状态：`'done'`，步骤全部完成，产物均可交互。

---

## 6. 与前端各视图模块的集成对接指南

| 目标界面 / 抽屉组件 | 消费的 Mock 数据源 | 核心读取与交互字段 |
|---|---|---|
| **伙伴私聊页面** (`PartnerDirectChatView.jsx`) | `mockPartners`, `mockGroupSessions` | 根据选中的 `partnerId` 过滤出与该伙伴的 1:1 对话流；读取伙伴 `avatar`, `role`, `status`, `summaryForLead` |
| **群聊时间轴与气泡** (`BotGroupTimelineItem.jsx`) | `mockGroupSessions.messages` | 消息气泡根据 `authorKind` 与 `authorBotId` 渲染角色图标与徽标；检测 `kind === 'plan'` 触发内嵌计划卡；检测 `files` 渲染交接产物胶囊 |
| **分工计划卡** (`BotGroupPlanCard.jsx`) | `mockPlanData` | 根据 `planId` 关联读取；渲染 Step 状态图标（`CircleCheck`, `Sparkles`, `CircleDashed`）；展示负责人胶囊与产物文件标签；支持“继续”、“重试”或步骤换人操作 |
| **实时运行状态条** (`BotGroupLiveStatus.jsx`) | `mockGroupSessions.liveStatus` | 呼吸灯闪烁、当前活跃伙伴头像、实时执行耗时计时器、终止与干预按钮 |
| **输入框与@点名** (`BotGroupComposer.jsx`) | `mockGroupSessions.memberIds`, `mockPartners` | 键入 `@` 触发成员过滤下拉列表；回车点名并将 `@PartnerName` 插入文本；可快捷发起分工安排 |
| **伙伴配置抽屉** (`PartnerSettingsDrawer.jsx`) | `mockPartners` | `soulMd` / `memoryMd` 在文本编辑器中查看与编辑；`skills` 卡片列表及开关切换；`sandboxPaths` 双平面路径与工具黑白名单展示 |
| **群聊配置抽屉** (`GroupSettingsDrawer.jsx`) | `mockGroupSessions`, `mockPartners` | 群名称与工作目录编辑；成员增删与头像栈；群主/负责人切换；发言模式（Auto vs Sequential）与回复模式（All vs Mention）切换；危险区解散群聊 |

---

## 7. 代码原型文件结构准备

后续实施者（Implementer）可直接创建以下三个标准 JS 文件，无需任何第三方冗余依赖，完全兼容原生 React 19 + Vite 8 环境：
1. `apps/desktop/src/renderer/mock/mockPartners.js`
2. `apps/desktop/src/renderer/mock/mockGroupSessions.js`
3. `apps/desktop/src/renderer/mock/mockPlanData.js`
并在 `apps/desktop/src/renderer/mock/index.js` 中做统一导出。
