# CindyR 变更记录与功能禁用清单 (UPDATE.md)

本文档系统记录了 **CindyR** 针对 Cindy 官方客户端进行的**深度去脂瘦身（Diet）、功能禁用与架构微调**。

---

## 一、 项目背景与改造定位

**CindyR** 旨在将原本功能繁复、集成了多种异构 Agent 运行时（Codex、Pi、Claude）以及大量非核心外围服务（语音、IM 机器人、远程桌面、视觉桥、专用网关等）的 Cindy 桌面客户端，重构为一个**纯粹、极轻量、秒级启动、高响应且高度稳定的 Claude Code 单运行时 AI 工作台**。

所有代码改造严格执行**“瘦身不搞物理破坏，修改务求优雅清晰”**的工程规范。

---

## 二、 代码修改与注释规范（核心原则）

在后续的所有开发、迭代与维护中，所有参与代码编写的 Agent 与开发者必须无条件遵守以下纪律：

1. **禁用原则：禁止物理删除原有代码**
   - 禁用任何现有功能、模块、类或配置时，**严禁物理删除代码**。
   - 对于多行、大块代码逻辑的禁用，必须使用整洁的批量注释（`/* ... */` 或成段的 `//`）进行包裹，并添加禁用标记（例如 `/* [Disabled: 视觉桥] ... */`）。

2. **简单修改原则：短逻辑直接修改**
   - 对于单行或一两行的简短改动（例如枚举映射、强制回退返回值 `return 'claude-code';`），**直接就地修改代码本身**，不得在外层嵌套多行冗余且冗赘的注释包裹块。

3. **现有文档注释保留原则**
   - 当禁用带有详尽架构设计说明、背景文档注释的代码块时，**必须完整保留原作者的文档注释说明**，仅用 `//` 注释掉实际执行的那一行调用（例如：`// buildVisionBridgeProxyTransform(log, isGuestProviderShareRequest),`）。

4. **单行导入（Import）禁用规范**
   - 禁用未使用的模块导入语句时，采用单行清晰注释，例如：
     ```ts
     // [Disabled: 远程桌面] import { registerRemoteDesktopIpc } from './remote-desktop';
     ```

5. **实体名称与运行时概念分离**
   - **Provider（供应商）**：表示提供模型服务能力的组织或原厂实体，保持原厂标识（如 `name: 'Anthropic'`）。
   - **Agent（运行时）**：表示承载的执行引擎（`agents: ['claude-code']`）。切勿将供应商名称误写为运行时名称。

---

## 三、 功能禁用清单 (Disabled Features)

### 1. 非 Claude 运行时（Codex & Pi）全面禁用与优雅回退
* **背景**：原版 Cindy 同时接入了 OpenAI Codex 与 Pi 两个异构运行时，带来了庞大的跨进程协议适配、上下文管理和 UI 切换负担。
* **禁用改动**：
  * **Core 层导出收敛** (`packages/maker-core/src/agents/index.ts` & `maker.ts`)：
    * 移除了 Codex 与 Pi 的 harness 激活加载，运行时注册中心仅保留 `claude-code`。
    * 会话创建、检查与校验中，非 `claude-code` 类型强制默认收敛。
  * **数据库与存储映射回退** (`apps/desktop/src/main/localDb/mapper.ts`, `orcaTeamStore.ts`, `agentKindConversion.ts`)：
    * 数据库记录与运行时类型互转时，一律映射为 `claude-code` / `cc`。
  * **Orca 多 Worker 派生收敛** (`apps/desktop/src/main/maker-ipc/orcaWorkerCreationService.ts`, `orcaWorkerDefaults.ts`, `sessionRequest.ts`)：
    * 拦截所有 Worker 创建请求，即便请求指定了 `codex` 或 `pi`，也统一优雅降级回退至 `claude-code`。
  * **前端 UI 选择器隐藏** (`ModelHarnessPicker.tsx`, `ModelSelector.tsx`, `agentOptions.ts`, `SubagentModelSection.tsx`)：
    * 隐藏 Codex 与 Pi 的切换标签卡、图标与配置入口，界面仅暴露纯粹的 Claude 选项。

### 2. 视觉桥（Vision Bridge）
* **背景**：用于在代理层透明将请求中的图片转换为文字描述的中间层，容易引起 tool_result 冲突且增加额外开销。
* **禁用改动**：
  * `apps/desktop/src/main/maker-host/anthropic-compat-proxy-host.ts` & `codex-proxy-host.ts`：
    * 完整保留原有架构说明，仅单行注释掉 `buildVisionBridgeProxyTransform(...)` 调用。
  * `apps/desktop/src/main/bootstrap-electron.ts`：
    * 批量注释禁用视觉桥配置 Store（`readVisionBridgeSettings`、`writeVisionBridgeSettings` 等）及其对应 IPC 通道（`VISION_BRIDGE_SETTINGS_GET`、`SET`、`RESET`）。

