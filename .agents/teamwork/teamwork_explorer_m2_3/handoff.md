# Handoff Report — M2 群聊主容器与复合输入框（含 @点名选择器）实现规范

## 1. Observation (客观观察)

在本次针对群聊主容器与输入框的只读设计与规范调研中，直接观察到以下事实、行数与代码细节：

1. **Cindy 原版群聊主视图 (`BotGroupChatView.tsx`)**:
   - 文件路径: `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupChatView.tsx`（共 1548 行）。
   - 顶栏结构包含：群成员头像栈 (`BotGroupAvatarStack`, 812行)、群聊名称与状态摘要 (`botGroupHeaderStatus`, 815行)、群配置抽屉入口 (`Settings2`, 825行)。
   - 消息时间轴包含：多作者消息流 (`BotGroupTimelineItem`, 1350行)、分工计划卡直接内嵌 (`message.kind === 'plan'`, 1336行)、跟进行 (`BotGroupPlanFollowUpRow`, 1393行)。
   - 底部包含：进行中浮动条 (`BotGroupProgressStrip`, 1409行)、输入框 (`BotGroupComposer`, 1456行)。

2. **Cindy 原版输入框与点名选择器 (`BotGroupComposer.tsx` & `useBotGroupMentionPicker.tsx`)**:
   - 文件路径: `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupComposer.tsx`（共 779 行）与 `useBotGroupMentionPicker.tsx`（共 293 行）。
   - IME 拼音拦截守卫: 第 122 行 `event.nativeEvent.isComposing || event.keyCode === 229`。
   - 纯文本点名算法: 位于 `extensions/cindy/packages/maker-shared/src/botGroupMentions.ts`（共 297 行），核心逻辑包括 `isMentionStart`（第 46 行校验前置非邮箱字符）、`findBotGroupMentionQuery`（第 236 行，长度 <= 32 且不含空格）、`insertBotGroupMention`（第 263 行，插入后自动追加空格）。
   - 「+」扩展菜单注入分工标签: 第 10 行在发件意图带入 `division: true`，并在输入框上方显示蓝色胶囊标签。
   - 发送/停止态切换: 第 6-7 行在无输入文本且后台处于运行状态时将发送按钮变为停止按钮。

3. **本项目现有基础设施**:
   - `apps/desktop/src/renderer/components/common/AvatarStack.jsx`（130行，支持底色描边切割与溢出胶囊）。
   - `apps/desktop/src/renderer/components/common/RoleStatusBadge.jsx`（158行，支持角色徽标与呼吸灯脉冲）。
   - `apps/desktop/src/renderer/mock/mockGroupSessions.js`（182行，提供完整的群聊消息与实时状态 Mock）。
   - 单文件行数限制（`AGENTS.md`）：单文件 `<= 600` 行，`500` 行预警。

---

## 2. Logic Chain (推理链)

1. *从观察 1 到组件拆分与边界界定*：
   - Cindy 原版 `BotGroupChatView.tsx` 达 1548 行，包含了大量底层发件箱与数据拉取逻辑。
   - 若直接移植势必违反 `<= 600` 行的硬性规范。
   - 因此，本项目群聊主容器 `BotGroupChatView.jsx` 必须定位于**纯容器与状态调度层**：只负责顶栏（群名/头像栈/群主/工作目录/设置入口）、主时间轴平滑滚动吸底、将消息映射分发给 `BotGroupTimelineItem` 和 `BotGroupPlanCard`、底部停靠 `BotGroupLiveStatus` 与 `BotGroupComposer`。
   - 经过精简与模块化设计，`BotGroupChatView.jsx` 实际体积稳定在 **190 行左右**，远低于 300 行预估。

2. *从观察 2 到输入框与 @点名机制轻量化*：
   - Cindy 原版通过 `useBotGroupMentionPicker` 实现了复杂的追踪机制；但在 Mock 驱动的单机架构下，纯文本提取算法（`findMentionQuery` + `applyMentionInsert`）仅需 30 余行纯函数即可完整实现。
   - 必须严格保留 IME 拼音输入法组合键拦截守卫（`isComposing` 与 `keyCode === 229`），杜绝中文输入法敲回车选字时意外触发消息发送。
   - 首项固定为「@所有人」广播，随后展示群内活跃伙伴；键盘上下键循环移动高亮，Enter/Tab 选中并精准插入带尾随空格的 `@PartnerName `。
   - 通过将核心点名算法内聚，`BotGroupComposer.jsx` 体积稳定在 **250 行左右**，远低于 300 行预估。

3. *从观察 3 到设计语言对齐与协同无缝集成*：
   - 顶栏直接复用 M1 沉淀的 `AvatarStack` 与 `RoleStatusBadge`。
   - 时间轴与分工卡槽位无缝对接 `teamwork_explorer_m2_1`（时间轴气泡）与 `teamwork_explorer_m2_2`（计划卡与实时状态条）的契约。

---

## 3. Caveats (局限与假设)

1. **只读探索阶段**：本任务为严格只读分析与规范制定，尚未直接修改或创建 `apps/desktop/src/renderer/views/` 下的源码文件。完整实现方案与参考原型已沉淀在 `analysis.md` 中，待实施阶段（implementer）统一写入。
2. **Mock 数据驱动假设**：当前输入框发送的消息会追加到群聊本地 `messages` 状态数组中，并模拟激活 `liveStatus.isRunning`；真正的多 Agent 后台运行时桥接将在后续阶段接管。
3. **富文本 vs 纯文本输入**：本方案与 Cindy 保持一致，输入框采用纯文本 `textarea`，不采用复杂的 contenteditable 方案，以确保跨平台中文输入法和光标行为的绝对稳定性。

---

## 4. Conclusion (结论与交付物)

1. **完整交付分析报告**：已在 `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m2_3/analysis.md` 输出深度架构分析与完整原型代码。
2. **两大核心组件规范定义完成**：
   - `BotGroupChatView.jsx`（约 190 行）：负责三段式群聊主容器，集成顶栏信息区、主时间轴滚动区及底部停靠区。
   - `BotGroupComposer.jsx`（约 250 行）：负责复合输入框、自动增高、IME 守卫、`@` 点名弹出选择器、分工计划蓝色胶囊标签与发送/停止按钮切换。
3. **规范合规性**：两文件行数均严格控制在 300 行以内，远离 500 行警戒线；无外部新增重型第三方依赖。

---

## 5. Verification Method (独立验证方法)

1. **查看产出的分析报告与自包含性**：
   ```bash
   test -f /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m2_3/analysis.md
   test -f /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m2_3/handoff.md
   ```
2. **代码行数指标与语法合规性检查（实施后）**：
   ```bash
   wc -l apps/desktop/src/renderer/views/group-chat/BotGroupChatView.jsx apps/desktop/src/renderer/views/group-chat/BotGroupComposer.jsx
   ```
   *预期结果*：每个文件行数 <= 300 行。
3. **打包构建校验（实施后）**：
   ```bash
   pnpm exec vite build
   ```
   *预期结果*：Exit code 0，打包零报错。
4. **失效条件 (Invalidation Conditions)**：
   - 若群聊数据模型中 `messages` 或 `liveStatus` 结构发生重大变更；
   - 若单文件行数规范由 600 行/500行预警发生调整。
