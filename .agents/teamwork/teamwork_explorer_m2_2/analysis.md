# Cindy 风格分工计划卡与实时状态条实现规范与设计方案

## 1. 概述与架构使命

本调研与设计方案聚焦于 **Milestone 2（M2：伙伴私聊与群聊核心视图）** 中的两大关键多 Agent 协同交互组件：
1. **分工计划卡 (`BotGroupPlanCard.jsx`)**：复刻 Cindy `BotGroupPlan.tsx` 的静态编排契约，承载组织者身份、步骤状态变迁、执行人下拉分配、交接文件药丸列表、进度条与跟进行/完成线。
2. **实时状态条 (`BotGroupLiveStatus.jsx`)**：复刻 Cindy `BotGroupLiveStatus.tsx` 的动态运行时契约，实现 3 秒延迟就地展示（`BotGroupSpeakingLine`）向固定在输入框上方的浮动进度条（`BotGroupProgressStrip`）跃迁，融合 Thinking Orange 呼吸脉冲、动态秒级耗时计数器与一键「停止」中断交互。

两项组件严格遵循仓库《代码行数规范》（单文件 <= 600 行，500 行预警，预估设计目标 <= 280 行）。经精巧解耦与实现，两个组件行数分别为 **224 行** 与 **222 行**，远低于预警红线。

---

## 2. Cindy 协同设计精髓复刻与契约映射

### 2.1 分工计划卡 (`BotGroupPlanCard`)
Cindy 中计划卡是嵌入在时间轴的一条特殊消息（`kind: 'plan'`），同时随着群状态的推进就地更新。

| 模块 | Cindy 原型 (`BotGroupPlan.tsx`) | 本项目规范方案 (`BotGroupPlanCard.jsx`) |
|------|-----------------------------------|-----------------------------------|
| **负责人胶囊** | `BotGroupOrganizerTag` (行 62) | `<BotGroupOrganizerTag organizerName role />`：呈现 `Shield` 盾牌图标、"主控调度" 角色与伙伴名字，带有 `bg-sky-500/15 border-sky-500/30` 细描边。 |
| **步骤状态图标** | `StepLead` (行 72) | `<StepStatusIcon status index />`：待办显示圆形序号；`running` 呈现 `Sparkles` 橙色呼吸灯 (`animate-pulse` + `animate-ping`)；`done` 呈现 `CheckCircle2` 绿色勾选；`failed` 呈现 `AlertCircle` 红色警示；`canceled` 呈现 `CircleDashed` 虚线。 |
| **执行人改派** | `EditableStepRow` (行 175) | 未完成或待开始步骤支持 `<select>` 改派下拉菜单，支持在现有群成员间秒级换人。 |
| **步骤快捷操作** | 删除步骤 / 重试 | 步骤右侧支持一键重试（`RotateCw`）与删除（`Trash2`，至少保留 1 步）。 |
| **交接文件药丸** | `BotGroupHandoffFiles` (行 438) | `<BotGroupHandoffFiles files workDir onFileClick />`：提取文件名 basename，`FileText` 蓝色图标，支持悬停显示工作区全路径及点击联动。 |
| **完成度进度条** | 动态计算百分比 | 顶部 `completed / total` 统计与 `h-1` 渐变色进度条 (`bg-gradient-to-r from-sky-500 to-emerald-400`)。 |
| **跟进行与分割线** | `BotGroupPlanEndDivider` (行 491) | 全量完成展示 `<CheckCircle2 /> 共 N 步协同任务均已顺利完成` 居中分割线；进行中支持自动推进开关 (`autoContinue`) 与「继续执行下一步」操作。 |

### 2.2 实时状态条 (`BotGroupLiveStatus`)
Cindy 中对于发言与分工步骤执行，采用精妙的时间窗跃迁机制：

```
[Agent 开始发言/执行]
       │
       ▼
 [0 ~ 3000ms 初始阶段] ──> 在时间轴末尾就地展示 BotGroupSpeakingLine (轻量行，避免打扰)
       │
   (耗时 >= 3s OR 处于分工步骤执行中)
       │
       ▼
 [浮动条跃迁阶段] ────> 跃迁为固定在输入框上方的 BotGroupProgressStrip
                        ├─ Thinking Orange 呼吸脉冲 (Sparkles 橙色高频呼吸灯)
                        ├─ 动态已耗时计数器 (useElapsedTimer 每秒刷新)
                        ├─ 正在发言/执行的 Agent 头像与步骤标题
                        └─ 一键「停止」红色中止按钮 (带加载中态)
```

---

## 3. 详细设计方案：`BotGroupPlanCard.jsx`