### 3. 语音全套功能（语音输入、全局快捷键、语音通话）
* **背景**：依赖本地系统音频采集、模型预热及复杂原生模块，非文本/编程核心链路。
* **禁用改动**：
  * `apps/desktop/src/main/bootstrap-electron.ts`：
    * 批量注释禁用 `registerVoiceInputIpc`、`registerGlobalVoiceInputIpc` 与系统挂起电源释放监听 `installVoiceInputPowerRelease`。
    * 注入安全兜底 Stub IPC（如 `voice-input:data:get`、`voice-conversation:call-status`、`voice-input:global-shortcut:set` 等），确保渲染进程旧 Hook 调用时安全返回空数据，不触发应用崩溃。
  * 渲染层设置与输入框：禁用语音输入相关控制开关及配置。

### 4. 远程桌面与设备互联远控（Remote Desktop）
* **背景**：用于跨电脑远程画面流传输与剪贴板控制，属于高敏感且非核心的远程控制功能。
* **禁用改动**：
  * `apps/desktop/src/main/bootstrap-electron.ts`：
    * 注释禁用 `registerRemoteDesktopIpc` 导入与注册。
    * 提供安全 Stub IPC（`remote-desktop:state`、`remote-desktop:permissions`），默认返回禁用与不支持状态。
  * 渲染层：隐藏远程桌面相关的设置条目与入口。
    * 侧边栏「全部任务 / 机器切换」下拉菜单 (`MachineSwitcherMenu.tsx`)：注释禁用远程桌面二级菜单项与目标设备过滤逻辑。
    * 主布局顶栏右侧与窗口 Chip 栈 (`MainLayout.tsx`)：已注释禁用 `TaskRemoteDesktopButton` 入口。

### 5. IM 机器人与外部 Hook 控制（Feishu / Telegram Bot & Hook Control）
* **背景**：个人与群组 IM 消息通道后台常驻监听服务，消耗系统网络及后台连接资源。
* **禁用改动**：
  * `apps/desktop/src/main/bootstrap-electron.ts`：
    * 注释禁用 `im.registerIpc()`、`registerTelegramBotConfigIpc()`、`registerBotImConnectionIpc()`、`startImOrchestrators()`、`startImConnection()`。
    * 注释禁用 `registerHookControlIpc()` 及其启动调用。
    * 提供安全 Stub IPC（如 `binding:list-attached` 等）。

### 6. macOS 菜单栏用量常驻服务（Menubar Service）
* **背景**：常驻系统托盘/菜单栏，定期轮询用量并派发原生 Helper 进程。
* **禁用改动**：
  * `apps/desktop/src/main/bootstrap-electron.ts`：
    * 注释禁用 `initMenubarService` 与 `stopMenubarService`。

### 7. Cindy 专用自营网关与自定义 Embedding
* **背景**：原版将请求中转至 Cindy 自建代理网关，非标准原厂 API 链路。
* **禁用改动**：
  * `apps/desktop/src/main/bootstrap-electron.ts`：
    * 禁用 `effectiveXdGatewayBaseUrl` 与 `withCindyGatewayKeyRejectionReport`，Embedding BaseUrl 设为空，直连原生系统标准请求通道。

---

## 四、 核心逻辑微调清单 (Fine-Tuned Features)

### 1. 模型目录拉取策略优化（启动秒开 + 方案 B 点击按需拉取）
* **涉及文件**：
  * `apps/desktop/src/main/maker-host/createDesktopProviderService.ts`
  * `apps/desktop/src/main/maker-ipc/register.ts`
* **改动细节**：
  * **启动期解耦**：在 `buildSource()` 中配置 `disableFetch: true`，跳过应用启动（Splash 阶段）对远程云端模型目录的网络同步，避免断网卡死或开机网络延迟，实现**秒级极速冷启**。
  * **方案 B 按需拉取**：导出 `refreshRemoteCatalogOnDemand()` 函数。仅在用户进入模型供应商管理并点击【获取模型列表】（触发 IPC `fetchModels`）时才真正向云端拉取最新模型目录。
  * **并发请求去重**：维护 `remoteCatalogFetchInflight` 状态，当用户短时间内多次点击按钮时，自动复用同一次正在进行中的网络 Promise，防止并发请求轰炸。

### 2. 内置提供商与离线模型精简
* **涉及文件**：
  * `packages/model-providers/src/builtin.ts`
* **改动细节**：
  * 注释掉硬编码的本地静态超大模型列表（`CLAUDE_CODE_MODELS`）。
  * `BUILTIN_PROVIDERS` 仅激活保留原厂 `ANTHROPIC_PROVIDER`，供应商名称维持官方 `name: 'Anthropic'`，`models: { 'claude-code': [] }` 允许动态拉取并填充模型 tag。
  * 其它非官方内置供应商（Google、xAI、Gemini 等）使用大块批量注释完整保留其源码结构，便于日后查阅与按需解开。

### 3. 插件市场恢复官方原版错误处理
* **涉及文件**：
  * `apps/desktop/src/main/plugin-market/api.ts`
  * `apps/desktop/src/main/plugin-market/service.ts`
  * `apps/desktop/src/main/serverApiClient.ts`
