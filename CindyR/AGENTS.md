# CindyR 客户端仓：Agent 工作入口与核心开发规范

CindyR 是基于 Cindy 官方客户端进行的**深度去脂瘦身（Diet）与专注化改造**版本，连接模型、工具与设备，旨在提供极轻量、秒级启动、高响应且高度稳定的 **Claude Code 单运行时 AI 工作台**。

任何在本仓库进行开发、修改、重构或调试的 Agent / 开发者，**必须严格遵守以下核心纪律与设计原则**。

---

## ⚡ 核心纪律与代码修改规范（最高原则）

在后续的所有开发任务中，无论是单 Agent 执行还是多 subagent 协同，必须严格贯彻以下核心铁律：

### 1. 禁用不删除原则（禁止物理删除）
- 禁用任何现有功能模块、服务、路由或配置时，**严禁物理删除原有代码**。
- 必须使用整洁的**批量注释（`/* ... */` 或成段的 `//`）**进行包裹禁用。
- 必须保留禁用原因标识，如 `/* [Disabled: 视觉桥] ... */`、`/* [Disabled: 语音输入] ... */`。

### 2. 简单修改原则（短逻辑直接改）
- 对于单行逻辑、简短返回值替换（例如枚举回退 `return 'claude-code';`、`const agentKind = 'claude-code';`）：
  - **直接就地修改代码本身**，不得在外层套用冗长啰嗦的多行注释块。
  - 严禁出现将一行代码包装成 5 行 `/* [Disabled: ...] */` 垃圾注释的写法。

### 3. 保留原有文档注释原则
- 当禁用带有架构设计说明、业务考量或详细文档注释的代码调用时：
  - **必须完整保留原有文档注释正文**。
  - **仅用 `//` 注释掉实际执行的那一行代码**。
  - 示例：
    ```ts
    // 视觉桥透明替换（层 A）：controller 未注入时短路透传，零干扰；注入后把纯文本...
    // buildVisionBridgeProxyTransform(log, isGuestProviderShareRequest),
    ```

### 4. 命名与概念清晰规范
- **Provider（供应商）**：是指提供 API 与模型能力的组织实体，必须保持原厂名称（如 `name: 'Anthropic'`）。
- **Agent（运行时）**：是指在其下运行的 Agent 引擎类型（即 `agents: ['claude-code']`）。
- 严禁将供应商名称篡改为 Agent 名称或其它混淆名称。

### 5. IPC 安全 Stub 必须兜底原则（杜绝未捕获异常与 RunLoop 假死）
- 凡在渲染进程（React Hook、生命周期 cleanup）或 `preload.ts` 中暴露的 IPC 通道，若对应主进程模块已被禁用，**必须在 `bootstrap-electron.ts` 中显式注册安全兜底 Stub**（如 `voice-input:cancel` 返回 `{ ok: true }`）。
- 严禁留空抛出 `No handler registered`，防止组件卸载时触发未捕获 Promise Rejection，造成渲染进程事件循环堵塞或 macOS Mach Port (`IMKCFRunLoopWakeUpReliable`) 通信挂起。

### 6. 开发环境双实例隔离原则（避免 SQLite 锁与端口竞争）
- 因品牌配置中 `userDataDirName: 'Cindy'`，本地开发实例若不加隔离，会与系统安装的 `/Applications/Cindy.app` 共享同一个数据目录 `~/Library/Application Support/Cindy/`。
- 这会导致 `localDb.sqlite` WAL 锁冲突（开发版启动超时自动退出）与 Native Helper / Socket 争抢假死。
- **开发启动必须附加 `--isolated=dev`**（使用独立数据目录 `Cindy-dev2-dev`）或在调试前彻底退出安装版（`pkill -f "/Applications/Cindy.app"`）。

### 7. 清单级能力关闭与离线优先原则（抑制网络噪音与握手报错）
- 对不可达或已下线的外部云端服务（如 SkillHub 市场），在 `config/endpoint*.json` 中将对应端点置为空串 `""`。
- 主进程利用端点架构预留的 `UNSUPPORTED_CAPABILITY` 机制在套接字建立前短路拦截，从根源杜绝底层 Chromium SSL 握手重置与网络中断报错。
- IPC 层捕获此类错误时降级为 `log.debug` 并返回合法安全空结构（如 `{ success: true, items: [] }`），严禁在无自建服务环境下向控制台刷屏抛出致命堆栈。

### 8. 提前 IPC 注册与异步就绪门禁原则（杜绝冷启无处理器报错）
- 渲染层可能在应用启动早期调用的业务 IPC（如 `maker:project-automation:*`），**必须在 `bootstrap-electron.ts` 的 `registerMakerIpcsAfterSplash` 中提前完成注册**。
- 处理器内部必须通过异步就绪门禁（如 `withLoader` 配合 `whenSchedulerReady()`，超时阈值 `15000ms`）等待下层服务就绪，严禁因服务启动延迟抛出 `No handler registered`。
- 底层子系统（`custom-mcp-registry`、`git-snapshot`、`session-archive-sync`、`cindy-brain`）数据库操作必须前置 `await whenDbReady()`。

