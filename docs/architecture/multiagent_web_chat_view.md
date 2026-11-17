---
doc_id: SPEC-MULTIAGENT-WEB-CHAT-VIEW
status: CURRENT
version: 1.9.0
last_verified: 2026-11-13
language: en-US
---

# Multi-Agent Web Chat View & Execution Status Card Architecture Specification

## 1. Overview & Objectives
This document establishes the official engineering architecture and visual interaction contract for the `multiagent-orchestration` web frontend (`src/web`), focusing on:
1. **Multi-Agent Room Chat View**: Left/right split chat timeline aligning with Cindy & AGY aesthetic design guidelines.
2. **User Message & Attachment Display**: Real-time right-aligned user messages with image thumbnails and downloadable file attachment cards.
3. **Execution Status Card (`Process First, Conclusion Last`)**: Strictly mounted directly **ABOVE** each message content bubble (`ExecutionStatusCard.tsx`), displaying Thinking breakdown, Tool execution trace, and Done metrics before the final conclusion text.
4. **Max-Height & Hidden Scrollbar Constraint**: Enforces maximum container height (`max-h-56` / `max-h-60`), activates vertical scrolling (`overflow-y: auto`) on overflow, and suppresses native scrollbars (`.no-scrollbar`).
5. **Claude Desktop-Style Composer `+` Context Menu**: Decouples left `+` action button from `@` mention and mounts a 5-item `PlusActionMenu` (`ContextActionPopover` alias) with drill-down `ConnectorsSubmenu` and `SkillsSubmenu`.

---

## 2. Component Hierarchy & Data Flow

```text
BotGroupChatPage (/bots/groups/:groupId or /cc-agent/:sessionId) & BotSessionPage (direct_<botId> parity)
  │
  ├── RoomHeader / BotSessionHeader (Sidebar Expand Toggle, Room/Bot Metadata, Invite Member Trigger, TaskBoard BookOpen Trigger, Drawer Settings Trigger)
  │
  ├── RoomTaskGroupBar ("全部动态" + Thread Pills [Rename/Delete] + "+ 新任务" mode toggle)
  │
  ├── SessionContextInspector (Conditional: renders only when AppSettings.recordSessionContext === true; returns null otherwise; Default Collapsed; System Instruction, Tool Declarations, User #1 via /context-snapshot)
  │
  ├── MessageTimeline (Instant Pre-Paint Anchor, isPinned Tracking, Reverse-Load Height Delta Compensation, Monotonic Sequence)
  │     │
  │     ├── MessageItem (User: Right, Queued/Steered Badges + Steer Action / Bot: Left; 28px Avatar, 760px max width)
  │     │     │
  │     │     ├── ExecutionStatusCard (Mounted ABOVE ContentBubble — Process First, Conclusion Last)
  │     │     │     ├── Status Header (Epitaxy Thinking Stage + >=2s Stopwatch Timer / Thought for Xs)
  │     │     │     ├── ThinkingCard (Sparkles, Collapsible, Left Guide Rail)
  │     │     │     ├── StepTimelineGroup (20px Timeline Axis, >=3 Auto-Collapse, Inline Diff/Output Drawers)
  │     │     │     ├── DoneSummaryCard (CheckCircle2, Total & Stage Time Breakdown)
  │     │     │     └── btn-inspect-process ("看过程" trigger -> invokes onInspectProcess)
  │     │     │
  │     │     └── ContentBubble (User: Accent Blue / Bot: Elevated Surface Card)
  │     │           ├── MessageAttachments (Image Previews + Downloadable File Cards)
  │     │           └── MarkdownContent (healStreamingMarkdown + CalloutBlock + GroupActionCard [default collapsed, 1-line header] + MarkdownDiffBlock)
  │     │
  │     └── AgentThinkingIndicator (Live Pulse when Bots are Processing)
  │
  ├── ExecutionProcessDrawer / TaskBoardDrawer / InviteMemberModal (In-Situ Slide-overs & Modals)
  │
  ├── GroupSettingsDrawer (Primary CWD + Multi-Workspace extraDirs, Real Member Roster & Role Toggle, Clear Room History Trigger)
  │
  └── Bottom Composer Card
        ├── PlusActionMenu / ContextActionPopover (Anchored to btn-add-context, 5 Root Items)
        │     ├── ConnectorsSubmenu (/api/mcp + /api/capabilities plugins, toggle-mcp-*, toggle-plugin-*)
        │     └── SkillsSubmenu (/api/skills, refresh, manage link, toggle-skill-*)
        ├── MentionAutocompleteMenu (@partner + @file workspace file tree)
        ├── SlashCommandMenu (/goal, /teamwork, /boost, /test, /new, /clear)
        ├── DollarCommandMenu ($variables, ;prompt shortcuts)
        ├── Quick Slash Mode Bar (/goal, /teamwork, /boost)
        ├── AttachmentPreviewBar (Pending Image Thumbnails + Generic File Cards)
        └── Two-Tier Composer Card (`composer-card`, flex-col; zero clear-input button)
              ├── Hidden <input> plus-file-input (multi-file <= 8 MB) & plus-folder-input (webkitdirectory)
              ├── Top Tier: Full-width auto-resizing Textarea (Shift/Cmd/Ctrl+Enter modifiers, Cmd/Ctrl+U upload, IME guard, max 144px)
              └── Bottom Tier: `composer-toolbar` (flex items-center justify-between, uniform w-8 h-8 rounded-xl)
                    ├── Left: btn-add-context (+ button, aria-haspopup="menu", toggles PlusActionMenu)
                    ├── Center: ModelAndEffortPicker (Model selection, thinking effort slider, toggle-ultracode switch) & composer-ultracode-pill
                    └── Right: btn-send-message / btn-stop-generating (aligned on same bottom baseline)
```

