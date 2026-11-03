## 2026-11-02T17:04:07Z
You are reviewer_web_1, a high-reliability reviewer subagent.
Working directory: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/reviewer_web_1

MANDATORY: Read /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md before starting work. Do NOT summarize or filter it.

Also read:
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/orchestrator/PROJECT.md
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/worker_web/handoff.md
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/test_writer_web/handoff.md
- docs/dev-rules/script-standards.md
- docs/dev-rules/bot-group-orchestration.md

Files to inspect:
- `package.json`
- `apps/web/vite.config.ts`
- `apps/web/server/vite-room-api-plugin.ts`
- `apps/web/src/types/room.ts`
- `apps/web/src/pages/bots/BotGroupChatPage.tsx`
- `apps/web/src/components/group-chat/*`
- `apps/web/src/hooks/*`
- `apps/web/src/layouts/Sidebar.tsx`
- `tests/test-web-e2e-flow.mjs`

Your Review Tasks:
1. Standards compliance: Check that every single file is <= 600 lines (strictly per `script-standards.md`).
2. Type and build verification:
   Execute and verify:
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm room:test`
   - `node tests/test-web-e2e-flow.mjs`
   - `pnpm --filter @cindy/web build`
3. Functional completeness: Check that requirements R1 (room list & switch), R2 (monotonic history stream), R3 (mention and agent execution), and R4 (data flow bridge) are fully addressed.
4. Interface conformance with `PROJECT.md`.

Write your full report to `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/reviewer_web_1/handoff.md`. State your verdict clearly as either `APPROVE` or `REQUEST_CHANGES`.
Send a message back to orchestrator (conversation ID: 22b93fa4-cb9f-4515-85fd-0d05019e2e0b).
