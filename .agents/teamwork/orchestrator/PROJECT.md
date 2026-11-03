# Project: Web Bot Group Chat & Multiagent Collaboration (`apps/web/`)

## Architecture
- **Target**: Multiagent Orchestration Web Group Chat in `apps/web/` connecting to underlying room storage (`scripts/lib/room-storage.ts`), 7 core partners (`scripts/lib/partner-scaffold.ts`), and agent driver (`scripts/lib/agent-driver.ts`).
- **Specification References**:
  - `docs/dev-rules/bot-group-orchestration.md` (Room storage, session lanes, monotonic sequence, EBNF prompt grammar, watermark).
  - `AGENTS.md` (Dual-plane isolation, runtime engine hierarchy, module routing).
  - `docs/axioms/STANDING_ORDER.md` (100% en-US code/doc, AST tree format, line and byte limits).
  - `docs/dev-rules/script-standards.md` (Line count <= 600, 3-4 line header, exit codes 0/1/2/124).
- **Module Boundaries**:
  - `apps/web/server/vite-room-api-plugin.ts`: Node.js Connect middleware plugin mounted in `apps/web/vite.config.ts` providing REST & SSE endpoints for rooms, messages, partner roster, and agent triggering.
  - `apps/web/src/pages/bots/BotGroupChatPage.tsx`: Dynamic group chat view reading `:groupId`, rendering timeline, room switcher, and composer.
  - `apps/web/src/components/group-chat/`: Modular UI atoms (`RoomHeader.tsx`, `MessageTimeline.tsx`, `MessageItem.tsx`, `MarkdownContent.tsx`, `MentionAutocompleteMenu.tsx`, `AgentThinkingIndicator.tsx`, `EmptyRoomState.tsx`).
  - `apps/web/src/hooks/`: Data hooks (`useRoom.ts`, `useRoomMessages.ts`, `usePartnerRoster.ts`).
  - `apps/web/src/layouts/Sidebar.tsx`: Dynamic group room list fetched from `/api/rooms`.
  - `tests/test-web-e2e-flow.mjs`: Automated opaque-box E2E test suite verifying R1-R4 flows, sequence monotonicity, mention resolution, and API bridge.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Room Discovery & Preset Sync | Discovers, lists, and switches group rooms, ensuring `multiagent-orchestration` is auto-initialized | M1 | ORIGINAL_REQUEST § R1 |
| 2 | REST Room & Member API | Endpoints `GET /api/rooms`, `GET /api/rooms/:slug`, `GET /api/partners` | M1 | bot-group-orchestration.md § 1.2 |
| 3 | Monotonic Message Persistence | `POST /api/rooms/:slug/messages` commits user message with strict monotonic sequence and clientId | M1 | ORIGINAL_REQUEST § R2 |
| 4 | SSE Agent Turn Streaming | `GET /api/rooms/:slug/stream` streams `turn_start`, `turn_chunk`, `turn_complete`, `all_complete` | M1 | ORIGINAL_REQUEST § R3, R4 |
| 5 | Concurrency & Boundary Guardrails | `withRoomLock` serializes file writes; `sanitizeGroupId` prevents path traversal | M1 | explorer_backend_bridge |
| 6 | Dynamic Route & Room Switcher | `BotGroupChatPage.tsx` handles `:groupId` URL parameter with room switcher dropdown | M2 | ORIGINAL_REQUEST § R1 |
| 7 | Monotonic Sequence Timeline | Message stream rendered strictly ordered by `sequence ASC` with `#<seq>` badges | M2 | ORIGINAL_REQUEST § R2 |
| 8 | 7 Partners & User Identity Badges | Color-coded role badges and avatars for Owner and 7 core partners | M2 | ORIGINAL_REQUEST § R2 |
| 9 | Zero-Dependency Markdown Renderer | `MarkdownContent.tsx` renders bold, lists, code blocks with copy button, and `@mention` pills | M2 | explorer_e2e_flow |
| 10 | `@伙伴` Mention Autocomplete Menu | Keyboard-navigable mention popup matching 7 partners by name/alias upon typing `@` | M2 | ORIGINAL_REQUEST § R3 |
| 11 | Real-time Agent Thinking Indicator | Visual indicator displaying active/queued agent execution status and live response | M2 | ORIGINAL_REQUEST § R3 |
| 12 | Dynamic Sidebar Navigation | `Sidebar.tsx` dynamically fetches rooms from `/api/rooms` with active room highlighting | M2 | spec_miner_web |
| 13 | Root `typecheck` Script | Exposes `"typecheck": "pnpm --filter @cindy/web exec tsc -b"` in root `package.json` | M1 | spec_miner_web |
| 14 | Opaque-Box E2E Test Suite | `tests/test-web-e2e-flow.mjs` verifying R1-R4 flows across Tiers 1-4 with exit code 0 | M3 | ORIGINAL_REQUEST Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Bridge & Vite API Middleware | `apps/web/server/vite-room-api-plugin.ts`, `apps/web/vite.config.ts`, `package.json` (typecheck) | None | DONE |
| M2 | Web UI Components & Room Experience | `apps/web/src/pages/bots/BotGroupChatPage.tsx`, `apps/web/src/components/group-chat/*`, `apps/web/src/layouts/Sidebar.tsx` | M1 | DONE |
| M3 | E2E Acceptance Testing & Hardening | `tests/test-web-e2e-flow.mjs`, validation of typecheck, test, and web:dev | M1, M2 | DONE |

