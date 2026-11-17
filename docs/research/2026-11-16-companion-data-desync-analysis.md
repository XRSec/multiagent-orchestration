# 深度侦察报告：排查“伙伴/助手内数据不同步、慢半拍”的根因与改造方案

- **日期**：2026-11-16
- **侦察专员**：`bot-modeep` (MoDeep · 深度调研与技术情报分析师)
- **关联会话**：Antigravity 会话 `6aed037b-3800-4be0-aa67-e135e648285c` / Paseo Agent `4cf7875c-87f3-4415-b64a-23645e2cedc9`
- **问题画像**：用户在 Antigravity 界面直接对话调度子任务时，Paseo 内“伙伴”窗口内容停留在旧对话，底部仅显示转圈耗时（`○ 2分35秒`），新对话内容完全丢失，且手动刷新依然无法呈现最新进展。

---

## 一、 图片解析与名词概念对齐

### 1.1 前景窗口 vs 背景窗口定义
通过核查用户上传的实拍图 `~/.gemini/antigravity-cli/brain/b14a3bd8-329c-4d30-a831-dc459f99864a/.user_uploaded/uploaded_media_1794782140403.jpg` 以及底层转录日志：

| 视窗维度 | 真实所属应用与界面 | 核心视觉特征 | 呈现的内容状态 |
|---|---|---|---|
| **前景窗口** | **Antigravity 原生客户端/IDE** | 底部为 Antigravity 交互栏（`给 Agent 发消息，标记 @files...`、模型选择 `Gemini 3.8 Flash`、权限 `Full access`、红色中断按钮、`1 个运行中`）。中间带有工具运行态（`:: [tool] 2m 35s`）。 | 停留在 **Step 31**：展示派发给 `bot-mocode` 的完整工程流水线文本，子智能体正在执行中。 |
| **背景窗口** | **Paseo 桌面端内的“伙伴 (Bots)”插件** | 标题栏与右侧 Artifacts 列表，消息气泡底部带有 Paseo 特有的 `运行耗时 4分`（对应 `paseo-bots/client/chat/stream/rows.tsx:397` 的 `chat.workedFor`），最底部有一个 Loader 旋转图标及 `○ 2分35秒`（对应 `rows.tsx:441` 的 `WorkingIndicator`）。 | 停留在 **Step 11**：展示多轮之前的回答（`智能体的“灵魂 (Soul)”并不是孤立存在的文本... 运行耗时 4分`），中间多轮对话完全蒸发，底部仅有一个 `○ 2分35秒` 的转圈。 |

### 1.2 “伙伴”与“助手”的名词对齐与代码溯源
在整个多智能体编排运行时中，相关术语对齐如下：
- **“伙伴” / “Bots”**：
  - 代码位置：`paseo-bots/` 插件及配置 `paseo-bots-plugin-settings/bots.json`。
  - 界面显示：在中文本地化 `paseo-bots/client/i18n/zh-CN.ts` 中，`bots: "伙伴"`、`botList: "伙伴列表"`。在用户心智中，“伙伴”即指代 Paseo 内部的 Bots 插件视图（或右侧主工作台）。
- **“助手” / “Assistant / Agent”**：
  - 代码位置：Paseo 核心协议 `@getpaseo/protocol` 中的 `Agent` 概念，以及 Paseo 宿主自带的会话管理。在部分语境下用户会交替使用“助手”与“伙伴”来描述当前正在对话的 `bot-moadmin` 实例。

