# Handoff Report: E2E Flow, UI Architecture, and Acceptance Verification in `apps/web/`

## 1. Observation

### 1.1 Existing Web Application Architecture (`apps/web/`)
1. **Tech Stack & Workspace Config** (`apps/web/package.json`):
   - React 19.0.0, React Router 7.1.5, Vite 6.0.7, TailwindCSS 3.4.17, Lucide Icons 0.468.0.
   - Scripts: `"dev": "vite"`, `"build": "tsc -b && vite build"`, `"preview": "vite preview"`.
   - Verified: `pnpm --filter @cindy/web build` compiles with 0 errors (TypeScript check + Vite bundle).
2. **Missing Root `typecheck` Script** (`package.json`):
   - Command `pnpm typecheck` executed at root exited with code 1:
     `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "typecheck" not found`.
   - The root `package.json` defines `"test"`, `"web:dev"`, `"web:build"`, `"room:test"`, but does NOT define `"typecheck"`.
   - In contrast, executing `pnpm --filter @cindy/web exec tsc -b` succeeds with exit code 0.
3. **Current Group Chat Page** (`apps/web/src/pages/bots/BotGroupChatPage.tsx`):
   - Line 32: `export function BotGroupChatPage() { ... }` does not read `useParams()`, hardcoding group title to `Cindy 核心研发协同群 (M1 Architecture Team)` (lines 160-163).
   - Lines 34-59: State `messages` is initialized with static mock messages (`g-1`, `g-2`, `g-3`).
   - Lines 62-146: `handleSend()` appends mock user and mock reply messages in memory; does not call backend APIs or persist to disk.
   - Lines 184-240: Message stream renders `messages.map()`, displaying sender, avatar, badge, timestamp, and cards (`IntentPreflightCard`, `ProgressiveDisclosureCard`, `ToolDecayScrubberCard`), but lacks monotonic sequence `#sequence` indicators and Markdown formatting.
   - Lines 242-273: Bottom composer has `<AtSign />` button and text input, but lacks `@伙伴` mention autocomplete menu, streaming status indicator, or disabled/loading state while agents execute.
4. **Navigation & Group Discovery** (`apps/web/src/layouts/Sidebar.tsx` & `apps/web/src/mock/bots.ts`):
   - `Sidebar.tsx` (lines 393-435) renders group items using `filteredGroups` sourced from `MOCK_BOT_GROUPS`.
   - `mock/bots.ts` (lines 123-154) defines `MOCK_BOT_GROUPS` with only two groups: `group-m1` and `group-arch`. The preset room `multiagent-orchestration` is missing from the mock list.
   - Router (`apps/web/src/router.tsx`, line 54) registers `{ path: 'bots/groups/:groupId', element: <BotGroupChatPage /> }`.
5. **Vite Dev Server & Proxy Configuration** (`apps/web/vite.config.ts`):
   - Lines 20-49: Configures proxy for `/api` targeting `http://localhost:3000` (`VITE_API_TARGET` or `DESKTOP_API_URL`).
   - Lines 39-46: Specifically disables proxy response buffering for `text/event-stream` (`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`), confirming readiness for SSE streaming.

### 1.2 Core Storage & Agent Driver Contracts
1. **Room Storage Contract** (`scripts/lib/room-storage.ts`):
   - Stores groups in `~/.multiagent-orchestration/groups/<room_slug>/`.
   - `GroupMessage` schema (lines 13-24):
     `{ id, groupId, sequence, authorKind: 'user' | 'bot', authorBotId?, authorName, content, mentionsJson?, clientId?, createdAt }`.
   - Sequence Monotonicity (lines 323-324): Strictly monotonic integer `sequence = (record.currentSequence || messages.length || 0) + 1`.
   - Concurrency Serialization (lines 86-119): `withRoomLock(cleanId, fn)` serializes asynchronous file operations per room via FIFO promise queue.
   - Idempotency (lines 318-321): Checks if incoming `msg.clientId` exists in `messages.json`, returning the existing message if duplicate.
