# Multi-Agent Orchestration 守护进程 (Daemon) 深度架构与实现规范

**文档版本**: 1.0.0  
**状态**: 正式规范 (Standard)  
**更新日期**: 2026-11-05  
**参考系统**: Paseo (`@getpaseo/server`, `@getpaseo/protocol`), Cindy (`CindyR/packages/maker-core`, `agent-control-plane`)

---

## 目录

1. [守护进程总体定位与架构拓扑](#1-守护进程总体定位与架构拓扑)
2. [双通道传输层与帧协议解复用](#2-双通道传输层与帧协议解复用)
3. [出站背压与心跳看门狗机制](#3-出站背压与心跳看门狗机制)
4. [Host as Universal Loader 配置隔离注入](#4-host-as-universal-loader-配置隔离注入)
5. [多 Agent 单发言人编排与黑板协同](#5-多-agent-单发言人编排与黑板协同)
6. [模式 B 进程内 SDK 调度器与工具沙箱拦截](#6-模式-b-进程内-sdk-调度器与工具沙箱拦截)
7. [脱机独立工作进程 (Task & Terminal Worker)](#7-脱机独立工作进程-task--terminal-worker)
8. [CLI 控制端与进程生命周期管理](#8-cli-控制端与进程生命周期管理)
9. [集成测试矩阵与宿主零污染审计](#9-集成测试矩阵与宿主零污染审计)

---

## 1. 守护进程总体定位与架构拓扑

Multi-Agent Orchestration Daemon 是常驻后台的系统核心中枢。它吸收了 **Paseo 的高性能前后端解耦、脱机工作进程、流量背压与网络多路复用**，以及 **Cindy 的宿主确定性多 Agent 调度、单发言人状态机、共享黑板增量切片与防死循环五维熔断**。

```
┌────────────────────────────────────────────────────────────────────────┐
│              Multi-Agent Orchestration Daemon (Core Architecture)      │
│                                                                        │
│   ┌───────────────────────────┐    ┌───────────────────────────────┐   │
│   │    Unix Domain Socket     │    │       HTTP / WebSocket        │   │
│   │   /tmp/mo-daemon.sock     │    │       127.0.0.1:38080         │   │
│   │   (0600 Owner Permissions)│    │   (/api/health, /api/rpc, WS) │   │
│   └─────────────┬─────────────┘    └───────────────┬───────────────┘   │
│                 │                                  │                   │
│   ┌─────────────▼──────────────────────────────────▼───────────────┐   │
│   │          FrameCodec & Dotted RPC Dispatcher (frames.ts)        │   │
│   │   - Opcode Demux: JSON Text & Binary Frames (0x01, 0x10, 0x30) │   │
│   │   - Dotted Namespaces: system.*, agent.*, room.*, worker.*     │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────────────────────▼────────────────────────────────┐   │
│   │             BackpressureGuard & Lease Watchdog                 │   │
│   │      - 64 MiB High-Water Mark Outbound Buffer Ceiling          │   │
│   │      - 15s Ping / 45s Lease Watchdog & Dead Socket Eviction     │   │
│   └──────┬──────────────────────┬──────────────────────────┬───────┘   │
│          │                      │                          │           │
│   ┌──────▼──────────────┐┌──────▼──────────────────┐┌──────▼────────┐  │
│   │   AgentOrchestrator ││   WorkerManager         ││  Universal-   │  │
│   │  - Single Speaker   ││  - Out-of-Process Tasks ││  ConfigLoader │  │
│   │  - Shared Blackboard││  - Detached Lifecycles  ││  - Merge Global│ │
│   │  - Delta Slicing    ││  - Timeout & Sigterm    ││    & Local    │  │
│   │  - Anti-loop Breaker││  - Stdout/Stderr Relays ││  - Strip 20   │  │
│   └──────────┬──────────┘└─────────────────────────┘│    Env Vars   │  │
│              │                                      └───────┬───────┘  │
│   ┌──────────▼──────────┐                                   │          │
│   │   ClaudeSdkRunner   │                                   │          │
│   │  - In-Process Tools │                                   ▼          │
│   │  - canUseTool Check │                       ┌───────────────────┐  │
│   │  - CWD Escape Deny  │                       │ Isolated Configs  │  │
│   └──────────┬──────────┘                       │ Bots/<name>/      │  │
│              │                                  │ claude_config/    │  │
│   ┌──────────▼──────────────────────────────────┴────────────────┐  │  │
│   │           StorageManager & DatabaseSchema (SQLite WAL)       │  │  │
│   │  - bots, rooms, sessions, thread_nodes, messages, cursors    │  │  │
│   │  - GROUP_MEMORY.md Blackboard Disk Persistence               │  │  │
│   └──────────────────────────────────────────────────────────────┘  │  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 双通道传输层与帧协议解复用

Daemon 同时提供两套传输通道，分别针对本地高性能与跨宿主客户端呈现：

### 2.1 本地 Unix Domain Socket (`LocalSocketServer.ts`)
- 默认监听在项目数据目录中的 `daemon.sock`（或 `/tmp/mo-daemon.sock`）；
- 严格设置操作系统文件权限 `0600`（仅允许当前用户进程读写）；
- 零 TCP 网络栈解析与零握手往返开销，微秒级 IPC 响应；
- 采用换行符（`\n`）与 JSON 自闭合解析流式分包。

### 2.2 HTTP & RFC 6455 WebSocket (`WsHttpServer.ts`)
- 原生零依赖 HTTP + WebSocket 服务，默认绑定 `127.0.0.1:38080`；
- `/api/health`: 纳秒级返回健康状态 `{ "status": "ok", "timestamp": ... }`；
- `/api/status`: 结构化输出 PID、正常运行时间、内存快照、活跃连接数；
- `/api/rpc`: 允许外部无头 CLI、curl 或 CI 脚本通过 HTTP POST 直接调用点分 RPC；
- 原生 RFC 6455 WebSocket 协议升级，支持浏览器 / Electron 渲染进程实时全双工连接。

### 2.3 帧协议分流与点分 RPC 路由 (`protocol/frames.ts`)
- **JSON 文本帧**: 承载 `request`, `response`, `event`, `ping`, `pong`；
- **二进制帧**: 参考 Paseo `demux.ts`，首字节作为 Opcode 分流：
  - `0x01`: 终端字符输出流
  - `0x02`: 终端按键输入流
  - `0x10`: 文件传输块
  - `0x30`: Host 穿透路由帧
- **点分 RPC 路由 (Dotted Namespacing)**:
  - `system.status`, `system.ping`
  - `agent.list`, `agent.get`, `agent.chat`, `agent.get_speaker_status`
  - `room.create`, `room.get`
  - `worker.task`, `worker.kill`

---

## 3. 出站背压与心跳看门狗机制

在长时多 Agent 交互中，如果网络慢或终端输出海量字符，Node.js 极易发生缓冲区膨胀导致 OOM 崩溃。

### 3.1 64 MiB 出站硬性高水位 (`BackpressureGuard.ts`)
- 严格继承 Paseo 的 `MAX_PHYSICAL_SOCKET_BUFFERED_BYTES = 64 * 1024 * 1024`（64 MiB）防护阈值；
- 无论是 Unix Socket 还是 WebSocket，在发送每一帧前均检查 `socket.writableLength`；
- 一旦积压达到阈值，立即抛出 `BACKPRESSURE_EXCEEDED` 异常并丢弃非关键瞬态帧，确保守护进程主干不崩溃。

### 3.2 45 秒租约看门狗 (Lease Watchdog, v4.1)
- 客户端每 15 秒 (`pingIntervalMs = 15000`) 发送 `ping`，Daemon 响应 `pong` 并更新连接活跃时间；
- 看门狗定时器每 5 秒扫描一次，若连接超时超过 45 秒 (`zombieTimeoutMs = 45000`) 未有任何活动，判定物理链路假死，主动断开并回收底层文件描述符。

---

## 4. Host as Universal Loader 配置隔离注入

针对宿主环境与伙伴工具的管理，彻底贯彻 **Host as Universal Loader** 哲学：

1. **聚合读取**:
   - 自持全局：只读读取 `~/.multiagent-orchestration/mcp.json`（严禁读取或触碰宿主 `~/.claude`）；
   - 项目本地：读取当前项目根目录的 `.mcp.json`；
   - 技能库：统一扫描 `~/.multiagent-orchestration/skills/` 与项目本地 `Customizations/skills/`；
   - 冲突覆盖规则：本地服务同名优先覆盖全局服务。
2. **20 个敏感系统环境变量剥离**:
   - 强制剥离 `ANTHROPIC_API_KEY`, `CLAUDE_CONFIG_DIR`, `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN` 等 20 个关键安全变量。
3. **独立物化与封锁**:
   - 为各个 Bot 物化专属于它的 `Bots/<name>/claude_config/mcp.json`；
   - 写入 `settings.json`，配置 `strictMcpConfig: true` 与 `settingSources: []`，封死外部磁盘读取；
   - 宿主用户的 `~/.claude` 绝对只读，atime/mtime 毫秒未动，隔离率 100%。

---

## 5. 多 Agent 单发言人编排与黑板协同

### 5.1 确定性单发言人机制 (Single Speaker Orchestration)
- 任何一轮交互仅允许 1 位智能体持有发言席位；
- 讨论卡（`talk` 模式）：前 5 步自动接续，第 6 步强制暂停并等待人类确认；
- 任务卡（`work` 模式）：由 `moAdmin` 统一规划，派发给专业伙伴（`moCode`, `moDoc`, `MoCI` 等）独立执行。

### 5.2 共享黑板与增量切片 (Blackboard & Delta Slicing)
- **单调自增序号**: SQLite 中 `messages.sequence` 严格单调自增（`sequence >= 1`）；
- **读位游标**: 每个 Bot 维护独立的 `member_cursors.last_seen_sequence`；
- **增量切片 (Delta Slicing)**: 每次唤醒前，仅向 Bot 注入 `sequence > last_seen_sequence` 的增量新消息，避免全量上下文膨胀；
- **黑板事实持久化**: 达成任务共识时，自动向 `GROUP_MEMORY.md` 追加事实摘要，并向所有监听端点广播 `blackboard.updated` 事件。

### 5.3 五维立体防死循环熔断 (Anti-Loop Circuit Breaker)
1. **人类所有者触发**: 新交互轮次仅能由人类发起；
2. **`NO_REPLY` 静默退出原语**: 当伙伴返回 `NO_REPLY` 或空内容时，不触发后续广播，直接结束轮次；
3. **3 圈 / 10 条上限熔断**: 单轮任务若连续发生超过 10 轮 Bot 交互而无人类介入，自动触发熔断抛出 `CIRCUIT_BREAKER_TRIPPED`；
4. **人类介入即时恢复**: 人类用户发送下一条消息时，自动重置轮次计数器并解除熔断。

---

## 6. 模式 B 进程内 SDK 调度器与工具沙箱拦截

在 `ClaudeSdkRunner.ts` 中实现最灵活的进程内模式：
1. **内存原生 MCP 工具 (In-Process Tools)**:
   - 内部工具函数直接以内存对象方式注入，免开网络端口与子进程，纳秒级分发；
2. **`canUseTool` 细粒度审批与路径防逃逸拦截**:
   - 在工具执行前拦截 `path`, `file`, `dir`, `target` 参数；
   - 严格核验是否位于当前工作区（CWD）或白名单授权目录（`mountedDirs`）内；
   - 一旦发现路径逃逸，立即拒绝并抛出 `ISOLATION_VIOLATION`；
3. **高保真 Fallback 引擎**:
   - 在无 Anthropic API Key 或离线开发环境下，优雅透明切换至确定性运行时，确保 100% 测试通过与开发可用。

---

## 7. 脱机独立工作进程 (Task & Terminal Worker)

参考 Paseo 的 `terminal-worker` 设计：
- `WorkerManager.ts` 管理独立子进程；
- 支持异步启动长时命令、编译或测试任务（如 `MoCI` 执行构建）；
- 环境变量自动清洗（剥离 20 个敏感 Key）；
- 严格超时控制（超时自动触发 `SIGTERM` 并在 1 秒后强制 `SIGKILL`）；
- 实时捕获 stdout/stderr 字符流，并通过 Daemon 广播 `worker.stdout` 与 `worker.stderr` 事件；
- 子进程崩溃或退出绝不影响主 Daemon 守护进程。

---

## 8. CLI 控制端与进程生命周期管理

通过 `src/daemon/cli.ts` 暴露工业级运维命令：

```bash
# 1. 启动守护进程 (前台常驻或后台守护)
npx tsx src/daemon/cli.ts start

# 2. 查询运行状态 (PID, 端口, 内存, 连接数)
npx tsx src/daemon/cli.ts status

# 3. 心跳检测
npx tsx src/daemon/cli.ts ping

# 4. 列出注册的伙伴
npx tsx src/daemon/cli.ts list-bots

# 5. 优雅关闭守护进程
npx tsx src/daemon/cli.ts stop
```

---

## 9. 集成测试矩阵与宿主零污染审计

在 `test/daemon.test.ts` 中构建了 10 项严苛的自动化端到端测试，全部执行通过：

| 测试用例序号 | 验证模块 | 测试项说明 | 结果 |
|---|---|---|:---:|
| **Test 1** | 启动与 PID 锁 | 启动 DaemonServer、创建 Unix Socket、双监听建立、防重复多开拦截 | **PASS** |
| **Test 2** | Unix Socket RPC | `system.ping` 往返与 `system.status` 结构化元数据获取 | **PASS** |
| **Test 3** | HTTP REST & RPC | `/api/health` (200), `/api/status` (200), `/api/rpc` POST 调用 | **PASS** |
| **Test 4** | UniversalConfigLoader | 全局与本地配置安全合并、20 敏感环境变量剥离、隔离配置物化 | **PASS** |
| **Test 5** | Bot 资产注册 | 7 位核心 Mo-Bots (`moCode`, `moDoc`, `moAdmin` 等) 写入与查询 | **PASS** |
| **Test 6** | 房间与黑板初始化 | `room.create`, `room.get` 及 `GROUP_MEMORY.md` 物理黑板生成与读取 | **PASS** |
| **Test 7** | 单发言人与切片 | 驱动交互、单调递增 sequence、增量切片读取、黑板事实追加 | **PASS** |
| **Test 8** | 防死循环熔断 | 模拟多轮循环触发熔断器、验证人类所有者介入重置与自愈 | **PASS** |
| **Test 9** | 脱机 Worker & 背压 | 运行独立子进程抓取 stdout/stderr、验证 64 MiB 背压超限保护 | **PASS** |
| **Test 10** | 优雅退出与审计 | 清理 Socket 与 PID 文件、审计宿主 `~/.claude` mtime 100% 零修改 | **PASS** |