* **改动细节**：
  * 移除此前针对 `NETWORK_ERROR` 做出的静默拦截与降级返回（此前是因本地缺失 `.env` 环境配置导致）。
  * 恢复官方原版规范的网络请求与异常上抛链路。

### 4. Claude 原生登录校验对齐
* **涉及文件**：
  * `apps/desktop/src/main/maker-host/claude-native-auth.ts`
* **改动细节**：
  * 移除此前添加的本地 API Key 模式特殊离线放行代码，逻辑与官方 `origin/main` 保持高度严格一致。

### 5. 添加供应商向导精简（仅保留 Anthropic 与自定义两种选项）
* **涉及文件**：
  * `apps/desktop/src/renderer/components/settings/AddProviderWizard.tsx`
  * `apps/desktop/src/renderer/components/settings/SettingsSidebarNav.tsx`
* **改动细节**：
  * **向导列表收敛**：移除预设搜索输入框、推荐列表、本机检测列表和庞杂的第三方云端预设（DeepSeek、GLM、Qwen 等），第一步画廊精简为纯粹的两个选项：
    1. **Anthropic**：官方订阅 / API 授权，直通 OAuth / API Key 连接。
    2. **自定义**：配置与 OpenAI / Anthropic 兼容的自定义端点与模型。
  * **导航图标修复**：修复 `SettingsSidebarNav` 中 `providers` 图标被误注释导致的渲染报错，并加入安全防御判空（`Icon && <Icon ... />`）。

### 6. 自定义供应商连接表单（ProviderConnectionDialog）单运行时收敛与防御
* **涉及文件**：
  * `apps/desktop/src/renderer/components/settings/ProviderConnectionDialog.tsx`
* **改动细节**：
  * **解决崩溃**：修复从添加向导进入自定义表单时，`simpleAdding` 默认将 `activeTab` 误设为已禁用的 `'pi'`，导致用户输入 URL 或 Key 触发 `patch` 时，访问 `rt['pi'].baseUrl` 报 `TypeError: Cannot read properties of undefined (reading 'baseUrl')`。
  * **单运行时对齐**：强制将 `activeTab` 默认值收敛至 `'claude-code'`。
  * **安全兜底防御**：在 `rt[activeTab]`、`rt[agent]`、`setRtSynced` 及 `followsDefaultConnection` 处全面补齐空值安全保护与 `emptyRuntime` 兜底，彻底杜绝输入变动时的空引用异常。

### 7. 模型供应商页面移除本机 CLI 检测建议（消除漏网之鱼）
* **涉及文件**：
  * `apps/desktop/src/renderer/components/settings/ProvidersSection.tsx`
  * `apps/desktop/src/renderer/__tests__/providersSectionUnavailableModels.test.tsx`
* **改动细节**：
  * **建议行禁用**：遵循非破坏性去脂（Diet）原则，批量注释禁用 `ProvidersSection.tsx` 中的 `SuggestionRow` 组件、`scanLocalCli()` 挂载探测以及左栏底部的 `suggestions`（检测到本机 CLI）渲染模块。
  * **专注单运行时**：CindyR 作为专注的 Claude Code 单运行时 AI 工作台，主列表已具备 Anthropic 官方直达与自定义端点通道，彻底消除旧版 Cindy 多 Agent/CLI 扫描的冗余建议行漏网之鱼。

### 8. 补齐语音模块（Voice Input）全套安全兜底 Stubs
* **涉及文件**：
  * `apps/desktop/src/main/bootstrap-electron.ts`
* **改动细节**：
  * **解决报错与卡死**：修复用户在切换页面（如由聊天页切到设置页）导致 `ChatInput` 卸载时，`useVoiceInput` 的 cleanup effect 调用 `window.electronAPI.voiceInput.cancel()` 抛出 `Uncaught (in promise) Error: No handler registered for 'voice-input:cancel'`。
  * **全面补齐 Stubs**：在 `registerIpcHandlers` 中为已禁用的语音输入补齐 `voice-input:cancel`、`voice-input:stop`、`voice-input:start`、`voice-input:audio`、`voice-input:audio-drain`、`voice-input:get-*-permission*`、`voice-input:speaker-filter:*` 等全套 IPC 同步/异步兜底处理器，杜绝未捕获异常引发的渲染进程事件循环堵塞与调试断点挂起。

### 9. 本地开发与正式版双实例物理冲突防御与隔离运行规范
* **背景与现场诊断**：
  * 在本地开发调试阶段（`pnpm start` / `electron-forge start`），如果宿主机上已运行正式安装版 `/Applications/Cindy.app`，会导致两套完全独立的 Electron 进程同时运行，出现严重的 CPU 争抢、点击无响应与假死现象。
