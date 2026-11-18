已完成对 `paseo-bots` 三个 DoD 交付项的修复与全量验证：

1. **DoD-1（“打开伙伴对话”跳转修复）**：移除 [BotsSurfaceReady.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/BotsSurfaceReady.tsx) 中重复触发 `openAgent` 的 `useEffect`，保留基于 `handledRouteRef` 的 `bot-chat` 路由同步，确保传入 `params.chatId` 时仅触发一次 `openAgent` 并直达原会话；[partner-chat-navigation.test.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/tests/partner-chat-navigation.test.tsx) 测试通过。
2. **DoD-2（进程重启孤儿工作流对账）**：[workflow-runner.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/server/workflow-runner.ts) 与 [index.server.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/index.server.ts) 已实现启动时与运行列表读取时的 `reconcileOrphanWorkflows` 对账逻辑，`activeWorkflowTaskIds` 保护活跃任务，孤儿任务自动结算并刷新卡片；[workflow-runner.test.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/tests/workflow-runner.test.ts) 对应测试通过。
3. **DoD-3A/3B（协议卡片渲染与 `<repair_brief>` 会话复用）**：修复 [protocol-cards.test.tsx](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/tests/protocol-cards.test.tsx) 的 `react-native` `Platform` mock，以及 [workflow-runner.test.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/tests/workflow-runner.test.ts) 中 `makeFakeHost` 的 `attach`、`library` 与 `relay` mock 契约，验证通过 `sendBotMessage` 复用原 `stage.chatId` 并在不可用时回退新建会话。

<worker_handoff>
STATUS: PASS
SUMMARY:
- Removed duplicate `openAgent` `useEffect` in `paseo-bots/client/BotsSurfaceReady.tsx` so `bot-chat` route params (`botId`, `chatId`) invoke `select()` and `openAgent` exactly once for existing `stage.chatId`.
- Fixed `react-native` `Platform` mock in `paseo-bots/tests/protocol-cards.test.tsx` and `makeFakeHost` (`attach`, `library`, `relay`) in `paseo-bots/tests/workflow-runner.test.ts` to verify DoD-3A protocol cards and DoD-3B `sendBotMessage` retry `chatId` reuse.
- Verified DoD-1, DoD-2 (`reconcileOrphanWorkflows`), DoD-3A (`ProtocolCard` + `segmentProtocolBlocks` + i18n), and DoD-3B across full `typecheck` and `vitest run`.
TOUCHED_FILES:
- paseo-bots/client/BotsSurfaceReady.tsx
- paseo-bots/client/chat/stream/ProtocolCard.tsx
- paseo-bots/client/chat/stream/TaskCard.tsx
- paseo-bots/client/chat/stream/TaskStageModal.tsx
- paseo-bots/client/chat/stream/rows.tsx
- paseo-bots/client/i18n/en.ts
- paseo-bots/client/i18n/zh-CN.ts
- paseo-bots/client/navigation.ts
- paseo-bots/index.client.tsx
- paseo-bots/index.server.ts
- paseo-bots/server/workflow-runner.ts
- paseo-bots/shared/protocol-cards.ts
- paseo-bots/tests/partner-chat-navigation.test.tsx
- paseo-bots/tests/protocol-cards.test.tsx
- paseo-bots/tests/workflow-runner.test.ts
VERIFICATION_PROOF:
  - Command: `npm --prefix /Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots run typecheck && npm --prefix /Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots test`
  - Exit_Code: `0`
  - Key_Output:
    `npm notice run @oliexe/paseo-bots@0.3.1 typecheck`
    `npm notice run tsc --noEmit`
    `npm notice run @oliexe/paseo-bots@0.3.1 test`
    `npm notice run vitest run`
    `Test Files  88 passed (88)`
    `Tests  914 passed (914)`
DOD_CHECKLIST:
  - [x] DoD-1 ("Open Partner Chat" navigation opens existing `stage.chatId`) -> verified by `tests/partner-chat-navigation.test.tsx` & `tests/workflow-ui.test.ts`
  - [x] DoD-2 (Orphan workflow state reconciliation on startup/read) -> verified by `tests/workflow-runner.test.ts` (`reconciles orphan running workflow tasks`)
  - [x] DoD-3A (Collapsible structured protocol cards with `PASS`/`PARTIAL`/`BLOCKED`/`FAILED` & i18n) -> verified by `tests/protocol-cards.test.tsx`
  - [x] DoD-3B (`<repair_brief>` retry reuses `stage.chatId` via `sendBotMessage` with fallback) -> verified by `tests/workflow-runner.test.ts`
  - [x] DoD-4 (Full `typecheck` & `vitest run` exit `0`, zero skipped tests) -> `88/88` files, `914/914` tests passed
OPEN_ISSUES: None
</worker_handoff>