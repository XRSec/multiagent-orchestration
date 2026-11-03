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

---

## 五、 修改文件总览 (72 Files Summary)

| 模块类别 | 关键修改文件 | 主要改动内容 |
| :--- | :--- | :--- |
| **Electron 核心与启动** | `apps/desktop/src/main/bootstrap-electron.ts` | 禁用语音、IM、远控、视觉桥等 IPC；注册兜底 Stubs |
| **模型服务与拉取** | `apps/desktop/src/main/maker-host/createDesktopProviderService.ts`<br>`apps/desktop/src/main/maker-ipc/register.ts` | 启动禁用网络拉取；实现点击按需拉取方案 B + 并发防重 |
| **内置提供商定义** | `packages/model-providers/src/builtin.ts` | 仅保留 Anthropic；清空内置硬编码模型改动态拉取 |
| **Agent 核心与收敛** | `packages/maker-core/src/agents/index.ts`<br>`packages/maker-core/src/maker.ts` | 卸载 Codex & Pi，收敛至单一 `claude-code` |
| **Worker 派生与存储** | `apps/desktop/src/main/maker-ipc/orcaWorkerDefaults.ts`<br>`apps/desktop/src/main/localDb/orcaTeamStore.ts`<br>`apps/desktop/src/shared/agentKindConversion.ts` | Orca 派生任务与数据库映射强制优雅回退 `claude-code` |
| **代理与请求重写** | `apps/desktop/src/main/maker-host/anthropic-compat-proxy-host.ts`<br>`apps/desktop/src/main/maker-host/codex-proxy-host.ts` | 单行注释禁用视觉桥转换调用，保留完整设计注释 |
| **前端交互与选择器** | `apps/desktop/src/renderer/components/new-chat/ModelSelector.tsx`<br>`ChatInput.tsx`<br>`agentOptions.ts` | 隐藏 Codex/Pi 选项；UI 专注呈现 Claude 系列模型 |
| **设置与配置管理** | `apps/desktop/src/renderer/components/settings/SettingsView.tsx`<br>`ProvidersSection.tsx`<br>`SubagentModelSection.tsx` | 精简设置面板导航，屏蔽已禁用的外部服务配置 |
