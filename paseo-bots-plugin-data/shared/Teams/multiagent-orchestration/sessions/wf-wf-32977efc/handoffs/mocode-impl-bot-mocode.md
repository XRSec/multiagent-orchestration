已完成对 `paseo-bots/` 工作流子系统及 `wf-moadmin-closed-loop` 契约的加固与测试验证，所有变更均已通过类型检查与全量测试套件。

### 主要变更摘要
1. **运行态与调度引擎加固 ([workflow-runner.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/workflow-runner.ts))**：
   - 修复 `teamSessionId` 回退拼接导致的 `wf-wf-` 双前缀问题（`taskId.startsWith("wf-") ? taskId : \`wf-${taskId}\``）。
   - 修复 `defaultStageDispatcher` 中 `waitForFinish(stageTimeoutMs)` 超时被 `.catch(() => null)` 静默吞掉的问题，显式检测超时或 `running` / `initializing` 状态并返回失败以触发重试/终态结算。
   - 将 `<worker_handoff>` 的 `PARTIAL` 状态与 `FAILED` / `BLOCKED` 统一视为阶段失败并触发重试/阻断传播。
   - 向 `buildStageBriefPrompt` 注入当前 `sessionBoardPath`。
2. **Blackboard 与 `<worker_handoff>` 解析增强 ([workflows.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/shared/workflows.ts))**：
   - `buildStageBriefPrompt` 在存在 `sessionBoardPath` 时于 `<task_brief>` 注入 `- SESSION_BOARD` 与 `- TASK_MANIFEST`，消除团队 `cwd: null` 下的路径分裂。
   - `parseWorkerHandoff` 增强为支持 6 字段提取（新增 `touchedFiles`、`verificationProof`、`dodChecklist`），并兼容常见 Markdown 粗体与列表前缀（如 `**STATUS:**`、`- TOUCHED_FILES:`）。
3. **客户端运行态可视化与 RPC ([rpc.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/shared/rpc.ts), [index.server.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/index.server.ts), [WorkflowsScreen.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/WorkflowsScreen.tsx))**：
   - 新增 `workflowRunsRpc` (`bots.workflows.runs`) 并在服务端返回 `listTasks()` 中工作流运行记录映射的 `TaskCard[]`。
   - 在 [WorkflowsScreen.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/WorkflowsScreen.tsx) 新增 **Active & Recent Runs** 面板（自动 4s 轮询运行中任务、手动刷新按钮、复用 `TaskCardView` 实时展示 DAG 阶段进度，并支持点击阶段一键跳转对应会话），同步补充中英文 i18n 文案。
4. **`wf-moadmin-closed-loop` 契约与测试 ([bots.json](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots-plugin-settings/bots.json), [workflow-runner.test.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/tests/workflow-runner.test.ts), [workflows.test.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/tests/workflows.test.ts))**：
   - 保持 `version: 4` 外层包络与 7 阶段 ID 不变，为 `moci-verify` 增加 `moadmin-plan` 依赖、为 `modoc-writeback` 增加 `mocode-impl` 依赖，并对齐注入式 `TASK_MANIFEST` 黑板路径与 6 字段 `<worker_handoff>` 契约。
   - 新增单元测试覆盖 `wf-` 去重前缀、`SESSION_BOARD`/`TASK_MANIFEST` 注入及 6 字段加粗 `<worker_handoff>` 解析。

<worker_handoff>
STATUS: PASS
SUMMARY:
- Fixed double `wf-` session prefix, silent stage timeout swallowing, and `PARTIAL` status handling in `paseo-bots/server/workflow-runner.ts`.
- Enhanced `buildStageBriefPrompt` (injecting `SESSION_BOARD` and `TASK_MANIFEST`) and `parseWorkerHandoff` (6-field extraction + markdown bold tolerance) in `paseo-bots/shared/workflows.ts`.
- Added `bots.workflows.runs` RPC (`shared/rpc.ts`, `index.server.ts`) and live Active & Recent Runs DAG visualization with chat navigation in `client/WorkflowsScreen.tsx` (+ i18n `en.ts`/`zh-CN.ts`), plus updated `wf-moadmin-closed-loop` contracts in `paseo-bots-plugin-settings/bots.json` and added unit tests.
TOUCHED_FILES:
- paseo-bots/shared/workflows.ts
- paseo-bots/server/workflow-runner.ts
- paseo-bots/shared/rpc.ts
- paseo-bots/index.server.ts
- paseo-bots/client/WorkflowsScreen.tsx
- paseo-bots/client/i18n/en.ts
- paseo-bots/client/i18n/zh-CN.ts
- paseo-bots/tests/workflow-runner.test.ts
- paseo-bots/tests/workflows.test.ts
- paseo-bots-plugin-settings/bots.json
VERIFICATION_PROOF:
  - Command: `cd /Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots && node -e 'const fs=require("fs"); const r=JSON.parse(fs.readFileSync("../paseo-bots-plugin-settings/bots.json","utf8")); if(!r.version||!r.values) process.exit(1); console.log("bots.json envelope ok, version="+r.version);' && npm run typecheck && npm test`
  - Exit_Code: `0`
  - Key_Output:
    `bots.json envelope ok, version=4`
    `ok`
    `Test Files  86 passed (86)`
    `     Tests  900 passed (900)`
DOD_CHECKLIST:
- [x] DoD-1 (Runtime & DAG Scheduling Hardening) -> Fixed double `wf-` prefix, stage timeout detection, and `PARTIAL` failure handling with passing `workflow-runner.test.ts`.
- [x] DoD-2 (Blackboard & `<worker_handoff>` Fidelity) -> Injected `SESSION_BOARD`/`TASK_MANIFEST` and added 6-field markdown-tolerant `parseWorkerHandoff` with passing `workflows.test.ts`.
- [x] DoD-3 (Client UI & `TaskCard` Robustness) -> Added `workflowRunsRpc` and live Active & Recent Runs DAG view + chat jump in `WorkflowsScreen.tsx`, typecheck `ok`.
- [x] DoD-4 (`wf-moadmin-closed-loop` Contract Optimization) -> Aligned cross-hop `dependsOn`, manifest guidance, and `<worker_handoff>` schema in `bots.json` (`version: 4`), validated by `workflows.test.ts`.
- [x] DoD-5 (Zero-Regression Verification) -> `npm run typecheck` and `npm test` (86 files, 900 tests) passed with `Exit_Code: 0`.
OPEN_ISSUES: None
</worker_handoff>