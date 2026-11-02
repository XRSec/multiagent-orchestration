# Handoff Report: M1 公共抽屉基建与原子组件实现规范

## 1. Observation
1. **参考源工程与原型实现**：
   - `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupSettingsDrawer.tsx:91-99` 中明确定义了防误触与 IME 拦截：
     ```tsx
     <Dialog.Content
       onPointerDownOutside={(event) => event.preventDefault()}
       onEscapeKeyDown={(event) => {
         if (event.isComposing || event.keyCode === 229) event.preventDefault();
         else if (subpage) { event.preventDefault(); back(); }
       }}
       className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[var(--border-default)] bg-[var(--surface)] outline-none"
     ```
   - `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupAvatars.tsx:105-131`（`BotGroupAvatarStack`）实现了头像叠放：
     ```tsx
     <span className={cn('flex rounded-full border-2 border-[var(--surface)]', index > 0 && (size === 'xs' ? '-ml-2' : '-ml-3'))}>
       <BotAvatar bot={member} size={size} />
     </span>
     ```
   - `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupPlan.tsx:62-69`（`BotGroupOrganizerTag`）与 `BotGroupLiveStatus.tsx` 中定义了角色胶囊（`inline-flex select-none items-center rounded-full bg-[var(--surface-chip)] px-1.5 py-px text-11`）与思考橙色脉冲（Thinking Orange）。
2. **当前目标工程结构**：
   - `apps/desktop/index.html:10-28` 定义了暗色 Tailwind 主题：`background: '#090d16'`, `surface: '#0f172a'`, `card: '#1e293b'`, `border: '#334155'`, `accent: '#38bdf8'`。
   - `package.json:28-36` 确认前端基础依赖：`react: ^19.3.1`, `lucide-react: ^1.66.0`, `vite: ^8.3.5`。
   - `apps/desktop/src/renderer/components/common/` 当前尚未建立，需作为 M1 产出放置 `SlideOverDrawer.jsx`、`AvatarStack.jsx`、`RoleStatusBadge.jsx`。

## 2. Logic Chain
1. 基于 Observation 1，Cindy 的抽屉使用了 `w-full max-w-md`（448px）固定在右侧，并通过 `onPointerDownOutside` 阻止关闭，避免用户编辑 Markdown（SOUL.md / MEMORY.md）或配置时因点击遮罩丢失数据；同时通过 `event.isComposing || event.keyCode === 229` 阻断输入法候选时的 Escape 关闭。
2. 基于 Observation 2，当前项目采用 Tailwind 内联配置，`surface` 对应 `#0f172a`。Cindy 的头像叠层采用与表面同色的 `border-2 border-[var(--surface)]`（在当前项目为 `border-surface`）配合 `-ml-2` 实现高质感切割感，无需使用模糊阴影；结合需求中的溢出 `+N` 胶囊，可通过 `members.slice(0, max)` 与 `+{members.length - max}` 完美达成。
3. 基于 Observation 1 & 2，伙伴角色标签（Leader / Reviewer / Worker / Architect）与运行状态（idle 绿点、thinking 橙点呼吸灯、offline 灰点、error 红点）需要统一的视觉呈现，通过将角色色系与呼吸灯结合为 `RoleStatusBadge`，既可单独渲染圆点或角色，也可组合展示。
4. 归纳出三大原子组件的 Props 规范、事件拦截逻辑、CSS 类名方案及完整代码骨架，并撰写于 `analysis.md` 中。

## 3. Caveats
- 本次任务仅包含公共原子组件的分析与规范制定，不直接写入业务代码（后续由实现 Agent 落地）。
- 抽屉动画目前规范推荐使用原生 Tailwind CSS 的 `transition-transform duration-300` 或受控挂载，如后续需要更加复杂的弹簧物理动效（spring motion），可引入 Framer Motion 或轻量 CSS 关键帧。

## 4. Conclusion
公共原子组件规范已全量确立并沉淀在 `analysis.md`：
1. `SlideOverDrawer.jsx`：448px 抽屉、`bg-surface`、`closeOnOverlayClick=false` 防误触拦截、`isComposing` ESC 组合保护、Header/Body/Footer 插槽化结构。
2. `AvatarStack.jsx`：`-ml-2` 水平叠放、`border-2 border-surface` 底色描边物理切割、超过 `max` 截断并展示 `+N` 胶囊、多格式头像与色系散列降级。
3. `RoleStatusBadge.jsx`：涵盖 Leader/Reviewer/Worker 角色色彩方案，提供翠绿常亮、琥珀橙呼吸灯（`animate-ping`）、石板灰及红点的四态状态指示器。

## 5. Verification Method
1. **文档核验**：
   - 检查 `analysis.md` 是否包含三大组件的 Props API 表格、事件处理方案及实现蓝图代码。
2. **下游实现验收标准**：
   - 后续在创建 `apps/desktop/src/renderer/components/common/` 对应组件后，执行：
     ```bash
     pnpm typecheck
     ```
   - 验证单文件行数：
     ```bash
     wc -l apps/desktop/src/renderer/components/common/*.jsx
     ```
     确保每个文件行数在 80~250 行区间（严格 <= 600 行）。
   - 本地预览交互验收：在浏览器中打开抽屉，输入中文拼音候选时按 ESC 键，验证抽屉未被关闭；点击半透明遮罩，验证抽屉未被误触关闭。