---

## 3. Strict CSS Scrollbar Suppression Invariant

To prevent visible native scrollbars across Chromium, WebKit, Gecko, and Edge:

### 3.1 CSS Rules (`src/web/src/index.css` & `src/web/src/styles/globals.css`)
```css
.no-scrollbar {
  scrollbar-width: none !important; /* Firefox */
  -ms-overflow-style: none !important; /* IE / Edge */
}
.no-scrollbar::-webkit-scrollbar {
  display: none !important; /* Chrome, Safari, WebKit */
  width: 0 !important;
  height: 0 !important;
  background: transparent !important;
}
```

### 3.2 Inline CSS Fallback (`ExecutionStatusCard.tsx`)
`ExecutionStatusCard` applies `className={`${maxHeightClass} overflow-y-auto no-scrollbar flex flex-col gap-2.5`}` alongside inline `scrollbarWidth: 'none'`, `msOverflowStyle: 'none'`, and `WebkitOverflowScrolling: 'touch'`.

---

## 4. Execution State Machine

```text
      ┌───────────┐
      │   idle    │
      └─────┬─────┘
            │
            ▼
      ┌───────────┐
      │ thinking  │  (Sparkles pulse, stopwatch timer, collapsible thoughts)
      └─────┬─────┘
            │
            ▼
┌───────────────────────┐
│    tool_executing     │  (Loader2 spin, tool calls, args & output inspection)
└───────────┬───────────┘
            │
      ┌─────┴───────────────┐
      ▼                     ▼
┌───────────┐         ┌───────────┐
│   done    │         │  failed   │  / aborted
└───────────┘         └───────────┘
```

---

## 5. Verification & Acceptance (Baseline & TASK-115..119)
- **Automated Status Card Suite**: `tests/test-group-chat-status-card.mjs` (historical baseline, 7 Tiers, 54/54 assertions).
- **Adversarial Suite**: `tests/test-web-adversarial-stress.mjs` (historical baseline, 6/6 stress suites, 313/313 assertions).
- **TASK-120 Multi-Workspace, Real Member Governance & Ultra Code Gate** (MoCI 9/9 PASS verification gate):
  - `cd src/web && npx tsc --noEmit` (PASS as of 2026-11-13)
  - `npm --prefix src/web run build` (PASS as of 2026-11-13)
  - `npx tsx test/task-120-backend.test.ts` (PASS as of 2026-11-13; in-flight promise safety, context slimming, HTTP idempotency, extraDirs, member governance, 3-way prompt modes, Ultra Code settings & SDK options)
  - `NODE_ENV=test npx tsx test/task-120-frontend.test.ts` (PASS as of 2026-11-13; source contracts + Chromium DOM/Playwright E2E for ActionCard collapse, RoomHeader invite, Drawer member management, multi-workspace extraDirs, partner prompt strategy, ModelsTab Ultra Code switch, and picker toggle)
- **TASK-119 Multi-Task Threading, Pure DM Session Routing & Full Clear Gate** (MoCI 7/7 VERDICT: PASS):
  - `cd src/web && npx tsc --noEmit` (PASS as of 2026-11-13)
  - `npm --prefix src/web run build` (PASS as of 2026-11-13)
  - `npx tsx test/task-119-backend.test.ts` (PASS as of 2026-11-13)
  - `npx tsx test/task-119-frontend.test.ts` (PASS as of 2026-11-13)
  - `npx tsx test/dm-real-session-and-dev-startup.test.ts` (PASS as of 2026-11-13)
  - `npx tsx test/daemon.test.ts` (PASS as of 2026-11-13)
  - `npx tsx test/vite-hmr-backend-isolation.test.ts` (PASS as of 2026-11-13)
