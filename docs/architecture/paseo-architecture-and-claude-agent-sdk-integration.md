# Paseo 前后端分离架构与 Claude Agent SDK 集成深度技术规范

**文档版本**: 1.0.0  
**状态**: 正式规范 (Standard)  
**更新日期**: 2026-11-05  
**涉及模块**: `paseo` Monorepo (`@getpaseo/protocol`, `@getpaseo/client`, `@getpaseo/server`, `@getpaseo/app`, `@getpaseo/desktop`), `CindyR/packages/maker-core`, `@anthropic-ai/claude-agent-sdk@0.3.292`

---

## 目录

1. [系统总体架构与设计哲学](#1-系统总体架构与设计哲学)
2. [Paseo 前端架构与 Electron 宿主通信](#2-paseo-前端架构与-electron-宿主通信)
3. [Paseo 后端守护进程 (Daemon) 架构与协议](#3-paseo-后端守护进程-daemon-架构与协议)
4. [高效通信通道与二进制帧多路复用](#4-高效通信通道与二进制帧多路复用)
5. [远程端到端加密中继传输 (E2EE Relay)](#5-远程端到端加密中继传输-e2ee-relay)
6. [进程生命周期与脱机终端隔离 (Terminal Worker)](#6-进程生命周期与脱机终端隔离-terminal-worker)
7. [Cindy 对 `@anthropic-ai/claude-agent-sdk` 的集成实践](#7-cindy-对-anthropic-aiclaude-agent-sdk-的集成实践)
8. [多 Agent Provider 抽象与 MCP 注入对比](#8-多-agent-provider-抽象与-mcp-注入对比)
9. [架构总结与落地建议](#9-架构总结与落地建议)

---

## 1. 系统总体架构与设计哲学

Paseo 是一套面向 AI Agent 协作的高性能开发环境与进程运行时，支持跨平台客户端（移动端、Web 端、桌面端）与本地或远程代码库的安全交互。在架构设计上，Paseo 贯彻了**“本地优先 (Local-First)”**与**“严格前后端契约解耦 (Strict C/S Decoupling)”**两大核心哲学。

### 1.1 Monorepo 包拓扑体系

在 `paseo/package.json` 中，系统采用 npm workspaces 组织为 11 个独立的子包，清晰划定各个技术分层的依赖边界：

```
paseo/ (Monorepo Root)
├── packages/protocol/           # [核心协议] 跨端共享的数据模型、Zod 编解码器与二进制帧规范
├── packages/client/             # [客户端 SDK] 通用 DaemonClient 与 PaseoClient 抽象
├── packages/server/             # [核心守护进程] Node.js 后台 Daemon、Agent 管理、MCP 服务端
├── packages/app/                # [跨端 UI] Expo / React Native 跨平台应用 (iOS/Android/Web/Desktop)
├── packages/desktop/            # [桌面宿主外壳] Electron 主进程、沙箱 Preload 与本地 IPC 传输代理
├── packages/cli/                # [无头命令行] Commander.js CLI 控制端与运维工具
├── packages/relay/              # [远程加密中继] 基于 Noise NK / NaCl 的 E2EE 安全信道客户端
├── packages/highlight/          # [语法高亮引擎] 跨端共享代码着色组件
├── packages/plugin/             # [插件契约] 本地扩展运行时
├── packages/expo-two-way-audio/ # [流式语音] 双向音频原生驱动
└── packages/website/            # [官网与文档] TanStack Router 静态站
```

### 1.2 零代码共享与全契约化约束

前端 (`packages/app`) 与后端守护进程 (`packages/server`) 之间**不存在任何直接的代码导入或内存对象引用**。两者的唯一交互纽带由以下两层构成：
1. **类型与校验契约**: `packages/protocol` 提供所有 RPC、流式事件、状态同步载荷的 TypeScript 类型与运行时 Zod 校验 Schema；
2. **连接通道**: 统一的 `WebSocket`（双工 RPC 与二进制帧）以及辅助的 `HTTP` REST 端点。

这种设计使得：
- 前端与后端守护进程可以完全独立部署、演进与升级；
- 允许单一守护进程同时服务于多个异构客户端（如开发者在手机端通过 Relay 查看任务，同时在桌面端通过 Electron 调试代码，并在终端使用 CLI 执行脚本）；
- 前端因崩溃或断网重连时，绝不影响后台长期运行的 Agent 推理任务或终端编译进程。

---

## 2. Paseo 前端架构与 Electron 宿主通信

```
┌────────────────────────────────────────────────────────────────────────┐
│                        前端呈现层 (Frontend Presentation)               │
│                                                                        │
│   ┌─────────────────────────┐  ┌────────────────────────────────────┐  │
│   │   Mobile App (iOS/And)  │  │   Desktop Electron (Renderer)      │  │
│   │   React Native (Expo)   │  │   BrowserWindow (React Native Web) │  │
│   └────────────┬────────────┘  └─────────────────┬──────────────────┘  │
│                │                                 │                     │
│                │                                 │ window.paseoDesktop │
│                │                                 ▼                     │
│                │               ┌────────────────────────────────────┐  │
│                │               │   Desktop Main Process (Host)      │  │
│                │               │   - preload.ts (contextBridge)     │  │
│                │               │   - LocalTransportManager (IPC)    │  │
│                │               └─────────────────┬──────────────────┘  │
│                │                                 │                     │
│                ▼                                 ▼                     │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    @getpaseo/client (PaseoClient)               │  │
│   │    - HostRuntimeController (心跳重连 / 网络切换)                 │  │
│   │    - ReplicaCache / ReplicaRowStore (本地持久化副本)             │  │
│   │    - DirectorySync (单调序列号比对 / 增量补丁对齐)               │  │
│   │    - ViewedTimelineOwner (会话时间线流式去重与增量消费)         │  │
│   └────────────────────────────────┬────────────────────────────────┘  │
└────────────────────────────────────┼───────────────────────────────────┘
                                     │ WebSocket / IPC
                                     ▼
```

### 2.1 跨端渲染与 Expo 路由体系

`packages/app` 采用 Expo SDK 54 与 React Native 构建，通过 `expo-router` 实现了基于文件目录的动态路由架构（如 `/h/[serverId]/workspace/[workspaceId]` 与 `/h/[serverId]/agent/[agentId]`）。
- **Web 导出与桌面集成**: 执行 `cross-env PASEO_WEB_PLATFORM=electron npx expo export --platform web`，将 UI 编译为纯静态的 Web 产物，直接打包嵌入 Electron 的 `BrowserWindow` 渲染层中；
- **响应式布局**: 同一套 UI 组件利用 `react-native-web` 兼容跨屏幕形态，在移动端呈现紧凑抽屉结构，在桌面端自适应为多面板工作台。

### 2.2 Electron 桌面沙箱与本地传输代理 (`LocalTransportManager`)

在桌面端，Chromium 渲染进程受限于系统沙箱（Renderer Sandbox），**无法直接开启原生 Unix Domain Socket、Windows Named Pipe 或拉起本地 SSH 子进程**。为了让渲染层无缝直连本地守护进程，Paseo 在 `packages/desktop` 中设计了双层 IPC 代理机制：

1. **预加载上下文隔离 (`packages/desktop/src/preload.ts`)**:
   通过 Electron 原生 `contextBridge.exposeInMainWorld("paseoDesktop", ...)` 向全局注入安全 API：
   ```typescript
   contextBridge.exposeInMainWorld('paseoDesktop', {
     invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
     send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
     on: (channel: string, listener: (...args: any[]) => void) => { ... },
     // 暴露系统原生文件选择、窗口控制与外部浏览器跳转能力
   });
   ```

2. **本地传输代理 (`packages/desktop/src/daemon/local-transport.ts`)**:
   主进程中的 `LocalTransportManager` 注册了 `open_local_daemon_transport` 与 `send_local_daemon_transport_message` 两组 IPC 处理器：
   - 渲染层发起连接请求时，主进程在操作系统层面打开真实的 Unix Socket (`/tmp/paseo.sock`) 或命名管道；
   - 渲染层发送的消息经 IPC 打包中继；底层 Socket 收到的数据包由主进程通过 `local_daemon_transport_message` 事件反向广播给前端渲染层；
   - 前端 SDK 中的 `DaemonClient` 感知不到底层物理差异，将其统一封装为标准的 `WebSocketLike` 双工流接口。

### 2.3 本地优先 (Local-First) 状态与缓存架构

为避免网络重连时的“全量拉取雪崩”并保障极致流畅的首屏体验，前端 SDK (`packages/app/src/runtime`) 实现了完整的本地副本管理：
1. **`ReplicaCache` 与 `ReplicaRowStore`**:
   在客户端维护本地 SQLite 或持久化键值存储。工作区配置、项目文件树、Agent 列表在首次同步后长期留存本地，离线状态下依然可完整浏览。
2. **`DirectorySync` 增量同步**:
   每一个实体集合分配有全局单调递增的序列号（Monotonic Sequence）。重连后，客户端仅向后端发送上次持久化的水位线 `lastKnownSequence`，后端直接计算并推送增量变更集合（Delta Patches），大幅缩减握手数据量。
3. **`ViewedTimelineOwner` 时间线消费**:
   针对 Agent 产生的大规模历史交互日志，采用游标分页拉取与流式补丁增量去重，确保客户端长时运行不会发生内存泄漏。

---

## 3. Paseo 后端守护进程 (Daemon) 架构与协议

后端守护进程位于 `packages/server`，是整个开发环境的中枢，由 Node.js 驱动，负责管理工作区、终端、Git 状态机以及各类型 Agent 实例。

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Paseo Node.js Daemon                            │
│                                                                        │
│   ┌───────────────────────┐ ┌───────────────────┐ ┌─────────────────┐  │
│   │  Express HTTP Server  │ │ VoiceAssistantWS  │ │  Proxy & Router │  │
│   │  - /api/status, health│ │ - Origin/Rebind   │ │  - Dynamic Port │  │
│   │  - /api/files/download│ │ - Auth Bearer     │ │  - Web UI Serve │  │
│   │  - /mcp/agents (MCP)  │ │ - Binary Demux    │ │                 │  │
│   └───────────────────────┘ └─────────┬─────────┘ └─────────────────┘  │
│                                       │                                │
│   ┌───────────────────────────────────▼────────────────────────────┐   │
│   │                    Session Authorization & Router              │   │
│   │      - Multi-client Multiplexing                               │   │
│   │      - Dotted RPC Dispatch (session.ts)                        │   │
│   │      - High-Water Mark Outbound Backpressure (64 MiB)          │   │
│   └───────┬───────────────────────────┬────────────────────────────┘   │
│           │                           │                                │
│   ┌───────▼─────────────────┐ ┌───────▼────────────────┐               │
│   │  AgentManager & Runner  │ │    TerminalManager     │               │
│   │  - Timeline & Streams   │ │    - Attached Workers  │               │
│   │  - Provider Adapters    │ │    - PTY Reconnection  │               │
│   └─────────────────────────┘ └────────────────────────┘               │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 引导启动与多协议监听 (`bootstrap.ts`)

在 `packages/server/src/server/bootstrap.ts` 中，Daemon 初始化原生 `http.createServer(app)` 并搭配 Express：
- **监听模式 (`parseListenString`)**:
  - **TCP 网络套接字**: 默认绑定 `127.0.0.1:6767`，支持局域网或容器内自定义端口；
  - **Unix Domain Socket**: 绑定 `unix:///tmp/paseo.sock` 或 `$PASEO_HOME/daemon.sock`，用于高性能本地进程间无网络开销通信；
  - **Windows Named Pipe**: 绑定 `\\.\pipe\paseo-daemon`。
- **静态 Web UI 挂载 (`mountWebUi`)**:
  将前端通过 `scripts/build-daemon-web-ui.mjs` 构建并经过 gzip/brotli 压缩的静态产物（`packages/server/dist/server/web-ui`）随 Daemon 一体化托管。即使不运行 Electron 外壳，用户也可以直接使用任何外部浏览器访问 `http://127.0.0.1:6767` 获得完整的前端功能。
- **内部 MCP 服务端点 (`/mcp/agents`)**:
  Daemon 暴露符合标准 Model Context Protocol 的 HTTP / SSE 端点，使外部工具（甚至其他 IDE）能够直接将 Paseo 托管的 Agent 作为标准 MCP 工具调用。

### 3.2 强契约协议分层 (`packages/protocol/src/messages.ts`)

Paseo 协议彻底摒弃了松散的任意 JSON 结构，全部基于 Zod 强类型鉴别联合体（Discriminated Unions）定义：

| 协议层级 | Schema 标识符 | 核心功能 |
|---|---|---|
| **顶层入站信封** | `WSInboundMessageSchema` | `ping` 心跳、`hello` 握手、`recording_state` 录音状态、`session` 包装载荷 |
| **顶层出站信封** | `WSOutboundMessageSchema` | `pong` 心跳响应、`server_info` 握手确认、`hello.rejected` 握手拒绝、`session` 广播 |
| **会话入站 RPC** | `SessionInboundMessageSchema` | 包含 `create_agent`, `agent_stream_subscribe`, `checkout_diff_update`, `terminal_input` 等上百种强类型请求 |
| **会话出站 RPC** | `SessionOutboundMessageSchema` | 包含 `agent_stream`, `agent_permission_request`, `workspace_update` 等事件流与结果响应 |

### 3.3 点分命名空间 RPC 体系

系统遵循统一的点分命名空间（Dotted Namespacing）规范：
- 请求通常命名为 `<domain>.<subdomain>.<action>.request`（如 `checkout.forge.set_auto_merge.request`）；
- 响应命名为 `<domain>.<subdomain>.<action>.response`；
- 每个请求必须包含唯一的 UUID 字段 `requestId`；
- 服务端捕获异常后，统一返回包含相同 `requestId` 的标准 `rpc_error` 包，确保前端异步 Promise 能够精确结算，避免悬挂调用。

---

## 4. 高效通信通道与二进制帧多路复用

对于 Agent 文本交谈和状态机同步，JSON 具有极高的可读性与灵活性；但对于**高频 PTY 终端字符流**和**大尺寸文件传输**，JSON 序列化会带来极其严重的 CPU 开销与内存垃圾回收压力。

为此，Paseo 协议在单条 WebSocket 物理连接上实现了**文本/二进制混合多路复用架构** (`packages/protocol/src/binary-frames/demux.ts`)。

```
WebSocket 传输帧
 ├── 文本帧 (Text Frame: 0x01) ──────> JSON.parse() ──> WSInboundMessageSchema (RPC / Session)
 └── 二进制帧 (Binary Frame: 0x02) ──> 首字节 Opcode 解复用器 (demux.ts)
                                       ├── 0x30: Host 路由中继帧 (host_route, HOST_ROUTE_OPCODE)
                                       ├── 0x01: Terminal Output (终端字符输出流)
                                       ├── 0x02: Terminal Input (终端按键输入流)
                                       ├── 0x03: Terminal Resize (窗口尺寸变更)
                                       ├── 0x04: Terminal Snapshot (ANSI 历史屏幕快照)
                                       ├── 0x05 - 0x07: Terminal Replay (终端重放流)
                                       ├── 0x10 - 0x12: File Transfer (文件切片流)
                                       └── 0x20 - 0x22: Plugin Binary (插件私有二进制流)
```

### 4.1 首字节 Opcode 分流规范

当客户端或服务端接收到底层二进制帧时，直接读取首字节（`byte[0]`）执行零拷贝分流：

```typescript
// packages/protocol/src/binary-frames/demux.ts 核心分发逻辑
import { HOST_ROUTE_OPCODE } from './host-route.js'; // 0x30

export function demuxBinaryFrame(buffer: Uint8Array): DemuxedFrame {
  const opcode = buffer[0];
  switch (opcode) {
    case HOST_ROUTE_OPCODE: // 0x30: Host 路由中继帧
      return parseHostRouteFrame(buffer.subarray(1));
    case 0x01:
      return parseTerminalOutputFrame(buffer.subarray(1));
    case 0x02:
      return parseTerminalInputFrame(buffer.subarray(1));
    case 0x03:
      return parseTerminalResizeFrame(buffer.subarray(1));
    case 0x04:
      return parseTerminalSnapshotFrame(buffer.subarray(1));
    case 0x10:
    case 0x11:
    case 0x12:
      return parseFileTransferFrame(opcode, buffer.subarray(1));
    default:
      throw new Error(`Unsupported binary frame opcode: ${opcode}`);
  }
}
```

### 4.2 流量背压与租约看门狗

1. **64 MiB 出站硬性高水位截断 (High-Water Mark)**:
   当 Agent 突然输出超大规模日志或终端发生刷屏（如 `cat /dev/urandom`）时，若客户端网络较慢，TCP 缓冲区会发生严重积压。Paseo 在 `packages/server/src/server/websocket/physical-socket.ts` 中设定了 `MAX_PHYSICAL_SOCKET_BUFFERED_BYTES = 64 * 1024 * 1024`（64 MiB）物理 WebSocket 出站高水位线，专门防范 1-10 个并发 Socket 堆积造成的内存膨胀；一旦积压超过阈值，立即丢弃非关键瞬态帧并发送警告，杜绝 Daemon 内存耗尽 OOM 崩溃（注：8 MiB 为单次图片/文件传输的最大载荷上限 `maxSize`，勿与底层物理 Socket 排水阈值混淆）。
2. **租约心跳 (Lease Heartbeat)**:
   客户端每 10 秒发送一次顶层 `ping`；Daemon 在刷新租约的同时若发现超过 30 秒无心跳，将判定物理链路死锁，主动释放底层资源。

---

## 5. 远程端到端加密中继传输 (E2EE Relay)

针对移动端在外网访问本地机器的需求，Paseo 拒绝依赖打洞或向公网暴露不安全的端口，而是引入了零信任端到端加密中继协议（位于 `packages/relay`）。

```
┌──────────────┐                                            ┌──────────────┐
│  Mobile App  │                                            │ Paseo Daemon │
│ (Expo E2EE)  │                                            │ (Local Host) │
└──────┬───────┘                                            └──────┬───────┘
       │                                                           │
       │ 1. Client Hello (Noise NK / NaCl 临时公钥协商)             │
       ├──────────────────────────────┬────────────────────────────┤
       │                              │                            │
       │                     ┌────────┴────────┐                   │
       │                     │ Paseo Relay     │                   │
       │                     │ (Zero-Knowledge)│                   │
       │                     └────────┬────────┘                   │
       │                              │                            │
       │ 2. 密文帧中转 (Encrypted Frame Relay)                      │
       ├─────────────────────────────►│───────────────────────────►│
       │ (中继服务器仅做无状态转发, 无法解密载荷)                      │
       │                              │                            │
```

1. **零知识中继 (Zero-Knowledge Relay)**:
   中继服务器仅记录配对会话与长连接 ID，完全不具备私钥，无法解析任何往来报文。
2. **Noise NK 协议加密握手**:
   - 客户端使用 Daemon 预先展示的身份公钥，发起 Noise NK 握手；
   - 握手完成后，双向流量全部使用 ChaCha20-Poly1305（或 NaCl `crypto_box`）对称加密；
   - 无论经过何种公共网络中继，传输的内容（包括代码快照、终端按键、Shell 交互和 AI Token 流）均享受最高等级的隐私保护。

---

## 6. 进程生命周期与脱机终端隔离 (Terminal Worker)

在传统的集成开发工具中，如果后端服务或主进程崩溃重启，所有正在执行的子进程（如正在编译的 `cargo build` 或训练任务）都会随着进程树的级联杀死而被迫终止。Paseo 在 `docs/terminal-worker.md` 与 `packages/server/src/terminal/` 中实现了革命性的**脱机独立终端工作进程机制**。

```
┌────────────────────────────────────────────────────────────────────────┐
│                        三级进程守护与容灾拓扑                           │
│                                                                        │
│   ┌─────────────────────────────┐                                      │
│   │   Paseo Supervisor 进程     │  (记录于 paseo.pid, 崩溃检测与拉起)    │
│   └──────────────┬──────────────┘                                      │
│                  │ fork() & supervise                                  │
│                  ▼                                                     │
│   ┌─────────────────────────────┐                                      │
│   │   Paseo Daemon 业务进程     │  (处理 HTTP, WebSocket, Agent 调度)  │
│   └──────────────┬──────────────┘                                      │
│                  │ spawn(detached = true)                              │
│                  │ (Unix Domain Socket / PID 登记)                     │
│                  ▼                                                     │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │          Detached Terminal Worker 独立守护子进程             │     │
│   │  - 脱离 Daemon 进程树, PID 由系统 launchd / init (PID 1) 接管   │     │
│   │  - 宿主运行 node-pty 执行真实的 Shell 交互                     │     │
│   │  - 内部运行无头 Headless xterm.js 屏幕缓冲区                  │     │
│   │  - 定时输出 ANSI 快照与增量回放日志                          │     │
│   └──────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

1. **脱离进程树 (Process Detachment)**:
   当用户在工作区开启终端时，Daemon 不在自身进程内启动 PTY，而是以 `detached: true` 启动外部独立的 `terminal-worker` 进程，并将其标准输入输出重定向至 `/dev/null`。该进程的父进程自动变为操作系统的 PID 1。
2. **独立元数据持久化**:
   Worker 启动后将其通信 Socket 与 PID 持久化写入 `$PASEO_HOME/terminal-worker/<pid>.json`。
3. **Daemon 重启自愈 (Crash Recovery)**:
   - 若 Daemon 发生崩溃、热重载或版本更新重启，Supervisor 迅速拉起新的 Daemon 进程；
   - 新 Daemon 扫描 `$PASEO_HOME/terminal-worker/` 目录，通过 Unix Socket 重新 Attach 到存活的 Worker 上；
   - Worker 将自身内存中的 Headless xterm.js ANSI 屏幕快照与最近未消费的增量日志重新打包，推送给客户端重新渲染；
   - **用户的长时间构建任务在 Daemon 重启期间持续运行，零终端会话中断**。

---

## 7. Cindy 对 `@anthropic-ai/claude-agent-sdk` 的集成实践

在 Cindy 体系中（见 `CindyR/packages/maker-core/` 与 `@anthropic-ai/claude-agent-sdk@0.3.292`），官方 SDK 不仅仅是一个模型 API 客户端，而是作为驱动 Claude Code 引擎自主决策、工具调用与代码演进的一等公民（First-Class Citizen）。

```
┌────────────────────────────────────────────────────────────────────────┐
│                  Cindy ClaudeCodeAgent 运行时架构                      │
│                                                                        │
│   ┌───────────────────────┐                                            │
│   │     User / IM / UI    │                                            │
│   └───────────┬───────────┘                                            │
│               │ handle.send()                                          │
│               ▼                                                        │
│   ┌───────────────────────┐                                            │
│   │ inputQueue AsyncQueue │                                            │
│   └───────────┬───────────┘                                            │
│               │ prompt                                                 │
│               ▼                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │            @anthropic-ai/claude-agent-sdk (sdkQuery)           │   │
│   │                                                                │   │
│   │  - Options:                                                    │   │
│   │    * strictMcpConfig: true                                     │   │
│   │    * settingSources: []                                        │   │
│   │    * plugins: [botOwnSkills]                                   │   │
│   │    * mcpServers: { ...InProcessSDK, ...RemoteHTTP }            │   │
│   │    * canUseTool: Interception & Approval                       │   │
│   │    * hooks: PreToolUse, PostToolUse                            │   │
│   │    * env: cleanProcessEnv() + CLAUDE_CONFIG_DIR                │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │ 异步迭代器 (AsyncGenerator)         │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                     startForwardLoop() 消费循环                 │   │
│   │                                                                │   │
│   │   translateSdkMessage()  (translator.ts)                       │   │
│   │   - 状态机跟踪 (RuntimeState / TurnState)                      │   │
│   │   - SDK 原生消息映射为标准化 AgentEvent                         │   │
│   │   - 看门狗与心跳刷新                                           │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │        eventQueue -> SessionEventPipeline -> UI / IM           │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.1 类继承与依赖注入体系

在 `CindyR/packages/maker-core/src/agents/claude-code/index.ts` 中，`ClaudeCodeAgent` 继承自框架基类 `BaseAgent`：
```typescript
export class ClaudeCodeAgent extends BaseAgent {
  readonly kind = 'claude-code' as const;
  readonly capabilities: Capabilities;

  constructor(deps: AgentDeps) {
    super(deps);
    this.capabilities = this.buildCapabilities(CAPABILITIES);
  }
  // ...
}
```
架构遵循完全的**依赖注入模式 (`AgentDeps`)**：
- `deps.auth`: 宿主鉴权适配器（获取订阅 Token、网关 Key 及刷新凭证）；
- `deps.runtimeConfig`: 运行时全局配置（端点、模型覆盖参数、安全标志）；
- `deps.mcpProviders`: 外部注入的 MCP 工具提供商列表；
- `deps.binaryPath`: 本地 Claude Code 原生 CLI 路径。

### 7.2 会话初始化与八段式 System Prompt 拼装

当调用 `startSession(opts)` 时，启动流程经历以下严密的步骤：

1. **鉴权门禁 (Auth Gate)**:
   调用 `resolveAgentCredentialMode` 与 `this.deps.auth.getState()`。若未通过鉴权，坚决抛出 `AgentNotAuthenticatedError`，**绝不带空凭证拉起子进程**，防止子进程静默回退并窃取宿主环境中可能残留的外部环境变量。
2. **环境变量构建与敏感清洗 (`env-builder.ts`)**:
   执行 `cleanProcessEnv()`，强制剥离外部 Shell 中意外带入的 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`、`CLAUDE_CONFIG_DIR` 等；显式注入 `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST = '1'`，阻止 CLI 扫描外部未受控的本地全局配置。
3. **八段式 System Prompt 追加拼装 (`buildClaudeSystemPromptAppend`)**:
   SDK 配置使用 `{ type: 'preset', preset: 'claude_code', append: appendText }`。八段拼装顺序具有强烈的优先级语义：
   - `[1] CC Preset`: 官方 SDK 内置的编码能力底层指令；
   - `[2] botProfilePrompt`: Bot 自身的 `SOUL.md` 人设规范；
   - `[3] MAKER_SYSTEM_PROMPT_APPEND`: 引擎全局协作与安全规则；
   - `[4] makerMemoryRules`: 记忆维护与更新指导原则；
   - `[5] botProfileContextPrompt`: Bot 运行上下文稳定性锚点；
   - `[6] hostSystemPrompt`: 宿主全局提示词（若为 Bot 独立会话则显式置空隔离）；
   - `[7] makerMemoryIndex`: 该 Bot 的 `MEMORY.md` 知识索引快照；
   - `[8] userPrompt`: 最终用户的单次指令。

### 7.3 MCP 工具注册与执行审批机制

Cindy 支持两类 MCP 接入形态，并通过 SDK 参数实施最高级别的安全隔离：

1. **进程内 SDK 实例 (In-Process SDK MCP)**:
   ```typescript
   // 格式：{ type: 'sdk', name: string, instance: McpServer }
   ```
   如 `cindy_memory`, `cindy_helper`, `cindy` 工具，直接在 Node.js 主进程中构建 `McpServer` 实例并传入 SDK，由 SDK 内部进程内调度，**零 Socket 开销，零网络丢包**。
2. **远程传输协议 (Remote Transport MCP)**:
   ```typescript
   // 格式：{ type: 'http' | 'sse', url: string, headers?: Record<string, string> }
   ```
   通过 `CustomMcpProvider` 将外部独立服务（如数据库分析器、浏览器驱动）以标准 HTTP/SSE 格式传递给 SDK 子进程。
3. **Bot 白名单过滤 (`isBotMcpServerAllowed`) 与 `strictMcpConfig`**:
   - `bot-runtime-policy.ts` 强制校验工具必须属于基础服务集合或在 Bot Profile 中显式挂载；
   - **`strictMcpConfig: true`**: 根据官方 SDK 规范（`sdk.d.ts` 中 `strictMcpConfig` 选项），该选项强制 Claude Code **完全忽略磁盘上的任何外部 MCP 配置**（包括用户 `~/.claude.json`、项目 `.mcp.json` 及子代理 frontmatter），仅加载代码中由 `options.mcpServers` 明确传入的服务！
4. **三路细粒度工具审批拦截 (`CanUseTool`)**:
   SDK 在执行工具前触发 `canUseTool(toolName, input, options)`：
   - **路径一 (`AskUserQuestion`)**: 拦截并向前端发起交互卡片，等待用户作答后回填到 `updatedInput.answers` 放行；
   - **路径二 (`ExitPlanMode`)**: 拦截并向前端提交 `plan_review` 交互，用户确认或修改计划后切出 Plan 模式；
   - **路径三 (常规工具)**: 经过能力路由、免审批策略及自动模型审查，若存在风险则向 UI/IM 广播审批请求，由用户点击后返回 `{ behavior: 'allow' }` 或 `{ behavior: 'deny' }`。
5. **本地插件沙箱挂载**:
   Bot 自学或专属的技能目录通过 `options.plugins = [{ type: 'local', path: botSkillDir }]` 传入，不写入宿主的公共技能目录。

### 7.4 运行时多轮交互与自愈机制

1. **流式 Prompt 队列 (`createAsyncQueue`)**:
   初始化单消费者异步队列 `inputQueue`，并作为参数传入 `sdkQuery({ prompt: inputQueue, ... })`。用户后续发送的消息通过 `inputQueue.push(sdkInput)` 持续喂入，实现在同一个运行中的 SDK 进程内进行无限多轮无感交谈。
2. **前向消费与消息翻译 (`startForwardLoop` & `translator.ts`)**:
   异步迭代器消费原始 SDK 消息（`system`, `stream_event`, `assistant`, `result`, `control_response` 等），通过内部状态机平滑转换为标准化的 `AgentEvent`（如 `text_delta`, `tool_result_full`, `status`, `done`），送入 `eventQueue` 并广播至前端。
3. **静默流断流透明自愈 (`CLAUDE_ENABLE_STREAM_WATCHDOG`)**:
   在子进程环境变量中注入看门狗，紧盯 HTTP chunk 间隔；若超过 300 秒无任何字节活动，子进程内部自动触发非流式降级重试，上层调用完全无感。
4. **OAuth 订阅 Token 401 动态热刷新 (`getOAuthToken`)**:
   向 SDK 注入 `getOAuthToken` 回调。当长时间运行的子进程遇到 401 Unauthorized 时，底层触发 `oauth_token_refresh`，回调宿主无缝刷新 Access Token 并热更新写回子进程环境变量。
5. **失效 Resume 会话自愈与满窗自动压缩**:
   - 若恢复旧会话时遇到快照丢失，自动降级为全新 Session 并重建 Query；
   - 当上下文逼近 Token 阈值时，自动向 `inputQueue` 发送 `/compact` 指令完成结构化摘要压缩，再继续执行后续任务。

---

## 8. 多 Agent Provider 抽象与 MCP 注入对比

为了全景化理解 Paseo 与 Cindy 在不同 Agent 引擎上的架构差异，下表对各类 Provider 进行了系统对比：

| 特性维度 | Paseo: Claude Code Provider | Paseo: Terminal / ACP Provider (Pi, Codex) | Cindy: ClaudeCodeAgent (SDK 原生) |
|---|---|---|---|
| **接入核心** | `@anthropic-ai/claude-agent-sdk` | 独立子进程 (JSON-RPC / PTY) | `@anthropic-ai/claude-agent-sdk@0.3.292` |
| **进程形态** | Daemon 内部实例化 SDK 子进程 | 脱机独立子进程 (Detached PTY) | Electron/Node 宿主内存直接调度 SDK |
| **MCP 工具注入** | 通过内置 `/mcp/agents` HTTP 反向暴露 | 命令行参数或标准输入/输出流 | 内存中直接装配 In-Process SDK MCP (`type: 'sdk'`) 与远程 HTTP MCP |
| **配置目录依赖** | 默认继承宿主环境或指定工作区 | 环境变量沙箱隔离 | v4.1 已全面强制注入独立 `CLAUDE_CONFIG_DIR=<bot_dir>/claude_config`（零 `~/.claude` 触碰） |
| **工具调用鉴权** | Daemon 推送 `agent_permission_request` | PTY 交互拦截 | SDK `canUseTool` 细粒度回调 + 策略拦截 |
| **多轮对话输入** | 单次 Query 或工作区指令流 | 终端 stdin 输入流 | `inputQueue` 异步队列流式喂入 |

---

## 9. 架构总结与落地建议

1. **通信架构的规范性**:
   Paseo 的“Zod 强契约 + 点分 RPC + 二进制首字节解复用”架构为现代复杂 AI 应用建立了极高标准。前端无论是 Web 还是桌面原生，均通过统一契约与轻量 SDK 与后台通信，架构高度解耦。
2. **SDK 集成的深度与工业级加固**:
   Cindy 对 `@anthropic-ai/claude-agent-sdk` 的运用不仅覆盖了标准接口，更在**鉴权门禁、环境净化、敏感工具拦截、流式看门狗、401 凭证热刷与上下文压缩**方面构建了工业级的安全防御体系。
3. **针对 R3（Bot 独立 MCP 隔离）的演进抓手**:
   当前 Cindy 在逻辑上已经施加了 `strictMcpConfig: true`、`settingSources: []` 与 `plugins` 本地沙箱；在 v4.1 架构中，已通过为每个 Bot 动态分配独立的 `<bot_dir>/claude_config`（配合 `settingSources: []` 与 `strictMcpConfig: true`）并将转录统一落盘至 `storage/transcripts/` 与 `~/.multiagent-orchestration/transcripts/`，彻底实现了宿主 `~/.claude` 环境的 0 侵入与多 Bot 的绝对物理隔离。
