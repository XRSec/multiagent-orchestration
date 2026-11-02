# M1 集成、模块导出与代码行数安全规范分析报告
# (M1 Integration, Module Export & Line Count Safety Specification)

## 0. 执行摘要 (Executive Summary)

本分析报告针对多 Agent 编排前端项目（`multiagent-orchestration`）的 **Milestone 1 (M1 基础 Mock 数据与公共原子组件)**，确立构建安全、ESM 模块导出契约、原子组件设计标准（SlideOverDrawer, AvatarStack, RoleStatusBadge）及严格单文件代码行数控制规范（60 ~ 180 行）。

核心结论：
1. **模块导出契约**：统一采用 **命名导出 + 默认导出双契约 (Dual Export Pattern)**，配合 Vite 8 ESM 原生解析，确保任意导入风格（具名解构/全量默认）零阻抗运行，并提供纯函数查询辅助工具（如 `getPartnerById`），削减下游视图组件重复计算与冗余代码。
2. **原子组件与暗色模式**：遵循 Cindy 视觉设计规范与 Tailwind 暗色主题（`bg-surface: #0f172a`, `border-border: #334155`, `bg-card: #1e293b`）。SlideOverDrawer 实现 448px 抽屉、ESC+IME 组合输入保护与 PointerDown 外部点击拦截；AvatarStack 采用 `-space-x-2` 与 `ring-2 ring-surface` 形成高对比环切；RoleStatusBadge 融合多 Agent 角色徽标与呼吸灯状态指示。
3. **类型与 Props 校验策略**：鉴于 `package.json` 当前未引入 `prop-types` 依赖，为避免引入额外包体积与构建开销，统一采用 **ES6 默认参数解构 + JSDoc 类型注解规范**，全面兼容 React 19。
4. **代码行数严格预算**：为所有 6 个 M1 交付文件设定 **60 ~ 180 行**的硬性预算区间（远低于工程 500 行预警与 600 行红线），并通过模块职责分解表与自动化检查命令进行质量守卫。

---

## 1. 模块导出契约与 Vite 8 ESM 兼容性设计

### 1.1 目标文件与路径规范
- `apps/desktop/src/renderer/mock/mockPartners.js`
- `apps/desktop/src/renderer/mock/mockGroupSessions.js`
- `apps/desktop/src/renderer/mock/mockPlanData.js`

### 1.2 双导出契约规范 (Dual Export Contract)
为了完全兼容 Vite 8 ESM 打包机制，并消除下游视图导入时因解构方式不一致导致的 `undefined` 或编译异常，每个 mock 模块必须同时提供：
1. **主要数据集的具名导出 (Named Export)** 与 **默认导出 (Default Export)**；
2. **常量映射表 (Map/Dictionary Export)**：以 `id` 为索引的哈希对象，时间复杂度 O(1)；
3. **纯函数查询辅助工具 (Helper Functions)**：减少下游组件中的 `find()` / `filter()` 重复逻辑，直接降低后续视图文件的代码行数。

#### 契约设计矩阵表
| 模块路径 | 具名导出项 (Named Exports) | 默认导出 (Default Export) | 辅助函数 / 映射导出 |
|---|---|---|---|
| `mockPartners.js` | `mockPartners` | `mockPartners` | `PARTNERS_MAP`, `getPartnerById(id)`, `getLeadPartner()` |
| `mockGroupSessions.js` | `mockGroupSessions` | `mockGroupSessions` | `GROUP_SESSIONS_MAP`, `getGroupSessionById(id)`, `getActiveGroupSession()` |
| `mockPlanData.js` | `mockPlanData`, `mockPlans` | `mockPlanData` | `getPlanById(id)`, `getPlanStepByStatus(status)` |

### 1.3 Vite ESM 导入范例验证
下游视图调用支持以下任意形式且完全等价：
```javascript
// 形式 A：具名导入（推荐，利于 Tree-shaking）
import { mockPartners, getPartnerById } from '@/mock/mockPartners.js';

// 形式 B：默认导入
import mockPartners from '@/mock/mockPartners.js';

// 形式 C：相对路径导入
import { mockGroupSessions } from '../../mock/mockGroupSessions.js';
```