- **TASK-118 Backend & Context Snapshot Suite**: `npx tsx test/task-118-backend.test.ts` (PASS as of 2026-11-13).
- **TASK-118 Frontend & Chromium DOM Parity Suite**: `npx tsx test/task-118-frontend.test.ts` (PASS as of 2026-11-13).
- **TASK-117 Two-Tier Composer & Multimodal SDK Suite**: `npx tsx test/task-117-composer-align-and-multimodal-sdk.test.ts` (4/4 checkpoints passing as of 2026-11-12).
- **TASK-117 Real-Browser DOM & Edge-Case Audit**: `NODE_ENV=test npx tsx test/task-117-dom-and-browser.test.ts` (Checkpoint A multimodal edge cases + Checkpoint B Desktop `1280×860` & Mobile `390×844` DOM/upload audit passing as of 2026-11-12).
- **TASK-116 Header Minimalism & Sidebar Toggle Suite**: `npx tsx test/task-116-header-avatar-and-sidebar-toggle.test.ts` (5/5 checkpoints + `tsc --noEmit` + Vite production build passing as of 2026-11-12).
- **TASK-115 Composer (+) & MCP Suite**: `npx tsx test/task-115-composer-plus-menu.test.ts` (5/5 checkpoints passing as of 2026-11-12).
- **TASK-106 Regression Suite**: `npx tsx test/task-106-markdown-group-action-and-composer-plus.test.ts` (6/6 checkpoints passing as of 2026-11-12).
- **TASK-106/107 Regression & Vite Build Suite**: `npx tsx test/task-106-107-markdown-actions-and-quote.test.ts` (6/6 checkpoints + Vite production build passing as of 2026-11-12).
- **TypeScript Check**: `cd src/web && npx tsc --noEmit` exits `0`.

---

## 6. Input Composer & Execution Drawer Parity (TASK-101)

### 6.1 Multiline Textarea & Keyboard Modifiers
- Upgraded from single-line `<input>` to `<textarea rows={1}>` with `autoResizeTextarea` capping at `144px`.
- `handleKeyDown` supports:
  - `Enter`: Submits message via `handleSend()` and resets height.
  - `Shift+Enter`: Native newline insertion.
  - `Cmd+Enter` (macOS) / `Ctrl+Enter` (Windows): Programmatic `\n` insertion at cursor position without submitting.
  - IME Composition Protection: Ignores Enter events when `e.nativeEvent.isComposing`, `isComposingRef.current`, or `e.keyCode === 229`.

### 6.2 Quad-Command Interception & Dual-Source Mention
- `/` Slash Commands: `SlashCommandMenu` triggered at line starts, post-newline, or via `PlusActionMenu` (`斜线命令`).
- `@` Dual-Source Mention: `MentionAutocompleteMenu` combines partner bots with workspace file tree (`/api/workspace/tree?depth=4`), navigable via arrow keys.
- `$` Variables & `;` Shortcuts: `DollarCommandMenu` provides context tokens (`$workspace`, `$blackboard`, `$latest_commit`, `$model`, `$diff`, `$rules`) and prompt templates (`;fix`, `;review`, `;test`, `;doc`).
- Mutual Exclusion: Enforced in `BotGroupChatPage.tsx` across `PlusActionMenu`, `MentionAutocompleteMenu`, `SlashCommandMenu`, and `DollarCommandMenu`.

### 6.3 In-Situ Process Inspection Drawer
- `ExecutionProcessDrawer` displays metrics summary (total/thinking/tool latency), live/completed status badges, collapsible thinking chain (`Sparkles`), sequential tool trace cards, and direct jump to the bot's private session.

---

## 7. Composer (+) Context Action Popover & Multi-Type Attachments (TASK-115)

### 7.1 Decoupled `+` Action Menu (`PlusActionMenu.tsx` & `PlusActionSubmenus.tsx`)
- Clicking `data-testid="btn-add-context"` opens `PlusActionMenu` (`ContextActionPopover` alias) with 5 Claude Desktop-aligned items:
  1. `添加文件或照片` (`plus-menu-upload-files`, `Paperclip`, `⌘ U` / `Ctrl+U`) -> triggers `plus-file-input`.
  2. `添加文件夹` (`plus-menu-upload-folder`, `Folder`) -> triggers `plus-folder-input` (`webkitdirectory`), filtering `node_modules|.git|dist|.DS_Store`, staging up to the first 10 eligible files <= 8 MB, and additionally inserting `[Folder: <name> (<n> files)]` when over limit or empty.
  3. `斜线命令` (`plus-menu-slash-commands`, `SquareSlash`) -> injects `/` and opens `SlashCommandMenu`.
  4. `连接器` (`plus-menu-connectors`, `Blocks`) -> drills down to `ConnectorsSubmenu` backed by `GET /api/mcp?target=group:<id>`, `GET /api/capabilities`, `PUT /api/mcp/:id/status`, and `PUT /api/capabilities`.
  5. `插件` (`plus-menu-plugins`, `Plug`) -> drills down to `SkillsSubmenu` backed by `GET /api/skills?scope=all&target=group:<id>` and `PUT /api/skills/:id/status`.
- Capture-phase keyboard navigation supports `ArrowDown`, `ArrowUp`, `ArrowRight`, `Enter`, and `Escape` (`submenu -> root -> close(true)`) while preventing `stopGenerating()` from firing when `plusMenuOpen` is true.