* **冲突根本原因**：
  1. **数据目录完全相同 (`userData`)**：查阅 `packages/maker-shared/src/brandIdentity.ts`，`userDataDirName` 为 `'Cindy'`，默认均访问 `~/Library/Application Support/Cindy/`。
  2. **SQLite 本地数据库 WAL 锁冲突**：已安装的正式版常驻持有 `localDb.sqlite` 数据库写锁（WAL 锁），开发版启动时在 `localDb.ensureReady()` 阶段因写锁被占陷入等待超时自动退出，主窗口因未收到就绪 IPC 信号而白屏挂死。
  3. **系统级 Native Helper 与 Socket 冲突**：如 `xdt-macos-menubar-helper`、`xdt-macos-session-drag-release-helper` 等监听相同 Unix Domain Socket 和全局快捷键，导致冲突挂死。
* **隔离规范与解决策略**：
  * **方案 A（推荐：彻底沙盒隔离）**：启动开发版时必须附加 `--isolated=dev`，使数据目录切换为独立路径 `~/Library/Application Support/Cindy-dev2-dev/`，与正式版数据与数据库锁物理完全隔开：
    ```bash
    pnpm desktop:start --isolated=dev
    ```
  * **方案 B（调试单一应用）**：调试开发版前，先在终端彻底退出已安装的正式版应用：
    ```bash
    pkill -f "/Applications/Cindy.app"
    ```

### 10. macOS 事件循环挂死与 DeviceLink 远端资源失败诊断体系
* **背景与现象**：
  * 页面切换或高负荷运行时偶发应用卡死，终端伴随 `Electron[PID] error messaging the mach port for IMKCFRunLoopWakeUpReliable` 与 `device-link:invoke Error: [INTERNAL] remote resource provider failed` 报错。
* **机制解析与防范规范**：
  1. **IMKCFRunLoopWakeUpReliable 机制**：
     * `IMK` 即 macOS **Input Method Kit（输入法框架）**。当用户点击窗口、聚焦输入框或键入时，系统通过 Mach Port 向目标进程 Cocoa 主线程 RunLoop 发送唤醒消息（`CFRunLoopWakeUp`）。
     * 当主线程被长时间同步阻塞、存在死循环、或因未捕获异常被 DevTools 断点冻结时，RunLoop 无法响应 Mach 消息并报错。
     * **防范**：严禁在 React 主线程进行同步高耗时计算；补齐全套安全 Stub 消除未处理异常；严防 `useEffect` 依赖数组不当导致的无限重渲染。
  2. **DeviceLink 远端资源容错 (`maker:remote-resources:get`)**：
     * `maker:remote-resources:get`（code: `IPC_ERROR`）属于多设备节点互联通信失败（向配对的手机或远端节点请求远程资源投影时远端返回 `INTERNAL`），主进程已配置 30s 超时与重试机制。此报错属于业务网络层异常，不应影响桌面端主线程事件循环。

### 11. 云端技能市场离线优雅降级与网络刷屏抑制
* **涉及文件**：
  * `config/endpoint.json`
  * `config/endpoint.global.json`
  * `apps/desktop/src/main/skillhub/registerIpc.ts`
  * `apps/desktop/src/main/skillhub/autoSyncService.ts`
  * `apps/desktop/src/renderer/features/skillhub/hooks/useMarketList.ts`
  * `apps/desktop/src/renderer/features/skillhub/SkillhubHomeView.tsx`
* **改动细节**：
  * **清单级关闭无效云端端点**：远端官方 `skill-hub.cindy.com.cn` 服务当前对 TLS 握手直接发送 TCP RST，导致底层狂刷 Chromium `ssl_client_socket_impl.cc handshake failed -101` 与连接重置错误。在 `endpoint.json` 与 `endpoint.global.json` 中将 `cindySkillHubApiBaseUrl` 规范置为空串 `""`。根据官方端点设计规范，空端点作为合法关闭开关在请求前短路抛出 `UNSUPPORTED_CAPABILITY`，从底层杜绝了无谓的网络套接字创建与握手报错。
  * **主进程 IPC 优雅降级与日志降噪**：优化 `registerIpc.ts` 中 `skillhub:sync`、`skillhub:list-market` 与 `skillhub:list-categories` 的错误捕获。当捕获到 `UNSUPPORTED_CAPABILITY` 或 `NETWORK_ERROR` 时，使用 `log.debug` 替换 `log.error` 刷屏，并安全返回空的统一数据 DTO，确保渲染进程与 Store 平稳初始化。
  * **自动同步登录前置短路**：在 `autoSyncService.ts` 中引入端点探测，当 `cindySkillHubApiBaseUrl` 为空时，登录阶段直接跳过云端 `runOnceAfterLogin()`。
  * **前端分类查询守卫**：为 `useCategoryList` 增加 `{ enabled }` 控制开关，在 `SkillhubHomeView` 处于本地技能 Tab 时跳过向云端获取分类，进一步净化网络链路。

### 12. 六大核心架构基线统一与收官 (Final Unified Baselines Consolidation)
* **涉及文件**：
  * `apps/desktop/src/main/bootstrap-electron.ts`
  * `apps/desktop/src/main/maker-ipc/project-automation.ts`
  * `apps/desktop/src/main/localDb/client/current.ts`
  * `apps/desktop/src/main/authManager.ts`
  * `apps/desktop/src/main/authBoundaryQuarantine.ts`
  * `apps/desktop/src/main/maker-ipc/binary-version.ts`
  * `apps/desktop/src/main/maker-ipc/chatServer.ts`
  * `apps/desktop/src/renderer/components/settings/AboutSection.tsx`
  * `apps/desktop/src/renderer/features/bots/botStore.ts`
  * `apps/desktop/src/renderer/features/bots/BotProfileCreateForm.tsx`
  * `vite.renderer.config.ts`
