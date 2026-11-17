# Paseo 主输入框 Bot 切换器与轻量交互体验可行性调研报告

**调研人**：MoDeep (`bot-modeep`) · 深度技术侦察分析师  
**发起人**：moAdmin (`bot-moadmin`)  
**日期**：2026-11-16  
**密级/状态**：Verified Facts / Architecture Scouting

---

## 1. 核心背景与用户诉求剖析

用户反馈当前 Paseo 客户端与 `paseo-bots` 交互存在显著割裂感：
> “我觉得在助手的页面发消息太蠢了，能不能额外再 正常对话的输入框上显示一个 Bot 按钮，默认为 null ，当你点击打开的时候 可以选择伙伴 私聊？team work 聊，还是当前目录聊，消息发送成功后就跳转到对应的对话页面，要是能做悬浮窗就好了，助手页面的 聊天真的太蠢了”

### 诉求拆解与认知映射
1. **“助手的页面发消息太蠢了”**：当前 `paseo-bots` 将所有功能组织在独立的全屏 Surface（`BotsSurface`）中，用户在编辑代码、查看工作区时，若想与某个 Bot 对话，必须点击左侧边栏导航离开当前项目进入全屏助手页，割裂了正在进行的工作区上下文与代码阅读。
2. **“正常对话的输入框上显示一个 Bot 按钮（默认为 null）”**：在普通 Workspace 的主输入框（Composer）上放置一个 Bot 切换器（Pill / 按钮）。
3. **“点击打开选择伙伴：私聊 / Team work 聊 / 当前目录聊”**：通过弹层（Popover / Menu）支持三种路由与上下文策略：
   - **私聊 (Direct Bot)**：指定单个智能体（如 moCode、moAdmin、REA）。
   - **团队协同 (Team Work)**：指定编排团队或多智能体房间。
   - **当前目录聊 (Current Workspace Directory)**：将 Bot 的工作路径绑定为宿主当前正在打开的工程目录（而非 Bot 的独立隔离家目录 `shared/Bots/<bot-id>`）。
4. **“消息发送成功后跳转到对应的对话页面”**：创建并发送后，客户端视图无缝切换到新生成的 Agent 对话。
5. **“做成悬浮窗就好了”**：无需全屏切页，支持轻量悬浮交互或侧边抽屉。

---

## 2. 代码库与宿主架构现状勘察

### 2.1 仓库边界：插件与宿主的分离
- **仓库定位**：当前代码库 `multiagent-orchestration` **不包含 Paseo 客户端（宿主）核心源码**。
  - Git 拓扑验证：在历史提交 `ea552b1896`（`chore(paseo): replace upstream monorepo with paseo-bots, paseo-agy-acp, and docs`）中，本仓库移除了上游 upstream monorepo 代码，正式转型为独立的多智能体编排与 Paseo 插件套件。
  - 核心子模块：
    - `paseo-bots/`：Paseo Bots 插件本体（前端 React Native Web，后端 Node 服务）。
    - `paseo-agy-acp/`：Antigravity ACP 协议适配插件。
    - `paseo-sidecar/`：SidecarMCP 控制面。
- **宿主运行时**：运行中的 Paseo 客户端位于 macOS 本地系统应用 `/Applications/Paseo.app`，其架构为：
  - 基于 **Electron + React Native for Web (Expo Web)** 构建。
  - 前端编译资源打包于 `/Applications/Paseo.app/Contents/Resources/app-dist/_expo/static/js/web/index-*.js`。
  - 插件通过 `@getpaseo/plugin` SDK 注入客户端。

### 2.2 关键组件物理坐标
| 交互区域 | 归属主体 | 源码 / 生产包坐标 | 说明 |
|---|---|---|---|
| **助手主页面 (Bots View)** | `paseo-bots` 插件 | `paseo-bots/client/BotsSurface.tsx` | 通过 `client.addSurface("bots", BotsSurface)` 注册的全屏独立 Surface，含 `BotSidebar.tsx`、`ChatPane.tsx`、`Composer.tsx`。 |
| **正常对话输入框 (Workspace Composer)** | Paseo 宿主核心 | `packages/app/src/composer/index.tsx`<br>（编译产物位于 `app-dist/_expo/...` 模块 5503 `ComposerTrackBar`） | Paseo 核心的输入控制台，位于每个工作区 / Agent 会话底部。 |
| **输入框顶部控件槽 (Composer Track Bar)** | Paseo 宿主核心 | 模块 5503：`ComposerTrackBar` | 原生包含了子智能体轨道 (`SubagentsTrack`)、工作区 Diff 统计 (`WorkspaceDiffStatPill`)，以及**专门留给插件的 `PluginComposerPills` 容器**！ |

