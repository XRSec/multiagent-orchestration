# Web Chat Studio Architecture & Interface Specifications

Status: Active  
Standard: `@agent-first-docs` (dense en-US, rule-first, zero demo code)  
Scope: `src/web/` frontend studio and companion backend controllers

---

## 1. Top-Bar Header Contract & Layout Isolation

### 1.1 Single Top-Bar Invariant
Chat and direct interaction views MUST render exactly one unified header bar. Stacking layout headers over view-level headers is strictly forbidden.

### 1.2 Layout Level Routing Suppression
- `MainLayout.tsx` MUST suppress `ContentHeader` when active route matches `isChatView`:
  - `/bots/groups/*` (Multi-agent Group Chat)
  - `/bots/:botId` (Single-Agent Bot Session, excluding roster/market root paths)
  - `/cc-agent/:sessionId` (Direct Agent Studio Sessions, excluding `/cc-agent/new`)
- Non-chat management routes (`/bots`, `/settings`, `/skills`, `/traces`, `/orchestrator`) retain standard `ContentHeader`.

### 1.3 Unified Room Header (`RoomHeader.tsx`) Structure
- **Left Slot**:
  - Sidebar collapse trigger (`PanelLeft` / `Menu`) rendered conditionally when sidebar is collapsed or on mobile.
  - Overlapping avatar cluster (max 4 visible avatars with negative margins and z-index ordering; surplus rendered as `+N` badge).
  - Primary title (Room display name or slug) in font-weight 600+.
  - Subtitle metadata: exact member count (`N 位成员`) in muted typography.
  - Room switcher selector dropdown.
- **Right Slot**:
  - Contextual actions: Batch selection (`CheckSquare`), Branch topic session (`GitFork`), Member invite trigger (`UserPlus`), Shared blackboard drawer toggle (`FileText`), Group settings trigger (`SlidersHorizontal`), Sequence badge (`#Seq`).

---

## 2. Group Settings Drawer Specification (`GroupSettingsDrawer.tsx`)

### 2.1 Drawer Placement & Triggering
- Right-aligned slide-over overlay with backdrop blur.
- Dual invocation triggers:
  1. `RoomHeader.tsx` right action button (`SlidersHorizontal`).
  2. `Sidebar.tsx` room context menu ("群设置").

### 2.2 Functional Modules
- **Identity Panel**: Room name, immutable filesystem slug, description, and creation timestamp.
- **Roster Management**: Bot member roster display with avatar, role badge, model name, and toggle inclusion.
- **Governance Mode**: Single-speaker protocol toggle (`singleSpeakerMode`), maximum autonomous steps cap (`maxSteps`).
- **Filesystem Artifacts**: Quick inspector links to physical `GROUP_CHARTER.md` and `GROUP_MEMORY.md`.
- **Danger Zone**: "解散群聊" (Room Dissolution) action requiring two-step `ConfirmModal` authorization. Core room `multiagent-orchestration` is locked against deletion.

---

## 3. UI Confirmation System Contract (`ConfirmModal.tsx`)

### 3.1 Dialog Replacement Mandate
Browser-native blocking dialogs (`window.confirm()`, `window.prompt()`, `window.alert()`) are completely prohibited across `src/web/src/`. All destructive and confirmation interactions MUST use `ConfirmModal`.

### 3.2 Modal Specifications
- Visual container: centered overlay with `backdrop-blur-xs`, `bg-surface-elevated`, rounded corners (`rounded-2xl`), shadow elevation (`shadow-2xl`).
- Semantic variants:
  - `danger`: Red capsule badge, warning icon (`AlertTriangle`), high-contrast destructive confirm button.
  - `warning`: Amber capsule badge, warning icon.
  - `info`: Blue capsule badge, info icon.
- Interaction contracts:
  - Keyboard listeners: Escape key dismisses; Enter key confirms (disabled if required prompt input is empty).
  - Prompt mode (`isPrompt: true`): Inlines text input field with placeholder and default value for renaming operations.

---

## 4. Sidebar Unified Teammates & Collapsed Avatars (`Sidebar.tsx`)

### 4.1 Section Architecture
"伙伴" (Teammates & Groups) serves as the unified section housing both Group Chats (`filteredGroups`) and Individual Bot Companions (`filteredPartners`). Group chats MUST NOT be isolated into an unnatural detached section, and collapsing the section MUST NOT ignore group chat entries.

### 4.2 Collapsed Representation (`teammatesCollapsed === true`)
- Header: "伙伴" title with rightward chevron (`>`) when collapsed, and "+" creation action menu (`新建群聊` / `新建伙伴`).
- Horizontal avatar strip:
  - Dynamically sized container measured via `ResizeObserver` on `avatarRowRef`.
  - Displays combined entries: Group chats appear first with dual-avatar circular lockup (`w-7 h-7`), followed by individual bot companion avatars (`w-7 h-7`).
  - Active route highlighted with blue ring and subtle zoom scaling (`scale-105`).
  - Context menus (`GroupContextMenu` / `PartnerContextMenu`) remain active via right-click on collapsed avatars.
  - Combined overflow badge: `+{overflowCount}` button rendered at the row end, computing across total groups + partners. Clicking toggles section expansion.

### 4.3 Expanded Representation (`teammatesCollapsed === false`)
- Header: "伙伴" with down chevron (`v`) and "+" creation action menu.
- Body:
  - Group Chats listed first with two-avatar cluster, room title, last message preview, and relative time.
  - Bot Companions listed next with bot avatar, name, role badge, and pin indicator.
  - "显示更多伙伴" toggle button if companions exceed visible threshold.

---

## 5. Persistence & Deletion Invariants

### 5.1 Anti-Resurrection Guard (`session-messages-controller.ts`)
- In `ensureSessionInDb()`, sessions marked with `status === 'deleted'` MUST NOT be flipped back to `'active'` during read operations.
- `GET /api/sessions/:id/messages` against a deleted session MUST return HTTP 404 with error payload `{ ok: false, error: 'Session has been deleted' }`.

### 5.2 Navigation Safety Guard (`Sidebar.tsx`)
- Deleting an active session or room MUST navigate immediately to `/cc-agent/new` before triggering the deletion API to prevent dangling 404 views.

### 5.3 Room Deletion API (`rooms-controller.ts`)
- `DELETE /api/rooms/:slug`:
  - System core room `multiagent-orchestration` MUST return HTTP 403.
  - User-created rooms MUST be archived by renaming to `.archived_${slug}_${timestamp}` to prevent re-discovery by `GET /api/rooms` while preserving audit logs.