* **改动细节**：
  * **1. IPC 提前注册与异步就绪门禁 (Eager IPC & Boot Gate)**：
    * 将 `maker:project-automation:*`（`pending-imports`, `reconcile`, `list-consents`, `revoke-consent`, `upsert-schedule`, `remove-schedule`）从滞后点移至 `registerMakerIpcsAfterSplash` 提前注册，彻底杜绝前端冷启调用抛出 `No handler registered`。
    * 在 `project-automation.ts` 引入 15 秒异步就绪门禁（`withLoader`），调用等待 `whenSchedulerReady()` 完成后执行。
    * `custom-mcp-registry`、`git-snapshot`、`session-archive-sync` 与 `cindy-brain` 等子系统的数据库操作一律通过 `await whenDbReady()` 守卫拦截。
  * **2. 授权适配器、Skill 投影与 Dev CSP 规范**：
    * 在 `auth-adapters.ts` 与 `authBoundaryQuarantine.ts` 中对 `isGhostSkillProjectionBoundaryStableForOwner` 实施指数退避重试（最多 3 次，1.5 倍退避因子），并在 `authManager` 中注入 `skillsPostCommitStep` 提交后核对钩子，保证跨账号全局共享 Skill 投影稳定。
    * 在 `vite.renderer.config.ts` 中通过 `devCspPlugin` 注入开发模式 `DEV_CSP`，并在 `csp.ts` 适配本地回环地址（`localhost`, `127.0.0.1`）来源。
  * **3. 数据库切换竞争消除与连接屏障**：
    * 消除切账号时 49ms 的 `DbClient not ready` 瞬时竞争窗口：在 `current.ts` 中引入 `whenDbReady` 队列屏障，在旧账号销毁期间排队缓冲查询请求，并在新实例建立后安全释放。
    * 在 `authManager` 中建立 `setAccountSwitchReconnect` 屏障，确保底层 SQLite 就绪严格先于 `appSessionState` 广播发射。
    * 在 `cindy-brain` 中引入幂等卡片重新分配追踪机制（`pendingGhostCardReassignments`）。
  * **4. 前端组件 SSOT 与防闪烁水合守卫**：
    * 抽取 `BotProfileCreateForm.tsx` 作为全屏引导页与模态弹窗的统一单一事实源（SSOT），消除两处表单冗余与行为分歧。
    * 通过 `useSyncExternalStore` 将伙伴创建表单与工作区默认模型实现动态响应式绑定。
    * 在 `botStore.ts` 的 `hydrateFromDatabase` 注入在途锁防闪烁守卫，杜绝数据库同步期间广播虚假空列表导致界面抽搐。
  * **5. 彻底清除非 Claude 运行时（Codex 与 Pi）死代码**：
    * 在 `AboutSection.tsx` 中彻底移除 Codex 与 Pi 版本号行、未安装占位及菜单选项，界面收敛为纯粹的 Claude Code。
    * 在 `binary-version.ts` 中彻底剥离 Codex 与 Pi 的 CLI probe 命令、版本轮询与 IPC 处理器；`maker:agent:binary-version` 严格限制只处理 `claude-code`，其余非法类型立即拦截。
  * **6. 多线程并发容错与候选认领隔离**：
    * 在 `chatServer.ts` 的 `readMessage` 与 `executionLane` 拦截 HTTP 400 `INVALID_INPUT` / `ChatResponseError`，安全回退到 `${room}:main`，杜绝未捕获的 Promise Rejection。
    * 在 `claimBesideRuns` 中隔离单条候选消息预读失败，防止单点异常拖垮并发扫描，保证邻近 Thread 任务能够正常并发认领与执行。

### 13. 伙伴群：本机拒绝由伙伴消息触发的普通执行（I1，2026-11）
* **涉及文件**：
  * `apps/desktop/src/main/maker-ipc/botGroupExecutionAdmission.ts`（新增，纯函数）
  * `apps/desktop/src/main/maker-ipc/chatServer.ts`（一行 import + `laneSetup` 内一条判断替换，原系统来源判断以 `//` 注释保留）
  * `apps/desktop/src/main/maker-ipc/__tests__/botGroupExecutionAdmission.test.ts`（新增）
  * `apps/desktop/src/main/maker-ipc/__tests__/chatServer.test.ts`
  * `docs/product-rules/bot-group-chat.md`（§4.0）
  * `docs/dev-rules/protocol-compatibility.md`（`groupSingleSpeaker` 小节）