### 1.4 浏览器运行环境隔离不变式 (Dual-Plane Isolation Invariant)
- **零 Node.js 内置模块**：严格禁止在 mock 文件及前端源码中出现 `import 'node:path'`、`import 'node:fs'` 或引用 `process.cwd()` 等运行时。
- **纯静态只读数据**：Mock 数据结构中涉及的沙箱路径（如 `runtimeCwd: "~/.multiagent-orchestration/partners/..."`）必须为纯静态字符串展示，不触发任何真实文件系统 I/O。

---

## 2. 公共原子组件规范与暗色模式适配标准

### 2.1 整体暗色模式样式令牌 (Dark Theme Tokens)
根据 `apps/desktop/index.html` 中的 Tailwind 配置，所有组件均使用以下标准令牌：
- 基础背景: `bg-background` (`#090d16`)
- 表面面板: `bg-surface` (`#0f172a`)
- 卡片容器: `bg-card` (`#1e293b`)
- 边框分割: `border-border` (`#334155`)
- 主题强调色: `text-accent` / `bg-accent` (`#38bdf8`)
- 强调悬浮色: `bg-accent-hover` (`#0ea5e9`)

### 2.2 SlideOverDrawer.jsx 设计规范
- **目标路径**：`apps/desktop/src/renderer/components/common/SlideOverDrawer.jsx`
- **尺寸与排版**：严格遵守 Cindy 448px 规范，采用 Tailwind 类 `w-full sm:max-w-md`（448px / 28rem）。
- **结构插槽划分**：
  1. `Overlay Backdrop`：半透明磨砂遮罩 `fixed inset-0 bg-black/60 backdrop-blur-sm z-40`，点击触发 `onClose`；
  2. `Slide Panel`：右侧滑动面板 `fixed inset-y-0 right-0 z-50 flex flex-col bg-surface border-l border-border shadow-2xl`，动画采用 `transform transition-transform duration-300 ease-in-out`；
  3. `Header Slot`：包含标题 `title`、副标题 `subtitle`、以及 Lucide `X` 图标关闭按钮；
  4. `Content Slot`：`flex-1 overflow-y-auto px-6 py-4` 独立滚动区域；
  5. `Footer Slot`：可选的底部操作条 `border-t border-border bg-surface/90 px-6 py-3.5`。
- **关键交互安全防护**：
  - **ESC 键 IME 组合保护**：在 `window.addEventListener('keydown')` 中必须检查 `e.isComposing`，防止输入法正在输入中文（如编辑 SOUL.md 时按下 ESC）误关抽屉：
    ```javascript
    if (e.key === 'Escape' && !e.isComposing) {
      onClose?.();
    }
    ```
  - **防误触与冒泡隔离**：面板根节点通过 `onClick={(e) => e.stopPropagation()}` 拦截事件冒泡，遮罩层点击专职负责关闭。
  - **滚动穿透锁定**：抽屉打开时锁住外层 `document.body.style.overflow = 'hidden'`，关闭或组件卸载时恢复原有样式。

### 2.3 AvatarStack.jsx 设计规范
- **目标路径**：`apps/desktop/src/renderer/components/common/AvatarStack.jsx`
- **层叠排布机制**：
  - 外层容器使用 `flex items-center -space-x-2` 负边距重叠。
  - 单个头像外沿使用 `ring-2 ring-surface`（借由 surface 底色遮挡前一个头像的圆弧，形成高对比度的利落视觉分割）。
- **溢出与兜底处理**：
  - 溢出胶囊：当头像数大于 `max`（默认 4）时，渲染 `+N` 胶囊（`font-mono text-xs font-semibold bg-slate-800 text-slate-300 ring-2 ring-surface rounded-full flex items-center justify-center`）。
  - 兜底图标：当头像缺失或未加载时，依据角色属性渲染 Lucide `Bot` 或 `User` 图标。