### 7.2 Multi-Type Attachment Transport (`'image' | 'file'`)
- `MessageAttachment` (`src/web/src/types/room.ts` & `src/daemon/types.ts`) expands `type` to `'image' | 'file'`.
- `AttachmentPreviewBar.tsx` (`AttachmentPreviewBar`) displays staged image thumbnails and non-image `FileText` + extension cards (`'待发送附件 (<n>):'`).
- `useRoomMessages.ts` (`sendMessage`), `DaemonServer.ts` (`agent:chat` / `session:history`), `messages-controller.ts` (`handleGetMessages` / `handlePostMessage` / `dispatchOrchestratorMessage`), and `AgentOrchestrator.ts` (`internalHandleChat`) persist and rehydrate `attachments` metadata end-to-end, rendered as downloadable file cards (`message-attachment-file-<idx>`) in `MessageItem.tsx`.

---

## 8. Minimalist Room Header & Closed-Loop Sidebar Toggle (TASK-116)

- **Avatar-Free Group Header (`RoomHeader.tsx`)**: Stacked circular partner avatars (`-space-x-1.5`, `partners.slice(0, 4)`) are omitted from the left header zone; only the optional sidebar expand toggle, room switcher (`{roomName}` + `{memberCount} 位成员`), and right-side actions remain (`showSidebarToggle ? '' : '-ml-2'`).
- **Closed-Loop Sidebar Collapse/Expand (`MainLayout.tsx` -> `BotGroupChatPage.tsx` / `BotSessionPage.tsx` / `SessionPage.tsx`)**:
  - `MainLayout.tsx` exports `LayoutOutletContext` (`sidebarCollapsed`, `isMobile`, `onToggleSidebar`, `onTriggerPeek`) and forwards it through `<Outlet context={...} />` so suppressed-`ContentHeader` chat views maintain full toggle parity.
  - Collapsing via `Sidebar.tsx` (`btn-collapse-sidebar`, `PanelLeftClose`) or `Cmd/Ctrl+B` exposes `data-testid="btn-expand-sidebar"` (`PanelLeft` with `onTriggerPeek` hover preview on desktop, `Menu` on mobile, `title="展开侧边栏 (⌘B)"`) in `RoomHeader.tsx`, `BotSessionHeader.tsx`, and `CCAgentSessionView`.

---

## 9. Instant Anchor Scroll & Layout Stabilization (`MessageTimeline.tsx`, `SessionPage.tsx`)

### 9.1 The Pre-Paint Instant Scroll Guarantee
- **Root Cause of Scroll Flutter**: Global CSS declaration `scroll-smooth` on timeline containers hijacks imperative DOM mutations (`scrollTop = scrollHeight`), causing the browser to animate smooth scrolling down from the first message upon page refresh or session switching.
- **Strict Invariant**:
  1. Timeline container MUST NOT apply CSS `scroll-smooth` class globally.
  2. The initial bottom anchoring MUST execute during the browser's pre-paint layout phase via `useLayoutEffect`.
  3. Pre-paint execution performs `scrollTop = scrollHeight` alongside `scrollIntoView({ behavior: 'instant' })`.
  4. Subsequent user interactions and live streaming messages transition safely to smooth auto-scrolling when anchored near the bottom (`isNearBottom`).
- **State Pivot Protocol**:
  - `isInitialScrollDoneRef` tracks first-mount status per room / session.
  - `prevRoomNameRef` / `prevSessionIdRef` resets the instant-anchor flag whenever the user navigates between rooms or sessions, guaranteeing instant bottom anchoring across all room transitions without animated sliding.
- **Verification**: Verified via `test/chat-scroll-instant-anchor.test.ts`.

---

## 10. Claude Design System (CDS) Tokens & Calibrated Motion (`globals.css`, `motion.ts`)

### 10.1 Warm Surface Hierarchy & Contrast Discipline
- **Pure Black Eradication**: Strict avoidance of `#000` pitch black; dark background surfaces adopt warm charcoal tones (`--cds-surface-0: #0b0b0b`, `--cds-surface-1: #141414`, `--cds-surface-2: #1e1e1e`, `--cds-surface-3: #282828`).
- **Semantic Color Separation**:
  - **Clay / Brand Accent** (`--cds-brand-clay`): Dedicated strictly to Bot identity markers, agent state badges, and primary multi-agent actions.
  - **Soft Blue Focus** (`--cds-focus-blue`): Dedicated strictly to interactive UI control focus states, text selection, and user action highlights.
- **Single Enclosing Border Principle**: Embedded buttons and controls inside bordered containers (such as `ComposerCard` and `MessageItem`) avoid redundant nested outer borders, preventing visual visual weight clutter.