* **改动细节**：
  * **宿主侧纵深防御**：在声明 `groupSingleSpeaker` 的服务器上，非分工/队列（无 `plan_id`）、非 AI 代答（无 `mask_owner_id`、非 digest）的普通执行，若来源消息由伙伴发出（`author.kind` 或 `origin` 为 `bot`），本机在建群专线前拒绝（`INVALID_EXECUTION_TRIGGER`，上报为通用运行错误）；系统来源在任何服务器上照旧拒绝。不取代服务端派发规则。
  * **不受影响**：旧服务器的有限续圈、分工/队列步骤、AI 代答与 digest、来源不可读、集成通知、人发的消息（含已删除与导入）、单聊。无 wire 变更、无新错误码、无渲染层或 i18n 改动。
  * **未验证前提**：该能力下非分工的后续执行都以发起请求的人类消息为来源（服务端代码不在本仓）。

### 14. Bot Home 镜像过期不再回滚设置（I2，2026-11）
* **涉及文件**：
  * `apps/desktop/src/main/maker-ipc/botProfileMirrorMarker.ts`（新增，纯函数：指纹、解析、合并、按槽判定）
  * `apps/desktop/src/main/maker-ipc/botProfileMirrorMarkerStore.ts`（新增，`.host-mirror.json` 读写、每个 Home 的进程内锁、原子写入）
  * `apps/desktop/src/main/maker-ipc/botProfileFolderSync.ts`
  * `apps/desktop/src/main/localDb/ipc/bots.ts`（镜像写改走 `writeBotProfileFolderMirrored`，原 `writeBotProfileFolder` import 以注释保留）
  * `apps/desktop/src/main/maker-ipc/__tests__/botProfileMirrorMarker.test.ts`、`botProfileMirrorMarkerStore.test.ts`（新增）
  * `apps/desktop/src/main/maker-ipc/__tests__/botProfileFolderSync.test.ts`、`apps/desktop/src/main/bot-import/__tests__/host.test.ts`
  * `docs/product-rules/cindy-bots-runtime.md`、`docs/product-rules/cindy-bots-completion-matrix.md`
* **改动细节**：
  * **问题**：设置先写数据库再镜像到 Home 文件；镜像失败时旧文件留在 Home，下一次对账把旧文件当作用户编辑派生新版本，已保存的设置被回滚。
  * **修复**：Home 根目录 `.host-mirror.json` 按槽（SOUL.md / memories/USER.md）记录宿主上次成功写入字节的 sha256。文件与快照一致为 in-sync；不一致但等于指纹为「镜像过期」，按数据库重写、不派生（结果 `mirror-stale`）；其余视为编辑，行为不变。
  * **竞态防护**：写文件与记指纹在每个 Home 的进程内锁中成对完成；重写前在锁内复核数据库版本未变且文件仍是宿主上次写入的字节，否则本轮跳过（结果 `mirror-skipped`），留给下次对账。
  * **安全边界**：伪造指纹只会让宿主用数据库覆盖文件，不能派生版本或提权；删除或损坏指纹退回旧行为。导入与邀请写入不记指纹，行为不变。`.host-mirror.json` 随 Home 备份复制，但不上传云端。

### 15. 委派子任务角色冻结指纹（I3，2026-11）
* **涉及文件**：
  * `apps/desktop/src/main/maker-ipc/botFrozenRoleFingerprint.ts`（新增，纯函数）
  * `apps/desktop/src/main/maker-ipc/botProfileRuntime.ts`
  * `apps/desktop/src/main/maker-ipc/__tests__/botFrozenRoleFingerprint.test.ts`（新增）
  * `apps/desktop/src/main/localDb/ipc/__tests__/botCanonicalSession.test.ts`
  * `docs/product-rules/cindy-bots-runtime.md`、`docs/product-rules/cindy-bots-completion-matrix.md`
* **改动细节**：
  * 委派子任务（`role = 'delegation'`）创建时冻结名称、简介与 Home `system_prompt.md` 覆盖层的指纹（只存哈希，不存正文），后续快照原样携带这份基线。
  * 续接时三项若漂移：运行快照标为 `degraded` 并在 `frozenRoleDrift` 记录字段名，**降级而非报错**，任务不阻断；技能／MCP／工具集资源漂移仍先于角色检查并照旧拒绝续接。
  * 覆盖层读取失败与远端会话不计为漂移；旧快照无指纹时以当次为基线，不追溯降级；跟随 Profile 的会话只记录指纹、不降级。

### 16. 委派准入：谱系与层级校验（I4，2026-11）
* **涉及文件**：
  * `apps/desktop/src/shared/botDelegationLineage.ts`（新增，纯函数，worker 与主进程共用）
  * `apps/desktop/src/main/localDb/worker/opHandlers/tx.ts`
  * `apps/desktop/src/main/localDb/client/tx/types.ts`
  * `apps/desktop/src/main/maker-ipc/botDelegationService.ts`
  * `apps/desktop/src/shared/__tests__/botDelegationLineage.test.ts`（新增）
  * `apps/desktop/src/main/localDb/worker/opHandlers/__tests__/botTx.test.ts`、`apps/desktop/src/main/localDb/ipc/__tests__/botCanonicalSession.test.ts`
  * `docs/product-rules/cindy-bots-runtime.md`（§6.1）
