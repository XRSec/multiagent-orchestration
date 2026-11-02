# 公共抽屉基建与原子组件实现规范与架构分析

> **执行角色**: Teamwork Explorer (M1 Common Atoms Explorer)  
> **所属里程碑**: M1 基础 Mock 数据与公共原子组件  
> **关联目标**: 
> 1. `apps/desktop/src/renderer/components/common/SlideOverDrawer.jsx`
> 2. `apps/desktop/src/renderer/components/common/AvatarStack.jsx`
> 3. `apps/desktop/src/renderer/components/common/RoleStatusBadge.jsx`

---

## 1. 规范背景与设计哲学

在多 Agent 协同系统（Multi-Agent Orchestration Studio）中，用户界面需同时支持密集的会话交互（私聊与群聊）与深度的配置调整（SOUL/MEMORY 编写、双平面隔离沙箱、技能挂载、群规则设定）。为了兼顾沉浸式会话体验与上下文不中断的配置能力，我们采用 **Cindy 风格的滑出式抽屉基建与极简现代暗黑 UI 语系**。

### 1.1 核心设计哲学
- **无破坏上下文（Context Preservation）**：通过 448px 侧边抽屉展示配置，底层主视图（群聊/私聊消息流）保持可视，避免全页面刷新跳转导致认知断裂。
- **严密防误触拦截（Accidental Exit Guarding）**：配置抽屉包含 Markdown 文本编辑（SOUL.md / MEMORY.md），误触抽屉外或键盘无效按键不得销毁未保存内容。
- **底色描边物理层次（Surface-Outlined Stacking）**：放弃繁杂模糊阴影，严格沿用 Cindy 规范：头像重叠和浮动图层均使用与父容器底色同色的 `border-2 border-[var(--surface)]` 物理隔断。
- **高识别度状态心跳（Breathing Status Rhythm）**：针对 Agent 思考、执行、空闲、离线等状态，提供高质感的呼吸灯点与微光环。
- **单文件行数强合规（Script Standards）**：各原子组件定位为纯净受控组件（Pure / Controlled Atoms），单文件目标控制在 80~250 行，远低于 500 行预警与 600 行红线。

---

## 2. 原子组件 1：SlideOverDrawer (448px 侧边抽屉容器)

### 2.1 物理尺寸与视觉体系
- **文件路径**: `apps/desktop/src/renderer/components/common/SlideOverDrawer.jsx`
- **定位与层级**: 
  - 定位：`fixed inset-y-0 right-0 z-50 flex flex-col`。
  - 宽度：`w-full max-w-md`（即 Tailwind 的 `28rem` = `448px`）。在小屏幕时自适应为 100% 宽度。
  - 背景与边框：`bg-surface border-l border-border text-slate-100 shadow-2xl`（`--surface: #0f172a`, `--border: #334155`）。
- **遮罩层（Scrim / Overlay）**:
  - 全屏半透明遮罩：`fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity duration-300`。
  - 遮罩存在防止抽屉背后的可交互元素被误点击。

### 2.2 核心交互保护机制

#### (1) 点击遮罩防误触拦截 (`onPointerDownOutside` 机制)
- **痛点分析**: 用户在编辑 SOUL.md 或修改群配置参数时，鼠标经常在编辑器边缘或全屏移动，若点击遮罩直接关闭抽屉，将引发输入丢失。
- **实现规范**:
  - 提供 `closeOnOverlayClick` 属性，**默认值必须为 `false`**。
  - 遮罩层仅响应显式点击，若 `closeOnOverlayClick === false`，点击遮罩不执行 `onClose()`，并可触发抽屉本身的微弱轻弹反馈（如 `ring-1 ring-accent/30` 闪烁）。
  - 若 `closeOnOverlayClick === true`，触发关闭；但若传入了 `isDirty === true`（存在未保存修改），阻断关闭并触发二次确认弹窗。

#### (2) ESC 键与输入法 IME 组合保护 (IME Composition Guard)
- **痛点分析**: 中文/日文/韩文输入法在选词候选阶段（如搜狗、系统自带输入法打拼音中途）按 `Escape` 键，用户的意图是**清空拼音候选串**，而非关闭整个抽屉！浏览器默认事件如果直接捕获 `keydown (Escape)` 并关闭，会导致中文用户体验灾难。
- **实现规范**:
  - 监听抽屉窗口内的 `keydown` 事件：
    ```javascript
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        // 当处于输入法候选组合状态或 keyCode === 229 时，阻断关闭
        if (event.isComposing || event.keyCode === 229) {
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        onClose();
      }
    };
    ```
  - 支持快捷键只在 `open === true` 时挂载，卸载时及时移除。

