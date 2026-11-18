已完成对 `paseo-bots/` 工作流子系统与 `wf-moadmin-closed-loop` 契约的只读架构侦察，未修改任何代码文件。

---

### 核心侦察发现（按 6 大焦点归类）

#### 1. 运行态与调度引擎（`DoD-1`）
- **Session Blackboard 双 `wf-` 前缀 Bug**：
  - [workflows.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/tools/workflows.ts#L18-L20) 中 `newWorkflowTaskId()` 生成 `wf-${hex}`；
  - [workflow-runner.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/workflow-runner.ts#L195-L198) 回退构造 `teamSessionId` 时无条件拼接 `` `wf-${taskId}` ``，导致生成 `wf-wf-32977efc`。
  - **修复策略**：若 `taskId` 已以 `wf-` 开头则直接复用，否则加 `wf-` 前缀。
- **Stage 超时静默吞错 Bug**：
  - [workflow-runner.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/workflow-runner.ts#L126-L144) 调用 `waitForFinish(stageTimeoutMs).catch(() => null)` 吞掉了超时异常；若超时时 `agent.status` 仍为 `running` / `initializing` 且无 `lastError`，调度器会读取不完整的 `lastTurn(items).reply` 并返回 `{ ok: true }`。
  - **修复策略**：显式捕获超时或检测 `agent.status === "running" || agent.status === "initializing"`，返回 `{ ok: false, error: "Stage timed out..." }` 以触发重试/失败结算。
- **DAG 校验与 `PARTIAL` 语义**：
  - `validateWorkflowDAG`（[workflows.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/shared/workflows.ts#L93-L157)）已覆盖空表、重复 ID、未知依赖、自环与 Kahn 环路检测。
  - `defaultStageDispatcher`（[workflow-runner.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/workflow-runner.ts#L146)）仅把 `FAILED` / `BLOCKED` 判为失败，漏掉了 `PARTIAL`（与 `parseWorkerHandoff` 注释声明不一致）。建议统一 `FAILED | BLOCKED | PARTIAL` 均触发重试或失败传播。

#### 2. Blackboard 与 `<worker_handoff>` 跨阶段传递（`DoD-2`）
- **Path Split 与 CWD 漂移**：
  - 运行态通过 [bot.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/shared/bot.ts#L699-L705) 注入 `Session blackboard: <sessionBoardPath>` 与 `Task manifest: <sessionBoardPath>/TASK_MANIFEST.md`；
  - 但 `multiagent-orchestration` 团队在 [bots.json](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots-plugin-settings/bots.json#L2052) 中 `"cwd": null`，导致各阶段 Bot 进程 CWD 落在 `.../Teams/multiagent-orchestration/agents/<botId>`，而 `wf-moadmin-closed-loop` Prompt 要求读写相对路径 `.t3/TASK_MANIFEST.md`，造成跨阶段清单分裂。
  - **修复策略**：在 `buildStageBriefPrompt` 中显式注入 `SESSION_BOARD` / `TASK_MANIFEST` 上下文提示（或通过 `StageBriefInput` 传入 `sessionBoardPath`），并在 `wf-moadmin-closed-loop` Prompt 中对齐“使用系统注入的 `Task manifest` 黑板路径（涉及仓库同步时显式指向仓库 `.t3/TASK_MANIFEST.md`）”。
- **跨跳上下文不可见**：
  - [workflow-runner.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/workflow-runner.ts#L295-L303) 仅注入直接 `dependsOn` 阶段输出，导致 `moci-verify`（仅依赖 `mocode-impl`）看不到 `moadmin-plan` 的 DoD，`modoc-writeback`（仅依赖 `moadmin-review`）看不到 `mocode-impl` 的 `TOUCHED_FILES`。
- **`<worker_handoff>` 解析器字段缺口**：
  - `parseWorkerHandoff`（[workflows.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/shared/workflows.ts#L368-L384)）仅返回 `hasBlock / status / summary / openIssues`，未提取 `TOUCHED_FILES`、`VERIFICATION_PROOF`、`DOD_CHECKLIST`；且未兼容常见 Markdown 粗体（如 `**STATUS:**`）或外层围栏。

#### 3. 客户端 UI 与运行态可视化（`DoD-3`）
- **`WorkflowsScreen` 缺少运行态监控**：
  - [WorkflowsScreen.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/WorkflowsScreen.tsx#L33-L176) 目前仅渲染 Scope 选择器和 `WorkflowListEditor`，无任何运行态列表、DAG 进度视图或会话跳转入口。
  - [rpc.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/shared/rpc.ts) 与 [index.server.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/index.server.ts) 目前没有暴露工作流运行列表 RPC（服务端已有 `listTasks()`，但仅对 Bot 工具 `list_tasks` 开放）。
  - **推荐实现策略**：
    1. 在 `shared/rpc.ts` 新增 `workflowRunsRpc`（如 `bots.workflows.runs`），在 `index.server.ts` 注册 handler，读取 `listTasks()` 中含 `record.workflow` 的记录并映射为 `TaskCard`（复用 `taskCardOf`）；
    2. 在 `WorkflowsScreen.tsx` 顶部或独立区块增加 **Active & Recent Runs** 面板（使用 `useRpc` + `useQuery` 轮询运行中任务），直接复用 `TaskCardView` 渲染实时 DAG 阶段流，并通过 `openScreen(chatScreen({ botId, chatId }, ...))`（[screen-navigation.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/screen-navigation.ts#L23-L34)）实现一键跳转对应阶段会话。
- **`TaskCardView` / `TaskStageModal` / `WorkflowEditor` 细节**：
  - `TaskCardView`（[TaskCard.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/chat/stream/TaskCard.tsx)）与 `TaskStageModal`（[TaskStageModal.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/chat/stream/TaskStageModal.tsx)）已支持阶段耗时、重试徽章、错误日志与 `onOpenChat`，可直接复用；需同步补充 `client/i18n/en.ts` 与 `client/i18n/zh-CN.ts` 新文案键。

#### 4. `wf-moadmin-closed-loop` 契约与 `bots.json` 规范（`DoD-4`）
- **版本包络校验注意**：
  - [bot.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/shared/bot.ts#L401) 与线上 [bots.json](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots-plugin-settings/bots.json) 当前实际均为 `"version": 4`（并非 v3）。修改 `bots.json` 时必须保留外层 `{ "version": 4, "values": ... }` 并用 `botSettings.schema.parse(parsed.values)` 校验。
- **阶段依赖与契约优化**：
  - 建议为 `moci-verify` 增加 `dependsOn: ["moadmin-plan", "mocode-impl"]`（或由 `workflow-runner` 注入祖先阶段/黑板索引），为 `modoc-writeback` 增加 `dependsOn: ["mocode-impl", "moadmin-review"]`（不改变拓扑分层，依然保持 7 层串行执行，且与 [workflows.test.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/tests/workflows.test.ts#L269-L277) 的 `layers` 断言完全兼容！）；
  - 统一所有阶段 `<worker_handoff>` 输出契约包含 `DOD_CHECKLIST`（可选但推荐）并对齐黑板 `TASK_MANIFEST.md` 路径指引。

---

### 建议 `bot-mocode` 修改文件清单
1. [paseo-bots/shared/workflows.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/shared/workflows.ts)（`parseWorkerHandoff` 增强、`buildStageBriefPrompt` 黑板路径注入）
2. [paseo-bots/server/workflow-runner.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/workflow-runner.ts)（修复 `wf-wf-` 双前缀、修复 `waitForFinish` 超时吞错、`PARTIAL` 判失败、传递 `sessionBoardPath`）
3. [paseo-bots/shared/rpc.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/shared/rpc.ts) & [paseo-bots/index.server.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/index.server.ts)（新增工作流运行列表 RPC）
4. [paseo-bots/client/WorkflowsScreen.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/WorkflowsScreen.tsx) & [paseo-bots/client/i18n/en.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/i18n/en.ts) & [paseo-bots/client/i18n/zh-CN.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/i18n/zh-CN.ts)（增加运行态 DAG 可视化与一键跳转会话）
5. [paseo-bots-plugin-settings/bots.json](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots-plugin-settings/bots.json)（优化 `wf-moadmin-closed-loop` `dependsOn` 与黑板/Manifest 契约，保留 `version: 4` 包络）
6. `paseo-bots/tests/` 下对应测试文件（补充双前缀、超时、Handoff 解析、RPC 与 UI 测试）

<worker_handoff>
STATUS: PASS
SUMMARY:
- Completed read-only architecture and dependency recon across `paseo-bots/` workflow runtime, blackboard/handoff parsers, client UI, and `paseo-bots-plugin-settings/bots.json`.
- Identified root causes for double `wf-` session prefix (`workflow-runner.ts:198`), silent timeout swallowing in `defaultStageDispatcher` (`workflow-runner.ts:126`), `PARTIAL` status handling mismatch, `parseWorkerHandoff` missing structured fields, manifest path split under `cwd: null`, and missing runtime execution view + RPC in `WorkflowsScreen.tsx`.
- Verified `bots.json` uses envelope `version: 4` and confirmed adding cross-hop `dependsOn` (`moadmin-plan` -> `moci-verify`, `mocode-impl` -> `modoc-writeback`) preserves the 7-layer DAG topology.
TOUCHED_FILES: None
VERIFICATION_PROOF:
  - Command: `cd /Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots && npm run typecheck && npx vitest run tests/workflows.test.ts tests/workflow-runner.test.ts tests/workflow-blackboard.test.ts tests/workflow-tool.test.ts tests/workflow-ui.test.ts tests/workflow-templates.test.ts`
  - Exit_Code: `0`
  - Key_Output: `ok / PASS (34) FAIL (0)` (baseline typecheck + all 6 workflow test suites passing before edits).
OPEN_ISSUES: None
</worker_handoff>