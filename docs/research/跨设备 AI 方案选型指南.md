# 跨设备 AI 方案选型指南

> 导出自 Google Gemini 会话

---

## 👤 用户提问 1

统一标准 HTTP + SSE / 单一 JSON-RPC  现在推荐的跨设备 AI 方案哪个最好 有没有更好的  统一标准 HTTP + SSE / 单一 JSON-RPC   现在推荐的跨设备 AI 方案哪个最好 有没有更好的

## 🤖 Gemini 回答

在跨设备 AI 架构中，早期的“双端点 HTTP + 长连接 SSE”已被正式废弃；目前统一标准的演进终点是“单一端点 Streamable HTTP（承载 JSON-RPC 2.0，按需返回短生命周期 SSE）”。但如果你追求跨设备（手机、桌面、多节点 VPS）的实时状态同步、工具审批与 NAT 穿透，**有比 HTTP + SSE 更好的底层方案**。 [^1]

## 一、 基于“HTTP + SSE / 单一 JSON-RPC”的三大主流标准对比

AI 生态已经把协议切分成了三个互不冲突的垂直层，全部统一在 **JSON-RPC 2.0** 语义之下： [^2]

| 协议标准 | 定位层级 | 传输层演进现状 | 跨设备优缺点 |
| --- | --- | --- | --- |
| MCP (2026-07-28 规范) | 纵向：Agent ↔ 远程工具/资源 | 彻底废弃旧版 /sse 双端点，全面转向 Streamable HTTP。单一 /mcp POST 端点，彻底无状态化（移除了 initialize 握手与内存 Session）。 | 最轻量、天然适配反向代理与负载均衡；但服务端无法主动向客户端发起独立请求（如远程弹窗审批受限）。 |
| A2A v1.0 (Linux 基金会) | 横向：Agent ↔ Agent 跨设备委托 | 默认采用 JSON-RPC 2.0 over HTTPS + SSE（SendStreamingMessage），同时原生提供 gRPC 与 WebSocket 绑定。 | 目前跨设备多 Agent 协作的最佳标准。内置显式任务状态机（含 INPUT_REQUIRED 中断等待人工确认）、Webhook 推送与多模态 Artifact 传输。 |
| ACP (Agent Client Protocol) | 前端：UI/CLI/IDE ↔ Coding Agent | 本地默认双向 stdio JSON-RPC；跨设备通常直接桥接到 WebSocket。 | 专为交互式 Agent 设计，原生定义了 Diff 预览、终端流、目录挂载与双向权限拦截（Permission Request）。 |

> **关键避坑：** 如果你在自研或选型，千万不要再用旧版“一条常驻 GET SSE 流 + 一条 POST 发消息”的设计。跨移动网络（Wi-Fi 切 5G）或经过跨国代理时，半开连接（Half-open TCP）和会话粘滞（Sticky Session）会让重连状态恢复变成灾难。**Streamable HTTP** 每次请求独立 POST，普通调用直接返回 `application/json`，耗时流式输出才升级为 `text/event-stream`，流结束即断开，干净利落。 [^3]

## 二、 有没有比 HTTP + SSE 更好的跨设备方案？

HTTP + SSE 本质上是“客户端强主动、服务端弱被动”的半双工妥协。在跨设备场景下，一旦遇到以下三个痛点，HTTP + SSE 就会显得捉襟见肘：

1. **设备在 NAT / 防火墙后**（如家里或公司的 Mac、移动端的手机，没有公网 IP）。
2. **双向对等控制（Server-to-Client RPC）**：远程 Agent 跑在 VPS 上，执行高危命令时需要立刻向你的手机/桌面端推送审批请求并阻塞等待结果，或者需要临时读取你本地电脑剪贴板里的一段上下文。 [^4]
3. **跨网断线重连与增量帧同步**：手机锁屏唤醒后，需要无损追平终端输出与思考流，而不是重新跑一遍任务。

针对这些痛点，业界已经跑通了**三种明显优于纯 HTTP + SSE 的架构方案**：

### 1. 终端与 Coding Agent 跨设备首选：Daemon + 端到端加密 Relay / Mesh（JSON-RPC over WebSocket）

这是目前跨设备操控本地/远端 Agent 体验最成熟的形态（典型成品如开源的 **Paseo** 架构）。 [^5]

- **核心机制：** 各台宿主机（Mac、Linux VPS）运行轻量级守护进程（Daemon）托管本地 Agent 进程池，客户端（CLI、Web、iOS/Android）与 Daemon 之间通过单一 **WebSocket** 全双工通道收发 JSON-RPC 帧。 [^6]
- **网络穿透：** 放弃公网暴露 HTTP 端口，采用 **Outbound Relay（出站中继，零端口映射 + 公钥握手端到端加密）** 或直接绑定在 **Tailscale / WireGuard IPv6** 虚拟内网 IP 上直连。
- **为什么更好：** 真正的全双工单连接，无 HTTP Header 往返开销；多个客户端（如电脑端 CLI 和手机 App）可以同时 Attach 到同一个 Agent Session 上实时共享终端流、Diff 和审批弹窗。 [^7]

### 2. 多节点分布式 Agent 编排首选：NATS + JetStream（Pub/Sub 替代点对点 RPC）

当你的 AI 节点分散在不同地域的设备（例如：一台国内机器做采集/本地 UI 操作、一台海外 VPS 跑推理调度与交易执行、手机做监控告警），点对点的 HTTP/RPC 会面临复杂的路由和超时重试问题。

- **核心机制：** 部署一个极轻量的单二进制 **NATS** 核心节点，所有设备均以 **Outbound TCP/TLS** 主动连向 Broker，内部依然可以直接封装 JSON-RPC 2.0 载荷。 [^8]
- **为什么更好：**

- **天然穿透所有 NAT：** 任何设备无需公网 IP、无需配反向代理，连上就能互相调用（Request-Reply 模式耗时仅亚毫秒级开销）。 [^9]
- **断线不丢状态：** 配合内置的 **JetStream** 持久化流，即使某台设备短暂断网或重启，恢复后也能按 Sequence ID 精确回放错过的事件流与任务指令，彻底解决 SSE 断流丢包问题。

### 3. 跨国高延迟 / 移动弱网流式传输：gRPC 双向流 或 WebTransport (QUIC)

- **A2A over gRPC： [^10]** A2A v1.0 已原生内置 Protobuf + gRPC 绑定。相比文本格式的 JSON + SSE，二进制序列化体积更小，且基于 HTTP/2 多路复用支持原生双向流与严格 Schema 校验，适合高频结构化数据（如实时行情 + Agent 决策信号）的跨节点直连。 [^11]
- **WebTransport (基于 HTTP/3 QUIC)： [^12]** 如果前端包含浏览器或移动端，且跨洲际网络存在丢包，WebTransport 解决了 TCP/WebSocket 的队头阻塞（Head-of-Line Blocking）问题，并在网络切换（Wi-Fi 切蜂窝网络）时支持 **0-RTT 连接迁移**，流不会断开。

## 三、 落地选型建议

1. **做标准化工具暴露 / 插件生态（对标通用客户端）： [^13]**
直接上 **MCP 最新版 Streamable HTTP（单 `/mcp` POST 端点 + 无状态 JSON-RPC）**。这是兼容所有主流 AI 客户端的最大公约数，零维护负担。 [^14]
2. **做异构多 Agent 跨云/跨机任务委派：**
采用 **A2A v1.0**。对外保持 JSON-RPC + SSE 兼容，内部节点间开启它的 **gRPC** 或 **WebSocket** 绑定，直接复用它现成的任务生命周期状态机（`SUBMITTED` → `WORKING` → `INPUT_REQUIRED` → `COMPLETED`）。 [^15]
3. **自建个人全设备 AI 中枢（Mac + 多地 Linux VPS + 手机）：**

- **想开箱即用：** 直接用 **Paseo**（Apache 2.0 开源 Daemon + Cross-Daemon 插件）配合 Tailscale 或自建 Relay，把各机器的 CLI Agent 统一收拢。
- **想自己写零依赖底座：** 放弃 HTTP + SSE，采用 **“单一 WebSocket（跑双向 JSON-RPC 2.0，附带单调递增 `seq` 序号用于断线增量重放）+ WireGuard/IPv6 直连（或 NATS 中转）”**。在控制代码极简的同时，延迟、双向交互和弱网恢复能力都比 HTTP + SSE 高出一个量级。 [^16]

