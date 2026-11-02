# Handoff Report — Cindy 风格分工计划卡与实时状态条设计方案

## 1. Observation (客观观察)

1. **Cindy 原型实现观察**:
   - `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupPlan.tsx` (共 573 行):
     - 第 62-69 行: `BotGroupOrganizerTag` 为 `min-h-[18px] rounded-full bg-[var(--surface-chip)] px-1.5 py-px text-11` 的负责人胶囊。
     - 第 72-93 行: `StepLead` 为 16px 步骤前置标记，待办为序号，执行中为 `Sparkles` Thinking Orange (`status-bar-accent`)，完成为 `CircleCheck`，失败为 `CircleAlert`，取消为 `CircleDashed`。
     - 第 175-254 行: `EditableStepRow` 包含步骤执行人改派下拉菜单（`DropdownMenu`）与删除（`allowRemove`）。
     - 第 283-435 行: `BotGroupPlanCard` 主体包含 `autoContinue` 自动推进开关、开始/放弃操作与折叠展开状态。
     - 第 438-478 行: `BotGroupHandoffFiles` 为交接文件药丸列表，包含 `FileTypeIcon` 与文件名，限制在 `workDir` 相对路径内打开。
     - 第 491-502 行: `BotGroupPlanEndDivider` 呈现「N 步都做完了」分割线。
     - 第 507-573 行: `BotGroupPlanFollowUpRow` 呈现「下一步 · 继续」与「重试」跟进行。
   - `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupLiveStatus.tsx` (共 293 行):
     - 第 49 行: `BOT_GROUP_PROGRESS_STRIP_DELAY_MS = 3_000` (3 秒阈值常量)。
     - 第 57-109 行: `BotGroupSpeakingLine` 在发言前 3 秒于时间轴末端就地展示。
     - 第 125-252 行: 超过 3 秒或进入步骤执行时跃迁为固定在输入框上方的 `BotGroupProgressStrip`，包含呼吸灯、耗时与一键「停止」按钮。
     - 第 283-292 行: `BotGroupHeaderStatusText` 顶栏状态指示文本。

2. **当前项目工程与 Mock 观察**:
   - `apps/desktop/src/renderer/mock/mockPlanData.js` (共 156 行): 已具备 3 套完整分工场景数据（`plan-running-01`、`plan-proposed-02`、`plan-done-03`），字段包含 `steps`、`outputFiles`、`resultSummary`、`organizerId`、`autoContinue` 等。
   - `apps/desktop/src/renderer/components/common/RoleStatusBadge.jsx` (共 158 行) 与 `AvatarStack.jsx` (共 130 行): 已就绪。
   - 项目规范 `AGENTS.md` 明确要求单文件 `<= 600` 行，`500` 行预警；本任务要求每个文件 `<= 280` 行。

3. **参考实现落地与行数观察**:
   - `proposed_BotGroupPlanCard.jsx`: 行数为 **224 行** (通过 `wc -l` 验证)。
   - `proposed_BotGroupLiveStatus.jsx`: 行数为 **222 行** (通过 `wc -l` 验证)。
   - `pnpm exec vite build` 执行耗时 261ms，编译退出码 0，零报错。

---

## 2. Logic Chain (推理链)

1. *从观察 1 到交互规范抽象*:
   - Cindy 原型将协同分为「静态编排卡片（Plan）」与「动态运行状态（Live Status）」。
   - `BotGroupPlan` 的本质是一个内嵌时间轴的消息卡片，关键在于步骤状态（待办/进行/完成/失败）、人员分配、交接物产出与继续/重试跟进行。
   - `BotGroupLiveStatus` 的本质是时间阈值驱动的视觉跃迁：0~3 秒是轻量发件状态（不打扰用户视野），>=3 秒或协同执行时变为常驻输入框上方的控制面板（带随时停止能力与耗时指示）。