### 10.2 Calibrated Spring Physics & Accessibility Fallback
- Four standardized Framer Motion spring presets codified in `src/web/src/utils/motion.ts`:
  - `SPRING_BOUNCY`: Dynamic popovers, floating menus, badges (`stiffness: 400, damping: 25`).
  - `SPRING_SNAPPY`: Tooltips, inline tabs, mode toggles (`stiffness: 500, damping: 35`).
  - `SPRING_GENTLE`: Drawers, layout panels, modal sheets (`stiffness: 280, damping: 30`).
  - `SPRING_MOLTEN`: Fluid layout morphing, full-width container reflows (`stiffness: 180, damping: 26`).
- **Reduced Motion Guard**: Every motion hook checks `prefers-reduced-motion: reduce` and gracefully degrades springs into instantaneous opacity cross-fades (`duration: 0.01s`).
- **Verification**: Verified via `test/ui-craft-theme-and-motion.test.ts`.

---

## 11. Temporal Metrics & Zero Invalid Date Guard (`time.ts`, `ExecutionStatusCard.tsx`)

### 11.1 Dynamic Stopwatch & Tabular Numbers
- Stopwatch timers (`ExecutionStatusCard`, `AgentThinkingIndicator`) enforce `tabular-nums` CSS font variant (`font-variant-numeric: tabular-nums; font-feature-settings: "tnum"`), eliminating width jitter and visual shaking during real-time seconds ticking.

### 11.2 Resilient Timestamp Formatting
- All time displays pipe through `src/web/src/utils/time.ts` (`formatMessageTime`, `formatElapsedSeconds`, `formatIsoToReadable`).
- Guarantees immediate fallback to `new Date()` or sanitized relative strings on empty, null, or corrupt timestamps, structurally preventing `Invalid Date` from rendering in client views.

---

## 12. Two-Tier Bottom-Aligned Composer & Multimodal Image Pipeline (TASK-117)

- **Two-Tier Vertical Composer Card (`BotGroupChatPage.tsx`)**: `data-testid="composer-card"` renders a `flex flex-col` stack separating the full-width `<textarea rows={1}>` (`maxHeight: '144px'`) above `data-testid="composer-toolbar"` (`flex items-center justify-between`). The left `+` (`btn-add-context`) and right `Send`/`Stop` (`btn-send-message` / `btn-stop-generating`) buttons share uniform `w-8 h-8 rounded-xl` (32×32 px) dimensions on the same bottom row; the redundant clear-input (`X` / `清空`) button is removed.
- **Physical Persistence & Native SDK Multimodal Dispatch**: Uploaded or pasted images flow through `DaemonServer.ts` / `messages-controller.ts` into `AgentOrchestrator.internalHandleChat`, which writes bytes once via `Paths.getUserAttachmentsDir()` (`<projectRoot>/data/attachments`), stores lightweight `/data/attachments/<fileName>` URLs in SQLite `metadata_json` (served statically by `vite-room-api-plugin.ts`), injects `<user_attachments>` + `[Attached ... is saved at: ...]` path hints into `effectiveContent`, and forwards intact Base64 payloads to `ClaudeSdkRunner.buildSdkPromptInput()` to emit native `AsyncIterable<SDKUserMessage>` image+text content blocks.

---

## 13. Session Context Inspector, Step Timeline, Epitaxy Thinking & Queued/Steer Parity (TASK-118)

- **Context Snapshot Inspector (`SessionContextInspector.tsx`)**: Visibility-gated collapsible bar mounted on `BotGroupChatPage.tsx`, `BotSessionPage.tsx`, and `SessionPage.tsx`. Queries `GET /api/config/settings` on mount and syncs live via the `window` `'mo:app-settings-changed'` event emitted by `SettingsPage.tsx`; returns `null` (not rendered) when `AppSettings.recordSessionContext` is `false` (default) or unresolved. Only when `recordSessionContext === true` does it render (default-collapsed, `defaultExpanded = false`) and query `/api/sessions/:id/context-snapshot` or `/api/rooms/:slug/context-snapshot` on expansion to display System Instruction, Tool Declarations, and User #1 (backed by `data/app-settings.json` and `mo-context-snapshot` JSONL records; storage contract in [session-physical-storage-topology.md](session-physical-storage-topology.md)).
- **Step Timeline & Epitaxy Thinking (`StepTimelineGroup.tsx`, `ExecutionStatusCard.tsx`, `AgentThinkingIndicator.tsx`, `ThinkingCard.tsx`)**: `StepTimelineGroup` renders tool steps along a fixed `20px` (`w-[20px]`) vertical axis with inline diff/output drawers and auto-collapses when `steps.length >= 3`. `getThinkingStageText()` cycles labels across `0/15/30/45/60s`, gates the live stopwatch at `elapsedSeconds >= 2`, and settles as `Thought for Xs`.
- **Dual-Lane `Queued` / `Steer` Execution (`useRoomMessages.ts`, `ComposerCard.tsx`, `BotSessionComposer.tsx`, `MessageItem.tsx`)**: Prompts sent while generating queue as `Queued` bubbles (`QueuedMessageDraft`) and support immediate `Steer` interruption/injection (`onSteerNow` / `onSteerSend`, `deliveryStatus === 'steered'`).
- **Streaming Markdown & Instant Scroll Anchoring (`MarkdownContent.tsx`, `MessageTimeline.tsx`)**: `healStreamingMarkdown()` closes unclosed triple-backtick fences mid-stream and parses GitHub Callouts (`[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!IMPORTANT]`, `[!CAUTION]`). `MessageTimeline` tracks bottom pinning (`isPinnedRef`, `<= 30px`) and compensates `scrollTop` by `scrollHeight` delta during reverse history loading. See [cindy-ui-parity-spec.md](cindy-ui-parity-spec.md) for the full UI parity contract and sidebar tree navigation spec.