### 3.1 数据模型（基于 `mockPlanData.js`）
```typescript
interface PlanStep {
  index: number;
  title: string;
  assigneeId: string;
  assigneeName: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  taskDescription?: string;
  outputFiles?: string[];
  resultSummary?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  elapsedSeconds?: number;
}

interface PlanData {
  id: string;
  title: string;
  organizerId: string;
  organizerName: string;
  status: 'proposed' | 'running' | 'done' | 'failed' | 'paused';
  currentStep?: number | null;
  workDir: string;
  autoContinue: boolean;
  canManage: boolean;
  steps: PlanStep[];
}
```

### 3.2 组件接口契约 (Props)
```typescript
interface BotGroupPlanCardProps {
  plan: PlanData;
  members?: Array<{ id: string; name: string; role?: string; avatar?: string }>;
  actionable?: boolean;              // 待启动时是否可点击「开始/放弃」
  reassignable?: boolean;            // 是否可下拉换人
  canManage?: boolean;               // 是否有管理权（删除步骤等）
  onStart?: () => void;              // 启动分工
  onDismiss?: () => void;            // 放弃/结束计划
  onStepAssigneeChange?: (stepIndex: number, newAssigneeId: string) => void;
  onStepRetry?: (stepIndex: number) => void;
  onStepDelete?: (stepIndex: number) => void;
  onContinue?: () => void;           // 继续下一步
  onAutoContinueToggle?: (checked: boolean) => void;
  onFileClick?: (filePath: string, workDir: string) => void;
  className?: string;
}
```

### 3.3 样式系统与视觉映射
- 卡片外框：`rounded-2xl border border-slate-700/80 bg-slate-900/90 shadow-lg`
- 执行中高亮：`bg-amber-500/5 border-amber-500/30`
- 完成态背景：`bg-slate-800/40 border-slate-700/40`
- 文件胶囊：`rounded-full bg-slate-800/90 border border-slate-700 hover:bg-slate-700`

---

## 4. 详细设计方案：`BotGroupLiveStatus.jsx`

### 4.1 数据模型与接口契约
```typescript
interface LiveSpeaker {
  memberId: string;
  displayName: string;
  activity: 'planning' | 'speaking' | 'step';
  startedAt: number;                  // 毫秒时间戳
  actionText?: string;                // 当前动作，如 "正在逆向分析 ELF 符号表..."
  avatar?: string;
}

interface BotGroupLiveStatusProps {
  speaker: LiveSpeaker | null;
  currentStep?: { index: number; title: string; total?: number } | null;
  onStop?: () => void;
  stopping?: boolean;
  forceFloating?: boolean;            // 强制固定为浮动条
  className?: string;
}
```

### 4.2 核心子组件拆解
1. `useElapsedTimer(startedAtMs, active)`：基于 `setInterval` 实现秒级动态耗时刷新，格式化输出 `mm:ss`。
2. `BotGroupSpeakingLine`：时间轴就地呈现组件，包含 24px 微头像、`Sparkles` 橙色呼吸灯、伙伴名字与当前简述。
3. `BotGroupProgressStrip`：浮动进度条，`max-w-3xl rounded-xl border border-amber-500/30 bg-slate-900/95 backdrop-blur-md`，包含已耗时动态计数器、一键「停止」按钮交互。
4. `BotGroupHeaderStatusText`：供顶栏复用的轻量文本指示器。
5. `BotGroupLiveStatus`：主容器门面，通过 `useEffect` 监听当前时间与 `speaker.startedAt`，3 秒内呈现 `SpeakingLine`，超时或进入步骤执行时自动跃迁为 `ProgressStrip`。

---

## 5. 代码行数与工程合规审计

| 组件文件 | 设计目标行数 | 实际落地行数 | 500 行预警比 | 600 行红线比 | 合规结论 |
|----------|-------------|-------------|-------------|-------------|----------|
| `BotGroupPlanCard.jsx` | <= 280 行 | **224 行** | 44.8% | 37.3% | **完全达标 (远低于警戒)** |
| `BotGroupLiveStatus.jsx` | <= 280 行 | **222 行** | 44.4% | 37.0% | **完全达标 (远低于警戒)** |

两者代码均采用自包含设计，依赖项仅限于 `react` 与 `lucide-react`，无任何隐式第三方耦合，可直接供 M2 群聊主视图 (`BotGroupChatView.jsx`) 与时间轴项 (`BotGroupTimelineItem.jsx`) 无缝引入调用。

---

## 6. 产物清单与文件映射

- 计划卡参考实现：`.agents/teamwork/teamwork_explorer_m2_2/proposed_BotGroupPlanCard.jsx` (224 行)
- 实时状态条参考实现：`.agents/teamwork/teamwork_explorer_m2_2/proposed_BotGroupLiveStatus.jsx` (222 行)
- 调研分析报告：`.agents/teamwork/teamwork_explorer_m2_2/analysis.md`
- 交付交接报告：`.agents/teamwork/teamwork_explorer_m2_2/handoff.md`