2. **Partner Roster & Aliases** (`scripts/lib/partner-scaffold.ts`):
   - 7 Core Partners (`CORE_PARTNER_DEFINITIONS`, lines 63-113):
     - `lead-orchestrator`: "Nexus · 多智能体统筹调度官" (`isLead: true`, aliases: `nexus`, `统筹调度官`, `调度官`)
     - `doc-skill-keeper`: "DocSkill 维护官" (aliases: `docskill`, `文档维护官`, `维护官`)
     - `cindy-r`: "Cindy_R · 代码库与运行时审计官" (aliases: `cindy_r`, `cindy-r`, `审计官`)
     - `rea-partner`: "REA 逆向分析伙伴" (aliases: `rea`, `逆向分析伙伴`)
     - `claude-sdk-architect`: "Claude SDK 架构师" (aliases: `claude-sdk-architect`, `sdk架构师`, `coder1`)
     - `agent-architect`: "Agent 架构师" (aliases: `agent-architect`, `coder2`, `架构师`)
     - `troubleshooting-engineer`: "排错工程师" (aliases: `troubleshooting-engineer`, `排错`, `reviewer`, `audit`)
3. **Agent Turn Driver & Grammar** (`scripts/lib/agent-driver.ts`):
   - EBNF turn prompt synthesis strictly conforming to `docs/dev-rules/bot-group-orchestration.md § 5.1`.
   - Untrusted JSON quarantine envelope (`<untrusted-json-block>`).
   - Silent exit primitive (`NO_REPLY`): if agent output is `NO_REPLY`, watermark advances and 0 messages are appended to timeline.
   - Deterministic mock reply support (`generateMockReply`, lines 92-115) for testing without Claude CLI or API keys.

---

## 2. Logic Chain

```
[Observation 1.1.1, 1.1.3] (apps/web has React 19 UI skeleton but BotGroupChatPage uses static in-memory state)
  +
[Observation 1.2.1, 1.2.2] (room-storage.ts & partner-scaffold.ts provide production-ready disk storage and 7 core partners)
  │
  ├─► [Logic Step 1: R1 Room Discovery & Switching]
  │   1. BotGroupChatPage must read `useParams<{ groupId: string }>()`, defaulting to 'multiagent-orchestration'.
  │   2. Sidebar and in-page header must dynamically fetch `/api/rooms` to discover existing rooms from disk.
  │   3. Include room badges (sequence count, member count, running status).
  │
  ├─► [Logic Step 2: R2 Monotonic History Stream & Rendering]
  │   1. Hydrate messages from `GET /api/rooms/:slug/messages`.
  │   2. Sort messages strictly by `sequence` ascending (`m.sequence`).
  │   3. Display `#sequence` badge + timestamp pill.
  │   4. Map `authorKind === 'user'` to User avatar/Owner badge.
  │   5. Map `authorKind === 'bot'` and `authorBotId` to the 7 core partner avatars, names, and color-coded role badges.
  │   6. Render content through a lightweight, zero-dependency Markdown parser (`MarkdownContent.tsx`) supporting code blocks, bold, lists, and highlighting `@mention` pills.
  │
  ├─► [Logic Step 3: R3 Input & @伙伴 Mention Autocomplete]
  │   1. When user inputs `@` or clicks `@` button, show `MentionAutocompleteMenu` populated from `/api/partners`.
  │   2. Keyboard navigation (`ArrowUp`/`ArrowDown`/`Enter`/`Tab`/`Escape`) filters by name, id, role, or aliases.
  │   3. Upon send, optimistically display user message with unique `clientId`.
  │   4. When message contains `@mentions`, trigger agent execution via SSE or REST `/trigger`.
  │   5. Show real-time thinking indicator: `[Agent: Nexus] 正在思考与分析需求...` with spinner.
  │   6. Append agent responses with server-minted sequence numbers as turns complete.
  │
  ├─► [Logic Step 4: R4 Front-to-Back Protocol & Concurrency]
  │   1. REST for CRUD: `GET /api/rooms`, `GET /api/rooms/:slug`, `GET /api/rooms/:slug/messages`, `POST /api/rooms/:slug/messages`.
  │   2. SSE for streaming: `GET /api/rooms/:slug/stream` (utilizing existing `vite.config.ts` SSE proxy optimization).
  │   3. Automatic fallback to 1-second polling if SSE connection drops.
  │   4. Optimistic UI for user messages, but NEVER for bot messages (strict sequence monotonicity).
  │
  └─► [Logic Step 5: Acceptance Criteria & Tests]
      1. Root `package.json` must expose `"typecheck": "pnpm --filter @cindy/web exec tsc -b"` to satisfy `pnpm typecheck`.
      2. Automated test suite `tests/test-web-e2e-flow.mjs` must verify all R1-R4 flows in mock mode without requiring browser UI.