---

## 14. Multi-Task Threading, Pure DM Session Routing & Full Clear Lifecycle (TASK-119)

### 14.1 `RoomTaskGroupBar`, Unified `thread_nodes` Topic Forking & `groupChatPostSendMode`
- **Horizontal Task Group Bar (`src/web/src/components/group-chat/RoomTaskGroupBar.tsx`, `src/web/src/hooks/useRoomThreads.ts`)**: Mounted directly under `RoomHeader` (`BotGroupChatPage.tsx`) and `BotSessionHeader` (`BotSessionPage.tsx`), backed by `GET/POST /api/rooms/:slug/threads` and `PATCH/DELETE /api/rooms/:slug/threads/:threadId` (`rooms-controller.ts`).
  - Exposes `thread-pill-all` (`"全部动态"`), per-thread pills (`thread-pill-<id>`) with message counters, inline rename (`btn-rename-thread-<id>`), thread delete (`btn-delete-thread-<id>`), and `+ 新任务` quick mode toggle (`btn-new-task-mode`).
- **In-Place Topic Forking & Deduplication (`BotGroupChatPage.tsx`, `MessageItem.tsx`, `MessageContextMenu.tsx`, `useRoomMessages.ts`)**:
  - `BotGroupChatPage` (`handleForkSingleMessage`, `handleBatchFork`; legacy `handleStartTopic` `group_topic` path removed) no longer creates orphan `group_topic` sessions via `POST /api/sessions` or navigates away to `/cc-agent/s-*`; instead it calls `POST /api/rooms/:slug/threads` (`StorageManager.createRoomThread` / `ensureThreadNode`) in-place, reusing any existing `'open'` thread matching `parentMessageId` (`reused: true`) unless `forceNew: true` is passed, and switches `selectedViewThreadId` + `composerTargetThreadId` directly inside the room.
  - `MessageItem` (`btn-fork-topic-msg`, `btn-reply-in-thread`) and `MessageContextMenu` (`menu-fork-topic-msg`, `menu-reply-in-thread`) hide redundant fork-topic actions when `message.threadId` is already present, highlighting `"在此话题中补充"` (`onReplyInThread`).
  - `useRoomMessages` includes `selectedViewThreadParentMessageId` inside `visibleMessages` so the forked anchor message remains visible inside the topic view.
- **Post-Send Mode (`AppSettings.groupChatPostSendMode`)**: Configured in `src/storage/AppSettings.ts` (`'new_task'` default vs `'stay_in_task'`) and surfaced in `src/web/src/pages/settings/SettingsPage.tsx` via `GET/PUT /api/config/settings` (`config:settings:get` / `config:settings:update` in `src/daemon/gateway/allowlist.ts` and `DaemonServer.ts`).
  - In `'new_task'` mode, sending a new task prepares the composer for the next independent task; in `'stay_in_task'` mode, the composer stays anchored on the newly created `threadId`.
- **Slash Commands**: `SlashCommandMenu.tsx` includes `/new` (switch to or start a new task context) and `/clear` (reset current context breakpoint).

### 14.2 Pure Session-ID DM Routing, Option A Dispatch & 1v1 Multi-Task Parity
- **Pure DM Session-ID Navigation (`src/web/src/utils/dmNavigation.ts`, `Sidebar.tsx`)**: `resolveCanonicalDmSessionId` and `navigateToBotDm` call `/api/sessions/resolve-dm` (`resolveOrCreateDmSession` in `src/web/server/session-storage.ts`) so partner rows in `Sidebar.tsx` render flat DM items and navigate strictly to `/cc-agent/:sessionId` without `direct_*` URLs; `isLegacyDirectSessionId` redirects any legacy `direct_*` route cleanly.
- **Option A Thread Dispatch (`SessionRouteDispatcher`, `resolveDispatchTarget` in `src/web/src/pages/cc-agent/SessionPage.tsx`)**: Extracts `threadId` strictly from `session.threadId` or `session_..._thread_<tid>` / `thread_<tid>` (never falling back to `session.targetId`) and renders `LazyBotGroupChatPage` with `roomSlugOverride` + `initialThreadIdOverride` or `LazyBotSessionPage` with `botIdOverride` + `canonicalSessionIdOverride` + `initialThreadIdOverride`.
- **1v1 Partner Multi-Task Workspace Parity (`src/web/src/pages/bots/BotSessionPage.tsx`)**: Migrates 1v1 partner workspaces onto `directRoomId = direct_<botId>` sharing `RoomTaskGroupBar`, `useRoomThreads(directRoomId)`, and `useRoomMessages` multi-task execution parity.