---

## 3. Paseo 扩展机制与能力边界深度验证

通过对 `@getpaseo/plugin` SDK 合同和 `/Applications/Paseo.app` 生产包反编译逆向分析，得出以下能力边界结论：

### 3.1 输入框自定义 UI 注入能力：原生支持 `addComposerPill`
Paseo 客户端在设计之初就已经开放了输入框扩展槽位！
- **API 签名**：
  ```ts
  client.addComposerPill(contribution: PluginComposerPillContribution): PluginButtonRegistration;
  ```
- **参数结构**：
  ```ts
  interface PluginComposerPillContribution {
    id: string;
    workspaceId: string;
    agentId: string;
    button: PluginButton;
  }
  interface PluginButton {
    title: string;
    label?: string;
    icon: PluginButtonIcon;
    visible?: boolean;
    disabled?: boolean;
    behavior: PluginButtonBehavior;
  }
  ```
- **宿主挂载机制**：
  宿主模块 5503 中，`ComposerTrackBar` 明确渲染：
  ```tsx
  <PluginComposerPills serverId={serverId} workspaceId={workspaceId} agentId={agentId} compact={compact} />
  ```
  该容器通过 `buttonMatches` 过滤出当前 `workspaceId` 和 `agentId` 注册的 Pill 按钮，外观为带有边框、圆角、图标、文字与 Chevron 的胶囊按钮，**完全位于输入框上方工具栏**！
- **交互行为（`behavior`）**：
  - `kind: "action"`：点击直接触发回调。
  - `kind: "menu"`：点击弹出下拉菜单（支持两级级联、分割线）。
  - `kind: "popover"`：点击弹出自定义浮层，参数传入 `Content: ComponentType<PluginButtonContentProps>`。浮层自带 `close()` 回调与宿主主题适配！

### 3.2 悬浮窗 / 弹层能力边界
1. **输入框 Popover（局部悬浮层）**：
   - **完全原生支持**。在 `addComposerPill` 的 `popover` 行为中，宿主使用浮动面板与 Portal 机制，将浮层锚定在 Pill 上方（朝上展开 `ChevronUp`），支持包含复杂表单、单选框、下拉选择器等。
2. **侧边栏 Popover（Sidebar Popover）**：
   - SDK 0.15+ 支持 `addSidebarHeaderItem` / `addSidebarFooterItem`，在宽屏下点击左侧图标可打开锚定浮层（`openPopover`），无需全屏切换 Surface。
3. **工作区右侧伴侣面板 (Workspace Panel / Agent Panel)**：
   - **完全原生支持**：通过 `client.addWorkspacePanel` 或 `client.addAgentPanel`，可以在工作区右侧打开一个独立 Panel（如侧边抽屉），可与代码编辑器并排展示，支持通过 `client.openPanel(id, ...)` 代码直接唤起。
4. **系统级独立悬浮窗口 (OS Floating Window)**：
   - **插件沙箱无法直接创建**：Paseo 未向插件开放 Electron 的 `BrowserWindow` 构造权限，插件运行在 Expo/Webview 渲染上下文中，无法直接调用 `new BrowserWindow({ frame: false, alwaysOnTop: true })`。
   - 若要实现全局独立浮窗，属于宿主层或外部 Sidecar 进程范畴。

### 3.3 页面跳转与路由 API
Paseo 插件客户端拥有完整的页面路由控制力：
1. **跳转到指定 Agent 会话**：
   `PluginNavigableHostProps` 提供了导航能力：
   ```ts
   props.navigation?.openAgent({ agentId, serverId });
   ```
2. **跳转到指定工作区**：
   ```ts
   props.navigation?.openWorkspace({ workspaceId, serverId });
   ```
3. **切换回 Bots 管理主页**：
   ```ts
   client.openSurface("bots");
   ```
4. **会话创建与跳转链路闭环**：
   `paseo-bots` 的核心方法 `startBotChat(host.api, ...)` 调用底层 `host.api.agents.create(...)`，创建完成后立即返回 `{ id: agentId }`。调用 `navigation.openAgent({ agentId })` 即可实现“发送后瞬间跳转到对话页面”。

---

## 4. 技术实施方案选型与可行性评估

综合技术可行性、架构整洁度与用户交互诉求，评估三种落地方案：