```

---

## 3. Detailed UI Component & Architecture Design

### 3.1 Component Breakdown for `apps/web/src/`

```
apps/web/src/
├── pages/bots/
│   └── BotGroupChatPage.tsx       # Core group chat view with room switching, header, stream, and composer
├── components/group-chat/
│   ├── RoomHeader.tsx             # Room switcher dropdown, member avatar stack, status badge, sequence count
│   ├── MessageTimeline.tsx        # Monotonic message stream with auto-scroll and "scroll to bottom" pill
│   ├── MessageItem.tsx            # Single message card: avatar, role badge, sequence pill, Markdown content
│   ├── MarkdownContent.tsx        # Dependency-free Markdown & @mention renderer (code blocks, copy button)
│   ├── MentionAutocompleteMenu.tsx# Dropdown menu for @伙伴 matching 7 core partners by alias/name/role
│   ├── AgentThinkingIndicator.tsx # Live status card showing active/queued partner execution state
│   └── EmptyRoomState.tsx         # Friendly empty state with starter suggestion chips
├── hooks/
│   ├── useRoom.ts                 # Room metadata, members, watermarks, and current sequence state
│   ├── useRoomMessages.ts         # Message stream state, optimistic updates, sorting, and SSE/poll sync
│   └── usePartnerRoster.ts        # 7 core partners discovery and alias lookup
└── types/
    └── room.ts                    # Frontend TypeScript interfaces mirroring room-storage.ts & partner-scaffold.ts