### 14.3 Full Clear History + Session ID + `.jsonl` Deletion UI Entry Points
- **Endpoint & Broadcast**: `POST /api/rooms/:slug/clear` (`rooms-controller.ts`) and daemon RPC `room:clear` -> `room:cleared` (`DaemonServer.ts`) execute `AgentOrchestrator.clearRoomHistory` -> `StorageManager.clearRoomHistoryAndSessions` -> `deletePhysicalJsonlFiles` (see [session-physical-storage-topology.md](session-physical-storage-topology.md) for storage and disk cleanup invariants).
- **UI Confirmation Surfaces**: Triggered via confirmation modals across entry points:
  - `src/web/src/pages/bots/components/GroupSettingsDrawer.tsx` (`btn-drawer-clear-room-history`; top-bar `RoomHeader.tsx` `btn-clear-room-history` was removed in TASK-120 to eliminate clutter)
  - `src/web/src/pages/bots/components/BotSessionHeader.tsx` (`btn-clear-partner-history`)
  - `src/web/src/components/menus/GroupContextMenu.tsx` (`menu-clear-room-history`)
  - `src/web/src/components/menus/PartnerContextMenu.tsx` (`menu-clear-partner-history`)

### 14.4 System Message Classification & Explicit Send Failure Surfacing
- **Clean Session Creation**: `POST /api/sessions` (`src/web/server/controllers/session-controller.ts`) no longer injects `sender_role = 'system'` context summaries into `messages` under `parentRoomId`.
- **System Author Mapping (`messages-controller.ts`, `DaemonServer.ts`, `MessageItem.tsx`)**: `handleGetMessages` and `DaemonServer` (`session:history`) map `sender_role IN ('system', 'error')` or `sender_id === 'system'` to `authorKind: 'system'` (`GroupMessage` in `src/web/src/types/room.ts`, `ChatMessage` in `src/web/src/types/session.ts`), never `'user'`. `MessageItem` renders system notifications distinctly (`'系统通知'` amber badge, `'⚠️'` fallback glyph, no bot private-chat jump).
- **Fail-Fast Persistence & Explicit Error Surfacing (`messages-controller.ts`, `useRoomMessages.ts`, `BotGroupChatPage.tsx`)**: `handlePostMessage` returns HTTP `500` immediately on DB unavailability or `INSERT` failure and persists/pushes background `dispatchOrchestratorMessage` errors via `persistAndBroadcastDispatchError` (`sender_role = 'error'` + `agent:turn_error` WebSocket event). `useRoomMessages` handles `wsRes.ok === false`, `agent:turn_error`, and HTTP fallback failures by marking optimistic messages `deliveryStatus: 'failed'` (`data-testid="msg-delivery-failed"` in `MessageItem.tsx`), clearing active thinking indicators, and surfacing `error` toasts via `BotGroupChatPage` (`roomMessageError`) instead of vanishing silently on refresh.

---

## 15. Dynamic Context Slimming, Group Governance, Multi-Workspace & Ultra Code Integration (TASK-120)

### 15.1 GroupActionCard Default Collapsed & One-Line Summary Header
- **Collapsible Action Container (`src/web/src/components/group-chat/GroupActionCard.tsx`)**:
  - `GroupActionCard` supports `defaultExpanded?: boolean` (defaults strictly to `false`), preventing verbose machine action XML/JSON from cluttering the timeline.
  - Renders a clean 1-line interactive summary header (`cursor-pointer select-none`, `data-expanded={expanded}`) displaying action glyph, action type badge (`collaborate` / `talk` / `finish`), target bot identity, and rotating chevron indicator.
  - Clicking anywhere on the header row smoothly toggles the embedded action payload body, exposing nested XML attributes and parameters on demand.

### 15.2 Real Group Member Management Roster, Role Toggling & InviteMemberModal
- **Drawer Member Roster (`src/web/src/pages/bots/components/GroupSettingsDrawer.tsx`)**:
  - Dedicated member governance section displays active room members with avatar, display name, and role badge (`director` / `specialist` / `guest`).
  - Inline role toggle button (`data-testid="btn-toggle-role-<botId>"`) switches member hierarchy between `director` and `specialist`, dispatched via `PATCH /api/rooms/:slug/members/:botId`.
  - Member removal button (`data-testid="btn-remove-member-<botId>"`) unbinds bots from the room via `DELETE /api/rooms/:slug/members/:botId`, enforcing that at least one director must remain.
  - Add member button (`data-testid="btn-add-room-member"`) opens `InviteMemberModal`.
