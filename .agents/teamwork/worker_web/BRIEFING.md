# BRIEFING — 2026-11-02T17:02:00Z

## Mission
实现 Web 端多智能体群聊系统：包含 Vite Connect API 插件（前后端桥接）、动态群聊页面、消息流式 SSE、@mention 自动补全、状态指示器及动态 Sidebar，并通过完整类型检查与测试。

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa
- Working directory: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/worker_web
- Original parent: 22b93fa4-cb9f-4515-85fd-0d05019e2e0b
- Milestone: Bot Group Web Integration & End-to-End Delivery

## 🔒 Key Constraints
- Write Ownership 仅限：
  - `package.json` (root)
  - `apps/web/vite.config.ts`
  - `apps/web/server/vite-room-api-plugin.ts`
  - `apps/web/src/types/room.ts`
  - `apps/web/src/pages/bots/BotGroupChatPage.tsx`
  - `apps/web/src/components/group-chat/*` (`RoomHeader.tsx`, `MessageTimeline.tsx`, `MessageItem.tsx`, `MarkdownContent.tsx`, `MentionAutocompleteMenu.tsx`, `AgentThinkingIndicator.tsx`, `EmptyRoomState.tsx`)
  - `apps/web/src/hooks/*` (`useRoom.ts`, `useRoomMessages.ts`, `usePartnerRoster.ts`)
  - `apps/web/src/layouts/Sidebar.tsx`
- 单文件代码行数 <= 600 行（script-standards.md）。
- 绝不硬编码测试结果或假实现。
- 绝不使用 `rm`，删除必须使用 `/opt/xrsec/.env/rmfile`。

## Current Parent
- Conversation ID: 22b93fa4-cb9f-4515-85fd-0d05019e2e0b
- Updated: 2026-11-02T16:51:00Z

## Task Summary
- **What to build**: Vite Connect middleware API 插件 (`/api/rooms`, `/api/rooms/:slug`, `/api/rooms/:slug/messages`, `/api/rooms/:slug/stream`, `/api/partners`), React 群聊界面 (`BotGroupChatPage`, `RoomHeader`, `MessageTimeline`, `MessageItem`, `MarkdownContent`, `MentionAutocompleteMenu`, `AgentThinkingIndicator`, `EmptyRoomState`), 自定义 hooks (`useRoom`, `useRoomMessages`, `usePartnerRoster`), 动态 Sidebar。
- **Success criteria**: `pnpm typecheck`, `pnpm test`, `pnpm room:test`, `node tests/test-web-e2e-flow.mjs`, `pnpm --filter @cindy/web build` 全部通过。
- **Interface contracts**: `docs/dev-rules/bot-group-orchestration.md`, `scripts/lib/room-storage.ts`, `scripts/lib/agent-driver.ts`.
- **Code layout**: apps/web/**

## Key Decisions Made
- 架构隔离：Vite 插件运行于 Node.js 环境，直接引入 `scripts/lib/*` 并挂载于 `server.middlewares`，前端代码仅通过 `/api/*` REST 与 SSE 进行通信。
- 消息自增与并发：通过 `withRoomLock` 串行化写入，保障 `currentSequence` 单调自增与 `clientId` 幂等。
- 零外部依赖 Markdown 渲染：实现 `MarkdownContent.tsx`，支持代码高亮、复制按钮及 `@mention` 药丸徽章。
- 全量契约校验：通过 17 项端到端 HTTP / SSE 测试与 21 项 CLI Room 测试。

## Artifact Index
- `apps/web/server/vite-room-api-plugin.ts` — Vite Connect 中间件
- `apps/web/src/types/room.ts` — 前端类型契约
- `apps/web/src/components/group-chat/*` — 群聊原子组件
- `apps/web/src/hooks/*` — 数据状态与 SSE 交互钩子
- `apps/web/src/pages/bots/BotGroupChatPage.tsx` — 路由容器页面
- `apps/web/src/layouts/Sidebar.tsx` — 动态群组侧栏
- `handoff.md` — 5 段式交付验收报告

## Change Tracker
- **Files modified**:
  - `package.json`: 添加 `"typecheck"` 命令
  - `apps/web/vite.config.ts`: 挂载 `viteRoomApiPlugin()`
  - `apps/web/server/vite-room-api-plugin.ts`: 实现 REST & SSE API 中间件
  - `apps/web/src/types/room.ts`: 前端房间与消息模型
  - `apps/web/src/pages/bots/BotGroupChatPage.tsx`: 动态群聊交互页面
  - `apps/web/src/components/group-chat/`: 7 个核心展示与交互组件
  - `apps/web/src/hooks/`: 3 个状态与流式订阅 hooks
  - `apps/web/src/layouts/Sidebar.tsx`: 动态拉取 `/api/rooms` 列表
- **Build status**: PASS (typecheck 0 errors, build 0 errors)
- **Pending issues**: none

## Quality Status
- **Build/test result**: PASS (typecheck, test, room:test, test-web-e2e-flow all exit code 0)
- **Lint status**: clean
- **Tests added/modified**: `tests/test-web-e2e-flow.mjs` (17/17 passed, 149 assertions)

## Loaded Skills
- None