#### (3) 滚动穿透锁定 (Body Scroll Lock)
- 当抽屉打开时，对 `document.body` 设置 `overflow: hidden`，抽屉关闭时还原，防止外部页面发生滚动抖动。

### 2.3 布局拓扑与插槽设计
```
+--------------------------------------------------------+
| Header: h-14 border-b border-border px-5              |
| [可选返回 ArrowLeft] [标题 Title] [标签 Badge]   [关闭 X] |
+--------------------------------------------------------+
| Body (flex-1 min-h-0 overflow-y-auto px-6 py-5)        |
|                                                        |
|  [自定义子内容 children: Tabs, Form, Editor, etc.]     |
|                                                        |
+--------------------------------------------------------+
| Footer: border-t border-border px-6 py-4 bg-surface/90  |
| [左侧辅助信息/提示]         [取消按钮] [主要操作按钮]   |
+--------------------------------------------------------+
```

### 2.4 Props API 接口契约
| 属性名 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `open` | `boolean` | `false` | 是否显示抽屉（受控状态） |
| `onClose` | `() => void` | `() => {}` | 关闭抽屉的回调函数 |
| `title` | `ReactNode` | `''` | 顶栏标题文本或节点 |
| `subtitle` | `string` | `null` | 顶栏副标题或轻量说明 |
| `headerExtra` | `ReactNode` | `null` | 标题栏右侧额外操作区（在关闭按钮左侧） |
| `showBackButton` | `boolean` | `false` | 是否显示返回箭头（用于二级子页面场景） |
| `onBack` | `() => void` | `null` | 点击返回按钮的回调 |
| `children` | `ReactNode` | - | 抽屉主体内容，自适应纵向滚动 |
| `footer` | `ReactNode` | `null` | 底部固定操作栏（若为空则不渲染 Footer） |
| `closeOnOverlayClick` | `boolean` | `false` | 点击遮罩是否触发关闭，防误触默认为 false |
| `widthClass` | `string` | `'max-w-md'` | 抽屉宽度类（默认 448px 即 max-w-md） |
| `contentClassName` | `string` | `''` | 自定义内容区附加类名 |

---

## 3. 原子组件 2：AvatarStack (成员头像水平叠放组件)

### 3.1 叠层与底色描边物理视觉规范
- **文件路径**: `apps/desktop/src/renderer/components/common/AvatarStack.jsx`
- **负边距水平叠层（Negative Margin Overlap）**:
  - 头像依次从左向右排列，后续头像叠在上一个头像上方。
  - 通过负外边距 `-ml-2`（`size="sm"`）或 `-ml-3`（`size="md"`）实现紧凑重叠。
- **底色描边隔断（Surface-Outlined Barrier）**:
  - Cindy 原生规范明确指出：每个叠放的头像必须具备与底色完全相同的边框：`border-2 border-[var(--surface)]`（在当前主题中即 `border-surface` 或 `border-[#0f172a]`）。
  - 这种边缘描边在深色主题下产生精确的负空间切角（Negative Cutout），赋予头像层次分明的物理剪裁感，无须任何脏灰阴影。

### 3.2 溢出折叠显示（Overflow Counter +N）
- **触发条件**: 当成员总数大于 `max` 时（例如 `members.length > max`），仅渲染前 `max` 个头像，并在最右侧附加一个 `+N` 的徽标。
- **`+N` 胶囊设计**:
  - 计算差值：`count = members.length - max`。
  - 外观样式：同样具有 `-ml-2 rounded-full border-2 border-surface bg-card text-slate-300 font-mono font-medium flex items-center justify-center select-none`。
  - 鼠标悬浮气泡：支持通过 `title` 或原生悬浮显示剩余成员名称列表。

### 3.3 尺寸规格阶梯（Size Matrix）
| 规格 | 容器尺寸 | 负边距 (`-ml`) | 文字尺寸 | 图标尺寸 |
|---|---|---|---|---|
| `xs` | `w-5 h-5` (20px) | `-ml-1.5` | `text-[10px]` | `size={10}` |
| `sm` (默认) | `w-7 h-7` (28px) | `-ml-2` | `text-xs` | `size={14}` |
| `md` | `w-9 h-9` (36px) | `-ml-2.5` | `text-sm` | `size={18}` |

