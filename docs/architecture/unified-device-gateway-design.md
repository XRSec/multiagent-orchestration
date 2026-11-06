# Multi-Agent Orchestration 网络与网关架构设计规范 (Cindy 风格)

**版本**: 2.0.0 (Unified Device Gateway)  
**设计哲学**: 彻底摒弃 Socket + Web 双轨分裂方案，全面采用 **Cindy 风格统一设备网关 (Device Gateway Host + Client-Only Thin Control)**。  
**网络穿透政策**: 网关专注于本地/宿主全双工服务与状态编排，**网络穿透解耦（由用户根据需要自行挂载 FRP / Tailscale / 反向代理或本地直连）**。

---

## 一、 为什么全面收敛为单一 WebSocket 网关方案？

早期系统常设计“本地用 Unix Domain Socket，外部界面用 Web/HTTP REST，事件流再开一套 WebSocket”。这种双轨或三轨制会导致致命问题：
1. **契约分裂与冗余维护**：新增或修改一个伙伴能力，需在 Socket 分帧、REST Controller、WebSocket 广播中写三份代码；
2. **客户端割裂**：本地 CLI、桌面 UI、手机端需维护不同的通讯协议库；
3. **Cindy 的最佳实践证明**：现代全平台运行时（Node.js CLI、浏览器、Electron、React Native 移动端）**原生 100% 具备成熟的 WebSocket 支持**；本地环回（`ws://127.0.0.1:PORT`）往返延迟仅 0.1~0.2ms，与 Unix Socket 在人机交互场景下无体感差异，但架构复杂度与代码量骤降 60% 以上。

---

## 二、 角色定位与网络拓扑

```
┌────────────────────────────────────────────────────────────────────────┐
│             被控端 / 执行网关 (Device Gateway Host)                     │
│             (用户的电脑 / 运行 multiagent-orchestration 的机器)         │
│                                                                        │
│   - SQLite WAL 高并发消息库 & 单调自增 sequence                        │
│   - 7 位核心伙伴 (moCode, moDoc, moAdmin, MoDeep...) 运行时            │
│   - Claude Agent SDK 进程内驱动与内存原生 MCP 工具                     │
│   - GROUP_MEMORY.md 物理共享黑板持久化                                 │
│   - 本地 Git 工作区与严格目录防逃逸拦截 (canUseTool)                   │
│                                                                        │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │   统一 WebSocket 网关服务 (GatewayServer @ 0.0.0.0:38080)     │     │
│   │   - GET /health: 存活探测 (供 FRP / 监控探针使用)             │     │
│   │   - WS /gateway: 全双工双向控制信道 (带可选 Token 鉴权)       │     │
│   │   - 64 MiB 出站背压拦截 & 30s 心跳租约看门狗                  │     │
│   │   - REMOTE_INVOKE_ALLOWLIST 远程调用白名单 (默认拒绝制)      │     │
│   │   - PUSH_FORWARD_ALLOWLIST Topic 订阅流式转发                │     │
│   └──────────────────────────────▲───────────────────────────────┘     │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │
              全双工 WebSocket 长连接通道 (ws://.../gateway)
        (支持本地环回直连 / 局域网直连 / 用户自建 FRP / Tailscale 穿透)
                                   │
   ┌───────────────────────────────┼──────────────────────────────┐
   │                               │                              │
   ▼                               ▼                              ▼
[本机 CLI 控制端]        [Web 前端 / Electron 界面]    [远程手机 App / 另一台电脑]
(mo-cli 纯控制端)        (跨端 Web 纯控制端)           (Mobile 纯控制端)
- 零 AI Agent 进程       - 零本地 Agent 进程           - 零本地模型 / 零本地 DB
- 零本地 SQLite 负担     - 零本地状态冲突              - 经网关直接指挥电脑上的伙伴
- 共享 GatewayClient     - 共享 GatewayClient          - 共享 GatewayClient
```

---

## 三、 统一 Envelope 帧契约 (The Single Protocol)

所有控制信令、对话推拉、事件流式推送全部使用统一的 Envelope 格式，彻底消除协议转换层。