### 1.3 为什么两边内容严重脱节？
在底层 Antigravity SQLite 数据库 `6aed037b-3800-4be0-aa67-e135e648285c.db` 与 `transcript_full.jsonl` 中，完整的时序如下：
- **Step 11 (22:23:42Z)**: 助手回答“如果把 MEMORY.md 和 shared/Bots/ 比作...”（耗时 4 分钟）。
- **Step 12 (22:26:06Z)**: 用户在 Antigravity 客户端追问：“你这样讲的话我就理解了，但是其实我还是建议 这些伙伴的 soul 落地...”。
- **Step 13 (22:26:06Z)**: 助手回答：“你的直觉非常敏锐且切中要害...”。
- **Step 14 (22:27:40Z)**: 用户继续在 Antigravity 追问：“我觉得最好是把 soul 从 bots.json 剥离出来...”。
- **Step 21 (22:30:34Z)**: 用户继续追问：“为什么不直接把 bots.json 中的 soul 落地，然后修改代码...”。
- **Step 22-24 (22:30:46Z)**: 派发 `bot-modeep` 排查并汇报。
- **Step 25 (22:31:34Z)**: 用户输入：“我另外一个会话跑了一个升级，你注意下...”。
- **Step 27 (22:31:34Z)**: 助手回答：“收到！这次升级的核心调整我已全部同步对齐...”。
- **Step 28 (22:32:21Z)**: 用户输入：“开始”。
- **Step 29-31 (22:32:41Z)**: 助手回答“已启动全流程工程改造，任务已派发给研发专员 bot-mocode...”，并调用 `invoke_subagent` 派发子任务。

**脱节结论**：
Antigravity 已经推进到了 **Step 31**，但 Paseo 伙伴界面中的对话历史**彻底停留在了 Step 11**。中间的 6 轮对话全部丢失，仅在最底下捕捉到了当前正在 running 的状态并显示 `○ 2分35秒`。

---

## 二、 消息流转链路与同步机制深度剖析

```
┌────────────────────────┐      ┌─────────────────────────┐      ┌──────────────────────┐      ┌─────────────────────────┐
│ Antigravity Core       │      │ paseo-agy-acp           │      │ Paseo Daemon         │      │ paseo-bots Client       │
│ (Native IDE / Brain)   │      │ (ACP Adapter Layer)     │      │ (Host Control Plane) │      │ (useChat / Stream)      │
└───────────┬────────────┘      └────────────┬────────────┘      └──────────┬───────────┘      └────────────┬────────────┘
            │                                │                              │                               │
[User chats │                                │                              │                               │
 in AGY UI] │                                │                              │                               │
            ├──Writes steps 12~28            │                              │                               │
            │  into transcript_full.jsonl    │                              │                               │
            │  (NO ACP event fired!)         │                              │                               │
            │                                │                              │                               │
            │                                ├───[GAP 1: No Idle Watcher]───┤                               │
            │                                │   Adapter DOES NOT watch     │                               │
            │                                │   transcript when idle!      │                               │
            │                                │   Zero timeline.item emitted!│                               │
            │                                │                              │                               │
[Subagent   │                                │                              │                               │
 bot-mocode │                                │                              │                               │
 dispatched]│                                │                              │                               │
            ├──Step 29: tool_call (RUNNING)  │                              │                               │
            ├──Step 31: assistant_message    │                              │                               │
            │                                │                              │                               │
            │                                ├───[GAP 2: Settle Filter]─────┤                               │
            │                                │   brain.ts:742-760:          │                               │
            │                                │   - Suppresses running tool! │                               │
            │                                │   - Suppresses assistant msg!│                               │
            │                                │   - Blocks on settleChildren!│                               │
            │                                │                              │                               │
            │                                │                              ├──WebSocket: agent_update──────┤
            │                                │                              │  status="running", startedAt  │
            │                                │                              │                               ├──Shows Spinner
            │                                │                              │                               │  `○ 2分35秒`
            │                                │                              │                               │  (Rows missing!)
            │                                │                              │                               │
            │                                │                              │   [User clicks Reload]        │
            │                                │                              │                               ├──chat.reload()
            │                                │                              │◄──fetch_agent_timeline────────┤
            │                                │                              │   (queries in-memory store)   │
            │                                │                              ├───returns stale rows─────────►│
            │                                │   [GAP 3: Reload Isolation]  │   (Up to step 11 only!)       │
            │                                │   Adapter is never signaled  │                               │
            │                                │   to re-read from disk!      │                               │
```