### 9. 账号切换数据库连接屏障原则（消除 49ms 竞争窗口）
- 账号切换、注销或重新连接时，主进程必须通过 `current.ts` 中的 `whenDbReady` 队列屏障挂起并发查询，并在 `authManager` 中通过 `setAccountSwitchReconnect` 确保数据库连接就绪先于会话广播（`appSessionState`）。
- 严禁在数据库实例尚未就绪时向渲染进程发射就绪信号，杜绝瞬时 `DbClient not ready` 竞争报错。
- `cindy-brain` 针对卡片重新分配必须实施幂等跟踪（`pendingGhostCardReassignments`）。

### 10. 多线程并发容错与候选隔离原则（保障多 Lane 独立吞吐）
- 在 `chatServer.ts` 中，`readMessage` 与 `executionLane` 遇到 HTTP 400 `INVALID_INPUT` 或已清理的消息实体时，必须捕获并优雅降级回退至 `${room}:main`，严禁抛出未捕获的 Promise Rejection。
- 在 `claimBesideRuns` 扫描并发任务时，单个候选消息预读失败必须局部隔离，严禁阻断后续相邻候选的认领，确保不同线程任务正常并发调度与执行。

---

## 🏗️ 核心架构与定制运行时边界

### 1. 单运行时收敛（Only Claude Code）
- 本项目**彻底禁用非 Claude 运行时（OpenAI Codex 与 Pi）**。
- 所有会话创建、任务检查、类型互转、数据库映射以及 Orca Worker 派生，一律统一优雅回退到 `claude-code`。
- UI 侧不暴露任何 Codex / Pi 切换器，全面收敛为专注的 Claude 体验。

### 2. 模型目录拉取策略（方案 B：点击按需拉取）
- **启动阶段断网/秒开保证**：
  - `apps/desktop/src/main/maker-host/createDesktopProviderService.ts` 中的 `buildSource()` 必须保持 `disableFetch: true`，严禁在应用 Splash/启动期阻塞请求远程云端目录。
- **按需拉取时机（方案 B）**：
  - 仅在用户打开模型供应商编辑连接设置、点击【获取模型列表】按钮时，才通过 `refreshRemoteCatalogOnDemand()` 发起网络拉取。
  - 每次点击均发起拉取，同时通过 `remoteCatalogFetchInflight` 对正在进行中的并发请求做 Promise 复用与去重。
- **内置提供商精简**：
  - `packages/model-providers/src/builtin.ts` 中 `BUILTIN_PROVIDERS` 仅激活 `ANTHROPIC_PROVIDER`，`models` 设为 `[]`（通过拉取模型 tag 动态填充），禁止硬编码大列表。

### 3. 禁用模块一览（详细清单参见 `UPDATE.md`）
以下模块已被系统级禁用并配置兜底 Stub，请勿擅自重新激活或引入其依赖：
- ❌ **视觉桥（Vision Bridge）**：禁用代理层图片转文字描述转换及配置 Store。
- ❌ **语音全套功能（Voice Input / Call）**：禁用语音输入 IPC、麦克风保活与全局快捷键；维护安全 Stub。
- ❌ **远程桌面（Remote Desktop）**：禁用跨电脑远程控制 IPC；维护安全 Stub。
- ❌ **IM 机器人与外部 Hook（Feishu / Telegram / Hook Control）**：禁用常驻长连接与事件监听；维护安全 Stub。
- ❌ **macOS 菜单栏用量常驻（Menubar Service）**：禁用托盘驻留轮询。
- ❌ **Cindy 专用自营网关（XD Gateway）**：禁用自营网关重定向，直连原生标准端点。

---

## 📂 模块规则与开发正本入口

| 修改范围 | 模块规则入口 | 开发与架构正本 |
| --- | --- | --- |
| **变更与瘦身台账** | [UPDATE.md](UPDATE.md) | 记录所有禁用功能与微调记录的正本 |
| **Desktop 端** | [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md) | [Desktop 开发](docs/dev-rules/desktop-development.md) |
| **Mobile 端** | [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) | [Mobile 开发与冷更边界](docs/dev-rules/mobile-development.md) |
| **maker-core 核心层** | [packages/maker-core/AGENTS.md](packages/maker-core/AGENTS.md) | [Agent 行为](docs/dev-rules/maker-core-and-agent-behavior.md) |

---

## 🛠️ 工程与 Git 交付规范

1. **变更记录强制同步**：
   - 任何涉及功能禁用、重新启用、架构微调或模型策略变更的代码修改，**必须同步在 `UPDATE.md` 中进行更新登记**。
2. **Git 操作纪律**：
   - 保持分支干净整洁。在推送前，**必须将未推送的多个零散 commit 进行 squash**（Git Squash Before Push）。
   - 禁止在任何环境下直接使用系统 `rm` 进行破坏性删除，一律使用项目或系统指定的安全删除通道。
3. **安全与凭据底线**：
   - 用户凭证、API Key、令牌、授权文件一律不得写入仓库或任何被 Git 跟踪的文件。