```

### 3.2 7 Core Partners UI Badge & Avatar Mapping Matrix

| Partner ID | Display Name | Role Badge | Badge Theme | Avatar Asset | Key Aliases |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `lead-orchestrator` | Nexus · 多智能体统筹调度官 | `调度脑` | Purple / Magenta | `/assets/agent-island-cindy.png` | `nexus`, `统筹调度官`, `调度官` |
| `doc-skill-keeper` | DocSkill 维护官 | `维护官` | Blue / Cyan | `/assets/agent-island-annie.png` | `docskill`, `文档维护官`, `维护官` |
| `cindy-r` | Cindy_R | `审计官` | Amber / Yellow | `/assets/agent-island-erika.png` | `cindy_r`, `cindy-r`, `审计官` |
| `rea-partner` | REA 逆向分析伙伴 | `逆向伙伴` | Rose / Red | `/assets/agent-island-tarara.png` | `rea`, `逆向分析伙伴` |
| `claude-sdk-architect` | Claude SDK 架构师 | `SDK架构师` | Emerald / Green | `/assets/agent-island-boli.png` | `sdk架构师`, `代码工程师1`, `coder1` |
| `agent-architect` | Agent 架构师 | `Agent架构师`| Indigo / Violet | `/assets/agent-island-chaku.png` | `agent架构师`, `代码工程师2`, `coder2` |
| `troubleshooting-engineer` | 排错工程师 | `排错工程师`| Orange / Coral | `/assets/agent-island-muffin.png`| `troubleshooting-engineer`, `排错`, `reviewer` |
| *(Human User)* | Owner / 我 | `群主` | Sky / Slate | `/assets/cindy-avatar-account.png` | `owner`, `我` |

### 3.3 Protocol Specification: REST & SSE Hybrid

1. **Room Discovery & Metadata**:
   - `GET /api/rooms`: returns list of available rooms (ensuring `multiagent-orchestration` is first).
   - `GET /api/rooms/:slug`: returns room metadata (`id`, `name`, `members`, `currentSequence`, `charter`, `memory`).
   - `GET /api/partners`: returns the 7 core partners roster with avatars, roles, and aliases.
2. **Message Stream**:
   - `GET /api/rooms/:slug/messages?afterSequence=X`: fetches all messages where `sequence > X`, strictly ordered by `sequence ASC`.
3. **Message Submission & Trigger**:
   - `POST /api/rooms/:slug/messages`:
     - Request: `{ content: string, clientId?: string, authorName?: string }`
     - Response: `{ ok: true, message: GroupMessage, mentions: string[] }`
     - Behavior: Appends user message via `withRoomLock`, extracts `@mentions`, and dispatches partner execution asynchronously.
4. **SSE Real-Time Stream**:
   - `GET /api/rooms/:slug/stream?since=X`:
     - Event `turn_start`: `{ botId, botName }` -> UI sets thinking indicator.
     - Event `turn_chunk`: `{ botId, chunk }` -> UI renders streaming partial reply.
     - Event `turn_complete`: `{ botId, sequence, reply, silent }` -> If not silent, appends bot message to timeline; if silent, updates watermark.
     - Event `all_complete`: `{ ok: true, currentSequence }` -> UI clears thinking indicator.
     - Event `error`: `{ ok: false, error }` -> UI displays error toast/banner.

---

## 4. Edge Cases & UI Handling Matrix

| Edge Case | UI Behavior & Prevention Strategy | System Guarantee |
| :--- | :--- | :--- |
| **Empty Room** (`messages.length === 0`) | Render `EmptyRoomState` with welcoming illustrations and 3 clickable suggestion chips: `"@Nexus 规划任务"`, `"@DocSkill 检查规范"`, `"@排错工程师 代码审查"`. Clicking a chip populates the composer. | No blank screen; clear affordance for first-time users. |
| **Very Long History** (500+ messages) | Timeline uses `overflow-y-auto` with sticky scroll tracking. If user scrolls up >150px from bottom, auto-scroll pauses and a floating pill `"最新消息 ↓"` appears. Code blocks are capped at `max-h-80` with an expand/collapse toggle. | Smooth 60fps rendering without viewport jumping. |
| **Rapid Consecutive Submissions** | Submit button shows spinner and is disabled while `POST` is in-flight. User message is optimistically appended with `pending` badge and unique `clientId`. | `withRoomLock` serializes file writes; `clientId` prevents duplicate sequence creation on network retries. |
| **Multiple `@mention`s** (e.g. `@Nexus @Cindy_R`) | Composer extracts all mentioned partners. Live indicator displays multi-agent status: `Nexus (执行中) · Cindy_R (等待中)`. Agent turns complete sequentially, each appending its own monotonic message. | Orderly turn execution without race conditions; watermark for each partner advances independently. |
| **Unknown Partner `@mention`** (e.g. `@NonExistent`) | Autocomplete popup only lists known partners. If user manually types an unknown `@bot`, UI highlights it in subtle amber with tooltip `"未识别的伙伴"`. Message is still saved normally. | System never throws or blocks; backend logs warning and continues processing remaining valid mentions. |
| **Network Failure & Reconnect** | SSE automatically reconnects with exponential backoff (1s -> 2s -> 5s). If SSE fails, UI transparently falls back to 1-second short polling. Failed user message displays a red `"发送失败"` chip with a `"重试"` button reusing the identical `clientId`. | Zero lost messages; idempotent retry prevents duplicate writes. |
| **Silent Agent Exit** (`NO_REPLY`) | When a partner has nothing to contribute (returns `NO_REPLY`), the thinking indicator silently dismisses. No blank card or empty bubble is added to the chat stream. | Clean timeline without clutter; watermark advances per `bot-group-orchestration.md § 5.2`. |

---

## 5. Acceptance Criteria & Test Verification

### 5.1 Three-Point Acceptance Verification

1. **`pnpm typecheck` Verification**:
   - **Current State**: Command `"typecheck"` is missing from root `package.json`.
   - **Fix**: Add `"typecheck": "pnpm --filter @cindy/web exec tsc -b"` to root `package.json`.
   - **Verification Command**: `pnpm typecheck` -> exits with code 0.
2. **`pnpm test` Verification**:
   - **Current State**: Executes `node tests/test-sdk-orchestrator.mjs` (passes 3/3 tests).
   - **Enhancement**: Create `tests/test-web-e2e-flow.mjs` covering UI data contracts, sequence sorting, mention parsing, API bridge execution, and edge cases. Chain or provide `pnpm room:test && node tests/test-web-e2e-flow.mjs`.
   - **Verification Command**: `pnpm test` -> exits with code 0.
3. **`pnpm web:dev` Verification**:
   - **Current State**: Runs `pnpm --filter @cindy/web dev` on `http://localhost:5173`.
   - **Verification Command**:
     - Start dev server: `pnpm web:dev`
     - Verify page loads in browser at `http://localhost:5173/bots/groups/multiagent-orchestration`.
     - Confirm room list shows `multiagent-orchestration`.
     - Send message `@Nexus 规划多智能体协同`, confirm user message and Nexus response render with strictly monotonic sequences.