### 2.1 卡点 1：外部对话数据链路完全静默（无空闲监听器）
- **文件坐标**：`paseo-agy-acp/server/session.ts` 与 `brain-observer.ts`
- **机制机理**：
  - `BrainTurnObservation`（负责读取 `transcript_full.jsonl` 并解析步骤生成 timeline item 的对象）仅在 `promptSession`（即**从 Paseo 发送消息**）时才会被实例化并 `observation.start()`（见 `session.ts:1931-1957`）。
  - 当会话处于空闲状态（Idle）时，`session.ts` **完全没有对 `transcript_full.jsonl` 进行任何文件监听（fs.watch / chokidar）或周期性轮询**。
  - 用户在 Antigravity 界面自 Step 12 聊到 Step 28，所有的 `USER_INPUT` 与 `PLANNER_RESPONSE` 纯粹写在本地文件系统，`paseo-agy-acp` 完全处于休眠状态，**0 次调用 `emit({ type: 'timeline.item' })`**，Paseo Daemon 也就永远不可能拿到这几轮历史。

### 2.2 卡点 2：转录结算（`settleBrainTurn`）过滤逻辑硬编码抑制了运行态卡片与助理文本
- **文件坐标**：`paseo-agy-acp/server/brain.ts:742-760`
- **机制机理**：
  在 `brain.ts` 的转录消费逻辑中：
  ```typescript
  if (
    postRpcStep ||
    emitForeground ||
    item.type === 'error' ||
    (row.type === 'SYSTEM_MESSAGE' && node.wokeUp)
  ) {
    onItem(item, timestamp)
  } else if (
    item.type === 'tool_call' &&
    item.status !== 'running' &&
    (shouldEmitPreWakeupTool ? shouldEmitPreWakeupTool(item) : true)
  ) {
    onItem(item, timestamp)
  }
  ```
  1. **正在运行的子任务工具卡片被静默抛弃**：
     Step 29 的 `invoke_subagent` 工具卡片其状态为 `item.status === 'running'`。由于条件明确要求 `item.status !== 'running'`，导致在子智能体执行的整个生命周期中（例如图中的 2分35秒），该工具调用**绝不发射给 Paseo**！
  2. **伴随的助理文本被静默抛弃**：
     Step 31 的内容（“已启动全流程工程改造...”）是 `assistant_message`。由于子任务未结束，`postRpcStep` 为 `false`；且 `emitForeground` 传入的是 `false`。该文本既不是 `error`，也不是 `SYSTEM_MESSAGE`，更不是 `tool_call`，因此直接落入两个 `if` 之外，**被完全丢弃，不调用 `onItem`**！
  3. **结算挂起锁死**：
     `settleBrainTurn` 在调用 `settleChildren` 时，会循环等待所有活跃子任务结算。在子任务长达数分钟的运行期间，Paseo 的 timeline 数据完全冻结，绝不向外冒泡任何中间内容。

### 2.3 卡点 3：“重新加载 (Reload)”并未击穿至磁盘，仅在查询 Daemon 的旧快照
- **文件坐标**：`paseo-bots/client/useChat.ts:235` 与 `paseo-agy-acp/server/session.ts`
- **机制机理**：
  - 前端点击“重新加载”时，触发 `handle.timeline.refetch({ direction: "tail", projection: "projected" })`。
  - 这个 RPC 仅仅是去读取 Paseo Daemon 进程内的 `InMemoryAgentTimelineStore`。
  - Paseo Daemon 并没有向底层 Provider (`paseo-agy-acp`) 下发“请重新从 Antigravity 磁盘转录加载历史”的指令。
  - 结果：Provider 没有读盘，Daemon 里的内存依然是 Step 11，前端不论点多少次刷新，拿到的永远是旧缓存。