## Interface Contracts

### Backend API Endpoints (Vite Middleware)
```typescript
// GET /api/rooms -> { ok: true, rooms: GroupRecord[] }
// GET /api/rooms/:slug -> { ok: true, room: GroupRecord, charter: string, memory: string }
// GET /api/rooms/:slug/messages?afterSequence=N -> { ok: true, messages: GroupMessage[] }
// POST /api/rooms/:slug/messages -> Body: { content: string, clientId?: string, authorName?: string } -> { ok: true, message: GroupMessage, mentions: string[] }
// GET /api/rooms/:slug/stream?since=N -> SSE text/event-stream (turn_start, turn_chunk, turn_complete, all_complete)
// GET /api/partners -> { ok: true, partners: PartnerInfo[] }
```

### Frontend Type Definitions (`apps/web/src/types/room.ts`)
```typescript
export interface GroupMessage {
  id: string;
  groupId: string;
  sequence: number;
  authorKind: 'user' | 'bot';
  authorBotId?: string;
  authorName: string;
  content: string;
  mentionsJson?: { all?: boolean; botIds?: string[] };
  clientId?: string;
  createdAt: string;
}

export interface GroupRecord {
  id: string;
  name: string;
  members: Record<string, { role: string; lastSeenSequence: number }>;
  currentSequence: number;
  createdAt: string;
}

export interface PartnerInfo {
  id: string;
  name: string;
  role: string;
  aliases: string[];
  avatarUrl?: string;
  badgeText?: string;
  badgeTheme?: string;
}
```

## Code Layout
- `apps/web/server/vite-room-api-plugin.ts`: Node.js Connect middleware for Vite serving room storage & partner driver APIs.
- `apps/web/vite.config.ts`: Vite config mounting the room API plugin.
- `apps/web/src/types/room.ts`: Frontend TypeScript interfaces for rooms, messages, and partners.
- `apps/web/src/pages/bots/BotGroupChatPage.tsx`: Group chat route page container.
- `apps/web/src/components/group-chat/`:
  - `RoomHeader.tsx`: Room selector & metadata bar.
  - `MessageTimeline.tsx`: Monotonically ordered message list.
  - `MessageItem.tsx`: Single message item with badges, sequence pill, and Markdown formatting.
  - `MarkdownContent.tsx`: Zero-dependency Markdown & @mention pill parser.
  - `MentionAutocompleteMenu.tsx`: @mention autocomplete popup.
  - `AgentThinkingIndicator.tsx`: Thinking state & streaming indicator.
  - `EmptyRoomState.tsx`: Empty state with starter prompts.
- `apps/web/src/layouts/Sidebar.tsx`: Dynamic room list navigation.
- `package.json`: Exposing `"typecheck"` script.
- `tests/test-web-e2e-flow.mjs`: E2E opaque-box acceptance test script.
