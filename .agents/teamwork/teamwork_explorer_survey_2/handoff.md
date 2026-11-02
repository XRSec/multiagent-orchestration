# Handoff Report — Cindy Settings Drawer Survey

## 1. Observation
1. **参考源码路径与实现规模**:
   - `extensions/cindy/apps/desktop/src/renderer/features/bots/BotGroupSettingsDrawer.tsx`（行数：607 行）定义了群设置抽屉容器、本地群设置表单（`BotGroupSettingsBody`）、名称/成员/工作目录/发言模式编辑及删除确认。
   - `extensions/cindy/apps/desktop/src/renderer/features/bots/ChatGroupSettings.tsx`（行数：482 行）定义了共享群的多 Tab 架构（`settings` / `members`）、子页面路由（`groupSettingsPage`）、`SettingsSection` 卡片布局及 `ProjectFolder` 目录选择器。
   - `extensions/cindy/apps/desktop/src/renderer/features/bots/ChatGroupMembersTab.tsx`（行数：90 行）实现了成员搜索（`Search`）、角色权限调整、设为主持人/管理员及移出成员菜单（`MemberActions`）。
   - `extensions/cindy/apps/desktop/src/renderer/features/bots/ChatGroupSettingsRows.tsx`（行数：95 行）定义了桌面端精致的设置行规范：`SettingsSection`、`SettingsCard`、`SettingsRow`、内缩进 16px 分割线 `SETTINGS_DIVIDER`。
   - `extensions/cindy/apps/desktop/src/renderer/features/bots/BotSettingsDrawer.tsx`（行数：199 行）定义了伙伴配置抽屉外壳，支持 `Dialog.Root` 侧边滑出形态及路由参数控制。
   - `extensions/cindy/apps/desktop/src/renderer/features/bots/BotMemorySettings.tsx`（行数：740 行）定义了三态记忆管理（`list` / `detail` / `edit`），支持自动保存、离开拦截与外部冲突消解。
   - `extensions/cindy/apps/desktop/src/renderer/features/bots/BotCapabilitySettings.tsx`（行数：503 行）定义了技能分层管理（Core、System Skills、Learned Skills、Shared Tools/MCP）及前 4 项折叠机制（`FOLD = 4`）。
2. **当前目标工程现状**:
   - `apps/desktop/src/renderer/` 当前由 `App.jsx`、`PartnerStudio.jsx`、`SessionHeader.jsx`、`ChatTimeline.jsx` 等 12 个文件构成，现有会话头与侧边栏缺少唤起伙伴配置抽屉与群聊配置抽屉的入口按钮。
   - 仓库 `AGENTS.md` 规范第 `[1.3]` 条强制要求单文件行数 $\le 600$ 行，在 500 行触发模块解耦预警。Cindy 原版单文件（607行、740行、1144行）在当前仓库中直接落地会产生行数超标违规。

## 2. Logic Chain
- **Step 1 (基于 Observation 1)**: Cindy 的右侧滑出抽屉（`max-w-md`，`fixed inset-y-0 right-0 z-50`）配合遮罩点击不关闭（`onPointerDownOutside` 拦截）与 IME 按键过滤，保证了底层对话流可见性与表单编辑防丢字的极致安全性。
- **Step 2 (基于 Observation 1)**: 伙伴配置与群聊配置业务均具有高度模块化特征（伙伴配置包含 SOUL.md 人设、MEMORY.md 分类记忆、技能列表、双平面沙箱；群聊配置包含基础资料、发言模式、成员搜索/权限列表、工作目录、解散高危区）。
- **Step 3 (基于 Observation 2)**: 直接移植 Cindy 单体大组件将直接突破本仓库单文件 600 行的红线，必须按“通用抽屉容器基建 + 伙伴配置拆分子组件 + 群聊配置拆分子组件”三层拓扑进行彻底解耦。
- **Step 4 (推导至 Conclusion)**: 将两大抽屉拆分为 12 个专一职责子文件，单文件行数控制在 80~220 行区间内，既能 100% 还原 Cindy 的 UI 质感与交互细节，又能完美遵循仓库架构规范。

## 3. Caveats
- 调研范围限定在前端 Renderer 展现层与组件状态管理，不涉及 Electron 真实的底层文件落盘与 Node.js 进程 IPC（业务将基于 Mock 数据流转）。
- 假定现有项目支持 TailwindCSS 工具类及 Lucide React 图标（已在现有 `PartnerStudio.jsx` 与 `SessionHeader.jsx` 中验证存在）。

## 4. Conclusion
1. **抽屉交互与视觉标准确立**: 统一采用 Slide-over Drawer（宽 448px），遮罩防误触点击拦截，ESC IME 输入保护，窗口 `no-drag` 适配，以及基于 `SettingsRowSystem` 的统一暗色卡片视觉。
2. **伙伴配置结构确立**: 覆盖 SOUL.md 预览/编辑、MEMORY.md 检索与分级卡片、挂载技能与 MCP 折叠列表、双平面隔离沙箱（Runtime CWD vs Build-Time Plane）展示。
3. **群聊配置结构确立**: 覆盖群头像栈、名称编辑、发言模式/回复模式 SegmentedControl、工作目录 Picker、成员管理（搜索/负责人设置/移出校验）与二次确认解散区。
4. **解耦拆分方案确立**: 将两大抽屉划分为 `common/`、`partner-drawer/`、`group-drawer/`，12 个子组件全部保持在 $\le 220$ 行，保证工程规范完全合规。

## 5. Verification Method
- **文件检查**:
  - 检查分析报告：`cat /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_2/analysis.md`
  - 检查规范行数：未来落地时运行脚本统计 `apps/desktop/src/renderer/` 各文件行数均 $\le 600$。
- **工程校验**:
  - 运行 `pnpm typecheck`（或 `pnpm test`），确认项目无编译或类型错误。