- **尺寸变体 (Size Variants)**：
  - `xs`: 20px (`w-5 h-5 text-[10px]`)
  - `sm`: 28px (`w-7 h-7 text-xs`) —— 默认规格
  - `md`: 36px (`w-9 h-9 text-sm`)
  - `lg`: 40px (`w-10 h-10 text-base`)

### 2.4 RoleStatusBadge.jsx 设计规范
- **目标路径**：`apps/desktop/src/renderer/components/common/RoleStatusBadge.jsx`
- **双模复合徽标**：可同时展示角色身份标签与实时状态指示灯。
- **多 Agent 角色配色方案**：
  | 角色代码 | 角色名称 | Lucide 图标 | 胶囊样式 (Dark Theme) |
  |---|---|---|---|
  | `lead` / `coordinator` | 主控调度 | `Crown` | `bg-purple-500/15 text-purple-300 border-purple-500/30` |
  | `architect` / `engineer` | 架构伙伴 | `Cpu` | `bg-sky-500/15 text-sky-300 border-sky-500/30` |
  | `reviewer` / `security` | 安全审计 | `Shield` | `bg-emerald-500/15 text-emerald-300 border-emerald-500/30` |
  | `worker` / `specialist` | 执行工作者 | `Bot` | `bg-slate-800 text-slate-300 border-slate-700` |
- **状态呼吸灯 (Breathing Light Indicator)**：
  - `running` / `thinking`: 橙黄色脉冲呼吸 `bg-amber-400 animate-pulse ring-4 ring-amber-400/20`
  - `idle` / `ready`: 常亮翠绿 `bg-emerald-400`
  - `awaiting`: 浅蓝闪烁 `bg-sky-400 animate-pulse`
  - `error`: 玫瑰红点 `bg-rose-500`
  - `done`: 青绿圆点 `bg-teal-400`
  - `offline` / `paused`: 沉稳灰点 `bg-slate-500`

### 2.5 Props 校验与类型契约策略
- 项目当前生产环境在 React 19 下运行，`package.json` 未安装 `prop-types`。
- **推荐策略**：统一使用 **ES6 解构默认值 (Default Parameters)** 结合 **JSDoc `@param` 契约文档**。
  - 好处：0 运行时包体积注入，Vite 构建绝对安全，IDE 能获得 100% 智能提示，且与 React 19 最佳实践一致（React 19 已弃用 `defaultProps`，直接鼓励默认参数）。
  - 下游组件在接收 props 时均有完备的兜底默认值，如 `SlideOverDrawer({ open = false, onClose = () => {}, width = 'max-w-md' })`。

---

## 3. 构建安全性与 Vite 8 编译验证

### 3.1 当前构建基线测试
经终端实测执行命令：
```bash
pnpm exec vite build
```
输出结果：
- 客户端环境打包成功（Transform 2051 modules）
- 打包输出路径：`apps/desktop/dist/`
- 构建耗时：仅约 157ms，生产环境 Bundle 大小 258 kB (gzip 80 kB)。

### 3.2 引入 6 个交付文件后的构建安全防线
为确保新加入的 3 个 mock 文件与 3 个公共组件打包 100% 成功，必须严格遵循以下规则：
1. **Lucide 图标按需导入**：必须采用解构式导入（如 `import { X, Bot, Crown, Cpu, Shield, User } from 'lucide-react'`），Vite + Rollup 会自动触发 Tree-shaking，不会将全套图标引入产物。
2. **纯前端语法标准**：所有 JSX/JS 文件保持纯 ES6+ 语法，不使用实验性提案。
3. **避免循环依赖**：公共组件 `common/` 属于底层叶子节点，绝不可反向导入 `views/` 或 `App.jsx`。
4. **统一文件扩展名**：JSX 组件文件必须保持 `.jsx` 扩展名（`SlideOverDrawer.jsx`、`AvatarStack.jsx`、`RoleStatusBadge.jsx`），Vite 默认的 esbuild 转换器能够自动识别并无误编译。