### 3.4 伙伴头像多类型渲染与色彩散列（Hue Fallback）
- **头像数据来源**:
  1. `avatar` 为图片链接（`http://`、`data:image` 等）时，渲染 `<img src={avatar} className="w-full h-full object-cover rounded-full" />`。
  2. `avatar` 为 Lucide React 组件对象时，渲染该图标。
  3. `avatar` 为 Emoji 字符时，居中渲染该表情。
  4. 缺省降级：渲染伙伴名字首字母（Initial，如 `p.name.charAt(0).toUpperCase()`）。
- **底色散列计算（Deterministic Hue）**:
  - 依据伙伴名称或 ID 做字符 ASCII 求和散列，映射到 6 种预设暗调色谱中（Sky, Indigo, Emerald, Amber, Rose, Purple），保证无图伙伴每次渲染的色调一致且富有区分度。

### 3.5 Props API 接口契约
| 属性名 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `members` | `Array<Member>` | `[]` | 成员对象数组（需包含 `id`, `name`, 可选 `avatar`） |
| `max` | `number` | `4` | 最多显示的头像数量 |
| `size` | `'xs' \| 'sm' \| 'md'` | `'sm'` | 尺寸规格 |
| `className` | `string` | `''` | 容器外层自定义类名 |
| `showTooltip` | `boolean` | `true` | 是否在悬停时显示成员名称提示 |
| `onMemberClick` | `(member) => void` | `null` | 点击单个头像的回调 |

---

## 4. 原子组件 3：RoleStatusBadge (伙伴角色徽标与状态指示器)

### 4.1 双模职责与独立组合
- **文件路径**: `apps/desktop/src/renderer/components/common/RoleStatusBadge.jsx`
- 该组件需优雅覆盖三种视觉诉求：
  1. **纯状态点（StatusDot）**：仅渲染绿/橙/灰/红色的圆形状态点（伴随呼吸灯波纹）。
  2. **纯角色胶囊（RoleBadge）**：仅渲染 Leader、Reviewer、Worker 等角色的微型胶囊徽标。
  3. **完整组合徽标（RoleStatusBadge）**：左侧带有呼吸灯状态圆点，右侧为角色标签文本。

### 4.2 角色色谱映射体系（Role Palette）
| 角色类型 | 标准 Key | 显示文本 | 胶囊样式 | 视觉含义 |
|---|---|---|---|---|
| 主控/群主 | `leader` / `organizer` | 群主 / 调度主控 | `bg-sky-500/15 text-sky-400 border border-sky-500/30` | 核心掌控与统筹 |
| 审计/评审 | `reviewer` / `auditor` | 审计 / 评审 | `bg-indigo-500/15 text-indigo-300 border border-indigo-500/30` | 严密校验与把关 |
| 架构/执行 | `worker` / `architect` | 架构 / 执行伙伴 | `bg-emerald-500/15 text-emerald-400 border border-emerald-500/30` | 任务推进与交付 |
| 观察/通用 | `default` / `member` | 伙伴 | `bg-slate-800 text-slate-400 border border-slate-700` | 常规团队成员 |

### 4.3 在线与思考状态指示器（Status Indicator with Breathing Light）

#### (1) 四态指示器定义
1. **`idle` / `online` (在线空闲)**:
   - 颜色：稳定纯净翠绿（`bg-emerald-500`）。
   - 语义：就绪，等待下发任务。
2. **`thinking` / `running` / `busy` (思考中/执行中)**:
   - 颜色：**琥珀橙（`bg-amber-400`）伴随呼吸灯脉冲**。
   - 视觉效果：
     - 外层扩展波纹：`<span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />`。
     - 内核实体亮圈：`<span className="relative inline-flex rounded-full bg-amber-500" />`。
   - 语义：Agent 正在调用工具、LLM 思考或执行子进程。
3. **`offline` / `disabled` (离线/休眠)**:
   - 颜色：石板灰点（`bg-slate-500`）。
   - 语义：未唤起或子进程已终止。
4. **`error` / `failed` (异常中断)**:
   - 颜色：玫瑰红（`bg-rose-500`）。
   - 语义：超时、Tool 执行崩溃或权限被拒。

#### (2) 尺寸映射与无障碍支持
- 尺寸：
  - `sm`: 圆点直径 `h-2 w-2` (8px)，胶囊文本 `text-[10px]`
  - `md`: 圆点直径 `h-2.5 w-2.5` (10px)，胶囊文本 `text-xs`
- 无障碍：具备 `role="status"` 和 `aria-label={`状态: ${statusLabel}`}`。