---

## 📚 参考文献与引用源

1. [https://www.google.com/intl/zh-CN/about/products](https://www.google.com/intl/zh-CN/about/products)
2. [Gemini](https://gemini.google.com/)
3. [https://gemini.google.com/library](https://gemini.google.com/library)
4. [https://gemini.google.com/scheduled](https://gemini.google.com/scheduled)
5. [https://gemini.google.com/customize](https://gemini.google.com/customize)
6. [视频](https://gemini.google.com/videos)
7. [https://accounts.google.com/SignOutOptions?continue=https://gemini.google.com](https://accounts.google.com/SignOutOptions?continue=https://gemini.google.com)


---

## 👤 用户提问 2

我说的是 daemon 与 client （app/web/android）  我说的是 daemon 与 client （app/web/android）

## 🤖 Gemini 回答

[https://www.google.com/intl/zh-CN/about/products](https://www.google.com/intl/zh-CN/about/products)[https://accounts.google.com/SignOutOptions?hl=zh-CN&continue=https://gemini.google.com/app/3232a637c69efa2a&ec=GBRAkgU](https://accounts.google.com/SignOutOptions?hl=zh-CN&continue=https://gemini.google.com/app/3232a637c69efa2a&ec=GBRAkgU)<iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KKRLL9S" height="0" width="0" style="display:none;visibility:hidden"></iframe>[Gemini](/)[/app](/app)[library](library)[/scheduled](/scheduled)[/customize](/customize)[库](library)[已安排](/scheduled)[自定义](/customize)[视频](/videos)[https://accounts.google.com/SignOutOptions?continue=https://gemini.google.com](https://accounts.google.com/SignOutOptions?continue=https://gemini.google.com)

# 与 Gemini 对话

你说 统一标准 HTTP + SSE / 单一 JSON-RPC 
现在推荐的跨设备 AI 方案哪个最好 有没有更好的 

统一标准 HTTP + SSE / 单一 JSON-RPC

现在推荐的跨设备 AI 方案哪个最好 有没有更好的

Gemini 说

在跨设备 AI 架构中，早期的“双端点 HTTP + 长连接 SSE”已被正式废弃；目前统一标准的演进终点是“单一端点 Streamable HTTP（承载 JSON-RPC 2.0，按需返回短生命周期 SSE）”。但如果你追求跨设备（手机、桌面、多节点 VPS）的实时状态同步、工具审批与 NAT 穿透，**有比 HTTP + SSE 更好的底层方案**。 [^1]

## 一、 基于“HTTP + SSE / 单一 JSON-RPC”的三大主流标准对比

AI 生态已经把协议切分成了三个互不冲突的垂直层，全部统一在 **JSON-RPC 2.0** 语义之下： [^2]

| 协议标准 | 定位层级 | 传输层演进现状 | 跨设备优缺点 |
| --- | --- | --- | --- |
| MCP (2026-07-28 规范) | 纵向：Agent ↔ 远程工具/资源 | 彻底废弃旧版 /sse 双端点，全面转向 Streamable HTTP。单一 /mcp POST 端点，彻底无状态化（移除了 initialize 握手与内存 Session）。 | 最轻量、天然适配反向代理与负载均衡；但服务端无法主动向客户端发起独立请求（如远程弹窗审批受限）。 |
| A2A v1.0 (Linux 基金会) | 横向：Agent ↔ Agent 跨设备委托 | 默认采用 JSON-RPC 2.0 over HTTPS + SSE（SendStreamingMessage），同时原生提供 gRPC 与 WebSocket 绑定。 | 目前跨设备多 Agent 协作的最佳标准。内置显式任务状态机（含 INPUT_REQUIRED 中断等待人工确认）、Webhook 推送与多模态 Artifact 传输。 |
| ACP (Agent Client Protocol) | 前端：UI/CLI/IDE ↔ Coding Agent | 本地默认双向 stdio JSON-RPC；跨设备通常直接桥接到 WebSocket。 | 专为交互式 Agent 设计，原生定义了 Diff 预览、终端流、目录挂载与双向权限拦截（Permission Request）。 |

> **关键避坑：** 如果你在自研或选型，千万不要再用旧版“一条常驻 GET SSE 流 + 一条 POST 发消息”的设计。跨移动网络（Wi-Fi 切 5G）或经过跨国代理时，半开连接（Half-open TCP）和会话粘滞（Sticky Session）会让重连状态恢复变成灾难。**Streamable HTTP** 每次请求独立 POST，普通调用直接返回 `application/json`，耗时流式输出才升级为 `text/event-stream`，流结束即断开，干净利落。 [^3]

## 二、 有没有比 HTTP + SSE 更好的跨设备方案？

HTTP + SSE 本质上是“客户端强主动、服务端弱被动”的半双工妥协。在跨设备场景下，一旦遇到以下三个痛点，HTTP + SSE 就会显得捉襟见肘：

1. **设备在 NAT / 防火墙后**（如家里或公司的 Mac、移动端的手机，没有公网 IP）。
2. **双向对等控制（Server-to-Client RPC）**：远程 Agent 跑在 VPS 上，执行高危命令时需要立刻向你的手机/桌面端推送审批请求并阻塞等待结果，或者需要临时读取你本地电脑剪贴板里的一段上下文。 [^4]
3. **跨网断线重连与增量帧同步**：手机锁屏唤醒后，需要无损追平终端输出与思考流，而不是重新跑一遍任务。

针对这些痛点，业界已经跑通了**三种明显优于纯 HTTP + SSE 的架构方案**：

### 1. 终端与 Coding Agent 跨设备首选：Daemon + 端到端加密 Relay / Mesh（JSON-RPC over WebSocket）

这是目前跨设备操控本地/远端 Agent 体验最成熟的形态（典型成品如开源的 **Paseo** 架构）。 [^5]

- **核心机制：** 各台宿主机（Mac、Linux VPS）运行轻量级守护进程（Daemon）托管本地 Agent 进程池，客户端（CLI、Web、iOS/Android）与 Daemon 之间通过单一 **WebSocket** 全双工通道收发 JSON-RPC 帧。 [^6]
- **网络穿透：** 放弃公网暴露 HTTP 端口，采用 **Outbound Relay（出站中继，零端口映射 + 公钥握手端到端加密）** 或直接绑定在 **Tailscale / WireGuard IPv6** 虚拟内网 IP 上直连。
- **为什么更好：** 真正的全双工单连接，无 HTTP Header 往返开销；多个客户端（如电脑端 CLI 和手机 App）可以同时 Attach 到同一个 Agent Session 上实时共享终端流、Diff 和审批弹窗。 [^7]

### 2. 多节点分布式 Agent 编排首选：NATS + JetStream（Pub/Sub 替代点对点 RPC）

当你的 AI 节点分散在不同地域的设备（例如：一台国内机器做采集/本地 UI 操作、一台海外 VPS 跑推理调度与交易执行、手机做监控告警），点对点的 HTTP/RPC 会面临复杂的路由和超时重试问题。

- **核心机制：** 部署一个极轻量的单二进制 **NATS** 核心节点，所有设备均以 **Outbound TCP/TLS** 主动连向 Broker，内部依然可以直接封装 JSON-RPC 2.0 载荷。 [^8]
- **为什么更好：**

- **天然穿透所有 NAT：** 任何设备无需公网 IP、无需配反向代理，连上就能互相调用（Request-Reply 模式耗时仅亚毫秒级开销）。 [^9]
- **断线不丢状态：** 配合内置的 **JetStream** 持久化流，即使某台设备短暂断网或重启，恢复后也能按 Sequence ID 精确回放错过的事件流与任务指令，彻底解决 SSE 断流丢包问题。

### 3. 跨国高延迟 / 移动弱网流式传输：gRPC 双向流 或 WebTransport (QUIC)

- **A2A over gRPC： [^10]** A2A v1.0 已原生内置 Protobuf + gRPC 绑定。相比文本格式的 JSON + SSE，二进制序列化体积更小，且基于 HTTP/2 多路复用支持原生双向流与严格 Schema 校验，适合高频结构化数据（如实时行情 + Agent 决策信号）的跨节点直连。 [^11]
- **WebTransport (基于 HTTP/3 QUIC)： [^12]** 如果前端包含浏览器或移动端，且跨洲际网络存在丢包，WebTransport 解决了 TCP/WebSocket 的队头阻塞（Head-of-Line Blocking）问题，并在网络切换（Wi-Fi 切蜂窝网络）时支持 **0-RTT 连接迁移**，流不会断开。

## 三、 落地选型建议

1. **做标准化工具暴露 / 插件生态（对标通用客户端）： [^13]**
直接上 **MCP 最新版 Streamable HTTP（单 `/mcp` POST 端点 + 无状态 JSON-RPC）**。这是兼容所有主流 AI 客户端的最大公约数，零维护负担。 [^14]
2. **做异构多 Agent 跨云/跨机任务委派：**
采用 **A2A v1.0**。对外保持 JSON-RPC + SSE 兼容，内部节点间开启它的 **gRPC** 或 **WebSocket** 绑定，直接复用它现成的任务生命周期状态机（`SUBMITTED` → `WORKING` → `INPUT_REQUIRED` → `COMPLETED`）。 [^15]
3. **自建个人全设备 AI 中枢（Mac + 多地 Linux VPS + 手机）：**

- **想开箱即用：** 直接用 **Paseo**（Apache 2.0 开源 Daemon + Cross-Daemon 插件）配合 Tailscale 或自建 Relay，把各机器的 CLI Agent 统一收拢。
- **想自己写零依赖底座：** 放弃 HTTP + SSE，采用 **“单一 WebSocket（跑双向 JSON-RPC 2.0，附带单调递增 `seq` 序号用于断线增量重放）+ WireGuard/IPv6 直连（或 NATS 中转）”**。在控制代码极简的同时，延迟、双向交互和弱网恢复能力都比 HTTP + SSE 高出一个量级。 [^16]

你说 我说的是 daemon 与 client （app/web/android） 

我说的是 daemon 与 client （app/web/android）

Gemini 说

在 **Daemon ↔ Client（App / Web / Android）** 这个具体交互层面上，结论非常明确：**“双向 JSON-RPC 2.0 over 单一 WebSocket + 增量事件日志（Event Log Cursor）”** 是目前工程体验最好、最成熟的黄金标准；而对于极端移动弱网，唯一比它更强的下一代方案是 **JSON-RPC over WebTransport (QUIC)**。

反过来，**HTTP + SSE 在这一层其实是“次优妥协”**，尤其在 Android 端和 Web 端同时挂载同一个 Daemon 时会暴露出明显的架构缺陷。

## 一、 为什么 HTTP + SSE 在 Daemon ↔ Client (特别是 Android/Web) 层不够好？

如果你用 Streamable HTTP + SSE 让 Web 和 Android 连 Daemon，立刻会撞上四个工程痛点：

1. **反向 RPC（Daemon → Client）极其别扭：**
Daemon 里的 Agent 跑着跑着需要向 Client 发起一个 `permission.request`（比如高危命令拦截弹窗），或者请求 Client 当前的 UI 焦点状态。在 HTTP + SSE 下，SSE 只能单向推事件，Client 收到后再另起一个 HTTP POST 把审批结果塞回去，请求与响应在协议层是割裂的，超时、撤回和多端抢答（比如电脑和手机同时弹了审批，手机点同意后电脑端弹窗怎么立刻消掉）需要自己手写一堆状态胶水。
2. **Android 移动网络的“假死连接（Zombie Connection）”：**
手机进电梯、切 Wi-Fi / 5G、或者锁屏进入 Doze 模式时，底层 TCP 连接经常处于半开状态。SSE 没有协议级双向 Ping/Pong 帧，Android 客户端往往要等几十秒系统超时才发现流断了，期间用户发指令转圈、看输出卡死。
3. **浏览器的连接池与跨域预检（CORS Preflight）损耗：**
高频交互（如终端按键流、实时取消任务、切换 Session）每次都发独立 POST，在 Web 端会频繁触发 OPTIONS 预检和 HTTP Header 解析开销。
4. **多端 Attach（状态广播）成本高：**
当你的桌面 App、Web 页面和 Android 手机同时打开同一个 Session 时，Daemon 需要把同一份流广播给三个端，用双向长连接做 Room/Session 订阅比维护多条 HTTP 流直观得多。

## 二、 当前生产级最优解：单一 WebSocket + 双向 JSON-RPC + Seq 游标

这也是目前主流 Coding Agent 守护进程（如 **ACP 协议远程桥接**、**Paseo**、**OpenCode Server** 等）不约而同收敛到的终极形态。它的精髓不在于“用了 WebSocket”，而在于**协议帧的设计**：

### 1. 真正的对等双向 JSON-RPC 2.0（Peer-to-Peer RPC）

连接一旦建立，不再区分谁是 HTTP Client 谁是 Server，双方都是对等的 JSON-RPC 节点：

- **Client → Daemon Request：** `session.prompt`、`session.cancel`、`fs.read`
- **Daemon → Client Notification（流式推送）：** `session.delta`（Token 流 / 思考流 / Tool 输出帧）
- **Daemon → Client Request（反向调用！）：** `client.requestPermission`、`client.askUserQuestion`

- Daemon 直接发出带 `id` 的 JSON-RPC Request 并 `await`；
- Web 和 Android 同时收到弹窗，任意一端点击“允许”返回 JSON-RPC Response，Daemon 立刻继续执行，并顺手发一条 `notification` 让其他端的弹窗自动消失。所有逻辑都在一套统一的 RPC 语义里闭环。

### 2. 核心灵魂：Event Log + 单调递增 `seq`（专治 Android 断网与锁屏）

单纯的 WebSocket 断了也会丢消息，所以**绝对不能把 Daemon 做成“只管往下吐数据的管道”**，而要把 Daemon 的 Session 做成**内存/SQLite 环形事件日志（Append-only Event Log）**：

- Daemon 产生的每一个流式分片、工具状态变更，都分配一个当前 Session 内严格递增的序号 `seq`（例如 `1041, 1042, 1043...`）。
- Android 锁屏切后台 5 分钟后再点亮屏幕，WebSocket 瞬间重连，发送的第一条握手指指令只需带上前一秒收到的最后游标：

JSON

```
{ "jsonrpc": "2.0", "id": 1, "method": "session.attach", "params": { "sessionId": "sess_01", "afterSeq": 1042 } }
```
- Daemon 直接从内存 Ring Buffer（或本地 SQLite WAL）里把 `1043 ~ 最新` 的增量帧一次性推下来，随后无缝切回实时流。**0 丢包、无需重拉全量历史、毫秒级追平界面。**

### 3. 混合载荷（JSON 控制帧 + Binary 终端/媒体帧）

WebSocket 原生支持 Text Frame 和 Binary Frame 混传：

- **Text Frame：** 跑纯正的单一 JSON-RPC 2.0（管生命周期、对话、审批、结构化 Diff）。
- **Binary Frame：** 如果你的 Daemon 挂载了真实的 PTY 终端（比如交互式 `vim`、`htop` 或实时音频/截图预览），直接用 1 字节 Channel ID 前缀 + 原始字节流走 Binary Frame，彻底省掉 Base64 编解码的体积膨胀与延迟。这是 HTTP + SSE 完全做不到的。

## 三、 有没有比 WebSocket 更好的？（下一代天花板方案）

如果你追求极致的工程指标，目前有两个方向在特定维度上确实比 WebSocket 更强：

| 进阶方案 | 核心优势（比 WebSocket 强在哪） | Web / Android / App 落地成本与现状 |
| --- | --- | --- |
| 1. JSON-RPC over WebTransport (HTTP/3 QUIC) | 彻底消灭移动弱网痛点： ① 0-RTT 连接迁移——Android 从家里 Wi-Fi 走到门外切 5G，IP 变了但 QUIC Connection ID 不变，连接根本不断；② 无队头阻塞（HOL Blocking）——可开一条 Reliable Bidirectional Stream 跑 JSON-RPC 控制信令，同时开多条独立 Stream 跑大体积文件/Diff/日志流，互不卡顿。 | Web (Chrome/Android WebView) 原生 new WebTransport() 已完全成熟；Android 原生可用 Cronet (Google 官方网络库)；坑点： Safari/iOS WebKit 支持较慢，且 Node.js 原生 WebTransport 服务端生态不如 WS 轻量（Go / Rust 写 Daemon 则非常丝滑），通常需要保留 WebSocket 作为 Fallback。 |
| 2. 本地 SQLite 增量同步引擎（Sync Engine 模式） | 离线优先（Offline-First）： Client（Android/App/Web IndexedDB）本地直接持有一份 Session/Message 表镜像，网络层不再关心“请求流”，只做底层 WAL/Row 差量同步，打开 App 永远是 0ms 瞬开历史记录，弱网发消息自动入本地队列。 | 适合重客户端体验，但对于实时 Token 流（每秒几十帧）如果全走数据库同步会有写放大，最佳实践是“历史消息走 Sync / Cursor 拉取，正在生成的 ephemeral 流走 WebSocket 内存广播”。 |

## 四、 跨三端（Desktop App / Web / Android）最优雅的架构组合

如果你现在自己定协议写 Daemon 和三端 Client，最干净、零冗余、以后绝对不用返工的组合是：

1. **协议语义层：单一 JSON-RPC 2.0**
所有控制、订阅、反向审批全部收敛进一套 JSON-RPC Schema（可以直接参考或兼容 **ACP** 的方法命名，省去自己设计 Tool Call / Diff / Permission 数据结构的时间）。
2. **传输与重连层：单一 `/rpc` WebSocket 端点 + `seq` 增量重放 + 应用层 15s 心跳**

- 放弃 SSE；只留一个普通 HTTP 接口给大体积静态产物下载（比如截图、导出文件，走浏览器原生缓存和 Range 断点续传）。
- 加上应用层极简 `ping/pong`（15 秒无响应立即由 Client 主动掐断重连并带 `afterSeq` 追平），完美绕开 Android 半开连接假死。
3. **跨网安全接入（解决 Web HTTPS Mixed Content 限制）：**

- **App / Android 原生端：** 可直接走 WireGuard / Tailscale 内网 IP 或 IPv6 直连 Daemon。
- **Web 端注意：** 如果你的前端部署在 `https://` 域名下，浏览器严禁连接裸 `ws://`（除非是 `localhost`）。最省心的解法是利用 **Tailscale Funnel / 自建轻量 TLS 反向代理 / Cloudflare Tunnel** 给 Daemon 套一层自动签发的 `wss://`，或者让 Daemon 主动连向你可控 VPS 上的极简无状态 WS Relay（双端认证后直接做 TCP/WS 字节流透传）。

你说 paseo 是怎么做的 

paseo 是怎么做的

Gemini 说

Paseo（`getpaseo/paseo`）在 **Daemon ↔ Client（Desktop / Web / iOS / Android / CLI）** 这一层完全放弃了 HTTP + SSE，采用的是 **“本地 Node.js Daemon + 单一全双工 WebSocket 总线 + Elixir 零知识双通道中继 + Noise NK 端到端加密 + 编译期 AOT 协议校验”** 的全栈架构。 [^1]

拆开它的源码结构（`packages/server`、`packages/protocol`、`packages/relay`、`packages/app`），核心实现有四个非常值得借鉴的工程设计： [^2]

## 一、 网络与穿透层：直连与“控制/数据分离”的零信任 Relay

Paseo Daemon 默认只监听本地 `127.0.0.1:6767`（防止局域网裸奔，且内置 `Host` Header 白名单校验以防御浏览器 DNS Rebinding 攻击）。跨设备连接支持两种路径：

- **Direct 直连模式：** 通过 Tailscale 虚拟内网 IP、LAN 或桌面/CLI 的 SSH 隧道直连 Daemon 的 WebSocket 端口，配合密码鉴权。 [^3]
- **Relay 出站中继模式（解决手机/Web 随时随地接入的核心设计）： [^4]**
官方开源了基于 **Elixir / OTP (Cowboy)** 编写的高并发中继服务 `getpaseo/paseo-relay`（单节点 2 GB 内存实测可稳定承载 15,000〜20,000 条活跃长连接）。它没有把所有客户端流量塞进同一条管道做复杂复用，而是采用了“1 条控制通道 + N 条按需数据通道”的分离模型： [^5]

1. **Control WebSocket（常驻）：** Daemon 启动后主动向 Relay 发起一条出站长连接（无需任何公网端口映射或防火墙配置），按 `serverId` 注册路由归属，平时只收发极轻量的 `ping/pong` 心跳与连接到达事件。
2. **Data WebSocket（按会话派生）：** 当你的 Android 手机或 Web 端连上 Relay 请求访问该 `serverId` 时，Relay 通过控制通道唤醒 Daemon；Daemon 立即再向同一个 Elixir BEAM 节点主动拨出一条专属的 Data WebSocket（携带 `role=server` 与 `connectionId`）。
3. **纯内存字节桥接：** 配对成功后，Relay 只在同一个 BEAM 节点内部将 Client Socket 与 Daemon Data Socket 的原始帧直接互相转发，不做任何业务解析，任一侧断开或异常即刻级联销毁槽位。 [^6]

## 二、 安全与帧传输层：`#fragment` 配对 + Noise NK 握手 + Opcode 保留 [^7]

因为 Relay 被严格定义为**不可信节点（Untrusted / Zero-knowledge）**，Paseo 在 WebSocket 载荷之上自己做了一层端到端加密传输层： [^8]

1. **URL Fragment 零泄漏扫码配对： [^9]**
Daemon 首次启动会生成持久化的 `Curve25519` 静态密钥对（权限 `0600` 存于 `$PASEO_HOME/daemon-keypair.json`）。生成手机配对二维码时，配对链接形如 `[https://app.paseo.sh/#offer=](https://app.paseo.sh/#offer=)...`，公钥放在 **URL `#` 锚点（Fragment）** 中——根据浏览器标准，`#` 后面的内容绝不会随 HTTP 请求发送到服务器，哪怕是托管 Web 前端的服务器也看不到你的公钥。
2. **Noise NK 密码学握手：**
手机连上通道后生成临时密钥对，先发一条明文 JSON 握手帧 `e2ee_hello`，Daemon 回复 `e2ee_ready`，跑完标准的 **`Noise_NK_25519_ChaChaPoly_SHA256`** 协议（旧版本自动降级兼容 `Curve25519 ECDH + XSalsa20-Poly1305` NaCl box）。握手完成前，Daemon 拒绝执行任何业务指令；握手后，每一帧都变成带单调递增计数器 Nonce 的 `ChaCha20-Poly1305` 认证密文，彻底免疫重放攻击与篡改。 [^10]
3. **端到端保留 WebSocket Opcode（`binaryCiphertext`）： [^11]**
很多加密中继会把所有加密后的数据无脑转成 Base64 文本帧，导致二进制传输膨胀 33%。Paseo 在握手期协商 `binaryCiphertext` 能力：应用层的 JSON 文本加密后走 WebSocket Text Frame，终端流/媒体等原始字节加密后直接走原生 **WebSocket Binary Frame**，端到端保留 Opcode，接收端解密后直接按帧类型分发，无需猜测字节内容。 [^12]

## 三、 应用层协议与移动端性能优化（`packages/protocol`） [^13]

在解密后的 WebSocket 通道内部，Paseo 设计了一套专为高频多 Agent 并发与移动端性能优化的协议层： [^14]

- **Tagged Envelope + 双向点分命名空间 RPC：**
外层采用极简的判别联合信封（Discriminated Union，`type` + `payload`），RPC 方法采用带明确方向后缀的点分命名规范：`domain.provider.operation.request` 配对 `domain.provider.operation.response`。无论是客户端发指令、拉取 Git Worktree Diff、向伪终端 `sendKeys()` 输入按键，还是 Daemon 反向推送 Agent 流与权限拦截弹窗，全跑在同一条连接上。 [^15]
- **严格的兼容契约与能力门控： [^16]**
协议层铁律规定所有新增字段必须为 `optional`，保证旧 App 连新 Daemon、新 App 连旧 Daemon 永不崩解析；具体新功能统一靠连接建立后下发的 `server_info.features.*` 做一次性开关判断，避免代码里堆满防御性分支。 [^17]
- **移动端杀手级优化——`zod-aot` 编译期静态校验： [^18]**
在 Android / iOS 的 React Native（Hermes 引擎）上，一条 353 KB 的 Agent/Provider 状态快照如果走 `JSON.parse` 加运行时 `Zod` 校验，单条消息就要吃掉 **10.9 ms** CPU 时间并分配 **5.9 MB** 内存，流式高频刷新的时候手机极易掉帧发热。Paseo 保持用 Zod 写 Schema 作为唯一类型真源，但在构建期通过脚本调用 `zod-aot` 把每个消息分支预编译成纯静态 JS 校验函数，将单帧耗时直接压到 **2.5 ms**、内存分配砍到 **1.2 MB**（提速超 4 倍，GC 压力下降近 80%）。 [^19]
- **一跳跨机路由（One-hop Multiplexing）： [^20]**
SDK 原生支持 `hosts.client(serverId)`，允许客户端把当前连上的 Daemon 当作跳板，透明转发操控另一台远端主机上的 Daemon 和 Agent，API 调用签名与本地完全一致。 [^21]

## 四、 客户端多端复用架构：Expo + Metro 编译期分流

Paseo 之所以能由极精简的团队同时维护 **CLI、Web、Electron 桌面端、iOS 和 Android 原生端**且体验高度一致，靠的是彻底的同源工程化： [^22]

| 模块包 | 职责与实现方式 |
| --- | --- |
| packages/server | Node.js / TypeScript 守护进程：统一包装 Claude Code、Codex、Pi、Antigravity、OpenCode 等 CLI 子进程生命周期，管理独立 Git Worktree、终端缓冲捕获、插件宿主及对外暴露 MCP Server。 |
| packages/app | 基于 Expo (React Native) 的统一客户端核心，一套业务与状态代码同时编译出 iOS、Android 和浏览器 Web。 |
| packages/desktop | 基于 Electron，直接复用 packages/app 的 Metro Web 构建管线，并内置本地 Daemon 随桌面端自动拉起。 |

为了不在业务代码里写满臃肿的 `if (isWeb)` 分支，Paseo 利用 **Metro 打包器的文件扩展名解析优先级**做编译期平台分流：例如桌面构建注入 `PASEO_WEB_PLATFORM=electron` 后，同一句模块导入会自动按 `.electron.tsx` → `.web.tsx` → `.native.tsx` 的顺序在打包期命中对应平台的底层实现（如录音、WebView 面板、原生桥接），无用平台的代码根本不会打进包里。 [^23]

下面的交互式架构图还原了 Paseo 从扫码配对、Elixir Relay 双通道建连、Noise NK 端到端握手到加密双向帧通信的完整四阶段链路，可点击阶段按钮逐步查看每一层的载荷与职责：

如果你打算在自己的多端 Agent 工具链里参考 Paseo 的做法，最值得直接抄作业的有三点：**用“1 条常驻控制 WS + 按需派生数据 WS”来做无状态反向穿透**、**用 URL `#fragment` 传递公钥配合 Noise NK 做零信任端到端加密且保留原生 Binary Opcode**，以及**在移动端用编译期 AOT Schema 校验替代运行时反射校验**。 [^24]

Gemini 是一款 AI 工具，其回答未必正确无误。

Google 应用语音输入 (⌘⇧D)发起新对话库已安排自定义设置修改提示复制提示答得好答得不好复制回答更多重做更多选项Share visual下载代码复制代码切换模型 (⌘⇧M)Google 账号Cat Tomfknjq9@gmail.com关于账号的重要提醒Google One 会员

---

## 📚 参考文献与引用源

1. [https://www.google.com/intl/zh-CN/about/products](https://www.google.com/intl/zh-CN/about/products)
2. [Gemini](https://gemini.google.com/)
3. [https://gemini.google.com/library](https://gemini.google.com/library)
4. [https://gemini.google.com/scheduled](https://gemini.google.com/scheduled)
5. [https://gemini.google.com/customize](https://gemini.google.com/customize)
6. [视频](https://gemini.google.com/videos)
7. [https://accounts.google.com/SignOutOptions?continue=https://gemini.google.com](https://accounts.google.com/SignOutOptions?continue=https://gemini.google.com)


---

## 👤 用户提问 3

paseo 是怎么做的  paseo 是怎么做的

## 🤖 Gemini 回答

[https://www.google.com/intl/zh-CN/about/products](https://www.google.com/intl/zh-CN/about/products)[https://accounts.google.com/SignOutOptions?hl=zh-CN&continue=https://gemini.google.com/app/3232a637c69efa2a&ec=GBRAkgU](https://accounts.google.com/SignOutOptions?hl=zh-CN&continue=https://gemini.google.com/app/3232a637c69efa2a&ec=GBRAkgU)<iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KKRLL9S" height="0" width="0" style="display:none;visibility:hidden"></iframe>[Gemini](/)[/app](/app)[library](library)[/scheduled](/scheduled)[/customize](/customize)[库](library)[已安排](/scheduled)[自定义](/customize)[视频](/videos)[https://accounts.google.com/SignOutOptions?continue=https://gemini.google.com](https://accounts.google.com/SignOutOptions?continue=https://gemini.google.com)

# 与 Gemini 对话

你说 统一标准 HTTP + SSE / 单一 JSON-RPC 
现在推荐的跨设备 AI 方案哪个最好 有没有更好的 

统一标准 HTTP + SSE / 单一 JSON-RPC

现在推荐的跨设备 AI 方案哪个最好 有没有更好的

Gemini 说

在跨设备 AI 架构中，早期的“双端点 HTTP + 长连接 SSE”已被正式废弃；目前统一标准的演进终点是“单一端点 Streamable HTTP（承载 JSON-RPC 2.0，按需返回短生命周期 SSE）”。但如果你追求跨设备（手机、桌面、多节点 VPS）的实时状态同步、工具审批与 NAT 穿透，**有比 HTTP + SSE 更好的底层方案**。 [^1]

## 一、 基于“HTTP + SSE / 单一 JSON-RPC”的三大主流标准对比

AI 生态已经把协议切分成了三个互不冲突的垂直层，全部统一在 **JSON-RPC 2.0** 语义之下： [^2]

| 协议标准 | 定位层级 | 传输层演进现状 | 跨设备优缺点 |
| --- | --- | --- | --- |
| MCP (2026-07-28 规范) | 纵向：Agent ↔ 远程工具/资源 | 彻底废弃旧版 /sse 双端点，全面转向 Streamable HTTP。单一 /mcp POST 端点，彻底无状态化（移除了 initialize 握手与内存 Session）。 | 最轻量、天然适配反向代理与负载均衡；但服务端无法主动向客户端发起独立请求（如远程弹窗审批受限）。 |
| A2A v1.0 (Linux 基金会) | 横向：Agent ↔ Agent 跨设备委托 | 默认采用 JSON-RPC 2.0 over HTTPS + SSE（SendStreamingMessage），同时原生提供 gRPC 与 WebSocket 绑定。 | 目前跨设备多 Agent 协作的最佳标准。内置显式任务状态机（含 INPUT_REQUIRED 中断等待人工确认）、Webhook 推送与多模态 Artifact 传输。 |
| ACP (Agent Client Protocol) | 前端：UI/CLI/IDE ↔ Coding Agent | 本地默认双向 stdio JSON-RPC；跨设备通常直接桥接到 WebSocket。 | 专为交互式 Agent 设计，原生定义了 Diff 预览、终端流、目录挂载与双向权限拦截（Permission Request）。 |

> **关键避坑：** 如果你在自研或选型，千万不要再用旧版“一条常驻 GET SSE 流 + 一条 POST 发消息”的设计。跨移动网络（Wi-Fi 切 5G）或经过跨国代理时，半开连接（Half-open TCP）和会话粘滞（Sticky Session）会让重连状态恢复变成灾难。**Streamable HTTP** 每次请求独立 POST，普通调用直接返回 `application/json`，耗时流式输出才升级为 `text/event-stream`，流结束即断开，干净利落。 [^3]

## 二、 有没有比 HTTP + SSE 更好的跨设备方案？

HTTP + SSE 本质上是“客户端强主动、服务端弱被动”的半双工妥协。在跨设备场景下，一旦遇到以下三个痛点，HTTP + SSE 就会显得捉襟见肘：

1. **设备在 NAT / 防火墙后**（如家里或公司的 Mac、移动端的手机，没有公网 IP）。
2. **双向对等控制（Server-to-Client RPC）**：远程 Agent 跑在 VPS 上，执行高危命令时需要立刻向你的手机/桌面端推送审批请求并阻塞等待结果，或者需要临时读取你本地电脑剪贴板里的一段上下文。 [^4]
3. **跨网断线重连与增量帧同步**：手机锁屏唤醒后，需要无损追平终端输出与思考流，而不是重新跑一遍任务。

针对这些痛点，业界已经跑通了**三种明显优于纯 HTTP + SSE 的架构方案**：

### 1. 终端与 Coding Agent 跨设备首选：Daemon + 端到端加密 Relay / Mesh（JSON-RPC over WebSocket）

这是目前跨设备操控本地/远端 Agent 体验最成熟的形态（典型成品如开源的 **Paseo** 架构）。 [^5]

- **核心机制：** 各台宿主机（Mac、Linux VPS）运行轻量级守护进程（Daemon）托管本地 Agent 进程池，客户端（CLI、Web、iOS/Android）与 Daemon 之间通过单一 **WebSocket** 全双工通道收发 JSON-RPC 帧。 [^6]
- **网络穿透：** 放弃公网暴露 HTTP 端口，采用 **Outbound Relay（出站中继，零端口映射 + 公钥握手端到端加密）** 或直接绑定在 **Tailscale / WireGuard IPv6** 虚拟内网 IP 上直连。
- **为什么更好：** 真正的全双工单连接，无 HTTP Header 往返开销；多个客户端（如电脑端 CLI 和手机 App）可以同时 Attach 到同一个 Agent Session 上实时共享终端流、Diff 和审批弹窗。 [^7]

### 2. 多节点分布式 Agent 编排首选：NATS + JetStream（Pub/Sub 替代点对点 RPC）

当你的 AI 节点分散在不同地域的设备（例如：一台国内机器做采集/本地 UI 操作、一台海外 VPS 跑推理调度与交易执行、手机做监控告警），点对点的 HTTP/RPC 会面临复杂的路由和超时重试问题。

- **核心机制：** 部署一个极轻量的单二进制 **NATS** 核心节点，所有设备均以 **Outbound TCP/TLS** 主动连向 Broker，内部依然可以直接封装 JSON-RPC 2.0 载荷。 [^8]
- **为什么更好：**

- **天然穿透所有 NAT：** 任何设备无需公网 IP、无需配反向代理，连上就能互相调用（Request-Reply 模式耗时仅亚毫秒级开销）。 [^9]
- **断线不丢状态：** 配合内置的 **JetStream** 持久化流，即使某台设备短暂断网或重启，恢复后也能按 Sequence ID 精确回放错过的事件流与任务指令，彻底解决 SSE 断流丢包问题。

### 3. 跨国高延迟 / 移动弱网流式传输：gRPC 双向流 或 WebTransport (QUIC)

- **A2A over gRPC： [^10]** A2A v1.0 已原生内置 Protobuf + gRPC 绑定。相比文本格式的 JSON + SSE，二进制序列化体积更小，且基于 HTTP/2 多路复用支持原生双向流与严格 Schema 校验，适合高频结构化数据（如实时行情 + Agent 决策信号）的跨节点直连。 [^11]
- **WebTransport (基于 HTTP/3 QUIC)： [^12]** 如果前端包含浏览器或移动端，且跨洲际网络存在丢包，WebTransport 解决了 TCP/WebSocket 的队头阻塞（Head-of-Line Blocking）问题，并在网络切换（Wi-Fi 切蜂窝网络）时支持 **0-RTT 连接迁移**，流不会断开。

## 三、 落地选型建议

1. **做标准化工具暴露 / 插件生态（对标通用客户端）： [^13]**
直接上 **MCP 最新版 Streamable HTTP（单 `/mcp` POST 端点 + 无状态 JSON-RPC）**。这是兼容所有主流 AI 客户端的最大公约数，零维护负担。 [^14]
2. **做异构多 Agent 跨云/跨机任务委派：**
采用 **A2A v1.0**。对外保持 JSON-RPC + SSE 兼容，内部节点间开启它的 **gRPC** 或 **WebSocket** 绑定，直接复用它现成的任务生命周期状态机（`SUBMITTED` → `WORKING` → `INPUT_REQUIRED` → `COMPLETED`）。 [^15]
3. **自建个人全设备 AI 中枢（Mac + 多地 Linux VPS + 手机）：**

- **想开箱即用：** 直接用 **Paseo**（Apache 2.0 开源 Daemon + Cross-Daemon 插件）配合 Tailscale 或自建 Relay，把各机器的 CLI Agent 统一收拢。
- **想自己写零依赖底座：** 放弃 HTTP + SSE，采用 **“单一 WebSocket（跑双向 JSON-RPC 2.0，附带单调递增 `seq` 序号用于断线增量重放）+ WireGuard/IPv6 直连（或 NATS 中转）”**。在控制代码极简的同时，延迟、双向交互和弱网恢复能力都比 HTTP + SSE 高出一个量级。 [^16]

你说 我说的是 daemon 与 client （app/web/android） 

我说的是 daemon 与 client （app/web/android）

Gemini 说

在 **Daemon ↔ Client（App / Web / Android）** 这个具体交互层面上，结论非常明确：**“双向 JSON-RPC 2.0 over 单一 WebSocket + 增量事件日志（Event Log Cursor）”** 是目前工程体验最好、最成熟的黄金标准；而对于极端移动弱网，唯一比它更强的下一代方案是 **JSON-RPC over WebTransport (QUIC)**。

反过来，**HTTP + SSE 在这一层其实是“次优妥协”**，尤其在 Android 端和 Web 端同时挂载同一个 Daemon 时会暴露出明显的架构缺陷。

## 一、 为什么 HTTP + SSE 在 Daemon ↔ Client (特别是 Android/Web) 层不够好？

如果你用 Streamable HTTP + SSE 让 Web 和 Android 连 Daemon，立刻会撞上四个工程痛点：

1. **反向 RPC（Daemon → Client）极其别扭：**
Daemon 里的 Agent 跑着跑着需要向 Client 发起一个 `permission.request`（比如高危命令拦截弹窗），或者请求 Client 当前的 UI 焦点状态。在 HTTP + SSE 下，SSE 只能单向推事件，Client 收到后再另起一个 HTTP POST 把审批结果塞回去，请求与响应在协议层是割裂的，超时、撤回和多端抢答（比如电脑和手机同时弹了审批，手机点同意后电脑端弹窗怎么立刻消掉）需要自己手写一堆状态胶水。
2. **Android 移动网络的“假死连接（Zombie Connection）”：**
手机进电梯、切 Wi-Fi / 5G、或者锁屏进入 Doze 模式时，底层 TCP 连接经常处于半开状态。SSE 没有协议级双向 Ping/Pong 帧，Android 客户端往往要等几十秒系统超时才发现流断了，期间用户发指令转圈、看输出卡死。
3. **浏览器的连接池与跨域预检（CORS Preflight）损耗：**
高频交互（如终端按键流、实时取消任务、切换 Session）每次都发独立 POST，在 Web 端会频繁触发 OPTIONS 预检和 HTTP Header 解析开销。
4. **多端 Attach（状态广播）成本高：**
当你的桌面 App、Web 页面和 Android 手机同时打开同一个 Session 时，Daemon 需要把同一份流广播给三个端，用双向长连接做 Room/Session 订阅比维护多条 HTTP 流直观得多。

## 二、 当前生产级最优解：单一 WebSocket + 双向 JSON-RPC + Seq 游标

这也是目前主流 Coding Agent 守护进程（如 **ACP 协议远程桥接**、**Paseo**、**OpenCode Server** 等）不约而同收敛到的终极形态。它的精髓不在于“用了 WebSocket”，而在于**协议帧的设计**：

### 1. 真正的对等双向 JSON-RPC 2.0（Peer-to-Peer RPC）

连接一旦建立，不再区分谁是 HTTP Client 谁是 Server，双方都是对等的 JSON-RPC 节点：

- **Client → Daemon Request：** `session.prompt`、`session.cancel`、`fs.read`
- **Daemon → Client Notification（流式推送）：** `session.delta`（Token 流 / 思考流 / Tool 输出帧）
- **Daemon → Client Request（反向调用！）：** `client.requestPermission`、`client.askUserQuestion`

- Daemon 直接发出带 `id` 的 JSON-RPC Request 并 `await`；
- Web 和 Android 同时收到弹窗，任意一端点击“允许”返回 JSON-RPC Response，Daemon 立刻继续执行，并顺手发一条 `notification` 让其他端的弹窗自动消失。所有逻辑都在一套统一的 RPC 语义里闭环。

### 2. 核心灵魂：Event Log + 单调递增 `seq`（专治 Android 断网与锁屏）

单纯的 WebSocket 断了也会丢消息，所以**绝对不能把 Daemon 做成“只管往下吐数据的管道”**，而要把 Daemon 的 Session 做成**内存/SQLite 环形事件日志（Append-only Event Log）**：

- Daemon 产生的每一个流式分片、工具状态变更，都分配一个当前 Session 内严格递增的序号 `seq`（例如 `1041, 1042, 1043...`）。
- Android 锁屏切后台 5 分钟后再点亮屏幕，WebSocket 瞬间重连，发送的第一条握手指指令只需带上前一秒收到的最后游标：

JSON

```
{ "jsonrpc": "2.0", "id": 1, "method": "session.attach", "params": { "sessionId": "sess_01", "afterSeq": 1042 } }
```
- Daemon 直接从内存 Ring Buffer（或本地 SQLite WAL）里把 `1043 ~ 最新` 的增量帧一次性推下来，随后无缝切回实时流。**0 丢包、无需重拉全量历史、毫秒级追平界面。**

### 3. 混合载荷（JSON 控制帧 + Binary 终端/媒体帧）

WebSocket 原生支持 Text Frame 和 Binary Frame 混传：

- **Text Frame：** 跑纯正的单一 JSON-RPC 2.0（管生命周期、对话、审批、结构化 Diff）。
- **Binary Frame：** 如果你的 Daemon 挂载了真实的 PTY 终端（比如交互式 `vim`、`htop` 或实时音频/截图预览），直接用 1 字节 Channel ID 前缀 + 原始字节流走 Binary Frame，彻底省掉 Base64 编解码的体积膨胀与延迟。这是 HTTP + SSE 完全做不到的。

## 三、 有没有比 WebSocket 更好的？（下一代天花板方案）

如果你追求极致的工程指标，目前有两个方向在特定维度上确实比 WebSocket 更强：

| 进阶方案 | 核心优势（比 WebSocket 强在哪） | Web / Android / App 落地成本与现状 |
| --- | --- | --- |
| 1. JSON-RPC over WebTransport (HTTP/3 QUIC) | 彻底消灭移动弱网痛点： ① 0-RTT 连接迁移——Android 从家里 Wi-Fi 走到门外切 5G，IP 变了但 QUIC Connection ID 不变，连接根本不断；② 无队头阻塞（HOL Blocking）——可开一条 Reliable Bidirectional Stream 跑 JSON-RPC 控制信令，同时开多条独立 Stream 跑大体积文件/Diff/日志流，互不卡顿。 | Web (Chrome/Android WebView) 原生 new WebTransport() 已完全成熟；Android 原生可用 Cronet (Google 官方网络库)；坑点： Safari/iOS WebKit 支持较慢，且 Node.js 原生 WebTransport 服务端生态不如 WS 轻量（Go / Rust 写 Daemon 则非常丝滑），通常需要保留 WebSocket 作为 Fallback。 |
| 2. 本地 SQLite 增量同步引擎（Sync Engine 模式） | 离线优先（Offline-First）： Client（Android/App/Web IndexedDB）本地直接持有一份 Session/Message 表镜像，网络层不再关心“请求流”，只做底层 WAL/Row 差量同步，打开 App 永远是 0ms 瞬开历史记录，弱网发消息自动入本地队列。 | 适合重客户端体验，但对于实时 Token 流（每秒几十帧）如果全走数据库同步会有写放大，最佳实践是“历史消息走 Sync / Cursor 拉取，正在生成的 ephemeral 流走 WebSocket 内存广播”。 |

## 四、 跨三端（Desktop App / Web / Android）最优雅的架构组合

如果你现在自己定协议写 Daemon 和三端 Client，最干净、零冗余、以后绝对不用返工的组合是：

1. **协议语义层：单一 JSON-RPC 2.0**
所有控制、订阅、反向审批全部收敛进一套 JSON-RPC Schema（可以直接参考或兼容 **ACP** 的方法命名，省去自己设计 Tool Call / Diff / Permission 数据结构的时间）。
2. **传输与重连层：单一 `/rpc` WebSocket 端点 + `seq` 增量重放 + 应用层 15s 心跳**

- 放弃 SSE；只留一个普通 HTTP 接口给大体积静态产物下载（比如截图、导出文件，走浏览器原生缓存和 Range 断点续传）。
- 加上应用层极简 `ping/pong`（15 秒无响应立即由 Client 主动掐断重连并带 `afterSeq` 追平），完美绕开 Android 半开连接假死。
3. **跨网安全接入（解决 Web HTTPS Mixed Content 限制）：**

- **App / Android 原生端：** 可直接走 WireGuard / Tailscale 内网 IP 或 IPv6 直连 Daemon。
- **Web 端注意：** 如果你的前端部署在 `https://` 域名下，浏览器严禁连接裸 `ws://`（除非是 `localhost`）。最省心的解法是利用 **Tailscale Funnel / 自建轻量 TLS 反向代理 / Cloudflare Tunnel** 给 Daemon 套一层自动签发的 `wss://`，或者让 Daemon 主动连向你可控 VPS 上的极简无状态 WS Relay（双端认证后直接做 TCP/WS 字节流透传）。

你说 paseo 是怎么做的 

paseo 是怎么做的

Gemini 说

Paseo（`getpaseo/paseo`）在 **Daemon ↔ Client（Desktop / Web / iOS / Android / CLI）** 这一层完全放弃了 HTTP + SSE，采用的是 **“本地 Node.js Daemon + 单一全双工 WebSocket 总线 + Elixir 零知识双通道中继 + Noise NK 端到端加密 + 编译期 AOT 协议校验”** 的全栈架构。 [^1]

拆开它的源码结构（`packages/server`、`packages/protocol`、`packages/relay`、`packages/app`），核心实现有四个非常值得借鉴的工程设计： [^2]

## 一、 网络与穿透层：直连与“控制/数据分离”的零信任 Relay

Paseo Daemon 默认只监听本地 `127.0.0.1:6767`（防止局域网裸奔，且内置 `Host` Header 白名单校验以防御浏览器 DNS Rebinding 攻击）。跨设备连接支持两种路径：

- **Direct 直连模式：** 通过 Tailscale 虚拟内网 IP、LAN 或桌面/CLI 的 SSH 隧道直连 Daemon 的 WebSocket 端口，配合密码鉴权。 [^3]
- **Relay 出站中继模式（解决手机/Web 随时随地接入的核心设计）： [^4]**
官方开源了基于 **Elixir / OTP (Cowboy)** 编写的高并发中继服务 `getpaseo/paseo-relay`（单节点 2 GB 内存实测可稳定承载 15,000〜20,000 条活跃长连接）。它没有把所有客户端流量塞进同一条管道做复杂复用，而是采用了“1 条控制通道 + N 条按需数据通道”的分离模型： [^5]

1. **Control WebSocket（常驻）：** Daemon 启动后主动向 Relay 发起一条出站长连接（无需任何公网端口映射或防火墙配置），按 `serverId` 注册路由归属，平时只收发极轻量的 `ping/pong` 心跳与连接到达事件。
2. **Data WebSocket（按会话派生）：** 当你的 Android 手机或 Web 端连上 Relay 请求访问该 `serverId` 时，Relay 通过控制通道唤醒 Daemon；Daemon 立即再向同一个 Elixir BEAM 节点主动拨出一条专属的 Data WebSocket（携带 `role=server` 与 `connectionId`）。
3. **纯内存字节桥接：** 配对成功后，Relay 只在同一个 BEAM 节点内部将 Client Socket 与 Daemon Data Socket 的原始帧直接互相转发，不做任何业务解析，任一侧断开或异常即刻级联销毁槽位。 [^6]

## 二、 安全与帧传输层：`#fragment` 配对 + Noise NK 握手 + Opcode 保留 [^7]

因为 Relay 被严格定义为**不可信节点（Untrusted / Zero-knowledge）**，Paseo 在 WebSocket 载荷之上自己做了一层端到端加密传输层： [^8]

1. **URL Fragment 零泄漏扫码配对： [^9]**
Daemon 首次启动会生成持久化的 `Curve25519` 静态密钥对（权限 `0600` 存于 `$PASEO_HOME/daemon-keypair.json`）。生成手机配对二维码时，配对链接形如 `[https://app.paseo.sh/#offer=](https://app.paseo.sh/#offer=)...`，公钥放在 **URL `#` 锚点（Fragment）** 中——根据浏览器标准，`#` 后面的内容绝不会随 HTTP 请求发送到服务器，哪怕是托管 Web 前端的服务器也看不到你的公钥。
2. **Noise NK 密码学握手：**
手机连上通道后生成临时密钥对，先发一条明文 JSON 握手帧 `e2ee_hello`，Daemon 回复 `e2ee_ready`，跑完标准的 **`Noise_NK_25519_ChaChaPoly_SHA256`** 协议（旧版本自动降级兼容 `Curve25519 ECDH + XSalsa20-Poly1305` NaCl box）。握手完成前，Daemon 拒绝执行任何业务指令；握手后，每一帧都变成带单调递增计数器 Nonce 的 `ChaCha20-Poly1305` 认证密文，彻底免疫重放攻击与篡改。 [^10]
3. **端到端保留 WebSocket Opcode（`binaryCiphertext`）： [^11]**
很多加密中继会把所有加密后的数据无脑转成 Base64 文本帧，导致二进制传输膨胀 33%。Paseo 在握手期协商 `binaryCiphertext` 能力：应用层的 JSON 文本加密后走 WebSocket Text Frame，终端流/媒体等原始字节加密后直接走原生 **WebSocket Binary Frame**，端到端保留 Opcode，接收端解密后直接按帧类型分发，无需猜测字节内容。 [^12]

## 三、 应用层协议与移动端性能优化（`packages/protocol`） [^13]

在解密后的 WebSocket 通道内部，Paseo 设计了一套专为高频多 Agent 并发与移动端性能优化的协议层： [^14]

- **Tagged Envelope + 双向点分命名空间 RPC：**
外层采用极简的判别联合信封（Discriminated Union，`type` + `payload`），RPC 方法采用带明确方向后缀的点分命名规范：`domain.provider.operation.request` 配对 `domain.provider.operation.response`。无论是客户端发指令、拉取 Git Worktree Diff、向伪终端 `sendKeys()` 输入按键，还是 Daemon 反向推送 Agent 流与权限拦截弹窗，全跑在同一条连接上。 [^15]
- **严格的兼容契约与能力门控： [^16]**
协议层铁律规定所有新增字段必须为 `optional`，保证旧 App 连新 Daemon、新 App 连旧 Daemon 永不崩解析；具体新功能统一靠连接建立后下发的 `server_info.features.*` 做一次性开关判断，避免代码里堆满防御性分支。 [^17]
- **移动端杀手级优化——`zod-aot` 编译期静态校验： [^18]**
在 Android / iOS 的 React Native（Hermes 引擎）上，一条 353 KB 的 Agent/Provider 状态快照如果走 `JSON.parse` 加运行时 `Zod` 校验，单条消息就要吃掉 **10.9 ms** CPU 时间并分配 **5.9 MB** 内存，流式高频刷新的时候手机极易掉帧发热。Paseo 保持用 Zod 写 Schema 作为唯一类型真源，但在构建期通过脚本调用 `zod-aot` 把每个消息分支预编译成纯静态 JS 校验函数，将单帧耗时直接压到 **2.5 ms**、内存分配砍到 **1.2 MB**（提速超 4 倍，GC 压力下降近 80%）。 [^19]
- **一跳跨机路由（One-hop Multiplexing）： [^20]**
SDK 原生支持 `hosts.client(serverId)`，允许客户端把当前连上的 Daemon 当作跳板，透明转发操控另一台远端主机上的 Daemon 和 Agent，API 调用签名与本地完全一致。 [^21]

## 四、 客户端多端复用架构：Expo + Metro 编译期分流

Paseo 之所以能由极精简的团队同时维护 **CLI、Web、Electron 桌面端、iOS 和 Android 原生端**且体验高度一致，靠的是彻底的同源工程化： [^22]

| 模块包 | 职责与实现方式 |
| --- | --- |
| packages/server | Node.js / TypeScript 守护进程：统一包装 Claude Code、Codex、Pi、Antigravity、OpenCode 等 CLI 子进程生命周期，管理独立 Git Worktree、终端缓冲捕获、插件宿主及对外暴露 MCP Server。 |
| packages/app | 基于 Expo (React Native) 的统一客户端核心，一套业务与状态代码同时编译出 iOS、Android 和浏览器 Web。 |
| packages/desktop | 基于 Electron，直接复用 packages/app 的 Metro Web 构建管线，并内置本地 Daemon 随桌面端自动拉起。 |

为了不在业务代码里写满臃肿的 `if (isWeb)` 分支，Paseo 利用 **Metro 打包器的文件扩展名解析优先级**做编译期平台分流：例如桌面构建注入 `PASEO_WEB_PLATFORM=electron` 后，同一句模块导入会自动按 `.electron.tsx` → `.web.tsx` → `.native.tsx` 的顺序在打包期命中对应平台的底层实现（如录音、WebView 面板、原生桥接），无用平台的代码根本不会打进包里。 [^23]

下面的交互式架构图还原了 Paseo 从扫码配对、Elixir Relay 双通道建连、Noise NK 端到端握手到加密双向帧通信的完整四阶段链路，可点击阶段按钮逐步查看每一层的载荷与职责：

如果你打算在自己的多端 Agent 工具链里参考 Paseo 的做法，最值得直接抄作业的有三点：**用“1 条常驻控制 WS + 按需派生数据 WS”来做无状态反向穿透**、**用 URL `#fragment` 传递公钥配合 Noise NK 做零信任端到端加密且保留原生 Binary Opcode**，以及**在移动端用编译期 AOT Schema 校验替代运行时反射校验**。 [^24]

Gemini 是一款 AI 工具，其回答未必正确无误。

Google 应用语音输入 (⌘⇧D)发起新对话库已安排自定义设置修改提示复制提示答得好答得不好复制回答更多重做更多选项Share visual下载代码复制代码切换模型 (⌘⇧M)Google 账号Cat Tomfknjq9@gmail.com关于账号的重要提醒Google One 会员

---

## 📚 参考文献与引用源

1. [https://www.google.com/intl/zh-CN/about/products](https://www.google.com/intl/zh-CN/about/products)
2. [Gemini](https://gemini.google.com/)
3. [https://gemini.google.com/library](https://gemini.google.com/library)
4. [https://gemini.google.com/scheduled](https://gemini.google.com/scheduled)
5. [https://gemini.google.com/customize](https://gemini.google.com/customize)
6. [视频](https://gemini.google.com/videos)
7. [https://accounts.google.com/SignOutOptions?continue=https://gemini.google.com](https://accounts.google.com/SignOutOptions?continue=https://gemini.google.com)


---

