已完成阶段 6（`modoc-writeback`：架构文档与标准沉淀），将经 `mocode-impl` 实现并由 `moadmin-review` 审批通过的 3 项 DoD 架构变更写回 [paseo-bots-workflow-engine-and-routing.md](file:///Users/xr/IDEA.localized/multiagent-orchestration/docs/paseo/paseo-bots-workflow-engine-and-routing.md)（升级至 `version: 1.2.0`）。

### 文档更新摘要
- **Section 1 & Section 6（坐标与一致性表）**：补充 `reconcileOrphanWorkflows`、`isWorkflowTaskActive`、结构化协议卡片（`segmentProtocolBlocks`、`parseBriefFields`、`ProtocolCard`、`rows.tsx`）及伙伴对话跳转（`navigateToAgentChat`、`BotsSurfaceReady.tsx`）代码坐标与对应测试命令。
- **Section 3.3（执行生命周期与孤儿对账）**：记录 `activeWorkflowTaskIds` 内存追踪、进程重启（`staleAfterMs: 0`）与 `bots.workflows.runs` 读取时（默认 `DEFAULT_ORPHAN_STALE_MS = 10 * 60 * 1000`）的 `reconcileOrphanWorkflows` 孤儿工作流结算机制，以及 `TaskCard` / `TaskStageModal` 通过 `navigateToAgentChat` 与 `handledRouteRef` 直达既有 `stage.chatId` 的跳转行为。
- **Section 4.2 & 4.4（重试会话复用与协议卡片渲染）**：补充 `<repair_brief>` 重试优先通过 `sendBotMessage` 复用原空闲会话（不可用时回退 `startChat` 新建会话），以及 `rows.tsx` 通过 `segmentProtocolBlocks` 识别 `<task_brief>` / `<repair_brief>` / `<worker_handoff>` 并由 `ProtocolCard` 渲染为可折叠状态卡片的规范。

<worker_handoff>
STATUS: PASS
SUMMARY:
- Updated `docs/paseo/paseo-bots-workflow-engine-and-routing.md` (`version: 1.2.0`, `last_verified: 2026-11-18`) with partner chat navigation (`navigateToAgentChat`, `BotsSurfaceReady`), orphan workflow reconciliation (`reconcileOrphanWorkflows`, `activeWorkflowTaskIds`), `<repair_brief>` session reuse (`sendBotMessage`), and structured protocol card rendering (`segmentProtocolBlocks`, `ProtocolCard`).
- Verified zero machine-specific absolute paths (D7 compliance) and ran all 4 conformance test suites referenced in Section 6.
TOUCHED_FILES:
- docs/paseo/paseo-bots-workflow-engine-and-routing.md
VERIFICATION_PROOF:
  - Command: `git -C /Users/xr/IDEA.localized/multiagent-orchestration diff --stat -- docs/ && (! rg -n "/Users/|/home/" /Users/xr/IDEA.localized/multiagent-orchestration/docs/paseo/paseo-bots-workflow-engine-and-routing.md) && npx --prefix /Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots vitest run tests/partner-chat-navigation.test.tsx tests/protocol-cards.test.tsx tests/workflow-runner.test.ts tests/workflow-ui.test.ts`
  - Exit_Code: `0`
  - Key_Output:
    `docs/paseo/paseo-bots-workflow-engine-and-routing.md | 39 ++++++++++++++++------`
    `✓ tests/protocol-cards.test.tsx (3 tests) 9ms`
    `✓ tests/workflow-ui.test.ts (12 tests) 8ms`
    `✓ tests/partner-chat-navigation.test.tsx (2 tests) 10ms`
    `✓ tests/workflow-runner.test.ts (7 tests) 253ms`
    `Test Files  4 passed (4) | Tests  24 passed (24)`
DOD_CHECKLIST:
  - [x] Sync `docs/` with verified DoD-1, DoD-2, DoD-3A, and DoD-3B architectural facts -> updated `docs/paseo/paseo-bots-workflow-engine-and-routing.md` to `1.2.0`
  - [x] Follow dense `en-US`, rule-first density, zero demo code, and D7 (no machine-specific absolute paths) -> `rg` check returned zero matches
  - [x] Verify conformance table commands pass -> 4 test files / 24 tests passed (`Exit_Code: 0`)
OPEN_ISSUES: None
</worker_handoff>