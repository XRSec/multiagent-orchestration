# TASK_MANIFEST: Fix Workflow Recovery & UI Missing

- **Scope**: `/Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/`
- **Preserve Untouched**: `0.16.2` baseline changes (`package.json`, lockfiles, `pnpm-workspace.yaml`, `server/activity.ts`, `tests/activity.test.ts`, `paseo-agy-acp/`).
- **Known Baseline Failure**: `tests/mcp-oauth.test.ts:245` (expected 401, actual 403).

---

## 1. Reconnaissance Findings (Exact Contracts & Call Sites)

### 1.1 Orphan Recovery, Auto/Manual Resume & Caller Notification
- **`shared/workflows.ts`**:
  - `WorkflowRunStateSchema` (L66-78) tracks `workflowId`, `workflowName`, `status` (`"running" | "done" | "failed"`), `stages` (`TaskStageStateSchema`), `currentStageIds`, `startedAt`, `completedAt`, `teamSessionId`, `sessionBoardPath`, `chatsArchivedAt`.
  - Missing persisted context for post-restart recovery/resume: `callerAgentId`, `callerBotId`, `userInput` (needed to notify the originating chat on orphan reconciliation and to reconstruct `RunWorkflowOptions` on resume).
- **`server/tasks.ts`**:
  - `TaskRecord` (L29-47) holds `taskId`, `groupId?`, `title`, `status`, `settledAt`, `cardAgentId?`, `publishedCardIds?`, `workflow?: WorkflowRunState`.
  - `settleTask` (L323-339) is write-once (`if (existing.settledAt) return { settled: false, record: existing }`). Resuming a settled/blocked workflow requires a locked helper (e.g. `reopenTaskWorkflow`) using `withTaskLock(taskId, ...)` to clear `settledAt: null`, set `status: "running"`, and reset non-`done` workflow stages back to `"pending"`.
- **`server/workflow-runner.ts`**:
  - `runWorkflowDag` (L686-1029): persists `teamSessionId` / `sessionBoardPath` at L739-743; should also persist `callerAgentId`, `callerBotId`, and `userInput` onto `WorkflowRunState`.
  - `notifyWorkflowCallerOnSettle` (L592-626) sends `buildWorkflowCompletionSummary(workflow, state)` (L556-590) to `callerAgentId` via `sendBotMessage`. Currently invoked only in `runWorkflowDag` (L766, L812).
  - `reconcileOrphanWorkflows` (L1044-1195):
    - L1079: `ref.timeline.refetch({ direction: "tail", projection: "projected", limit: 80 })` omits `wholeTurns: true` (used in `server/activity.ts:74` and `server/handoff-notifications.ts:85`).
    - L1156-1168: settles orphan task via `settleAndPublish(options.host, task.taskId, task.cardAgentId)` / `settleTask(...)`, then archives stage chats (L1170-1188), **without** calling `notifyWorkflowCallerOnSettle`. Originating chat (`callerAgentId ?? task.cardAgentId`) receives no failure/interrupted wake-up message.
    - Note `index.server.ts:111` calls `reconcileOrphanWorkflows({ host, staleAfterMs: 0 })` before `host.paseo` is attached, and `index.server.ts:119` calls `reconcileOrphanWorkflows({ host, staleAfterMs: 0, republish: true } as any)` on `host.onAttach` (`republish` is not declared on `ReconcileOrphanWorkflowsOptions` at L1033-1038).
