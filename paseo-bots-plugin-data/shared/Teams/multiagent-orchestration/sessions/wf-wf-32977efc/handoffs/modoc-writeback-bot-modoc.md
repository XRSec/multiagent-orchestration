已完成阶段 6（`modoc-writeback`：架构文档与标准沉淀），将 `mocode-impl` 落地并经 `moadmin-review` 审批的工作流运行时、黑板协议与实时运行态 UI 变更事实写回 `docs/`。

### 文档更新摘要
- **[paseo-bots-workflow-engine-and-routing.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/paseo/paseo-bots-workflow-engine-and-routing.md)**（`v1.0.0` -> `v1.1.0`）：
  - 补充 `bots.workflows.runs` RPC（`paseo-bots/shared/rpc.ts`、`paseo-bots/index.server.ts`）与 `WorkflowsScreen` 实时运行态 DAG 面板（4s 轮询 `TaskCardView`、支持 `openScreen(chatScreen(...))` 一键跳转阶段聊天）的架构坐标与 Conformance 校验条目。
  - 更新 `runWorkflowDag` 与 `defaultStageDispatcher` 生命周期契约：记录 `fallbackSessionId` 去重（`taskId.startsWith("wf-") ? taskId : "wf-" + taskId`）、`waitForFinish(stageTimeoutMs)` 超时/滞留显式失败返回，以及 `<worker_handoff>` `STATUS: FAILED | BLOCKED | PARTIAL` 失败传播语义。
  - 更新 `buildStageBriefPrompt` `<task_brief>` 模板（注入 `SESSION_BOARD` 与 `TASK_MANIFEST`）及 `parseWorkerHandoff` 6 字段（`STATUS|SUMMARY|TOUCHED_FILES|VERIFICATION_PROOF|DOD_CHECKLIST|OPEN_ISSUES`）Markdown 容错解析说明。
- **[INDEX.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/paseo/INDEX.md)** 与 **[README.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/README.md)**：同步更新 `[1.4]` 路由关键词与文档行数（`216`）。

<worker_handoff>
STATUS: PASS
SUMMARY:
- Updated `docs/paseo/paseo-bots-workflow-engine-and-routing.md` (`v1.1.0`) with verified facts: `wf-` fallback `teamSessionId` deduplication, `waitForFinish(stageTimeoutMs)` timeout/running failure detection, `PARTIAL` handoff failure propagation, `SESSION_BOARD`/`TASK_MANIFEST` injection in `<task_brief>`, 6-field markdown-tolerant `parseWorkerHandoff`, and `bots.workflows.runs` + `WorkflowsScreen` live monitor.
- Updated `docs/paseo/INDEX.md` route `[1.4]` load triggers and `docs/README.md` line count (`216`) for `paseo/paseo-bots-workflow-engine-and-routing.md`.
- Confirmed `docs/paseo/paseo-bots-configuration-and-storage.md` already reflects `bots.json` `version: 4` envelope; zero code or config files were modified.
TOUCHED_FILES:
- docs/paseo/paseo-bots-workflow-engine-and-routing.md (+13/-8)
- docs/paseo/INDEX.md (+1/-1)
- docs/README.md (+1/-1)
VERIFICATION_PROOF:
  - Command: `cd /Users/xr/IDEA.localized/multiagent-orchestration && git diff --stat docs/ && wc -l docs/paseo/paseo-bots-workflow-engine-and-routing.md && ! rg -n "/Users/|/home/|C:\\\\" docs/paseo/paseo-bots-workflow-engine-and-routing.md docs/paseo/INDEX.md docs/README.md && echo "DOC_VERIFY_OK"`
  - Exit_Code: `0`
  - Key_Output:
    `docs/README.md | 2 +-`
    `docs/paseo/INDEX.md | 2 +-`
    `docs/paseo/paseo-bots-workflow-engine-and-routing.md | 21 +++++++++++++--------`
    `3 files changed, 15 insertions(+), 10 deletions(-)`
    `216`
    `DOC_VERIFY_OK`
DOD_CHECKLIST:
- [x] DoD-6 (Documentation Write-Back & Stage Handoffs) -> Updated `docs/paseo/paseo-bots-workflow-engine-and-routing.md`, `docs/paseo/INDEX.md`, and `docs/README.md` in dense `en-US` with zero D7 hardcoded paths and verified `DOC_VERIFY_OK`.
OPEN_ISSUES: None
</worker_handoff>