- **Top Bar UserPlus Invite (`src/web/src/components/group-chat/RoomHeader.tsx`, `InviteMemberModal.tsx`)**:
  - `RoomHeader` removes the broken `/bots/new` redirect and wires `UserPlus` (`data-testid="btn-room-header-invite-member"`) directly to `onInviteMember`.
  - `InviteMemberModal` (`data-testid="invite-member-modal"`) displays candidate bots not currently in the room, filtered by availability.
  - Clicking any candidate (`data-testid="btn-select-bot-<botId>"`) immediately invokes `POST /api/rooms/:slug/members` and adds the specialist to the active roster without page reload.
- **Top Bar Decluttering**:
  - Redundant `btn-clear-room-history` trash icon is stripped from `RoomHeader.tsx` to preserve a clean minimalist header, keeping destructive clear operations safely scoped inside `GroupSettingsDrawer.tsx` (`btn-drawer-clear-room-history`).

### 15.3 Multi-Workspace Folders Management (`PRIMARY` CWD + `extraDirs`)
- **Multi-Workspace Directory Controls (`src/web/src/pages/bots/components/GroupSettingsDrawer.tsx`)**:
  - `drawer-workspace-section` manages both the primary working directory (`PRIMARY` badge) and auxiliary workspace directories (`extraDirs: Array<{ path: string, mode: 'ro' | 'rw' }>`).
  - Primary working directory supports path editing (`input-group-folder-path`, `btn-change-group-folder`) and native system dialog directory picking (`btn-trigger-room-system-dialog`).
  - Auxiliary folders list displays mounted directory paths with interactive mode badges (`RO` read-only vs `RW` read-write).
  - Mode toggle button (`data-testid="btn-toggle-dir-mode"`) switches access between `ro` and `rw` in-place.
  - Directory addition form (`btn-add-extra-dir`, `input-extra-dir-path`, `select-extra-dir-mode`, `btn-confirm-add-extra-dir`) appends new directories, persisting via `PATCH/PUT /api/rooms/:slug`.
  - Removal button (`data-testid="btn-remove-extra-dir"`) unmounts auxiliary folders safely from the room definition.

### 15.4 Partner Advanced Settings: 3-Way System Prompt Strategy
- **Prompt Strategy Selector (`src/web/src/pages/bots/components/BotSettingsSubpages.tsx`)**:
  - Advanced bot configuration provides `data-testid="system-prompt-mode-card"` offering three selectable strategies:
    1. `append` (`prompt-mode-option-append`): Appends custom partner instructions after the platform baseline prompt.
    2. `override` (`prompt-mode-option-override`): Replaces default instructions completely with custom soul markdown.
    3. `claude_md` (`prompt-mode-option-claude_md`): Injects instructions directly into `<cwd>/CLAUDE.md`, letting Claude Code natively ingest workspace rules.
  - Persisted to SQLite `bots.capabilities_json` via `PUT /api/bots/:id/capabilities`.

### 15.5 Ultra Code (Ultracode) Mode Integration
- **Platform Default Setting (`src/web/src/pages/settings/components/ModelsTab.tsx`)**:
  - Renders `data-testid="setting-ultracode-card"` with `switch-ultracode-default` bound to `AppSettings.ultracodeDefault`.
  - Toggling persists immediately to `<projectRoot>/data/app-settings.json` via `PUT /api/config/settings`.
- **Session-Level Popover Toggle (`src/web/src/components/ModelAndEffortPicker.tsx`)**:
  - Mounts `data-testid="toggle-ultracode"` switch card displaying `"Ultra Code 模式"` and subtitle `"xhigh + Workflows"`.
  - Triggers `onUltracodeChange`, dynamically escalating reasoning effort to `xhigh` and activating workflow triggers.
- **Active Composer Status Pill (`src/web/src/components/ComposerCard.tsx`, `src/web/src/pages/bots/components/BotSessionComposer.tsx`)**:
  - When Ultra Code is enabled, composers render `data-testid="composer-ultracode-pill"` featuring an accent badge and tooltip.
  - Clicking the pill acts as an instant dismissal toggle, reverting to standard model and effort parameters.

### 15.6 WebSocket Resilience & HTTP Fallback Idempotency
- **Extended Turn Timeout (`src/web/src/services/gateway/WebGatewayClient.ts`)**:
  - `agent:chat` WebSocket request timeout extended to `300,000ms` (5 minutes) to comfortably accommodate multi-agent planning loops and deep reasoning under `xhigh` / Ultra Code settings without premature client-side aborts.
- **Client-Side Deduplication & Idempotency (`src/web/server/controllers/messages-controller.ts`)**:
  - `handlePostMessage` enforces a 180-second `client_id` idempotency window. Re-transmitted messages return `{ ok: true, message: existing, deduplicated: true }` without initiating duplicate LLM runs or inserting duplicate DB records.