* **改动细节**：
  * **两道闸**：服务预检在建会话与工作区前快速拒绝；worker 事务内依据父委派的 lineage 重新计算 lineage 与 depth，作为不可绕过的权威校验（`bots.createDelegation` 新增可选 `maxDepth`，缺省 1）。
  * **五个错误码**：`DELEGATION_LINEAGE_INVALID`（父谱系损坏或超上限，失败即关闭）、`DELEGATION_DEPTH_EXCEEDED`、`DELEGATION_CYCLE`、`DELEGATION_SELF_TARGET`、`DELEGATION_TARGET_VERSION_MISSING`（指定目标伙伴却未冻结版本，不再向 `bot_session_links` 写入 NULL 版本）。
  * **有意收紧**：旧版伙伴间委派产生的 worker 会话（`role = 'delegation'`）不能再派出后台任务，返回 `DELEGATION_DEPTH_EXCEEDED`；委派 worker 也**永远不能**续接（reopen）已结束的后台任务（该拒绝不再取决于层级上限配置），同样返回 `DELEGATION_DEPTH_EXCEEDED`；它们仍可列出、停止自己的任务并接收完成回传。
  * **谱系长度上限**：lineage 最多 16 项，写入（事务内计算新谱系）与读取（解析父委派谱系）两端都校验，超限以 `DELEGATION_LINEAGE_INVALID` 拒绝。
  * **不变**：普通伙伴会话（主对话、话题、例行任务、群专线）发起的普通 Cindy 后台任务行为与写入值（lineage `[botId]`、depth 1）保持一致。

### 17. 同步范围说明（I1–I4）
* 以上 13–16 项只改动 `CindyR/` 下的文件；仓库根目录的 `extensions/cindy` 副本**未同步**这些改动，如需对齐须另行移植。

---

## 五、 修改文件总览 (109 Files Summary)