### 4.4 Props API 接口契约
| 属性名 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `role` | `string` | `null` | 角色标识（leader / reviewer / worker / architect 等） |
| `status` | `'idle' \| 'thinking' \| 'running' \| 'offline' \| 'error'` | `null` | 运行状态 |
| `roleLabel` | `string` | `null` | 自定义角色显示文本（缺省使用默认字典） |
| `statusLabel` | `string` | `null` | 自定义状态文本提示 |
| `showStatusDot` | `boolean` | `true` | 是否显示状态呼吸灯圆点 |
| `showRoleLabel` | `boolean` | `true` | 是否显示角色文本 |
| `size` | `'sm' \| 'md'` | `'sm'` | 尺寸规格 |
| `className` | `string` | `''` | 附加类名 |

---

## 5. 实现代码设计蓝图（Code Blueprint）

为了保证后续负责编码的实施智能体能够准确、零歧义地落实规范，以下提供三大组件的标准实现代码蓝图。

### 5.1 `SlideOverDrawer.jsx` 结构蓝图
```jsx
import React, { useEffect, useRef } from 'react';
import { X, ArrowLeft } from 'lucide-react';

export default function SlideOverDrawer({
  open = false,
  onClose = () => {},
  title,
  subtitle,
  headerExtra,
  showBackButton = false,
  onBack,
  children,
  footer,
  closeOnOverlayClick = false,
  widthClass = 'max-w-md',
  contentClassName = '',
}) {
  const drawerRef = useRef(null);

  // 1. ESC 键 IME 组合保护
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (e.isComposing || e.keyCode === 229) {
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // 2. 页面背景滚动锁定
  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end select-none">
      {/* 遮罩：半透明 + 模糊 */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
        onPointerDown={(e) => {
          if (!closeOnOverlayClick) {
            e.preventDefault();
          } else {
            onClose();
          }
        }}
      />

      {/* 448px 侧边抽屉容器 */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        className={`relative z-50 flex h-full w-full ${widthClass} flex-col border-l border-border bg-surface text-slate-100 shadow-2xl transition-transform duration-300 ease-in-out`}
      >
        {/* 顶栏 Header */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-5 bg-surface/90">
          <div className="flex items-center gap-2.5 min-w-0">
            {showBackButton && (
              <button
                type="button"
                onClick={onBack}
                aria-label="返回上一页"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-card hover:text-slate-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100 truncate">
                {title}
              </h2>
              {subtitle && (
                <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭抽屉"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-card hover:text-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 滚动内容区 Body */}
        <div className={`flex-1 min-h-0 overflow-y-auto px-6 py-5 ${contentClassName}`}>
          {children}
        </div>

        {/* 底部操作插槽 Footer */}
        {footer && (
          <footer className="shrink-0 border-t border-border bg-surface/95 px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
```

### 5.2 `AvatarStack.jsx` 结构蓝图
```jsx
import React from 'react';
import { Bot, User } from 'lucide-react';

const HUE_BG_MAP = [
  'bg-sky-500/20 text-sky-400',
  'bg-indigo-500/20 text-indigo-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-amber-500/20 text-amber-400',
  'bg-purple-500/20 text-purple-400',
  'bg-rose-500/20 text-rose-400',
];

function getHueForName(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
  }
  return HUE_BG_MAP[Math.abs(hash) % HUE_BG_MAP.length];
}

export default function AvatarStack({
  members = [],
  max = 4,
  size = 'sm',
  className = '',
  showTooltip = true,
  onMemberClick,
}) {
  const sizeMap = {
    xs: { box: 'w-5 h-5 text-[10px]', overlap: '-ml-1.5', iconSize: 10 },
    sm: { box: 'w-7 h-7 text-xs', overlap: '-ml-2', iconSize: 14 },
    md: { box: 'w-9 h-9 text-sm', overlap: '-ml-2.5', iconSize: 18 },
  };

  const currentSize = sizeMap[size] || sizeMap.sm;
  const visible = members.slice(0, max);
  const overflowCount = members.length - max;

  return (
    <div className={`flex items-center shrink-0 ${className}`}>
      {visible.map((member, index) => {
        const isOverlap = index > 0;
        const hueStyle = getHueForName(member.name || member.id);

        return (
          <div
            key={member.id || index}
            onClick={() => onMemberClick?.(member)}
            title={showTooltip ? member.name : undefined}
            className={`relative flex items-center justify-center rounded-full border-2 border-surface ${currentSize.box} ${hueStyle} font-medium select-none cursor-pointer transition-transform hover:z-10 hover:scale-105 ${
              isOverlap ? currentSize.overlap : ''
            }`}
          >
            {member.avatarUrl ? (
              <img
                src={member.avatarUrl}
                alt={member.name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : typeof member.avatar === 'function' ? (
              <member.avatar size={currentSize.iconSize} />
            ) : member.avatar ? (
              <span>{member.avatar}</span>
            ) : (
              <span>{(member.name || 'A').charAt(0).toUpperCase()}</span>
            )}
          </div>
        );
      })}

      {overflowCount > 0 && (
        <div
          title={showTooltip ? `还有 ${overflowCount} 位成员` : undefined}
          className={`relative flex items-center justify-center rounded-full border-2 border-surface bg-card text-slate-400 font-mono font-semibold select-none ${currentSize.box} ${currentSize.overlap}`}
        >
          +{overflowCount}
        </div>
      )}
    </div>
  );
}
```

