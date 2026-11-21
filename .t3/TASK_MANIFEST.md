# TASK_MANIFEST — Multiagent Orchestration (Wave 4 & Wave 5)

Status: DONE (Live Reload / Paseo Dispatch Deferred by Operator)
Director: Main Orchestrator (T3 Control Plane)
Boundary: Runtime plugin patches -> T3 `delegate_task` (`moCode`); Docs alignment -> T3 Control Plane; Static/test gates & plugin reload -> Director.

## Wave 4: Runtime Fixes & Legacy Migration (DONE)
- [x] `W4-1` (`paseo-agy-acp`): Replace `PASEO_AGY_BOT_AGENT` with `PASEO_AGY_BOT_PROMPT_FILE` (`npm run check` + `npm test` PASS)
- [x] `W4-2` (`paseo-bots` server): `LIFECYCLE_MOUNT_LABEL`, single `agent.open.before` hook, auth backoff, feed-bridge merge
- [x] `W4-3` (`paseo-bots` client): Fix `WorkflowsScreen` hooks order, `Companion` `memoryPrefix` retention, `FeedPane` nav polish
- [x] `W4-4` (`paseo-feed`): Idempotent `channels/*.jsonl -> index.jsonl` migration + title sync
- [x] `W4-Live`: Reload `agy-acp`, `paseo-bots`, `paseo-feed`; verified `bot-chief` E2E dispatch (`34ce58c5-7c16-4ba0-a6ba-bfd2cb330ad7`)

## Wave 5: Cross-Pillar Integration (`Feed <-> Workflow <-> Team <-> Chat`)

### Stage 1: Parallel Plugin Implementation (DONE)
- [x] `W5-1` (`paseo-feed`): DONE (`typecheck` PASS, `39/39` tests PASS)
  - Scope: `paseo-feed/{shared/protocol.ts,server/roster.ts,server/extractor.ts,server/hydrator.ts,server/sync.ts,server/store.ts,client/FeedScreen.tsx,client/FeedMessageCard.tsx,client/FeedComposer.tsx,client/feed-helpers.ts,tests/feed-core.test.ts,tests/feed-ui-logic.test.ts}`
  - Deliverables: `workflow` source & labels (`WORKFLOW_*_LABEL`, `LIFECYCLE_MOUNT_LABEL`, `GLOBAL_ASSISTANT_LABEL`, `LONG_SESSION_ENABLED_LABEL`), workflow metadata retention, cold-start auto-creation in `sendToFeedChannel` (`reason: "created"`), `"打开会话 ↗"` header jump & `created` notice.
- [x] `W5-2` (`paseo-bots` shared/server): DONE (`6/6` targeted test files / `93/93` tests PASS)
  - Scope: `paseo-bots/{shared/task-card.ts,shared/feed-view.ts,shared/rpc.ts,server/tasks.ts,server/workflow-runner.ts,server/feed-bridge.ts,server/tools/workflows.ts,index.server.ts,tests/bot-feed-fusion.test.ts,tests/workflows.test.ts}`
  - Deliverables: `groupId` & `sourceChatId` on `TaskCardSchema`/`taskCardOf`/`TaskRecord`, `workflowRunRpc` (`bots.workflows.run`) + `startWorkflowFromRpc`, `"workflow"` source + metadata fields on `shared/feed-view.ts` & `server/feed-bridge.ts`.
- [x] `W5-3` (`paseo-bots` client): DONE (`tsc --noEmit` PASS, `6/6` client test files / `49/49` tests PASS)
  - Scope: `paseo-bots/{client/screen-navigation.ts,client/WorkflowsScreen.tsx,client/settings/WorkflowEditor.tsx,client/chat/stream/TaskCard.tsx,client/teams/TeamMap.tsx,client/BotFeedPane.tsx,client/BotsSurfaceReady.tsx,index.client.tsx,client/i18n/en.ts,client/i18n/zh-CN.ts,tests/screen-navigation.test.ts}`
  - Deliverables: `workflowsScreen(scope?)`, `feedScreen(kind, id, title?)`, `teamChatScreen(groupId)`; inline `workflowRunRpc` runner & team links in `WorkflowsScreen`/`WorkflowListEditor`; `onOpenTeamFeed`/`onOpenSourceChat` in `TaskCardView`; workflow count & quick jumps in `TeamMap`; `"workflow"` badge & cross-jumps in `BotFeedPane`; deep-link routing in `BotsSurfaceReady`; top-level `WorkflowsRoute` cleanup + `/feed`, `/team`, `/workflows` slash commands in `index.client.tsx`; i18n + Vitest tests.

### Stage 2: Gate, Documentation Write-Back & Deferred Live Reload
- [x] `W5-Gate`: DONE — 4-package static & test suite exited `0` (`paseo-feed` `typecheck` + `39/39`, `paseo-bots` `typecheck` + `vitest` PASS, `paseo-long-session` `typecheck` + `6/6`, `paseo-agy-acp` `check` + `526/526`)
- [x] `W5-Docs`: DONE — Synced Wave 1–5 specs (`MEMORY.md`, `docs/INDEX.md`, `docs/README.md`, `docs/design/INDEX.md`, `docs/project/INDEX.md`, `docs/project/shards/{01,03}`, `docs/design/paseo-agy-acp/{INDEX,shards/01}`, `docs/design/paseo-bots/{INDEX,shards/01,03,04,05}`, `docs/design/paseo-feed/INDEX.md`, `paseo-feed/README.md`)
- [ ] `W5-Reload`: DEFERRED — `paseo plugin reload paseo-bots`, `paseo plugin reload paseo-feed`, status check (held per operator)
- [ ] `W5-Paseo`: DEFERRED — Live Paseo `bot-chief` E2E verification dispatch (held per operator)