| 模块类别 | 关键修改文件 | 主要改动内容 |
| :--- | :--- | :--- |
| **Electron 核心与启动** | `apps/desktop/src/main/bootstrap-electron.ts` | 提前注册 `project-automation` IPC；禁用语音、IM、远控、视觉桥等 IPC；注册全套安全兜底 Stubs |
| **调度与自动化门禁** | `apps/desktop/src/main/maker-ipc/project-automation.ts`<br>`apps/desktop/src/main/scheduler-host/project-automation-loader.ts` | 引入 `withLoader` 15s 异步就绪门禁；消除冷启 IPC 缺失异常 |
| **数据库与账号屏障** | `apps/desktop/src/main/localDb/client/current.ts`<br>`apps/desktop/src/main/authManager.ts`<br>`apps/desktop/src/main/authBoundaryQuarantine.ts` | 引入 `whenDbReady` 队列屏障与 `setAccountSwitchReconnect`，彻底消除 49ms 竞争；Skill 投影指数退避 |
| **多线程与会话服务** | `apps/desktop/src/main/maker-ipc/chatServer.ts` | `readMessage` 与 `executionLane` HTTP 400 安全回退 `${room}:main`；`claimBesideRuns` 隔离并发认领失败 |
| **模型服务与拉取** | `apps/desktop/src/main/maker-host/createDesktopProviderService.ts`<br>`apps/desktop/src/main/maker-ipc/register.ts` | 启动禁用网络拉取；实现点击按需拉取方案 B + 并发防重 |
| **内置提供商定义** | `packages/model-providers/src/builtin.ts` | 仅保留 Anthropic；清空内置硬编码模型改动态拉取 |
| **Agent 核心与收敛** | `packages/maker-core/src/agents/index.ts`<br>`packages/maker-core/src/maker.ts` | 卸载 Codex & Pi，收敛至单一 `claude-code` |
| **Worker 派生与存储** | `apps/desktop/src/main/maker-ipc/orcaWorkerDefaults.ts`<br>`apps/desktop/src/main/localDb/orcaTeamStore.ts`<br>`apps/desktop/src/shared/agentKindConversion.ts` | Orca 派生任务与数据库映射强制优雅回退 `claude-code` |
| **二进制版本探测收敛** | `apps/desktop/src/main/maker-ipc/binary-version.ts` | 彻底移除 Codex/Pi probe 与轮询；IPC 严格限定 `claude-code` |
| **前端表单与组件 SSOT** | `apps/desktop/src/renderer/features/bots/BotProfileCreateForm.tsx`<br>`apps/desktop/src/renderer/features/bots/botStore.ts` | 伙伴表单 SSOT 提取；`useSyncExternalStore` 动态绑定默认模型；`hydrateFromDatabase` 防闪烁锁 |
| **前端交互与选择器** | `apps/desktop/src/renderer/components/new-chat/ModelSelector.tsx`<br>`ChatInput.tsx`<br>`agentOptions.ts` | 隐藏 Codex/Pi 选项；UI 专注呈现 Claude 系列模型 |
| **设置与关于页面** | `apps/desktop/src/renderer/components/settings/SettingsView.tsx`<br>`AboutSection.tsx`<br>`ProvidersSection.tsx`<br>`SubagentModelSection.tsx`<br>`AddProviderWizard.tsx`<br>`ProviderConnectionDialog.tsx`<br>`SettingsSidebarNav.tsx` | About 页面彻底清除非 Claude 行；精简向导为 Anthropic 与自定义两项；表单单运行时收敛与判空；移除本机 CLI 建议行；修复导航图标崩溃 |
| **技能市场与端点控制** | `config/endpoint.json`<br>`config/endpoint.global.json`<br>`apps/desktop/src/main/skillhub/registerIpc.ts`<br>`apps/desktop/src/main/skillhub/autoSyncService.ts`<br>`apps/desktop/src/renderer/features/skillhub/hooks/useMarketList.ts`<br>`apps/desktop/src/renderer/features/skillhub/SkillhubHomeView.tsx` | 清单级关闭云端 SkillHub；IPC 错误降级为 `log.debug` 并返回安全空结构；前端分类查询增加 `enabled` 守卫 |
| **自动化测试保护** | `apps/desktop/src/renderer/__tests__/providersSectionUnavailableModels.test.tsx`<br>`apps/desktop/src/main/maker-ipc/__tests__/binaryVersionIpc.test.ts`<br>`apps/desktop/src/main/maker-ipc/__tests__/chatServerThreadContext.test.ts`<br>`apps/desktop/src/renderer/components/settings/__tests__/AboutSection.binaryVersions.test.tsx` | 对齐禁用建议行渲染、纯 Claude 二进制版本 IPC、多线程并发容错与 About 单运行时测试用例 |
| **伙伴群执行准入（I1）** | `apps/desktop/src/main/maker-ipc/botGroupExecutionAdmission.ts`<br>`apps/desktop/src/main/maker-ipc/chatServer.ts`<br>`apps/desktop/src/main/maker-ipc/__tests__/botGroupExecutionAdmission.test.ts`<br>`apps/desktop/src/main/maker-ipc/__tests__/chatServer.test.ts`<br>`docs/product-rules/bot-group-chat.md`<br>`docs/dev-rules/protocol-compatibility.md` | 一次一位伙伴的服务器上，本机拒绝由伙伴消息触发的普通执行（纵深防御，无 wire 变更） |
| **Bot Home 镜像指纹（I2）** | `apps/desktop/src/main/maker-ipc/botProfileMirrorMarker.ts`<br>`apps/desktop/src/main/maker-ipc/botProfileMirrorMarkerStore.ts`<br>`apps/desktop/src/main/maker-ipc/botProfileFolderSync.ts`<br>`apps/desktop/src/main/localDb/ipc/bots.ts`<br>`apps/desktop/src/main/maker-ipc/__tests__/botProfileMirrorMarker.test.ts`<br>`apps/desktop/src/main/maker-ipc/__tests__/botProfileMirrorMarkerStore.test.ts`<br>`apps/desktop/src/main/maker-ipc/__tests__/botProfileFolderSync.test.ts`<br>`apps/desktop/src/main/bot-import/__tests__/host.test.ts`<br>`docs/product-rules/cindy-bots-completion-matrix.md` | `.host-mirror.json` 指纹区分镜像过期与真实编辑；过期按数据库重写（`mirror-stale`），版本已变则跳过（`mirror-skipped`），不再回滚设置 |
| **委派角色冻结（I3）** | `apps/desktop/src/main/maker-ipc/botFrozenRoleFingerprint.ts`<br>`apps/desktop/src/main/maker-ipc/botProfileRuntime.ts`<br>`apps/desktop/src/main/maker-ipc/__tests__/botFrozenRoleFingerprint.test.ts` | 名称/简介/`system_prompt.md` 漂移时快照降级为 `degraded` 并记录字段名，不报错 |
| **委派准入（I4）** | `apps/desktop/src/shared/botDelegationLineage.ts`<br>`apps/desktop/src/main/localDb/worker/opHandlers/tx.ts`<br>`apps/desktop/src/main/localDb/client/tx/types.ts`<br>`apps/desktop/src/main/maker-ipc/botDelegationService.ts`<br>`apps/desktop/src/shared/__tests__/botDelegationLineage.test.ts`<br>`apps/desktop/src/main/localDb/worker/opHandlers/__tests__/botTx.test.ts`<br>`apps/desktop/src/main/localDb/ipc/__tests__/botCanonicalSession.test.ts`<br>`docs/product-rules/cindy-bots-runtime.md` | 服务预检 + worker 事务内谱系/深度校验；五个 `DELEGATION_*` 错误码；旧版 bot→bot worker 会话收紧，reopen 同样拒绝 |

> 文件计数说明：原 84 项沿用前文统计；I1–I4 相对基线 `57cde3b` 共改动或新增 26 个文件（`git status --porcelain --untracked-files=all`，不含本 `UPDATE.md`），其中 `chatServer.ts` 已在上表计入，故新增 25 项，合计 109。`botCanonicalSession.test.ts`、`cindy-bots-runtime.md` 与 `cindy-bots-completion-matrix.md` 由多个迭代共用，各只计一次。