### 5.2 Proposed Automated Test Suite (`tests/test-web-e2e-flow.mjs`)
An automated, non-interactive Node.js test script should validate:
- **Suite 1: Data Contracts & Component Signatures**: Verifies all required group chat components exist, export valid React components, and reference the 7 core partner definitions.
- **Suite 2: Monotonic Sequence Sorter**: Tests that out-of-order, mixed-sequence message arrays are sorted strictly monotonically by `sequence ASC`, and duplicate `clientId`s are deduplicated.
- **Suite 3: Mention Autocomplete & Alias Matcher**: Tests matching across IDs, Chinese names, English names, and aliases (e.g. `@nexus`, `@统筹调度官`, `@维护官`, `@审计官`, `@coder1`, `@排错`).
- **Suite 4: Front-to-Back Flow Simulation**: Simulates user message submission with `@Nexus`, verifies disk persistence in `~/.multiagent-orchestration/groups/multiagent-orchestration/messages.json`, validates monotonic sequence increment, and verifies mock turn execution.
- **Suite 5: Edge Cases Simulation**: Tests empty room initialization, surrogate-safe emoji truncation, multiple mentions extraction, and unknown mention resilience.

---

## 6. Caveats
1. **Mock Mode vs Live Claude CLI in Dev**:
   - Live Claude CLI execution requires an active Claude CLI login and network access. In test environments or when offline, `MOCK_AGENT=true` (or `--mock-run`) must be supported seamlessly so developers and automated test runners can run without external credentials.
2. **React 19 Compatibility**:
   - `apps/web` uses React 19 (`19.0.0`). Many third-party React libraries (such as older `react-markdown` plugins) have peer dependency conflicts with React 19. Implementing a dedicated, clean, lightweight Markdown renderer in `MarkdownContent.tsx` avoids external dependency drift and ensures zero type conflicts.
3. **Shared Code Boundaries**:
   - Node.js filesystem modules (`node:fs`, `node:child_process`) must strictly reside on the Vite middleware / backend server plane, while React components in `apps/web/src/` communicate strictly via HTTP/SSE.

---

## 7. Conclusion
1. **Readiness**: The frontend shell in `apps/web` has full UI foundations (Vite 6, React Router, Tailwind, Lucide, and existing chat card atoms), and the backend storage (`room-storage.ts`) and agent driver (`agent-driver.ts`) are 100% verified by 21 passing tests.
2. **Implementation Path**:
   - Step 1: Add `"typecheck": "pnpm --filter @cindy/web exec tsc -b"` to root `package.json`.
   - Step 2: Implement Vite room API middleware (`vite-room-api-plugin.ts`) to serve `/api/rooms*` and `/api/partners`.
   - Step 3: Upgrade `BotGroupChatPage.tsx` with dynamic room switching, monotonic sequence display, Markdown rendering, `@伙伴` mention autocomplete menu, and real-time execution status.
   - Step 4: Implement automated E2E acceptance test suite `tests/test-web-e2e-flow.mjs`.

---

## 8. Verification Method

### 8.1 Independent Verification Commands
```bash
# 1. Verify TypeScript type checking on apps/web
pnpm --filter @cindy/web exec tsc -b

# 2. Verify production build of apps/web
pnpm --filter @cindy/web build

# 3. Verify existing CLI room test suite (21/21 passed)
node tests/test-cli-room.mjs

# 4. Verify root test suite
pnpm test

# 5. Start web development server
pnpm web:dev
```

### 8.2 Invalidation Conditions
- Any message sequence number `< 1` or non-monotonic.
- UI crash when entering an unrecognized `@mention`.
- TypeScript errors during `tsc -b` in `apps/web`.
- Empty or broken chat bubble on agent `NO_REPLY`.
- Path traversal vulnerability when accessing room slugs via API.