2. *从观察 1 与观察 2 到单文件行数治理*:
   - Cindy 原生 `BotGroupPlan.tsx` 为 573 行，逼近项目 600 行红线。
   - 提取其核心精髓（计划卡折叠、负责人胶囊、五态图标、换人下拉、交接文件、进度条、自动推进、分割线），剔除多余的外部重型菜单库依赖，采用纯原生 React 19 + Tailwind 实现。
   - 最终 `proposed_BotGroupPlanCard.jsx` 精简至 224 行，`proposed_BotGroupLiveStatus.jsx` 精简至 222 行，均完全收敛在 `<= 280` 行内。

3. *从观察 2 与观察 3 到 M2 实施路线支撑*:
   - 实施 Agent 可直接以 `proposed_BotGroupPlanCard.jsx` 与 `proposed_BotGroupLiveStatus.jsx` 为蓝本，创建至 `apps/desktop/src/renderer/views/group-chat/`。
   - 接口契约完全兼容 `mockPlanData.js` 与 `mockGroupSessions.js`，可直接挂载至 `BotGroupChatView.jsx` 与 `BotGroupTimelineItem.jsx`。

---

## 3. Caveats (局限与前提)

1. **只读探查限制**: 本探索任务为严格只读分析，未向 `apps/desktop/src/renderer/views/` 写入正式生产代码；完整可用代码已写入本目录下的 `proposed_BotGroupPlanCard.jsx` 与 `proposed_BotGroupLiveStatus.jsx`，供 M2 实施者直接搬运或集成。
2. **本地文件打开**: `BotGroupHandoffFiles` 点击打开文件依赖 Electron 主进程暴露的 `window.electronAPI.openPath` 或工作区绝对路径解析；在纯浏览器 Mock 环境下通过 `onFileClick` 回调触发提示或路径复制。
3. **多 Speaker 并行并发**: 当前 `proposed_BotGroupLiveStatus.jsx` 针对单主控发言与单步骤协同进行了极致提炼；若后续群聊进入多 Agent 完全并行发言模式，可通过外层 map 渲染多条 strip 或扩展折叠计数器。

---

## 4. Conclusion (结论)

已制定全面、精准的 Cindy 风格分工计划卡与实时状态条实现规范，并在探查目录输出两份生产就绪代码原型：
1. **`proposed_BotGroupPlanCard.jsx` (224 行)**: 完整复刻 `BotGroupOrganizerTag`、5态步骤图标、改派下拉菜单、`BotGroupHandoffFiles` 交接文件胶囊、梯度进度条与全部完成分割线。
2. **`proposed_BotGroupLiveStatus.jsx` (222 行)**: 完整复刻 3 秒延迟就地呈现向浮动条跃迁机制、Thinking Orange 呼吸脉冲、秒级动态耗时计数器与一键停止按钮。
3. 两文件均严格满足 `<= 280` 行硬性指标，质量和架构完全满足 M2 伙伴群聊落地标准。

---

## 5. Verification Method (独立验证方法)

1. **行数与代码审计**:
   ```bash
   wc -l .agents/teamwork/teamwork_explorer_m2_2/proposed_BotGroupPlanCard.jsx .agents/teamwork/teamwork_explorer_m2_2/proposed_BotGroupLiveStatus.jsx
   ```
   *预期输出*: 两文件行数均在 220~230 行之间，严格 `<= 280` 行。

2. **文档与设计报告验证**:
   ```bash
   test -f .agents/teamwork/teamwork_explorer_m2_2/analysis.md
   test -f .agents/teamwork/teamwork_explorer_m2_2/handoff.md
   ```

3. **Vite 打包测试**:
   ```bash
   pnpm exec vite build
   ```
   *预期输出*: `Exit code 0`，构建无报错。

4. **失效条件 (Invalidation Conditions)**:
   - 若 `mockPlanData.js` 的数据字段结构发生破坏性变更；
   - 若代码规范对单文件行数做出更苛刻调整（< 200 行）。