```typescript
export interface Envelope<T = any> {
  kind: 'link-open' | 'link-accept' | 'invoke' | 'invoke-result' | 'push' | 'ping' | 'pong';
  id: string;              // UUIDv4 请求标识
  src?: string;            // 发起端标识
  dst?: string;            // 目标端标识
  payload: T;              // 强类型载荷
  timestamp: number;       // 时间戳
}
```

### 1. 握手阶段 (`link-open` / `link-accept`)
- 客户端进站发送 `link-open`，携带 `clientName`, `clientType`, 可选 `token` 及能力集；
- 网关校验 Token（若启用），回传 `link-accept`，带回 `gatewayId` 和 `allowlistHash`（两端版本差异校验哈希）。

### 2. 请求-响应阶段 (`invoke` / `invoke-result`)
客户端请求网关执行操作：
```json
{
  "kind": "invoke",
  "id": "req_101",
  "payload": {
    "channel": "agent:chat",
    "args": {
      "roomId": "room_core",
      "botId": "bot_moadmin_director_03",
      "content": "请带领 moCode 开始编译"
    }
  }
}
```
网关执行完成后，原路返回 `invoke-result`：
```json
{
  "kind": "invoke-result",
  "id": "req_101",
  "payload": {
    "channel": "agent:chat",
    "result": {
      "replyContent": "已指派 moCode 开始编译并更新黑板。",
      "sequence": 4,
      "blackboardUpdated": true
    }
  }
}
```

### 3. 事件推流阶段 (`push` 与 Topic 订阅)
网关支持基于 Topic 的实时推流：
- 客户端调用 `gateway:subscribe` 订阅如 `session:<roomId>` 或 `*`；
- 当 Agent 产生实时流式 Token 时，网关推送 `push` 帧：
```json
{
  "kind": "push",
  "id": "evt_201",
  "payload": {
    "topic": "session:room_core",
    "event": "agent:stream_chunk",
    "data": { "chunk": "正在执行架构校验..." }
  }
}
```

---

## 四、 安全白名单防御 (Allowlist & Sandbox Defense)

1. **`REMOTE_INVOKE_ALLOWLIST` (默认拒绝制)**:
   - 仅放行被明确列出的 Channel（`agent:chat`, `room:create`, `worker:task:execute` 等）；
   - 严禁任何远程客户端下发任意 Shell 脚本或读取宿主用户的私密密钥（如 `auth:*`）。
2. **工作区目录防逃逸 (`canUseTool`)**:
   - 运行时工具执行拦截器强制核验目标路径是否超出 `cwd` 或 `mountedDirs` 白名单；
   - 严禁向项目根目录以外的任何敏感系统目录越权写文件。
3. **宿主隔离铁律**:
   - 运行时永远不得修改、污染或依赖用户宿主的 `~/.claude`；
   - 剥离 20 个敏感系统环境变量。

---

## 五、 用户网络穿透挂载指南 (FRP / Tailscale / 本地回环)

网关设计天然契合无头和穿透环境：

### 模式 A：纯本地开发 (Zero Configuration)
- 网关监听：`127.0.0.1:38080`
- CLI 或本地前端直接连接：`ws://127.0.0.1:38080/gateway`

### 模式 B：局域网或内网穿透 (FRP / 反向代理)
在 `frpc.ini` 中配置：
```ini
[multiagent_gateway]
type = tcp
local_ip = 127.0.0.1
local_port = 38080
remote_port = 38080
```
或通过 Nginx 反向代理 WebSocket 升级：
```nginx
location /gateway {
    proxy_pass http://127.0.0.1:38080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### 模式 C：Tailscale 虚拟专网
在运行网关的电脑上加入 Tailscale 网络后，任意接入 Tailscale 的移动设备或笔记本直接通过 Tailscale IP 连接：
```bash
MO_GATEWAY_URL="ws://100.x.y.z:38080/gateway" npx tsx src/daemon/cli.ts status
```

---

## 六、 运维 CLI 命令速查

```bash
# 启动设备网关主机
npx tsx src/daemon/cli.ts start

# 查看网关状态与连接数
npx tsx src/daemon/cli.ts status

# 心跳延迟探测
npx tsx src/daemon/cli.ts ping

# 查询已注册伙伴
npx tsx src/daemon/cli.ts list-bots

# 平滑停止网关
npx tsx src/daemon/cli.ts stop
```