### 2.4 卡点 4：前端 `useChat.ts` “抛弃消息体 + 80ms 防抖 RPC 反查”机制导致必然“慢半拍”
- **文件坐标**：`paseo-bots/client/useChat.ts:296-301`
- **机制机理**：
  - 当 Paseo Daemon 发出 `agent_stream` WebSocket 事件时，`useChat` 并不直接把事件中的 delta chunk 或 item merge 进当前的 React 状态。
  - 相反，它通过 `schedule()` 开启一个 80ms 的防抖定时器，然后异步调用 `handle.timeline.refetch({ direction: "after", cursor: endCursor })` 去 Daemon 重新拉一遍。
  - 这种设计导致：
    1. 即使后端推送了流式数据，前端也必须等待 80ms + 完整 RPC 来回 + 序列化/反序列化。
    2. 如果前一个 refetch 处于 `busy` 状态，后续的推送还会被积压排队，丢帧或跳帧。
    3. 视觉上呈现出明显的“打字机卡顿、慢半拍、跟不上 Antigravity 原生响应”的摩擦感。

---

## 三、 根治与改造建议

为彻底解决“数据不同步、外部对话丢失、转圈时不展示流水线内容、刷新无效”的问题，建议按以下三层架构协同改造：

### 建议 1：在 `paseo-agy-acp` 中引入“常驻外生转录监听器 (External Transcript Watcher)”
- **改造目标**：彻底打通 Antigravity 外部对话 -> Paseo 内部的单向静默壁垒。
- **实施方案**：
  - 在 `SessionManager` 或 `Session` 对象创建后，为 `session.brainRoot + '/' + session.state.nativeId + '/logs/transcript_full.jsonl'` 建立常驻的轻量级增量监听器（利用现有的 `watchBrain` 或基于文件 mtime / size 的防抖轮询）。
  - 当检测到文件追加且当前并不在 Paseo 的 `promptSession` 执行期时，自动提取增量行（`USER_INPUT`、`PLANNER_RESPONSE`、`GENERIC`），并转化为标准 `timeline.item` 调用 `emitItem` 推送到 Paseo Daemon。
  - 确保无论用户在 Antigravity 界面发消息，还是在 Paseo 伙伴发消息，两端 timeline 绝对实时一致。

### 建议 2：修复 `brain.ts` 结算过滤机制，放行运行中状态与流式响应
- **文件**：`paseo-agy-acp/server/brain.ts`
- **改造方案**：
  - **放行运行中的子任务**：修改 `brain.ts:755`，允许 `item.type === 'tool_call'` 即使在 `status === 'running'` 时也进行 `onItem(item, timestamp)` 发射，以便 Paseo 前端能够实时展示“bot-mocode 正在执行中”的卡片。
  - **放行并及时上屏助理文本**：对于在等待子任务期间伴随的 `PLANNER_RESPONSE`（即解释正在执行什么流水线的文本），不得因为 `postRpcStep === false` 而拦截，应当在首轮解析到时立即推送到 timeline。

### 建议 3：赋予“重新加载 (Reload)”真正的穿透能力（Cache Busting & Hydration）
- **改造方案**：
  - 在 `useChat.reload()` 或 Paseo 插件 RPC 中，增加一个强制重新对齐指令（例如调用 `refreshSession(agentId)`）。
  - 收到该请求后，`paseo-agy-acp` 清空当前的内存转录游标，全量重新执行 `replayTools()` / `readTranscriptRows()`，并向 Paseo Daemon 推送全量 `replacement` 事件。
  - 彻底打破“前端重刷 -> 查 Daemon 内存旧数据 -> 依旧不同步”的死锁环。

### 建议 4：优化 `useChat.ts`，支持直接消化 `agent_stream` 增量推送
- **文件**：`paseo-bots/client/useChat.ts`
- **改造方案**：
  - 在 `handle.timeline.subscribe` 回调中，如果收到的是带有具体 payload 的 `timeline` 增量分片，直接在客户端本地的 `entries` 进行追加或覆盖（in-place patching），立即触发 React re-render。
  - 仅在收到 `replacement` 或检测到底层 seq 出现空洞（Gap）时，才触发 80ms 防抖的 `refetch` 兜底。
  - 彻底抹平“慢半拍”的体验延迟，实现毫秒级流式呈现。