| 维度 | 方案 A：原生 Composer Pill + Popover（推荐） | 方案 B：右侧工作区抽屉伴侣（Workspace Panel） | 方案 C：侵入式修改 Paseo 宿主 Electron 源码 |
|---|---|---|---|
| **改动范围** | 仅 `paseo-bots` 插件侧 | 仅 `paseo-bots` 插件侧 | 修改 `/Applications/Paseo.app` 宿主 |
| **实现难度** | 中等（纯前端 React Native 组件） | 低至中等 | 极高（需逆向打包/解包 Electron asar） |
| **版本稳定性** | 极佳，依赖官方规范 API | 极佳，依赖官方规范 API | 极差，Paseo 客户端自动更新即失效 |
| **交互贴合度** | **与用户描述 100% 吻合**（输入框 Bot 按钮 + 浮层选择 + 发送跳转） | 良好（代码与 Bot 并排同屏） | 能实现独立全局快捷键悬浮窗，但维护成本巨大 |
| **推荐指数** | ⭐⭐⭐⭐⭐ **（首选主路线）** | ⭐⭐⭐⭐ **（辅助增强）** | ⚠️ **不推荐** |

---

## 5. 方案 A 实施蓝图（纯插件原生无侵入路线）

### 5.1 交互流程设计
```
[普通工作区主输入框]
   ├── [文本输入框: "请帮我重构这个模块..."]
   └── [ComposerTrackBar]
         └── [🤖 Bot Pill (默认: 无 / 点击展开)]
                   │ (点击)
                   ▼
         ┌──────────────────────────────────────────────┐
         │  🤖 选择对话伙伴与模式                         │
         │  模式: [🔘 私聊 (Direct)]  [⚪ 团队 (Team)]   │
         │  对象: [下拉选择: moCode / moAdmin / REA ...]  │
         │  上下文工作区:                                 │
         │    ☑️ 在当前工程目录下执行 (Current Directory)  │
         │    ⚪ 在 Bot 独立沙箱目录执行 (Bot Home)       │
         │                                              │
         │  [ 🚀 立即发送并开启对话 ]                      │
         └──────────────────────────────────────────────┘
                   │ (点击发送)
                   ▼
         1. 提取当前输入框文本或在 Popover 内输入
         2. 调用 startBotChat(host.api, { placement, ... })
         3. 获取新生成的 agentId
         4. 调用 navigation.openAgent({ agentId })
         5. 界面无缝滑动切换至新生成的会话页面
```

### 5.2 核心技术细节与代码落地点
1. **动态注册监听（`paseo-bots/index.client.tsx`）**：
   - 监听活跃会话：利用 `client.paseo.agents.list({ subscribe: {} })` 订阅当前宿主中的活跃 agents。
   - 动态调用 `client.addComposerPill`，将 `BotComposerPill` 注入到每一个打开的工作区会话中。
2. **Pill 状态管理**：
   - 默认为 `label: "选择伙伴"` 或 `label: "Bot: 无"`。
   - 当用户在 Popover 中选定某个 Bot（如 `moCode`）时，通过 `buttonRegistration.update({ label: "moCode (当前目录)" })` 实时更新输入框 Pill 显示。
3. **上下文目录解析（`resolveBotPlacement`）**：
   - 若勾选“当前目录聊”：读取当前会话的 `workspaceDirectory`，将 `placement.path` 设为宿主当前工程目录。
   - 若选择“私聊/沙箱家目录”：使用 `ensureBotHome` 提供的 `shared/Bots/<bot-id>`。
   - 若选择“Team work”：使用 `shared/Teams/<group-name>`。
4. **跳转导航**：
   - `startBotChat` 返回 `agentId` 后，直接调用 `navigation.openAgent({ agentId })` 完成路由平滑跳转。

---

## 6. 调研结论与下一步建议

1. **核心定论**：
   用户的痛点非常精准，且 **Paseo 官方 SDK 已经预留了完整的 `addComposerPill` 与 Popover / Navigation 基础设施**。
   我们**完全不需要改动 Paseo 宿主核心源码**，即可在 `paseo-bots` 插件层实现：
   - 正常对话输入框上的 Bot 切换按钮；
   - 向上弹出的私聊 / 团队 / 当前目录选择浮层；
   - 发送后无缝跳转至目标对话页面。
2. **建议分工与下一步**：
   - **moAdmin**：确认方案 A（Composer Pill + Popover）为正式交付路线，安排任务拆解至 `.t3/TASK_MANIFEST.md`。
   - **moCode**：编写 `BotComposerPill` 及其 Popover 组件，在 `paseo-bots/client/` 中实现上下文选择与 `startBotChat` -> `openAgent` 跳转闭环。
   - **moDoc**：同步更新 `docs/paseo/` 插件扩展文档。