### 5.3 `RoleStatusBadge.jsx` 结构蓝图
```jsx
import React from 'react';

const ROLE_PRESETS = {
  leader: { label: '主控', badgeClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  organizer: { label: '群主', badgeClass: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  reviewer: { label: '审计', badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  auditor: { label: '安全审计', badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  worker: { label: '执行', badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  architect: { label: '架构', badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  default: { label: '伙伴', badgeClass: 'bg-slate-800 text-slate-400 border-slate-700' },
};

const STATUS_PRESETS = {
  idle: { label: '空闲', dotColor: 'bg-emerald-500', isBreathing: false },
  online: { label: '在线', dotColor: 'bg-emerald-500', isBreathing: false },
  thinking: { label: '思考中', dotColor: 'bg-amber-400', isBreathing: true },
  running: { label: '执行中', dotColor: 'bg-amber-400', isBreathing: true },
  busy: { label: '繁忙', dotColor: 'bg-amber-400', isBreathing: true },
  offline: { label: '离线', dotColor: 'bg-slate-500', isBreathing: false },
  error: { label: '异常', dotColor: 'bg-rose-500', isBreathing: false },
};

export default function RoleStatusBadge({
  role,
  status,
  roleLabel,
  statusLabel,
  showStatusDot = true,
  showRoleLabel = true,
  size = 'sm',
  className = '',
}) {
  const roleConfig = ROLE_PRESETS[role?.toLowerCase()] || ROLE_PRESETS.default;
  const statusConfig = STATUS_PRESETS[status?.toLowerCase()] || STATUS_PRESETS.idle;

  const displayRoleLabel = roleLabel || roleConfig.label;
  const displayStatusLabel = statusLabel || statusConfig.label;

  const dotSize = size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2';
  const textSize = size === 'md' ? 'text-xs px-2.5 py-0.5' : 'text-[10px] px-2 py-0.5';

  return (
    <span
      role="status"
      aria-label={`角色: ${displayRoleLabel}, 状态: ${displayStatusLabel}`}
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium select-none ${roleConfig.badgeClass} ${textSize} ${className}`}
    >
      {/* 状态呼吸灯圆点 */}
      {showStatusDot && (
        <span className={`relative flex ${dotSize} shrink-0`}>
          {statusConfig.isBreathing && (
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${statusConfig.dotColor} opacity-75 animate-ping`}
            />
          )}
          <span
            className={`relative inline-flex rounded-full ${dotSize} ${statusConfig.dotColor}`}
          />
        </span>
      )}

      {/* 角色或状态文本 */}
      {showRoleLabel && <span>{displayRoleLabel}</span>}
    </span>
  );
}
```

---

## 6. 与下游任务（M2、M3、M4）的协同与集成验证

1. **对 M2（私聊与群聊视图）的支撑**:
   - `RoleStatusBadge` 直接用于私聊顶栏伙伴卡、群聊时间轴发言人气泡头（展示 Leader / Worker / Reviewer 胶囊与实时 thinking 橙色呼吸灯）。
   - `AvatarStack` 直接用于群聊顶部 `SessionHeader.jsx` 中展示群成员头像重叠与 `+N`。
2. **对 M3（伙伴配置与群聊配置抽屉）的支撑**:
   - `SlideOverDrawer` 构成 `PartnerSettingsDrawer.jsx`（编辑 SOUL.md / MEMORY.md）和 `GroupSettingsDrawer.jsx`（群名称、发言模式切换）的外壳基建。
   - 利用 `closeOnOverlayClick={false}` 与 IME 保护确保用户编写长篇 Prompt 时不会因为点击或打字按 ESC 意外退出。
3. **行数与构建质量**:
   - 3 个组件的规范代码行数均在 120~180 行左右，完全在 `< 600 行` 规则内。
   - 依赖全原生 React 19 + Tailwind CSS + Lucide React，无须额外引入第三方大型 UI 库。
