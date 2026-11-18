已完成阶段 1（`moadmin-plan`：意图解析与任务拆解），并将任务边界、7 阶段 DAG 矩阵与验收门禁同步写入会话黑板 [TASK_MANIFEST.md](file:///Users/xr/.paseo/plugin-data/paseo-bots/shared/Teams/multiagent-orchestration/sessions/wf-2cf6cd8c/TASK_MANIFEST.md) 与仓库清单 [TASK_MANIFEST.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/.t3/TASK_MANIFEST.md)。

### 1. 核心交付范围与拆解契约
1. **DoD-1（高优）修复「打开伙伴对话」跳转空白新会话 Bug**：
   - 追踪 [TaskStageModal.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/chat/stream/TaskStageModal.tsx) → [TaskCard.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/chat/stream/TaskCard.tsx) → [index.client.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/index.client.tsx) / [BotsSurfaceReady.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/BotsSurfaceReady.tsx) 的导航链路（对照 [HandoffCard.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/chat/stream/HandoffCard.tsx) 与 [PaseoSidebar.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/PaseoSidebar.tsx)），精准打开已有 `stage.chatId` 会话并补充单测。
2. **DoD-2 孤儿工作流状态对账（Orphan Reconciliation）**：
   - 在 [index.server.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/index.server.ts)、[tasks.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/tasks.ts) 与 [workflow-runner.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/workflow-runner.ts) 中登记内存活跃运行态；对插件重启或读取时无内存活跃 runner 且超过陈旧窗口的 `running` 任务/阶段自动结算为 `failed` / `interrupted` 并刷新卡片状态，补齐单测。
3. **DoD-3 结构化协议标签卡片渲染与 `<repair_brief>` 会话复用**：
   - **3A（客户端卡片）**：在消息流层（[workflows.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/shared/workflows.ts)、[rows.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/chat/stream/rows.tsx) 等）识别 `<task_brief>`、`<repair_brief>`、`<worker_handoff>`（避开代码块误判），渲染为契合 `PluginTheme["colors"]` 与 `TaskCard` 风格的可折叠状态卡片（`PASS` 绿 / `PARTIAL` 黄 / `BLOCKED` 橙 / `FAILED` 红，支持展开 `VERIFICATION_PROOF` 与 `DOD_CHECKLIST` 及中英双语 i18n）。
   - **3B（服务端重试复用）**：在 [workflow-runner.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/workflow-runner.ts) 触发 `<repair_brief>` 重试时优先通过 `sendBotMessage` 复用原阶段 `chatId`，仅在原会话不可用时回退新建会话，并补齐单测与组件测试。

### 2. 下游阶段关键护栏提醒
- **路径校正**：客户端入口位于顶层 [index.client.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/index.client.tsx)（而非 `client/index.client.tsx`）。
- **在世工作树保护**：`paseo-bots/` 当前已有未提交增量修改（含 `WorkflowsScreen.tsx`、`workflow-runner.ts`、`workflows.ts` 等），`bot-modeep` 与 `bot-mocode` 须基于当前磁盘状态增量演进，严禁覆盖回退已有改动。

<worker_handoff>
STATUS: PASS
SUMMARY:
- Decomposed the 3 core `paseo-bots` UX & stability deliverables (DoD-1 partner chat `stage.chatId` navigation fix, DoD-2 startup/read orphan workflow state reconciliation, DoD-3A collapsible protocol tag UI cards + DoD-3B `<repair_brief>` `chatId` session reuse) into an atomic 7-stage closed-loop DAG.
- Synchronized session blackboard `TASK_MANIFEST.md` and repo `.t3/TASK_MANIFEST.md` with exact read/write boundaries, corrected entrypoint path (`paseo-bots/index.client.tsx`), and flagged uncommitted working-tree files in `paseo-bots/` for incremental preservation.
- Locked downstream verification commands (`npm --prefix paseo-bots run typecheck` and `npm --prefix paseo-bots test`) and strict scope/hygiene guardrails for `bot-modeep`, `bot-mocode`, `bot-moci`, and `bot-modoc`.
TOUCHED_FILES:
- /Users/xr/.paseo/plugin-data/paseo-bots/shared/Teams/multiagent-orchestration/sessions/wf-2cf6cd8c/TASK_MANIFEST.md
- /Users/xr/IDEA.localized/multiagent-orchestration/.t3/TASK_MANIFEST.md
VERIFICATION_PROOF:
- Command: `cmp -s .../sessions/wf-2cf6cd8c/TASK_MANIFEST.md .../.t3/TASK_MANIFEST.md && echo "MANIFEST_SYNC_OK" && wc -l .../TASK_MANIFEST.md && (! grep -En '/Users/|/home/' .../TASK_MANIFEST.md) && echo "D7_CHECK_OK"`
- Exit_Code: 0
- Key_Output:
  MANIFEST_SYNC_OK
  91 .../sessions/wf-2cf6cd8c/TASK_MANIFEST.md
  D7_CHECK_OK
DOD_CHECKLIST:
- [x] User intent distilled into unambiguous binary DoD items (DoD-1, DoD-2, DoD-3A, DoD-3B, DoD-4 QA, DoD-5 Docs)
- [x] Session blackboard `TASK_MANIFEST.md` and repo `.t3/TASK_MANIFEST.md` initialized and byte-identical (`D7` compliant)
- [x] Clear read/write boundaries and watchpoints defined for `bot-modeep`, `bot-mocode`, `bot-moci`, and `bot-modoc`
- [x] Zero direct production code mutations performed by `bot-moadmin`
OPEN_ISSUES: None
</worker_handoff>