- **`server/task-cards.ts`**:
  - `publishWorkflowCard` (L156-171) and `settleAndPublish` (L178-206) resolve `agentId` via `record.cardAgentId ?? groupAgentFor(...) ?? requesterAgentId` (`groupAgentFor` L31-40 routes to `group.leadId`'s latest chat when in a team). Because `cardAgentId` may be the lead's chat rather than the originating caller chat, `callerAgentId` must be stored separately for notifications.
- **`shared/rpc.ts`, `index.server.ts`, `server/tools/workflows.ts`, `server/tools/index.ts`**:
  - `workflowRunsRpc` (`shared/rpc.ts:510-514`) is handled at `index.server.ts:348-352`. No `bots.workflows.resume` RPC or `resume_workflow` tool exists yet.

### 1.2 Bot Chat Stream `TASK_CARD` Rendering & Resume/Retry UI
- **`index.client.tsx`**:
  - `TASK_CARD` is registered with `client.addTimelineRenderer` at L273-289 using `<TaskCardView>`, which only covers Paseo's native agent view.
- **`client/chat/stream/model.ts`**:
  - `StreamRow` (L62-64) supports `"routine-run"`, `"interaction"`, `"handoff"` — **missing** `"task-card"`.
  - `buildStreamRows` `case "plugin":` (L230-248) parses `HANDOFF_CARD`, `INTERACTION_CARD`, and `ROUTINE_RUN_CARD`, and silently drops `TASK_CARD`!
  - `standsAlone` (L307) and search text extraction (L506) also need `"task-card"`.
- **`client/chat/stream/rows.tsx` & `client/chat/Stream.tsx`**:
  - `RowContent` (`rows.tsx:73-106`) switches on `row.kind` and lacks `case "task-card":`.
  - `RowContext` (`rows.tsx:38-58`, constructed in `Stream.tsx:285-306`) provides `colors`, `openChat`, and `openBotChat`.
- **`client/chat/stream/TaskCard.tsx`, `client/chat/stream/TaskStageModal.tsx`, `client/WorkflowsScreen.tsx`**:
  - `TaskCardView` (`TaskCard.tsx:60-284`) and `TaskStageModal` (`TaskStageModal.tsx:66-338`) have no Resume/Retry action for `failed` / `blocked` workflows.
  - `WorkflowsScreen` (`WorkflowsScreen.tsx:139-152`) renders `<TaskCardView>` from `runsQuery` (`bots.workflows.runs`).
  - `tests/workflow-ui.test.ts:10-12` mocks `@getpaseo/plugin/client` with only `useSettings` (not `useRpc`), so any `useRpc` call inside `TaskCardView` must either be optional/prop-driven (`onResume`) or `tests/workflow-ui.test.ts` must mock `useRpc`.
- **`client/i18n/en.ts` (L1366+) & `client/i18n/zh-CN.ts` (L1372+)**:
  - `workflows` namespace holds all workflow UI labels; needs resume/retry keys.

### 1.3 Existing Test Coverage & Commands
- Typecheck: `npm run typecheck` (`tsc --noEmit`)
- Targeted suite: `npx vitest run tests/workflow-runner.test.ts tests/workflow-ui.test.ts tests/stream.test.ts tests/task-cards.test.ts tests/workflow-tool.test.ts tests/workflows.test.ts`
- Full suite: `npm test` (`vitest run`)

---

## 2. Implementation Plan

### Step 1: Persist Caller Context & Reopen Helper
- **`shared/workflows.ts` (`WorkflowRunStateSchema`, L66-78)**:
  - Add optional fields: `callerAgentId: z.string().optional()`, `callerBotId: z.string().optional()`, `userInput: z.string().optional()`.
- **`server/tasks.ts`**:
  - Add `reopenTaskWorkflow(taskId: string, updater: (wf: WorkflowRunState) => WorkflowRunState): Promise<TaskRecord>` under `withTaskLock` to clear `settledAt: null`, set `status: "running"`, and apply `updater` to `record.workflow`.

### Step 2: Orphan Notification & `resumeWorkflow` in `server/workflow-runner.ts`
- **`runWorkflowDag` (L739-743)**:
  - Persist `callerAgentId`, `callerBotId`, and `userInput` onto `WorkflowRunState` during initialization.
- **`reconcileOrphanWorkflows` (L1044-1195)**:
  - Add `wholeTurns: true` to `ref.timeline.refetch(...)` at L1079 when rescuing completed stage sessions.
  - Track whether this reconciliation call actually settled the task (`settled === true`). When `options?.host?.paseo` is available and `settled` is true, notify `task.workflow.callerAgentId ?? task.cardAgentId` via `notifyWorkflowCallerOnSettle` with a clear interrupted/failure summary (reconstructing `WorkflowDefinition` from `task.workflow.stages` if needed).
- **`resumeWorkflow` (new export in `server/workflow-runner.ts`)**:
  - Guard against `isWorkflowTaskActive(taskId)`.
  - Read `TaskRecord`; validate `task.workflow` exists and `task.workflow.status === "failed"` (or `task.status === "blocked"`).
  - Resolve `WorkflowDefinition` from `host.values()` (matching `workflowId`) or reconstruct from `task.workflow.stages` (`id`, `name`, `botId`, `prompt ?? ""`, `engine`, `dependsOn`, `maxRetries`, `skillIds`, `mcpServerIds`).
  - Via `reopenTaskWorkflow`: preserve all stages with `status === "done"` (`output`, `handoffFilePath`, `chatId`, `completedAt`), and reset `failed` / `skipped` / `running` / `pending` stages to `status: "pending"`, `error: null`, `completedAt: null`, `retries: 0`; set `workflow.status = "running"`, `completedAt = null`, `chatsArchivedAt = null`.
  - Call `publishWorkflowCard(host, taskId, callerAgentId)` and launch `runWorkflowDag(...)` asynchronously with `notifyCallerOnSettle: true`.

### Step 3: RPC & MCP Tool Wiring
- **`shared/rpc.ts` (after L514)**:
  - Define `workflowResumeRpc` (`name: "bots.workflows.resume"`, input `{ taskId: z.string().min(1) }`, output `{ ok: z.boolean(), card: TaskCardSchema.optional(), error: z.string().optional() }`).
- **`index.server.ts` (after L352)**:
  - Import `workflowResumeRpc` and `resumeWorkflow`, register `server.handle(workflowResumeRpc, ...)`.
- **`server/tools/workflows.ts` & `server/tools/index.ts`**:
  - Add `resumeWorkflowTool` (`resume_workflow`) calling `resumeWorkflow` and register in `BOT_TOOLS` (`server/tools/index.ts:14`).

### Step 4: Bot Chat Stream `TASK_CARD` Rendering
- **`client/chat/stream/model.ts`**:
  - Import `TASK_CARD`, `TaskCardSchema`, `type TaskCard` from `../../../shared/task-card`.
  - Add `(RowBase & { kind: "task-card"; card: TaskCard })` to `StreamRow` (L62-64).
  - Handle `TASK_CARD` in `buildStreamRows` `case "plugin":` (L230-248) with key `` `task-card:${card.data.taskId}` ``.
  - Add `"task-card"` to `standsAlone` (L307) and search text extraction (L506).
- **`client/chat/stream/rows.tsx`**:
  - Import `TaskCardView` from `./TaskCard`.
  - Add `case "task-card":` in `RowContent` (L99-105), routing `onOpenChat` via `botId && context.openBotChat ? context.openBotChat(botId, chatId) : context.openChat?.(chatId)`.

### Step 5: Resume/Retry UI & i18n
- **`client/i18n/en.ts` & `client/i18n/zh-CN.ts`**:
  - Add `workflows.resumeWorkflow`, `workflows.resumingWorkflow`, `workflows.resumeSuccess`, `workflows.resumeFailed`.
- **`client/chat/stream/TaskCard.tsx` & `client/chat/stream/TaskStageModal.tsx`**:
  - Add optional `onResume?: (taskId: string) => void | Promise<void>` prop (and/or `useRpc(workflowResumeRpc)` fallback with `useToast`) to `TaskCardView`.
  - Render a Resume/Retry button in `TaskCardView` header/footer when `card.status === "blocked" || wf.status === "failed"` (and optionally in `TaskStageModal` when `stage.status === "failed"` and `onResume` is provided).
  - Update `tests/workflow-ui.test.ts` mock for `@getpaseo/plugin/client` if `useRpc` is called in `TaskCardView`.
- **`client/WorkflowsScreen.tsx` (L139-152)**:
  - Wire `onResume` on `<TaskCardView>` to call `workflowResumeRpc` and trigger `runsQuery.refetch()`.

---

## 3. Acceptance Criteria

- **AC-1 (Orphan Notification)**: `reconcileOrphanWorkflows` sends a clear interrupted/failure summary to `callerAgentId` (falling back to `cardAgentId`) via `notifyWorkflowCallerOnSettle` when settling an orphan workflow with an attached `host.paseo`, without duplicate notifications on subsequent runs.
- **AC-2 (Backend Resume & RPC/Tool)**: `resumeWorkflow` re-opens a `failed`/`blocked` workflow task, preserves completed `done` stages and their outputs/handoffs, resets `failed`/`skipped`/`pending` stages to `pending`, and re-runs `runWorkflowDag`; exposed via `bots.workflows.resume` RPC (`shared/rpc.ts`, `index.server.ts`) and `resume_workflow` tool (`server/tools/workflows.ts`, `server/tools/index.ts`).
- **AC-3 (Bot Chat Stream `TASK_CARD`)**: `client/chat/stream/model.ts` parses `TASK_CARD` plugin timeline items into `"task-card"` rows and `client/chat/stream/rows.tsx` renders them inline via `<TaskCardView>` with working `onOpenChat` navigation.
- **AC-4 (Resume/Retry UI)**: `TaskCardView` (in both Bot Chat stream and `WorkflowsScreen`) displays a Resume/Retry button for `failed` / `blocked` workflows, invokes `bots.workflows.resume`, shows toast feedback, and refreshes state.
- **AC-5 (Verification)**: `npm run typecheck` passes with 0 errors; targeted tests (`tests/workflow-runner.test.ts`, `tests/workflow-ui.test.ts`, `tests/stream.test.ts`, `tests/task-cards.test.ts`, `tests/workflow-tool.test.ts`, `tests/workflows.test.ts`) and full `npm test` pass (excluding known baseline `tests/mcp-oauth.test.ts:245`).