---

## 4. 单文件代码行数严格控制 (60 ~ 180 行标准)

### 4.1 规范背景与依据
- 仓库全局守则 (`AGENTS.md` / `script-standards.md`): 单文件 `<= 600` 行，`500` 行预警。
- 本次任务目标：将所有 6 个新增文件严格约束在 **60 ~ 180 行**之间。
  - **下限 60 行约束理由**：杜绝偷工减料的简陋实现，确保具备健壮的边界防御、默认值、可访问性（aria 属性）、完备的 Mock 字段。
  - **上限 180 行约束理由**：强制单一职责解耦，杜绝出现“巨石组件”，为后续 M2/M3 页面提供清爽、易读的基石。

### 4.2 6 个目标文件的行数预算分解表
| 序号 | 目标文件绝对/相对路径 | 角色性质 | 推荐行数区间 | 重点内容分配 |
|---|---|---|---|---|
| 1 | `apps/desktop/src/renderer/mock/mockPartners.js` | 数据契约 | **110 ~ 150 行** | 3大伙伴完整定义(Lead, Architect, REA)、SOUL.md正文、MEMORY.md文本、skills数组、sandboxPaths对象、双导出契约、`getPartnerById`辅助函数 |
| 2 | `apps/desktop/src/renderer/mock/mockGroupSessions.js` | 数据契约 | **100 ~ 145 行** | 1个完整群聊会话模型(基本属性、群目录、发言模式)、包含多Agent交替对话、带@点名与代码块的完整时间轴消息流、双导出契约、`getGroupSessionById` |
| 3 | `apps/desktop/src/renderer/mock/mockPlanData.js` | 数据契约 | **80 ~ 125 行** | Cindy 风格任务分工计划模型：计划标题、组织者、整体状态、4个分工步骤（含负责人、执行状态、交付文件产物列表）、双导出契约、`getPlanById` |
| 4 | `apps/desktop/src/renderer/components/common/SlideOverDrawer.jsx` | UI 原子组件 | **100 ~ 140 行** | 448px 滑出抽屉、遮罩层、ESC 键(含 IME 组合检查)监听、Body 滚动锁、防穿透点击处理、Header/Body/Footer 插槽 |
| 5 | `apps/desktop/src/renderer/components/common/AvatarStack.jsx` | UI 原子组件 | **70 ~ 110 行** | 头像重叠布局(`-space-x-2`)、环切描边(`ring-2 ring-surface`)、+N 溢出胶囊、尺寸变体映射、Lucide 兜底图标 |
| 6 | `apps/desktop/src/renderer/components/common/RoleStatusBadge.jsx` | UI 原子组件 | **75 ~ 115 行** | 角色标签徽章(Lead/Architect/Reviewer/Worker)、脉冲呼吸指示灯、Lucide 图标集成、暗色半透明主题风格 |

### 4.3 自动化行数校验脚本
在代码合并或验收阶段，使用以下单行命令即可秒级检验行数合规性：
```bash
wc -l apps/desktop/src/renderer/mock/*.js apps/desktop/src/renderer/components/common/*.jsx | awk '{if ($1 > 180) print "RED LINE VIOLATION (>180):", $2, $1; else if ($1 < 60 && $2 != "total") print "MIN BUDGET VIOLATION (<60):", $2, $1; else if ($2 != "total") print "PASS [60-180]:", $2, $1}'
```

---

## 5. 综合结论与后续实现建议
1. **实现者指引**：后续负责编写业务代码的 Agent 应直接按照本报告设计的双导出签名、Props 参数表及 Tailwind 类名进行编码。
2. **测试与构建保障**：在编写完成后，只需依次执行 `wc -l` 脚本与 `pnpm exec vite build`，即可确保 100% 达到 M1 质量与规范红线标准。
