已完成对 `paseo-bots/` 的只读架构侦察，未修改任何代码文件。

### 核心侦察发现

1. **在世工作树基线（需增量保留）**
   - `paseo-bots/` 当前已有未提交增量修改：`client/WorkflowsScreen.tsx`、`client/i18n/en.ts`、`client/i18n/zh-CN.ts`、`index.server.ts`、`server/workflow-runner.ts`、`shared/bot.ts`、`shared/rpc.ts`、`shared/workflows.ts` 及 5 个测试文件。`bot-mocode` 须基于当前磁盘状态增量演进。

2. **DoD-1：点击“打开伙伴对话”跳转到空白新会话的根因**
   - [TaskStageModal.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/chat/stream/TaskStageModal.tsx#L159-L170) 调用 `onOpenChat(stage.botId, stage.chatId!)`。
   - [index.client.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/index.client.tsx#L256) 与 [WorkflowsScreen.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/WorkflowsScreen.tsx#L142)（经 [screen-navigation.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/screen-navigation.ts#L23-L34) `chatScreen`）均以 `client.openScreen({ screenId: "bot-chat", params: { botId, chatId } })` 打开目标页。
   - **根因**：[BotsSurfaceReady.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/BotsSurfaceReady.tsx#L86) 仅解构 `{ theme, layout, host, navigation, settings, latest, commit }`，**完全忽略了 `screen` 与 `params`**；`selection` 恒初始化为 `null`（[L107](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/BotsSurfaceReady.tsx#L107)），既未调用 `select({ botId: params.botId, chatId: params.chatId })`（[L365-L375](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/BotsSurfaceReady.tsx#L365-L375) 负责解析 `botHost` 并调用 `openAgent({ agentId, serverId })`），又在桌面端落入 `<BotLauncherCore initialBotId={listed[0]?.id ?? null} />`（[L740-L767](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/BotsSurfaceReady.tsx#L740-L767)），导致始终打开空白新会话。
   - **建议方案**：让 `BotsSurfaceReady` 接收 `screen` 与 `params`，在 `screen === "bot-chat"` 且 `params?.botId` 存在时通过去重 ref + `useEffect` 触发 `select({ botId: params.botId, chatId: params.chatId ?? null })`（若含 `chatId` 则直接透传 `openAgent` 打开原会话）。

3. **DoD-2：进程重启后孤儿工作流状态对账**
   - [workflow-runner.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/workflow-runner.ts#L185)（`runWorkflowDag`）与 [tasks.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/tasks.ts#L183-L198)（`updateTaskWorkflow`）、[index.server.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/index.server.ts#L336-L340)（`workflowRunsRpc` -> `listTasks()`）目前均无内存活跃运行态注册表，也无启动/读取时对账逻辑。
   - **建议方案**：在 `workflow-runner.ts` 维护进程内 `activeWorkflowTaskIds`（`Set<string>`，`finally` 清理）；新增 `reconcileOrphanWorkflows`：在 `index.server.ts` 启动时立即扫描（无活跃 runner，可对所有遗留 `workflow.status === "running"` 执行结算），并在 `workflowRunsRpc` / `listTasks` 路径按安全过期阈值（且 `!activeWorkflowTaskIds.has(taskId)`）惰性结算：将 `running` stage 置为 `failed`（附中断诊断信息）、`pending` stage 置为 `skipped`、`workflow.status = "failed"` 并通过 `settleAndPublish` / `settleTask` 持久化与刷新 `TaskCard`。

4. **DoD-3：结构化协议卡片（3A）与 `<repair_brief>` 会话复用（3B）**
   - **3A**：[rows.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/chat/stream/rows.tsx#L157-L161)（`UserMessage` 纯文本 `<Text>`）与 [rows.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/chat/stream/rows.tsx#L216)（`AssistantMessage` -> [Markdown.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/Markdown.tsx#L13-L15)）目前未拦截协议标签。可在 `shared/` 新增跳过 fenced code blocks（`` ``` `` / `~~~`）的协议分段解析器（复用 [workflows.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/shared/workflows.ts#L386-L413) `parseWorkerHandoff`），并新建 `client/chat/stream/ProtocolCard.tsx`（对齐 `PluginTheme["colors"]`、`StatusBadge` 与 `TaskCard.tsx` 风格，支持 `PASS`/`PARTIAL`/`BLOCKED`/`FAILED` 配色、可折叠 `VERIFICATION_PROOF`/`DOD_CHECKLIST` 及 `en`/`zh-CN` i18n）。
   - **3B**：[workflow-runner.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/workflow-runner.ts#L283) 每次波次均无条件 `newUuid()`，且 `defaultStageDispatcher`（[L101](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/workflow-runner.ts#L101)）仅调用 `startChat`。当 `stageState.retries > 0 && stageState.chatId` 时，应优先在原 `chatId` 上通过 [sendBotMessage](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/shared/chat.ts#L564-L616) 发送 `<repair_brief>` 并 `waitForFinish`；仅当原会话不可用/已归档/发送抛错时，回退至 `startChat` 新建会话并更新 `stage.chatId` 与 `rekeyMember`。

<worker_handoff>
STATUS: PASS
SUMMARY:
- Diagnosed DoD-1 root cause: `BotsSurfaceReady.tsx` ignores `screen` and `params` (`botId`, `chatId`) passed from `openScreen({ screenId: "bot-chat", params })`, leaving `selection = null` and falling through to a blank `BotLauncherCore`.
- Mapped DoD-2 orphan reconciliation points across `index.server.ts`, `server/tasks.ts`, `server/task-cards.ts`, and `server/workflow-runner.ts` (in-memory `activeWorkflowTaskIds` + startup & lazy stale settlement via `settleAndPublish`).
- Mapped DoD-3A/3B integration points: fenced-code-safe parser + `ProtocolCard.tsx` in `client/chat/stream/rows.tsx` + `en`/`zh-CN` i18n, and `sendBotMessage` reuse of `stageState.chatId` on `retries > 0` in `server/workflow-runner.ts` with `startChat` fallback.
TOUCHED_FILES: None
VERIFICATION_PROOF:
  - Command: `rg -n "onOpenChat|openChat|chatScreen|openScreen|TaskStageModal|stage\.chatId" paseo-bots/client paseo-bots/index.client.tsx && rg -n "ChatPane|sendBotMessage|agents\.ref\(.*\)\.send" paseo-bots/`
  - Exit_Code: `0`
  - Key_Output:
    `paseo-bots/index.client.tsx:256: onOpenChat={(botId, chatId) => client.openScreen({ screenId: "bot-chat", params: { botId, chatId } })}`
    `paseo-bots/client/BotsSurfaceReady.tsx:86: export function BotsSurfaceReady({ theme, layout, host, navigation, settings, latest, commit }: BotsSurfaceReadyProps)`
    `paseo-bots/client/BotsSurfaceReady.tsx:365: const select = (next: Selection) => { if (next.chatId) { ... openAgent({ agentId: next.chatId, serverId: botHost.key }); } ... }`
    `paseo-bots/shared/chat.ts:564: export async function sendBotMessage(api: ChatApi, input: SendBotMessageInput): Promise<void>`
    `paseo-bots/server/workflow-runner.ts:283: const reservedChatId = newUuid();`
DOD_CHECKLIST:
  - [x] Inspected `git status -s` in `paseo-bots/` and flagged 13 uncommitted files for incremental preservation -> verified
  - [x] Diagnosed DoD-1 partner chat navigation bug with exact file/line citations -> `BotsSurfaceReady.tsx:86,107,365-375,740-767`
  - [x] Mapped DoD-2 orphan workflow reconciliation architecture -> `index.server.ts`, `server/tasks.ts`, `server/task-cards.ts`, `server/workflow-runner.ts`
  - [x] Mapped DoD-3A protocol card rendering & DoD-3B retry `chatId` reuse -> `rows.tsx`, `workflows.ts`, `chat.ts`, `workflow-runner.ts`
OPEN_ISSUES: None
</worker_handoff>