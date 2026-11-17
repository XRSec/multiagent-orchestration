---
doc_id: SPEC-CINDY-UI-PARITY
status: CURRENT
version: 2.5.0
last_verified: 2026-11-12
language: en-US
---

# Cindy-Grade Web UI Parity Specification

## 1. Overview & Architectural Goals
This document defines the interface standards, component topology, design tokens, and state synchronization models implemented to align the `src/web` user interface with official Cindy desktop client specifications.

Key parity areas covered:
- Batch Session Management (multi-select, range selection, bulk deletion/archival)
- First-Class Diff & Patch Rendering (`MarkdownDiffBlock`, full-width gutter/backgrounds)
- Cindy-Grade Thinking Blocks (`ThinkingCard`, default-collapsed, live timer, pulse animation)
- Semantic Tool Execution Tracing (interactive file capsules, execution states)
- Rich Session UX (full Markdown rendering, code block copy, floating scroll-to-bottom anchor, active task abort)

---

## 2. Design Tokens (`src/web/src/styles/globals.css`)
Semantic CSS variables ensure identical contrast, accessibility, and theming between light and dark modes:

```css
:root {
  --diff-add-fg: #1a7f37;
  --diff-add-bg: #dafbe1;
  --diff-add-border: #aceebb;
  --diff-del-fg: #cf222e;
  --diff-del-bg: #ffebe9;
  --diff-del-border: #ffcecb;
  --diff-line-num: #6e7781;
  --thinking-body-text: #57606a;
  --agent-actions-rail: #d0d7de;
}

.dark {
  --diff-add-fg: #3fb950;
  --diff-add-bg: rgba(46, 160, 67, 0.15);
  --diff-add-border: rgba(63, 185, 80, 0.4);
  --diff-del-fg: #f85149;
  --diff-del-bg: rgba(248, 81, 73, 0.15);
  --diff-del-border: rgba(248, 81, 73, 0.4);
  --diff-line-num: #8b949e;
  --thinking-body-text: #8b949e;
  --agent-actions-rail: #30363d;
}
```

### Thinking Pulse Keyframes
```css
@keyframes pulse-dot {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1.1); opacity: 1; }
}
.thinking-dot-1 { animation: pulse-dot 1.4s infinite ease-in-out; }
.thinking-dot-2 { animation: pulse-dot 1.4s infinite ease-in-out 0.2s; }
.thinking-dot-3 { animation: pulse-dot 1.4s infinite ease-in-out 0.4s; }
```

---

## 3. Session Batch Management
### 3.1 State Machine (`src/web/src/hooks/useSessions.ts`)
- `selectedSessionIds`: `Set<string>` maintaining currently highlighted session IDs.
- `selectionAnchorId`: `string | null` storing the primary selection pivot for range selection.

### 3.2 Keyboard & Pointer Modifiers (`src/web/src/layouts/Sidebar.tsx`)
- **`Cmd + Click` / `Ctrl + Click`**: Toggles target session in/out of `selectedSessionIds`.
- **`Shift + Click`**: Calculates linear slice between `selectionAnchorId` and target row in visible session order (`visibleSessionIds.slice(start, end + 1)`).
- **`Escape` Key**: Clears all active selections instantly.

### 3.3 Floating Capsule Action Bar
When `selectedSessionIds.size > 0`, a floating capsule header displays:
1. `已选择 {count} 个会话` counter badge.
2. `归档` / `取消归档` batch trigger (`POST /api/sessions/batch-archive`).
3. `删除` destructive action triggering `ConfirmModal` (`POST /api/sessions/batch-delete`).
4. `清空` button or `X` to exit selection mode.

---

## 4. Markdown Diff Engine (`src/web/src/components/chat/MarkdownDiffBlock.tsx`)
### 4.1 Structural Layout
```text
+-------------------------------------------------------------+
| [Header] filepath | +N -N stats badge                       |
+--------+--------+-------------------------------------------+
| LineNo | Symbol | Code Line Content (w-max min-w-full)      |
| 12     |   -    | const x = 1;                              |
|        |   +    | const x = 2;                              |
| 13     |        | console.log(x);                           |
+--------+--------+-------------------------------------------+
```

### 4.2 Architectural Guarantees
- **Line Number Gutter**: Fixed width `${maxLineLength + 3}ch`, right-aligned, `user-select: none`.
- **Symbol Column**: Dedicated 16px wide column displaying green `+`, red `-`, or blank.
- **Horizontal Scrolling Background**: Applied via `w-max min-w-full` on each diff row to ensure background color (`--diff-add-bg` / `--diff-del-bg`) covers the entire line width during horizontal scrolling.
- **Code Fence Routing**: `src/web/src/components/group-chat/MarkdownContent.tsx` intercepts ```diff and ```patch fences to automatically render `MarkdownDiffBlock`.

---

## 5. Thinking Card Architecture (`src/web/src/components/chat/ThinkingCard.tsx`)
### 5.1 Lifecycle States
- **Default State**: Collapsed by default across all contexts (group chat, single-agent, and subagent views).
- **In-Progress State**:
  - Displays `✦ Thinking` with 3 pulsing dots.
  - Real-time timer ticker (`Date.now() - startedAt`) updating every 500ms.
- **Completed State**:
  - Displays `✦ Thought for Xs` with frozen duration capsule and chevron rotation.
- **Expanded Rail Layout**:
  - Left accent rail: `border-l-2 border-[var(--agent-actions-rail)]`.
  - Content formatted in italicized `text-[var(--thinking-body-text)]`.

---

## 6. Assistant Execution Cards & Tool Tracing (`AssistantExecutionCards.tsx`)
- **Semantic Tool Call Action Headers**: Displays human-readable action summaries before raw tool names.
- **Interactive File Capsules**: File arguments (`path`, `file_path`) render as styled pill badges (`FileCode` icon + file name) with interactive preview hooks.
- **Status Indicators**:
  - `running`: Spinning `Loader2`.
  - `success`: Green `CheckCircle2`.
  - `error`: Red `XCircle`.

---

## 7. Session Page Markdown & UX Upgrades
- **Full Markdown Rendering**: `SessionPage.tsx` and `BotSessionTimeline.tsx` use `MarkdownContent` with table, blockquote, link, and list support.
- **Code Block Actions**: Copy-to-clipboard button with checkmark feedback.
- **Smooth Scroll-To-Bottom Anchor**: Floating button appears whenever scroll position is > 150px from bottom.
- **Abort Controller**: "停止响应" button allows immediate cancellation of active LLM generation loops.

---

## 8. Group Chat E2E Resilience & Anti-Strand Execution Engine

### 8.1 Root Cause Analysis & Problem Taxonomy
Prior to Milestone 3 hardening, user interactions in group chats suffered from intermittent indicator freezing (ticking past 60s+ without termination) and missing assistant responses due to five systemic failure modes:
1. **Frontend Return Trap (`useRoomMessages.ts`)**: When WebSocket `agent:chat` timed out or disconnected, the HTTP REST fallback (`POST /api/rooms/:slug/messages`) returned early on 200 OK (`return true;`), bypassing `setIsThinking(false)` and `setActiveBot(undefined)`. The `ActiveBotIndicator` remained permanently mounted in the client DOM. Furthermore, falsy check `!serverMessages` failed to trigger REST history fetch on empty WebSocket history arrays (`[]`).
2. **HTTP/WS Dual-Track Disconnect (`messages-controller.ts`)**: HTTP fallback POST saved messages to SQLite but did not notify the orchestrator engine, stranding HTTP messages without triggering bot executions.
3. **Room Identifier Multi-Alias Fragmentation (`StorageManager.ts`)**: Disparate components referred to rooms using different slug formats (`multiagent-orchestration`, `multiagent_orchestration`, `room_multiagent_orchestration`). Exact-match SQL queries partitioned history and hid newly written messages.
4. **SDK Resume Silent Swallow (`ClaudeSdkRunner.ts`)**: When resuming a pruned or invalid Claude CLI session (`--resume <staleId>`), the runner encountered `No conversation found with session ID`. Treating `message.is_error` as a quiet empty response returned `NO_REPLY`, leaving the user stranded without execution.
5. **AgentOrchestrator Silent Skip on User Turns (`AgentOrchestrator.ts`)**: Inter-agent anti-loop `NO_REPLY` tokens were returned directly when addressed by a human user, exiting without emitting terminal events (`turn.complete`) or persisting assistant feedback.

### 8.2 Architectural Invariants & Solution Topology

```text
+---------------------------------------------------------------------------------------+
| User Prompt (Web UI)                                                                  |
|   ├── WS invoke('agent:chat') ─── (OK) ─────────────────┐                             |
|   └── (Fail) ─> HTTP POST /api/rooms/:slug/messages     │                             |
|                   │                                     │                             |
|                   ├── finally { setIsThinking(false) }  │ [Guaranteed UI Cleanup]     |
|                   ▼                                     ▼                             |
|         messages-controller.ts                Unified WebSocket Gateway               |
|                   │                                     │                             |
|                   └──> dispatchOrchestratorMessage() <──┘                             |
+-------------------------------------------┬-------------------------------------------+
                                            ▼
                          AgentOrchestrator.handleChat()
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
          ClaudeSdkRunner.executeTurn()                   StorageManager (SQLite)
                     │                                             │
      [Stale Resume Error Detection]                       [Multi-Alias Query]
      isClaudeResumeSessionNotFound()                      getRoomAliasList(slug)
                     │                                             │
      ├── Clear sdkSessionId = null                        ├── WHERE room_id IN (...)
      ├── CAS Session Reset in SQLite                      └── Query across hyphen/under
      └── Auto-Retry without --resume                              & room_ prefix
                     │
                     ▼
         [Evaluation & Reply Output]
                     │
     ┌───────────────┴───────────────┐
     ▼                               ▼
[Standard Output]               [NO_REPLY Token]
Emit turn.complete              ├── role === 'user':
                                │     Persist friendly fallback message
                                │     Emit turn.complete (isFinal: true)
                                └── role !== 'user' (Inter-agent):
                                      Emit turn.complete (isFinal: true, silent)
```

### 8.3 Detailed Technical Specifications

#### 8.3.1 Frontend Thinking Indicator Lifecycle Guard (`src/web/src/hooks/useRoomMessages.ts`)
- **Return Trap Elimination**: The HTTP fallback branch MUST encapsulate state teardown within a `finally` block:
  ```typescript
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(groupId)}/messages`, { ... });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.message) {
        setMessages((prev) => ...);
        success = true;
      }
    }
  } catch (fallbackErr: any) {
    setError(fallbackErr?.message || '发送失败');
  } finally {
    setIsThinking(false);
    setActiveBot(undefined);
  }
  return success;
  ```
- **Empty Array History Fallback (AC-302)**: Check `(!serverMessages || serverMessages.length === 0)` so that empty WS history frames immediately trigger REST history fetch fallback.

#### 8.3.2 HTTP REST & WebSocket Dual-Track Convergence (`src/web/server/controllers/messages-controller.ts`)
- **Background Orchestrator Dispatch (AC-303)**: `handlePostMessage` MUST dispatch incoming messages to the orchestrator pipeline asynchronously after SQLite write:
  ```typescript
  dispatchOrchestratorMessage({
    roomId: rawSlug,
    botId: targetBot,
    content,
    authorName: body.authorName || '人类用户',
    clientId: finalClientId,
  }).catch((err) => {
    console.warn('[messagesController] Background orchestrator dispatch error:', err);
  });
  ```
- **Tri-Tier Dispatch Fallback Strategy**:
  1. *Embedded Daemon*: Check `getActiveEmbeddedDaemon()`, dispatching directly to in-process `AgentOrchestrator`.
  2. *Gateway Client*: Connect to `ws://127.0.0.1:38080/gateway` via `GatewayClient` and invoke `agent:chat`.
  3. *Standalone Engine*: Instantiate a dedicated `AgentOrchestrator` against local `.daemon` storage.

#### 8.3.3 RoomId Multi-Alias Normalization (`src/storage/StorageManager.ts`)
- **Permutation Generator (AC-304)**: `getRoomAliasList(roomId: string): string[]` produces all 7 standard alias variants:
  - Raw string
  - Prefix-stripped string (`replace(/^room_/, '')`)
  - Hyphenated slug (`foo-bar`)
  - Underscored slug (`foo_bar`)
  - Prefixed raw (`room_${raw}`)
  - Prefixed hyphenated (`room_foo-bar`)
  - Prefixed underscored (`room_foo_bar`)
- **Parameterized SQL Clause Expansion**:
  - `getRoom(slugOrId)`: `WHERE id IN (${placeholders}) OR slug IN (${placeholders}) LIMIT 1`
  - `getMessagesSince(roomId, sequence)`: `WHERE room_id IN (${placeholders}) AND sequence > ? AND silent_token = 0 AND rewind_at IS NULL AND sender_role != 'message_tombstone' ORDER BY sequence ASC`
  - `appendMessage(...)`: Deduplicates client IDs across `(session_id = ? OR room_id IN (${placeholders})) AND client_id = ?`.
  - `getMemberCursor(roomId, memberId)`: Resolves `MAX(last_seen_sequence)` across all room aliases.

#### 8.3.4 ClaudeSdkRunner Self-Healing Session Recovery (`src/daemon/orchestrator/ClaudeSdkRunner.ts`, `SessionLifecycleEngine.ts`)
- **Error Classifier (`isClaudeResumeSessionNotFound`)**: Scans `string`, `Error.message`, `Error.stack`, and message object properties (`result`, `error`, `message`, `stderr`, `stdout`, `output`, `errors[]`) matching:
  `/No conversation found with session ID(?:\s*:\s*([^\s]+))?/i`
- **Fast-Fail Stream Interceptor (AC-305)**:
  - If `message.type === 'error'` or `message.type === 'result'` with `message.is_error` contains the pattern, immediately throw an error instead of returning empty results.
  - Guard `finalReply` against silent error string swallowing.
- **Self-Healing Re-Execution**:
  ```typescript
  catch (err: any) {
    const staleId = this.sdkSessionId;
    if (isClaudeResumeSessionNotFound(err, staleId || undefined)) {
      this.sdkSessionId = null;
      this.pendingRewindTo = undefined;
      const recoveryHandoff = staleId ? this.onInvalidResumeDetected?.(staleId) : undefined;
      const rebuiltPrompt = recoveryHandoff ? `${recoveryHandoff}\n\n${prompt}` : effectivePrompt;
      return this.executeTurn(rebuiltPrompt, { ...options, isBridgeTurn });
    }
    throw err;
  }
  ```

#### 8.3.5 AgentOrchestrator NO_REPLY Fallback Completion Loop (`src/daemon/orchestrator/AgentOrchestrator.ts`)
- **Direct User Turn Protection (AC-306)**: When a human user turn results in `NO_REPLY`:
  - Synthesize a polite user-facing status reply: `"已接收您的指令。当前伙伴（${bot.name}）已完成协同上下文评估，暂无需执行的增量代码或任务。如需深入协助，请提供更具体的操作指引。"`
  - Persist assistant message record into SQLite storage.
  - Emit terminal event `turn.complete` with `{ isFinal: true, replyContent, ... }`.
  - Advance the bot's member cursor in SQLite.
- **Inter-Agent Turn Termination**: For non-user relay turns receiving `NO_REPLY`, emit terminal `turn.complete` with `isFinal: true` and `replyContent: 'NO_REPLY'` so the UI immediately clears thinking and spinner states.
- **Turn Interruption Guard**: Enclose runner invocation in `try / catch`, emitting `turn.interrupted` before rethrowing so client listeners unmount active spinners on backend execution faults.

### 8.4 Verification Matrix (AC-301 through AC-306)

| AC Code | Requirement Description | Target File | Verification Method | Status |
|---|---|---|---|---|
| **AC-301** | Guaranteed Thinking Indicator Cleanup in HTTP Fallback | `src/web/src/hooks/useRoomMessages.ts` | Static AST / Regex assertion of `finally` block teardown | **VERIFIED (100%)** |
| **AC-302** | REST History Fallback on Empty Array | `src/web/src/hooks/useRoomMessages.ts` | Assertion of `(!serverMessages \|\| serverMessages.length === 0)` | **VERIFIED (100%)** |
| **AC-303** | HTTP Controller Orchestrator Dispatch | `src/web/server/controllers/messages-controller.ts` | Dual-track dispatch export & invocation test | **VERIFIED (100%)** |
| **AC-304** | RoomId Multi-Alias Normalization | `src/storage/StorageManager.ts` | 7-permutation query test on rooms & messages in SQLite | **VERIFIED (100%)** |
| **AC-305** | ClaudeSdkRunner Self-Healing Session Recovery | `src/daemon/orchestrator/ClaudeSdkRunner.ts` | Stale resume pattern matching & re-execution test | **VERIFIED (100%)** |
| **AC-306** | AgentOrchestrator NO_REPLY User Fallback Feedback | `src/daemon/orchestrator/AgentOrchestrator.ts` | E2E mock runner turn execution & `turn.complete` emission | **VERIFIED (100%)** |

---

## 9. Input Composer Multi-Command Engine & In-Situ Execution Drawer Parity (TASK-101)

### 9.1 Overview & Defect Remediation Scope
Prior to TASK-101, the web chat composer suffered from two core structural limitations:
1. **Single-Line Input Constraint (`BotGroupChatPage.tsx`)**: The message input was backed by a standard `<input type="text">`, prohibiting multi-line input. Pressing Enter immediately submitted the text without modifier support (such as `Shift+Enter` or `Cmd+Enter`), and composition events from Input Method Editors (IME) could trigger premature submission.
2. **Missing Command Interception Engine**: Typing `@` was strictly restricted to partner mention matching without file referencing capability. Prefix commands such as `/` (slash workflows) and `$` (runtime variable injection) were completely absent.
3. **Destructive Blank-Page Routing on "看过程" (`ExecutionStatusCard.tsx`)**: Clicking the process inspection button triggered `navigate('/cc-agent/' + targetSessionId)`, routing away from the group chat view into a detached single-agent session that frequently resolved to a blank or 404 state.

### 9.2 Multiline Textarea & Modifier Matrix (`BotGroupChatPage.tsx`)
The input element is upgraded to an auto-resizing `<textarea>` with explicit modifier detection:
- **Auto-Resize Mechanics (`autoResizeTextarea`)**: Dynamically sets `el.style.height = `${Math.min(el.scrollHeight, 144)}px``, supporting up to 6 visual rows (144px cap) with auto vertical scroll on overflow.
- **IME Composition Guard**: `handleKeyDown` inspects `e.nativeEvent.isComposing`, `isComposingRef.current`, and `e.keyCode === 229`. All key handling is suppressed while composition is active, ensuring Asian language inputs (e.g., Pinyin, Kanji) do not trigger premature submission.
- **Keyboard Modifiers Truth Table**:
  - `Enter`: Submits message via `handleSend()` and resets textarea height.
  - `Shift + Enter`: Native newline insertion, accompanied by `requestAnimationFrame(autoResizeTextarea)`.
  - `Cmd + Enter` (macOS) / `Ctrl + Enter` (Windows/Linux): Programmatically splices `\n` into the cursor position (`val.slice(0, start) + '\n' + val.slice(end)`), advances the selection range, and recalculates height.
  - `Shift + Cmd + Enter`: Evaluated as a composite modifier, inserting a newline without triggering form submission.

### 9.3 Quad-Command Engine & Mutual Exclusion State Machine
The composer implements a unified token parser supporting four command spaces with strict mutual exclusion to eliminate popup collisions:

```text
+-----------------------------------------------------------------------------------------+
|                                User Input Stream (Textarea)                              |
+-----------------------------------------------------------------------------------------+
                                            │
                ┌───────────────────────────┼───────────────────────────┐
                ▼                           ▼                           ▼
      /(?:^|\n)\/([a-z0-9_-]*)$/      Last @ Token                Last $ or ; Token
                │                           │                           │
                ▼                           ▼                           ▼
        [SlashCommandMenu]       [MentionAutocompleteMenu]      [DollarCommandMenu]
        - /goal, /teamwork       - @partner (7 Core Mo-Bots)    - $ (Variables)
        - /boost, /test          - @file (Workspace Files)      - ; (Prompt Templates)
                │                           │                           │
                └───────────────────────────┼───────────────────────────┘
                                            ▼
                        [Mutual Exclusion Arbiter]
                        Only 1 popup menu active in DOM
```

1. **`/` Slash Command Menu (`SlashCommandMenu.tsx`)**:
   - Triggers on start of text or following a newline: `/(?:^|\n)\/([a-z0-9_-]*)$/i`.
   - Filters built-in collaborative modes (`/goal`, `/teamwork`, `/boost`, `/test`).
2. **`@` Dual-Source Mention System (`MentionAutocompleteMenu.tsx`)**:
   - Fetches workspace file tree asynchronously on mount (`/api/workspace/tree?depth=4`).
   - Merges partner records (`PartnerInfo`) and flattened workspace files (`FileItem`) into a unified keyboard-navigable list.
   - Renders clear section dividers (`伙伴 (N)` and `文件 (M)`) when both results match.
   - Arrow keys (`ArrowUp`, `ArrowDown`) navigate seamlessly across the merged boundary; `Enter` or `Tab` selects the highlighted item and inserts `@<partner.name>` or `@<file.path>`.
3. **`$` Context Variables & `;` Prompt Shortcuts (`DollarCommandMenu.tsx`)**:
   - Intercepts cursor tokens prefixed with `$` (variables) or `;` (prompts).
   - Context Variables: `$workspace`, `$blackboard`, `$latest_commit`, `$model`, `$diff`, `$rules`.
   - Quick Prompt Shortcuts: `;fix`, `;review`, `;test`, `;doc` expanding into pre-composed instructions.
4. **Mutual Exclusion Protocol**:
   - When `slashQuery` is active, `mentionQuery` and `dollarTrigger` are forced to `null`.
   - When `mentionQuery` is active, `dollarTrigger` is cleared.
   - Selecting any autocomplete item automatically restores focus to the textarea, repositions the cursor immediately after the replacement token, and re-triggers `autoResizeTextarea()`.

### 9.4 In-Situ Execution Process Inspection Drawer (`ExecutionProcessDrawer.tsx`)
Replaces disruptive external route navigation with an in-situ slide-over drawer mounted over the active group chat:
- **Trigger Points**:
  - `ExecutionStatusCard`: "看过程" (`btn-inspect-process`) button invokes `onInspectProcess(msg)` callback, opening the drawer natively.
  - Fallback inline drawer: When rendered without a parent callback, `ExecutionStatusCard` maintains an internal `showDrawer` state.
- **Drawer Architecture & Telemetry Presentation**:
  - **Header & Action Bar**: Sequence badge (`#<seq>`), author name/ID, timestamp, and a one-click JSON export button (`Copy` icon) copying full execution payloads to clipboard.
  - **Metrics Summary Strip**: Real-time duration breakdown (`totalMs`, `thinkingMs`, `toolMs`) alongside execution status pill (`CheckCircle2` done, `XCircle` failed, `AlertTriangle` aborted).
  - **Collapsible Thinking Stream**: `Sparkles` indicator revealing raw reasoning output with duration timer.
  - **Sequential Tool Traces (`ToolCallItem`)**: 1-indexed execution trace cards featuring status pills (`PASS` / `FAIL` / spinning `Loader2`), execution duration, collapsible input arguments (`Input Arguments` pre block), and execution output (`Execution Output` pre block).
  - **Physical Transcript SSOT Pointer**: Displays disk storage path pointing to `$MULTIAGENT_HOME/agents/<bot>/claude_config/projects/...` for zero-archaeology auditing.
  - **Sandbox Jump Action**: Deep-link button (`进入 <bot> 独立沙箱`) redirecting to `/bots/<authorBotId>` for private session continuation.

### 9.5 Verification Matrix (TASK-101)

| Requirement Code | Description | Target Component | Verification Method | Status |
|---|---|---|---|---|
| **AC-101-1** | Textarea auto-resize & modifier keys | `BotGroupChatPage.tsx` | Shift/Cmd/Ctrl+Enter newline insertion, height cap <= 144px | **VERIFIED (100%)** |
| **AC-101-2** | IME composition state guard | `BotGroupChatPage.tsx` | Key event suppression on `isComposingRef` and `keyCode === 229` | **VERIFIED (100%)** |
| **AC-101-3** | Quad-command mutual exclusion | `BotGroupChatPage.tsx` | Mutual exclusion between `/`, `@`, `$`, and `;` popups | **VERIFIED (100%)** |
| **AC-101-4** | Dual-source mention autocomplete | `MentionAutocompleteMenu.tsx` | Merged navigation across partners and workspace files | **VERIFIED (100%)** |
| **AC-101-5** | In-situ execution process drawer | `ExecutionStatusCard.tsx`, `ExecutionProcessDrawer.tsx` | Right-side drawer slide-in, removal of blank-page route jump | **VERIFIED (100%)** |

---

## 10. Bot Settings System Prompt Dynamics, Skills Governance & Theme Token Parity (TASK-102)

### 10.1 Overview & Architectural Objectives
TASK-102 addresses user feedback regarding inaccurate system prompt size statistics, scroll traps in the personality configuration subpage, incomplete skill roster presentation, and design system color conflicts:
1. **Accurate Character & Line Metrics**: Provide dynamic, real-time recalculation of prompt size (`{length} 字符 · {lines} 行`) across drawer list items and subpage headers.
2. **Full-Fidelity Prompt Binding**: Eliminate arbitrary 300-character truncation caused by downstream `soulSummary` consumption in favor of authoritative `soul_md` data binding.
3. **Scroll & Keyboard Isolation**: Provide independent scroll containers and mouse wheel isolation (`onWheel.stopPropagation`) to prevent outer settings drawers from intercepting downward prompt scrolling.
4. **Dynamic Skills Discovery**: Discover skills across the full directory hierarchy (`Customizations/skills`, `~/.multiagent-orchestration/skills`, `~/.agents/skills`) and surface them dynamically in `BotCapabilityMatrix`.
5. **Semantic Design Tokens**: Replace hardcoded dark hex color literals in `SkillhubLocalPage.tsx` with unified theme tokens.

### 10.2 Full-Fidelity System Prompt Data Binding
In previous iterations, `mapDbRowToBotDetail` in `bots-controller.ts` produced `soulSummary: soulMd.slice(0, 300).trim()`. Frontend pages consumed this property as the default `systemPrompt`, artificially clipping the prompt to 300 characters and showing an inaccurate "300字符 5行" representation.

```typescript
// Unified data binding across BotRosterPage.tsx, BotSessionPage.tsx, BotsHomePage.tsx
systemPrompt: b.soul_md || b.soulSummary || '',
```

By prioritizing `b.soul_md`, the configuration drawer receives the complete system instructions (including multi-section markdown directives and behavioral protocols).

### 10.3 Dynamic Real-Time Metric Calculation
Both the settings drawer overview and the personality detail subpage compute prompt metrics reactively:

```tsx
// BotSettingsDrawer.tsx (Personality list row)
<div className="flex items-center gap-1.5 text-text-tertiary">
  <span className="text-xs font-mono">
    {botSystemPrompt.length} 字符 · {botSystemPrompt.split('\n').length} 行
  </span>
  <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
</div>

// BotSettingsSubpages.tsx (Personality subpage header)
<div className="flex items-center justify-between">
  <label className="text-text-tertiary text-[11px] font-medium block">System Prompt (系统提示词)</label>
  <span className="text-[10px] text-text-tertiary font-mono">
    {botSystemPrompt.length} 字符 · {botSystemPrompt.split('\n').length} 行
  </span>
</div>
```

### 10.4 Textarea Dimension Control & Scroll Isolation
To resolve issues where scrolling or pressing down-arrow inside extended system prompts was captured by the outer drawer:
1. **Wheel Event Isolation**: Attached `onWheel={(e) => e.stopPropagation()}` to prevent outer modal scroll listeners from hijacking the scrollbar.
2. **Dimension Constraints**: Configured `min-h-[260px] max-h-[550px] overflow-y-auto resize-y`, granting the user vertical resize freedom while maintaining predictable container layout.

```tsx
<textarea
  value={botSystemPrompt}
  onChange={(e) => setBotSystemPrompt(e.target.value)}
  onWheel={(e) => e.stopPropagation()}
  rows={12}
  placeholder="请输入该伙伴的系统设定提示词..."
  className="w-full min-h-[260px] max-h-[550px] overflow-y-auto resize-y bg-surface border border-border-default rounded-xl p-3.5 font-mono text-xs text-text-primary focus:outline-none focus:border-accent-blue leading-relaxed custom-scrollbar shadow-inner"
/>
```

### 10.5 Tri-Tier Skills Governance & Discovery Pipeline
- **Catalog Fetching (`BotCapabilityMatrix.tsx`)**: Queries `/api/skills?scope=all&target=bot:${botId}` on component mount, merging live backend skills with system defaults.
- **Search Scope Expansion**: Integrated `~/.agents/skills` into `agentProfileMcp.ts` and `~/.multiagent-orchestration/skills` into `skills-controller.ts`.
- **Runtime Prompt Tri-Tiering (`RuntimeEnvironment.ts`)**:
  - `Active Preloaded Skills`: Pre-mounted runtime plugins.
  - `On-Demand Skills Library`: Dynamically discoverable and callable via `Skill(...)`.
  - `Prohibited Skills`: Explicitly forbidden skills.
- **Dynamic Runner Plugin Registration (`ClaudeSdkRunner.ts`)**: Replaced hardcoded skill lists with dynamic loading from `this.skillsList`.

### 10.6 Theme Token Alignment & Palette Expansion
- **Tailwind Palette Expansion (`tailwind.config.js`)**:
  Registered `surface-on-card`, `surface-base`, `border-subtle`, `accent-blue`, `accent-green`, `accent-purple`, `accent-amber`, and `accent-red`.
- **Skillhub Contrast Remediation (`SkillhubLocalPage.tsx`)**:
  Replaced hardcoded hex colors (`#1F1F1F`, `#2E2E2E`, `#8E8E93`) with design tokens (`bg-surface-chip`, `bg-surface-elevated`, `border-border-default`, `text-text-primary`, `text-text-tertiary`), achieving WCAG AA contrast compliance across light and dark modes.

### 10.7 Verification Matrix (TASK-102)

| Requirement Code | Description | Target Component | Verification Method | Status |
|---|---|---|---|---|
| **AC-102-1** | System prompt full-fidelity binding | `BotRosterPage.tsx`, `BotSessionPage.tsx`, `BotsHomePage.tsx` | Verifying `soul_md` feeds system prompt without 300-char clamp | **VERIFIED (100%)** |
| **AC-102-2** | Dynamic real-time metric counter | `BotSettingsDrawer.tsx`, `BotSettingsSubpages.tsx` | Character & line count reactive update on input mutation | **VERIFIED (100%)** |
| **AC-102-3** | Textarea dimension & scroll isolation | `BotSettingsSubpages.tsx` | `onWheel.stopPropagation`, `min-h-[260px]`, `resize-y` | **VERIFIED (100%)** |
| **AC-102-4** | Tri-tier skills governance | `BotCapabilityMatrix.tsx`, `RuntimeEnvironment.ts` | Dynamic skill catalog query, 3-tier prompt injection | **VERIFIED (100%)** |
| **AC-102-5** | Strict target arbitration & clean reset | `AgentOrchestrator.ts`, `StorageManager.ts` | Target attribute exclusivity, zero duplicate reset messages | **VERIFIED (100%)** |
| **AC-102-6** | Skillhub theme token parity | `SkillhubLocalPage.tsx`, `tailwind.config.js` | Elimination of hardcoded dark hex values, semantic tokens | **VERIFIED (100%)** |

---

## 11. Bot Native Tool Whitelist Rendering & Dynamic DisallowedTools State Synchronization (TASK-103)

### 11.1 Problem Overview & Architectural Defect Taxonomy
During partner configuration auditing, users reported that re-entering the companion settings drawer (`BotCapabilityMatrix.tsx`) resulted in all native tools appearing fully checked regardless of prior customizations. Any user-disabled tools were reset, and whitelist counts contradicted persisted backend configurations:

1. **Backend Capability Shape Divergence**: The backend capability mapping (`bots-controller.ts`, `agentProfileMcp.ts`) serializes tools divided into `sdkTools` (native engine tools: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`) and `mcpTools` (`mcp__agent_profile__*`, etc.) rather than a single unified `tools` array. When frontend components inspected `initialCapabilities?.tools`, the value was `undefined`.
2. **Aggressive Fallback Collision**: Lacking a unified `tools` key, component state initialization fell back directly to `TIERS[3].defaultTools` (full permission tier with all tools enabled).
3. **DisallowedTools Neglect**: Neither the initial state nor subsequent prop updates checked or subtracted `initialCapabilities.disallowedTools`, rendering blacklist rules invisible in the UI.
4. **Stale Reactive Synchronization Guard**: The `useEffect` updating local state on `initialCapabilities` changes strictly guarded on `Array.isArray(initialCapabilities.tools) && initialCapabilities.tools.length > 0`. Because `tools` was absent, the effect never executed, permanently stranding the component on stale fallback states.
5. **Static Tier Overwrite on Save**: During persistence, `computedDisallowed` was derived from static tier definitions (`TIERS.find((t) => t.id === level)?.defaultDisallowed`), completely ignoring which tools the user had unchecked in the UI.

### 11.2 Dual-Pass Tool Resolution Engine (`resolveToolsFromCaps`)
To decouple UI state from backend serialization differences, `BotCapabilityMatrix.tsx` implements a deterministic dual-pass tool resolution engine:

```typescript
/**
 * Reconstruct the effective tool list from capabilities, merging sdkTools + mcpTools
 * when the top-level `tools` key is absent, then subtracting `disallowedTools`.
 * Returns undefined only when no tool data is present at all.
 */
function resolveToolsFromCaps(caps?: BotCapabilityData): string[] | undefined {
  if (!caps) return undefined;

  // 1. Aggregation Pass: Prefer explicit tools array; fall back to sdkTools + mcpTools merge
  let raw: string[] | undefined;
  if (Array.isArray(caps.tools) && caps.tools.length > 0) {
    raw = caps.tools;
  } else if (Array.isArray(caps.sdkTools) || Array.isArray(caps.mcpTools)) {
    raw = [...(caps.sdkTools || []), ...(caps.mcpTools || [])];
  }

  if (!raw || raw.length === 0) return undefined;

  // 2. Subtraction Pass: Invert disallowedTools
  const disallowed = new Set(caps.disallowedTools || []);
  if (disallowed.size === 0) return raw;

  return raw.filter((t) => !disallowed.has(t));
}
```

### 11.3 Bidirectional State Synchronization Topology

```text
+---------------------------------------------------------------------------------------+
| Backend Data Plane (SQLite / Agent YAML / Markdown Definition)                        |
|   └── capabilities: { sdkTools: [...], mcpTools: [...], disallowedTools: [...] }      |
+-------------------------------------------┬-------------------------------------------+
                                            │ GET /api/bots/:id
                                            ▼
+---------------------------------------------------------------------------------------+
| BotCapabilityMatrix State Hydration & Reactive Update                                 |
|                                                                                       |
|   initialCapabilities ──> resolveToolsFromCaps(caps)                                  |
|                              ├── 1. Merge (sdkTools ∪ mcpTools)                       |
|                              └── 2. Subtract (disallowedTools)                         |
|                                            │                                          |
|                                            ▼                                          |
|                              [useState / useEffect]                                   |
|                                     tools state                                       |
+-------------------------------------------┬-------------------------------------------+
                                            │
                                            ▼
+---------------------------------------------------------------------------------------+
| UI Rendering & User Interaction                                                       |
|   - Checkboxes: checked={tools.includes(tool.id)}                                     |
|   - User unchecks tool (e.g., unchecked 'Bash') ──> setTools(tools.filter(...))       |
+-------------------------------------------┬-------------------------------------------+
                                            │ Save Button Clicked
                                            ▼
+---------------------------------------------------------------------------------------+
| Dynamic Bidirectional Inversion (Save Handler)                                        |
|                                                                                       |
|   const allToolIds = AVAILABLE_TOOLS.map(t => t.id);                                  |
|   const computedDisallowed = allToolIds.filter(id => !tools.includes(id));            |
|   const finalTools = [...tools, 'mcp__agent_profile__*'];                             |
|                                                                                       |
|   PUT /api/bots/:id                                                                   |
|   payload: { tools: finalTools, disallowedTools: computedDisallowed }                 |
+---------------------------------------------------------------------------------------+
```

### 11.4 Dynamic DisallowedTools Derivation & Invariant Guarantees
1. **Dynamic Set Difference**: Instead of reading from static tier defaults, the save handler calculates the exact set difference:
   `computedDisallowed = AVAILABLE_TOOLS.map(t => t.id).filter(id => !tools.has(id))`.
   Every tool unchecked by the user is guaranteed to be appended to `disallowedTools`.
2. **Agent Profile Invariant**: The core capability introspection tool `mcp__agent_profile__*` is forcefully retained in `finalTools` to prevent partner capability deadlocks.
3. **Reactive Rehydration**: When `initialCapabilities` changes across companion drawer navigations, `useEffect` invokes `resolveToolsFromCaps`, synchronizing checkboxes with current backend truth.

### 11.5 Backend Controller Capability Persistence (`src/web/server/controllers/bots-controller.ts`)
The bot management controller (`handleBotsRoute`) synchronizes incoming tool and skill constraints:
- Accepts `body.disallowedTools` and updates `def.disallowedTools`.
- Maps `body.onDemandSkills` and `body.disallowedSkills` to bot definition and `x-mo` configuration slices.
- Preserves capability parity across dynamic hot-reloads and agent runtime executions.

### 11.6 Verification Matrix (TASK-103)

| Requirement Code | Description | Target Component | Verification Method | Status |
|---|---|---|---|---|
| **AC-103-1** | Native tool whitelist data rehydration from `sdkTools + mcpTools` | `BotCapabilityMatrix.tsx` | Unit test / assertion on `resolveToolsFromCaps` output | **VERIFIED (100%)** |
| **AC-103-2** | Active subtraction of `disallowedTools` from rendered state | `BotCapabilityMatrix.tsx` | Verification that blacklisted tools are rendered unchecked | **VERIFIED (100%)** |
| **AC-103-3** | Reactive prop rehydration in `useEffect` | `BotCapabilityMatrix.tsx` | Dynamic update verification upon `initialCapabilities` change | **VERIFIED (100%)** |
| **AC-103-4** | Dynamic save inversion deriving `disallowedTools` from UI unchecks | `BotCapabilityMatrix.tsx` | Payload inspection of `PUT /api/bots/:id` containing unchecked IDs | **VERIFIED (100%)** |
| **AC-103-5** | Zero TypeScript compilation & build errors | `src/web` | `npx tsc --noEmit` and Vite production build clean exit | **VERIFIED (100%)** |

---

## 12. Unified Multi-Scope Capabilities API & Cross-Page State Convergence (TASK-105)

### 12.1 Problem Overview & Architectural Goals
Previously, capability management across the application was fragmented across multiple endpoints:
- Skills were scanned and toggled through `/api/skills` (`skills-controller.ts`).
- Bot tool permissions and execution parameters were routed through `/api/bots/:id` (`bots-controller.ts`).
- Frontend views (`SkillhubLocalPage.tsx`, `BotCapabilityMatrix.tsx`, `BotRosterPage.tsx`) relied on distinct data-fetching contracts and local states, leading to divergence between Customizations views and individual companion drawers.

TASK-105 converges these workflows into a single isomorphic capabilities interface. For the complete normative specification, refer to [unified-capabilities-api-spec.md](unified-capabilities-api-spec.md).

### 12.2 Single Endpoint Contract (`/api/capabilities`)
Mounted via `src/web/server/controllers/capabilities-controller.ts` and dispatched via `src/web/server/vite-room-api-plugin.ts` (`handleCapabilitiesRoute`):
- `GET /api/capabilities?scope=<scope>&targetId=<targetId>`: Returns normalized `UnifiedCapabilityPayload`.
- `PUT /api/capabilities?scope=<scope>&targetId=<targetId>`: Atomically updates capabilities across the specified scope and synchronizes underlying storage files.
- **Five Scope Levels**: `global` (system-wide skills/rules), `group` (collaborative room capabilities), `bot` (partner micro-kernel capabilities), `project` (workspace skills/settings), and `session` (ephemeral runtime state).

### 12.3 Unified Client Hook (`useCapabilities.ts`)
Components across `src/web/src` interact with capability APIs through the unified React hook:
```typescript
const {
  capabilities,
  loading,
  error,
  refetch,
  updateCapabilities,
  setSkillTier,
  toggleTool
} = useCapabilities({ scope: 'bot', targetId: 'bot_mocode_engine_01' });
```
- **Optimistic State Updates**: Local state reflects user interactions immediately.
- **Automated Rollback**: If persistence fails, the hook reverts to previous state without corrupting the UI.
- **Core Invariant Preservation**: Guarantees `mcp__agent_profile__*` is always retained when persisting tools.

### 12.4 Verification Matrix (TASK-105)

| Requirement Code | Description | Target Component | Verification Method | Status |
|---|---|---|---|---|
| **AC-105-1** | Unified multi-scope `/api/capabilities` endpoint | `capabilities-controller.ts`, `vite-room-api-plugin.ts` | Endpoint GET/PUT query across `global` and `bot` scopes | **VERIFIED** |
| **AC-105-2** | Isomorphic `UnifiedCapabilityPayload` data contract | `capabilities-controller.ts`, `useCapabilities.ts` | Validation of tri-tier skills, tools, and rules schema | **VERIFIED** |
| **AC-105-3** | Multi-plane persistence synchronization (Markdown, SQLite, `skills-config.json`) | `capabilities-controller.ts` | Verification of filesystem write and DB update | **VERIFIED** |
| **AC-105-4** | Reusable client hook `useCapabilities` with optimistic update and rollback | `useCapabilities.ts` | Hook lifecycle, error handling, and method verification | **VERIFIED** |
| **AC-105-5** | Zero TypeScript compilation & build regression | `src/web` | `cd src/web && npx tsc --noEmit` exits with 0 errors | **VERIFIED** |

---

## 13. Room Header Decluttering & Blackboard Task-Partitioned Working Bots Drawer (TASK-109)

### 13.1 Problem Overview & Architectural Goals
In prior versions of the group chat interface (`RoomHeader.tsx`):
1. **Redundant UI Noise**: The top action bar displayed a static sequence badge `#1` (`#{currentSequence}`) with a `Hash` icon next to group settings, alongside a legacy "话题" (`GitFork`) topic creation button. These controls occupied valuable header real estate, clashed with the Cindy desktop minimalist aesthetic, and caused confusion.
2. **Missing Real-Time Task & Partner Visibility**: Users lacked an immediate, in-situ view of what tasks were currently assigned on the shared blackboard, which partners were actively working on them, and which companions were on standby.
3. **Blackboard State Disconnect**: Viewing active tasks required inspecting raw Markdown files (`GROUP_MEMORY.md`) or opening the unparsed blackboard text view.

TASK-109 addresses these defects through three coordinated enhancements:
- **Top Bar Decluttering**: Eliminates the `#1` sequence badge and the "话题" button from `RoomHeader.tsx`.
- **Book Icon Placement Contract**: Inserts a dedicated book button (`BookOpen`, `btn-header-task-board`) positioned strictly to the left of the group settings button (`btn-header-group-settings`).
- **Blackboard-Partitioned Working Bots Drawer (`TaskBoardDrawer.tsx`)**: Renders a dedicated slide-over drawer organizing active tasks, task specifications, acceptance criteria, active working bots, backlog items, and standby partners, backed directly by SQLite SSOT (`.daemon/blackboard_ssot.db`).

### 13.2 Header Layout & Icon Positioning Contract
In `src/web/src/components/group-chat/RoomHeader.tsx`:
- The right-hand actions bar sequence is strictly ordered:
  1. `UserPlus` (Invite members, routes to `/bots/new`)
  2. `FileText` (Blackboard / `GROUP_MEMORY` toggle)
  3. `BookOpen` (`data-testid="btn-header-task-board"`, TaskBoard drawer toggle)
  4. `SlidersHorizontal` (`data-testid="btn-header-group-settings"`, Group settings drawer)
- The invariant `taskBoardIdx < settingsIdx` ensures the Book icon button is physically placed immediately to the left of settings.

### 13.3 Working Bots & Task Partitioning Architecture (`TaskBoardDrawer.tsx`)
Mounted in `BotGroupChatPage.tsx` and listening on `onToggleTaskBoard`:
1. **Data Source**: Queries `GET /api/rooms/:slug/blackboard` (or fallback `/api/blackboard`), which reads parsed JSON directly from `.daemon/blackboard_ssot.db` (table `blackboard_ssot`, row `id = 1`, field `state_json`).
2. **Active Task Card (`ActiveTaskCard`)**:
   - Renders active task ID, title, lifecycle status badge (`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `VERIFIED`, `DONE`).
   - Surfaces task specification and acceptance criteria.
   - Computes `workingPartners`: Resolves the task assignee and any currently executing bots (`activeBot`, `activeBots`, plus director `moAdmin`).
3. **Backlog Partition (`BacklogTaskCard`)**:
   - Lists queued tasks from `kanban.backlog` with task ID, title, and assignee badge.
4. **Standby Partners Section**:
   - Surfaces all room companions that are not currently engaged in the active task (`standbyPartners`).
5. **Interactive Controls**:
   - Header with `BookOpen` avatar, refresh button (`btn-refresh-taskboard`), and close button (`btn-close-taskboard`).
   - Supports keyboard `Escape` dismissal and backdrop click-to-close.

### 13.4 Backend SQLite SSOT Endpoint (`rooms-controller.ts`)
The `rooms-controller.ts` module exposes `handleBlackboardState`:
- Reads directly from `.daemon/blackboard_ssot.db` using `node:sqlite` (`DatabaseSync`).
- Extracts `state_json` containing `kanban.activeTask`, `kanban.backlog`, and `rootGoal.objective`.
- Merges raw Markdown from `groups/<slug>/GROUP_MEMORY.md` for backward-compatible fallback.
- Returns `{ ok: true, blackboard, memory, roomId }`.

### 13.5 Verification Matrix (TASK-109)

| Requirement Code | Description | Target Component | Verification Method | Status |
|---|---|---|---|---|
| **AC-109-1** | Top bar visual decluttering (removal of `#1` and `话题` button) | `RoomHeader.tsx` | Verification of omitted `btn-header-start-topic`, `GitFork`, and `#{currentSequence}` | **VERIFIED** |
| **AC-109-2** | Book icon button positioning left of settings | `RoomHeader.tsx` | Index order assertion `btn-header-task-board` < `btn-header-group-settings` | **VERIFIED** |
| **AC-109-3** | TaskBoard slide-over drawer with task-partitioned working bots | `TaskBoardDrawer.tsx` | Verification of `ActiveTaskCard`, `BacklogTaskCard`, and `workingPartners` computation | **VERIFIED** |
| **AC-109-4** | Full group chat page integration & toggle binding | `BotGroupChatPage.tsx` | `taskBoardOpen` state management and `onToggleTaskBoard` event wiring | **VERIFIED** |
| **AC-109-5** | Backend SQLite SSOT endpoint `/api/blackboard` | `rooms-controller.ts` | Verification of `handleBlackboardState` reading `.daemon/blackboard_ssot.db` | **VERIFIED** |

---

## 14. Message Action Row Iconography & Micro-Interactions Parity (TASK-114)

### 14.1 Problem Overview & Architectural Goals
In previous iterations of `src/web/src/components/group-chat/MessageItem.tsx`:
1. **Icon Semantics Divergence**: The topic/fork action rendered a `GitFork` code branch icon rather than a conversation-centric icon. The quote and copy buttons lacked visual parity with Cindy's native desktop client assets.
2. **Heavyweight Visual Weight**: The message action toolbar employed high-contrast pill backgrounds, colored borders, and saturated accent states that disrupted conversation legibility.
3. **Missing Context Menu Parity**: The overflow menu lacked synchronization with the upgraded conversation icons (`MessagesSquare`).

TASK-114 refactors the message action toolbar to achieve visual parity with official Cindy desktop specifications (benchmarked against reference visual assets):
- **Copy Action**: Uses Lucide `Copy` (overlapping rounded rectangles, switching to green `Check` on successful clipboard copy).
- **Quick Quote**: Uses Lucide `MessageSquare` (single conversation bubble), prepending `> @sender: content\n\n` into the input composer.
- **Topic / Fork**: Uses Lucide `MessagesSquare` (dual overlapping conversation bubbles, replacing legacy `GitFork`).
- **More Actions**: Uses Lucide `MoreHorizontal` (horizontal three dots), anchoring the popover `MessageContextMenu`.
- **Minimalist Grayscale Tokens**: Strips heavy pill container styling in favor of lightweight borderless buttons with subtle neutral hover feedback (`text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-500/10`).

### 14.2 Visual Asset Mapping & Iconography Topology

| Action Item | Test ID | Lucide Icon Component | Visual Semantics | Target Callback |
|---|---|---|---|---|
| **Recall & Edit** | `btn-recall-edit-msg` | `Pencil` (3.5x3.5) | In-situ message correction (User messages only) | `onRecallAndEdit(message)` |
| **Copy Message** | `btn-copy-msg` | `Copy` → `Check` (3.5x3.5) | Dual overlapping rectangles with dynamic feedback | `handleCopy()` |
| **Quick Quote** | `btn-quote-msg` | `MessageSquare` (3.5x3.5) | Single chat bubble for markdown quote injection | `onQuoteMessage(message)` |
| **Topic Fork** | `btn-fork-topic-msg` | `MessagesSquare` (3.5x3.5) | Dual chat bubbles for threaded session branching | `onForkMessage(message)` |
| **More Actions** | `btn-more-options-msg` | `MoreHorizontal` (3.5x3.5) | Horizontal triple dots triggering context popover | `handleOpenMenu()` |

### 14.3 Styling Discipline & Design Tokens
In accordance with Cindy desktop design principles:
- **Button Dimension & Padding**: `p-1 rounded-md transition-colors cursor-pointer`.
- **Icon Sizing**: `w-3.5 h-3.5` (14px standard glyph rendering).
- **Action Strip Spacing**: `gap-1 sm:gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity`.
- **Theme Color Contrast**:
  - Light mode: `text-neutral-500 hover:text-neutral-800 hover:bg-neutral-500/10`
  - Dark mode: `dark:text-neutral-400 dark:hover:text-neutral-200`
- **Context Menu Synchronization (`MessageContextMenu.tsx`)**: Replaces old branch icon with `MessagesSquare` to maintain visual consistency between toolbar and dropdown items.

### 14.4 Verification Matrix (TASK-114)

| Requirement Code | Description | Target Component | Verification Method | Status |
|---|---|---|---|---|
| **AC-114-1** | Cindy-grade 4-icon action mapping (`Copy`, `MessageSquare`, `MessagesSquare`, `MoreHorizontal`) | `MessageItem.tsx` | Automated AST / regex presence check in `task-114-cindy-action-icons-parity.test.ts` | **VERIFIED** |
| **AC-114-2** | Minimalist grayscale styling & hover feedback (`neutral-500`, `neutral-500/10`) | `MessageItem.tsx` | Class token validation for light/dark theme contrast | **VERIFIED** |
| **AC-114-3** | Interactive event bindings (`handleCopy`, `onQuoteMessage`, `onForkMessage`, `handleOpenMenu`) | `MessageItem.tsx` | Verification of callback execution & state updates | **VERIFIED** |
| **AC-114-4** | Context menu icon harmonization (`MessagesSquare` for topic fork) | `MessageContextMenu.tsx` | Verification of matching icon component in popover menu | **VERIFIED** |
| **AC-114-5** | Zero TypeScript compilation & test regression | `src/web` | `cd src/web && npx tsc --noEmit` exits with 0 errors | **VERIFIED** |

---

## 15. Composer (+) Context Action Menu, MCP Connectors API & Multi-Type Attachments (TASK-115)

### 15.1 Architectural Objectives & `+`/`@` Decoupling
Prior to TASK-115, the composer left-side `+` trigger (`data-testid="btn-add-context"`) invoked `handleAtButtonClick`, inserting a literal `@` token instead of exposing a multi-dimensional extension popover, while attachment types accepted only `'image'`.

TASK-115 decouples `+` from `@` across `BotGroupChatPage.tsx`, `PlusActionMenu.tsx`, `PlusActionSubmenus.tsx`, and `mcp-controller.ts`:
- **Trigger Decoupling**: Removes `handleAtButtonClick`; `btn-add-context` carries `aria-haspopup="menu"`, `aria-expanded={plusMenuOpen}`, and `aria-controls="composer-plus-menu"` to toggle `PlusActionMenu` (also exported as `ContextActionPopover`).
- **Placeholder Parity**: Empty room composer textarea displays `'输入 / 作为命令'`; active rooms append `' · 在 <roomName> 中 @ 提及伙伴'`.
- **Keyboard Trigger Preservation**: Typing `@`, `/`, `$`, or `;` continues to activate `MentionAutocompleteMenu`, `SlashCommandMenu`, and `DollarCommandMenu` independently.

### 15.2 Five-Item Root Menu & Submenu Drill-Down Topology
`PlusActionMenu` (`src/web/src/components/group-chat/PlusActionMenu.tsx`) renders a `w-64 sm:w-72` floating card (`w-72 sm:w-80` in submenu views) anchored at `bottom-full left-0 mb-2`:

| Order | Item ID / `data-testid` | Lucide Icon | Verbatim Label | Shortcut / Indicator | Action / Target |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `plus-menu-upload-files` | `Paperclip` | `添加文件或照片` | `⌘ U` (macOS/iOS) or `Ctrl+U` | Triggers hidden `plus-file-input` (`multiple`) |
| 2 | `plus-menu-upload-folder` | `Folder` | `添加文件夹` | — | Triggers hidden `plus-folder-input` (`webkitdirectory`) |
| 3 | `plus-menu-slash-commands` | `SquareSlash` | `斜线命令` | — | Invokes `handleTriggerSlashCommand`, injects `/`, opens `SlashCommandMenu` |
| 4 | `plus-menu-connectors` | `Blocks` | `连接器` | `ChevronRight` | Switches `view` to `'connectors'` (`ConnectorsSubmenu`) |
| 5 | `plus-menu-plugins` | `Plug` | `插件` | `ChevronRight` | Switches `view` to `'plugins'` (`SkillsSubmenu`) |

Submenus (`src/web/src/components/group-chat/PlusActionSubmenus.tsx`, which also exports `WorkspaceFilesSubmenu` as an unmounted helper):
- **`ConnectorsSubmenu` (`data-testid="plus-submenu-connectors"`)**: Splits results into internal `McpSectionList` (`plus-mcp-item-<id>`, `toggle-mcp-<id>`) and `PluginSectionList` (`plus-plugin-item-<id>`, `toggle-plugin-<id>`), plus live search (`plus-submenu-search`), back button (`plus-submenu-back`), click-to-insert tokens (`[MCP: <id>]`, `[Connector: <name>]`), and `管理` navigation to `/customizations?tab=installed`.
- **`SkillsSubmenu` (`data-testid="plus-submenu-plugins"`, titled `插件与技能`)**: Lists workspace and global skills (`plus-skill-item-<id>`), refresh button, `管理` link to `/customizations?tab=marketplace`, click-to-insert `[Skill: <id>]`, and internal `CompactToggleSwitch` (`toggle-skill-<id>`).
- **Live Toggle Endpoints**: `PlusActionMenu` snapshots state on open via `fetchExtensionsSnapshot(groupId)` (`GET /api/skills?scope=all&target=group:<id>`, `GET /api/mcp?target=group:<id>`, `GET /api/capabilities?scope=group&targetId=<id>`) and persists switches optimistically with rollback via `PUT /api/skills/:id/status`, `PUT /api/mcp/:id/status`, and `PUT /api/capabilities?scope=group&targetId=<id>` (`disallowedPlugins`).

### 15.3 Keyboard Navigation, IME Guard & Popover Mutual Exclusion
- **Capture-Phase Keyboard Handler**: `PlusActionMenu` registers `window.addEventListener('keydown', onKeyDown, true)`, handling `ArrowDown`, `ArrowUp`, `ArrowRight` (enter submenu), `Enter`, and `Escape` (`submenu -> root -> close(true)` restoring textarea focus), while ignoring IME events (`e.isComposing || e.keyCode === 229`).
- **Global `Escape` Priority**: `BotGroupChatPage.tsx` suppresses `stopGenerating()` whenever `plusMenuOpen`, `mentionQuery`, `slashQuery`, or `dollarTrigger` is active.
- **Outside-Click Flicker Guard**: Pointer listener checks `menuRef.current?.contains(target)` and `triggerButtonRef?.current?.contains(target)` so clicking `+` toggles cleanly.
- **Mutual Exclusion**: Opening `PlusActionMenu` clears `mentionQuery`, `slashQuery`, and `dollarTrigger`; typing `@`, `/`, `$`, or `;` closes `plusMenuOpen`.

### 15.4 Multi-Type Attachment Pipeline & Folder Upload Policy
- **Isomorphic Attachment Schema**: `MessageAttachment` in both `src/web/src/types/room.ts` and `src/daemon/types.ts` expands to `type: 'image' | 'file'`, `mimeType: string`, `data: string` (Base64 data URL), `name?: string`, and `size?: number`.
- **File & Folder Staging Limits (`BotGroupChatPage.tsx`)**:
  - `handleFileInputChange`: Rejects individual files over `8 MB`, reading others via `FileReader.readAsDataURL` as `'image'` or `'file'`.
  - `handleFolderInputChange` (`webkitdirectory`): Filters out `node_modules`, `.git`, `dist`, and `.DS_Store` entries and files over `8 MB`; stages up to the first `10` eligible files into `pendingAttachments`, and additionally inserts `[Folder: <folderName> (<n> files)]` into the textarea when more than `10` eligible files exist or `0` eligible files remain.
  - Global `Cmd/Ctrl+U` shortcut opens `fileInputRef.current?.click()` directly.
- **Preview & Timeline Rendering**:
  - `AttachmentPreviewBar.tsx`: Renders image thumbnails or `FileText` + `getFileExtension(att.name)` cards, showing header `'待发送附件 (<n>):'` when any attachment has `type === 'file'`.
  - `MessageItem.tsx`: Renders downloadable `<a download={...} data-testid="message-attachment-file-<idx>">` cards showing filename, `att.mimeType`, and formatted byte size for non-image payloads.
- **Transport Persistence**: `useRoomMessages.ts` (`'（附件文件）'` vs `'（图片附件）'` fallback text), `DaemonServer.ts` (`agent:chat` and `session:history`), `messages-controller.ts` (`handleGetMessages` / `handlePostMessage` / `dispatchOrchestratorMessage`), and `AgentOrchestrator.ts` (`internalHandleChat` metadata) propagate `attachments` end-to-end.

### 15.5 MCP Connectors REST Controller (`/api/mcp`)
Mounted in `src/web/server/vite-room-api-plugin.ts` via `handleMcpRoute` (`src/web/server/controllers/mcp-controller.ts`):

| Endpoint | Request | Behavior & Response |
| :--- | :--- | :--- |
| `GET /api/mcp?target=<target>` | `target` defaults to `'global'` (e.g., `group:<groupId>`) | Aggregates `BUILTIN_RUNTIME_MCPS` (`blackboard` with 5 tools; `agent_profile` with `get_my_capabilities`) and `UniversalConfigLoader.loadMergedMcpServers()` (`.mcp.json` `'project'` vs `'global'`); returns `{ ok: true, target, connectors: McpConnectorEntry[] }`. |
| `PUT /api/mcp/:id/status` | JSON `{ enabled: boolean, target?: string }` | Updates `disabledGlobal` (when `'global'`) or `targetDisabledMap[targetKey]` in `<projectRoot>/data/mcp-connectors.json` without mutating other scopes; returns `{ ok: true, id, enabled, target }`. |

### 15.6 Conformance & Verification Matrix (TASK-115)

| Requirement | Symbol / Artifact | Verification Command | Status |
| :--- | :--- | :--- | :--- |
| **AC-115-1..AC-115-5** | `PlusActionMenu`, `PlusActionSubmenus`, `BotGroupChatPage`, `handleMcpRoute` | `npx tsx test/task-115-composer-plus-menu.test.ts` | **VERIFIED (5/5 checkpoints)** |
| **AC-115-6** | `MessageAttachment` (`room.ts`, `types.ts`), `AttachmentPreviewBar`, `MessageItem`, `messages-controller.ts` | `npx tsx test/task-115-composer-plus-menu.test.ts` | **VERIFIED (Checkpoint 4)** |
| **TASK-106 Compatibility** | `BotGroupChatPage` (`<PlusActionMenu` without `handleAtButtonClick`) | `npx tsx test/task-106-markdown-group-action-and-composer-plus.test.ts` | **VERIFIED (6/6 checkpoints)** |
| **TASK-106/107 & Vite Build** | `BotGroupChatPage`, `PlusActionMenu`, `src/web` bundle | `npx tsx test/task-106-107-markdown-actions-and-quote.test.ts` | **VERIFIED (6/6 checkpoints + Vite build)** |
| **Type Safety** | `src/web` workspace | `cd src/web && npx tsc --noEmit` | **VERIFIED (0 errors)** |

---

## 16. Minimalist Group Room Header & Closed-Loop Sidebar Collapse/Expand Architecture (TASK-116)

### 16.1 Minimalist Room Header Contract (`RoomHeader.tsx`)
Prior to TASK-116, `RoomHeader.tsx` rendered a stacked cluster of circular partner avatars (`-space-x-1.5`, `partners.slice(0, 4)`, `<img>`) immediately to the left of the room switcher dropdown. TASK-116 removes that avatar stack so the left header zone stays minimalist:
- **Left Content Composition**: Renders only the conditional sidebar toggle button (`data-testid="btn-expand-sidebar"` when `isMobile || sidebarCollapsed`) followed by the room switcher displaying `{roomName}` and `{memberCount} 位成员` metadata.
- **Dynamic Alignment**: Applies `-ml-2` to the room switcher trigger whenever `showSidebarToggle` is `false`, preventing excess left padding on desktop when the sidebar is expanded.

### 16.2 Closed-Loop Sidebar Collapse & Expand Topology (`MainLayout.tsx` & Chat Views)
`MainLayout.tsx` suppresses `<ContentHeader>` on chat routes (`isChatView`: `/bots/groups/*`, `/bots/:botId`, `/cc-agent/:sessionId`) to avoid double headers. To prevent users from losing the expand button after collapsing the sidebar on chat routes:
- **`LayoutOutletContext` (`src/web/src/layouts/MainLayout.tsx`)**: Exports `LayoutOutletContext` (`sidebarCollapsed`, `isMobile`, `onToggleSidebar`, `onTriggerPeek`) and forwards it via `<Outlet context={...} />`.
- **Unified Toggle State (`handleToggleSidebar`)**: Toggles `sidebarCollapsed` and clears `isPeeking = false` across `Sidebar.tsx` (`data-testid="btn-collapse-sidebar"`, `PanelLeftClose`), `ContentHeader.tsx`, `Cmd/Ctrl+B` keyboard shortcut, and chat view headers.
- **Consistent Expand Trigger (`data-testid="btn-expand-sidebar"`)**:
  - `RoomHeader.tsx` (fed by `BotGroupChatPage.tsx`): Renders `PanelLeft` on desktop (`onMouseEnter={!isMobile ? onTriggerPeek : undefined}`, `title="展开侧边栏 (⌘B)"`) or `Menu` on mobile when `isMobile || sidebarCollapsed`.
  - `BotSessionHeader.tsx` (fed by `BotSessionPage.tsx`): Renders identical `btn-expand-sidebar` control using `LayoutOutletContext`.
  - `CCAgentSessionView` (`src/web/src/pages/cc-agent/SessionPage.tsx`): Consumes `LayoutOutletContext` and renders `btn-expand-sidebar` in its top status bar (`PanelLeft` / `Menu` + hover peek + `⌘B` title).

### 16.3 Conformance & Verification Matrix (TASK-116)

| Requirement | Symbol / Artifact | Verification Command | Status |
| :--- | :--- | :--- | :--- |
| **AC-116-1** | `RoomHeader` (`RoomHeader.tsx`, zero left avatar stack) | `npx tsx test/task-116-header-avatar-and-sidebar-toggle.test.ts` | **VERIFIED (Checkpoint 2)** |
| **AC-116-2** | `MainLayout` (`LayoutOutletContext`, `handleToggleSidebar`), `Sidebar` (`btn-collapse-sidebar`), `ContentHeader` (`btn-expand-sidebar`) | `npx tsx test/task-116-header-avatar-and-sidebar-toggle.test.ts` | **VERIFIED (Checkpoint 3)** |
| **AC-116-3** | `BotGroupChatPage`, `BotSessionPage` + `BotSessionHeader`, `CCAgentSessionView` (`btn-expand-sidebar`) | `npx tsx test/task-116-header-avatar-and-sidebar-toggle.test.ts` | **VERIFIED (Checkpoint 4)** |
| **AC-116-4** | Bidirectional state simulation, `tsc --noEmit`, Vite build | `npx tsx test/task-116-header-avatar-and-sidebar-toggle.test.ts` | **VERIFIED (Checkpoint 5)** |

---

## 17. Route-Level Lazy Loading & Warm Suspense Fallback (`router.tsx`, `RouteSuspenseFallback.tsx`)

### 17.1 Code Splitting Architecture
- Prior to code splitting, the production Vite bundle generated a single monolith JavaScript asset of 1,058.57 kB (gzip 290.72 kB).
- All primary page components (`BotGroupChatPage`, `BotSessionPage`, `SessionPage`, `BotSettingsSubpages`, `AnalyticsPage`, etc.) are wrapped in dynamic `React.lazy()` imports.
- **Measured Production Footprint**: Reduced the primary index bundle to 438.00 kB (gzip 131.37 kB, a 58.7% payload reduction).

### 17.2 Warm Suspense Fallback
- `RouteSuspenseFallback.tsx` injects a warm-toned skeleton placeholder matching `--cds-surface-0..2` during chunk download, preventing white flashes or abrupt structural shifts during route transitions.

---

## 18. Full-Screen Mobile Safe-Area & Gesture Inset Resilience (`MainLayout.tsx`, `MobileBottomNav.tsx`)

### 18.1 Safe Area Envelopes
- Full compliance with modern mobile browsers (iOS Safari, Android Chrome) utilizing `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- Input composer containers and bottom navigation bars enforce dynamic padding to prevent virtual keyboard overlaps and home-indicator collisions.

---

## 19. High-Availability Gateway Client with Full Jitter Backoff (`WebGatewayClient.ts`)

### 19.1 RFC/AWS Full Jitter Protocol
- The WebSocket client adopts an exponential backoff formula with full random jitter:
  $$\text{Sleep} = \text{random}(0, \min(M, B \times 2^{\text{attempt}}))$$
- Mitigates reconnection thundering herds upon gateway restarts or network disconnections while preserving real-time push synchronization across active tabs.

---

## 20. Instant Pre-Paint Anchor Scrolling (`MessageTimeline.tsx`)

- Replaces delayed post-render scroll hooks with `useLayoutEffect` pre-paint positioning (`scrollTop = scrollHeight`).
- Eradicates visual sliding glitches on timeline refresh while preserving smooth scrolling for real-time incoming streaming deltas.
- **Verification**: Verified via `test/chat-scroll-instant-anchor.test.ts`.

---

## 21. Two-Tier Bottom-Aligned Composer & End-to-End Agent Multimodal Image Pipeline (TASK-117)

### 21.1 Two-Tier Vertical Composer Card & Clear Button Removal (`BotGroupChatPage.tsx`)
Prior to TASK-117, the group chat composer placed `+`, `<textarea>`, a clear-input `X` button, and the Send/Stop button on a single horizontal row, causing vertical alignment drift during multi-line input and visual clutter from the redundant clear button.

TASK-117 aligns `BotGroupChatPage.tsx` with the Cindy / T3-code two-tier vertical card layout:
- **Vertical Card Container (`data-testid="composer-card"`)**: Uses `flex flex-col gap-1` with top full-width auto-resizing `<textarea rows={1}>` (`maxHeight: '144px'`, IME composition guard, `Shift/Cmd/Ctrl+Enter` newline handling, and `onPaste` clipboard image staging).
- **Bottom-Aligned Action Bar (`data-testid="composer-toolbar"`)**: Uses `flex items-center justify-between gap-2 pt-1.5 mt-0.5 border-t border-border-default/20`:
  - Left zone: `+` context trigger (`data-testid="btn-add-context"`, `w-8 h-8 rounded-xl`).
  - Right zone: Stop (`data-testid="btn-stop-generating"`, `w-8 h-8 rounded-xl`) or Send (`data-testid="btn-send-message"`, `w-8 h-8 rounded-xl`).
  - All primary toolbar buttons share an identical `32×32 px` (`w-8 h-8`) footprint on the same horizontal row regardless of single-line or multi-line textarea growth.
- **Clear Button Removal**: Removes the redundant clear-input (`X` / `清空`) button entirely from `composer-card`.

### 21.2 Physical Attachment Persistence & Lightweight SQLite Metadata
To avoid storing multi-megabyte base64 blobs in SQLite while preserving full image data for the Agent SDK:

```text
Web UI (Paste / File Upload -> Base64 dataURL)
   │
   ├── WS agent:chat (DaemonServer) / HTTP POST fallback (messages-controller)
   ▼
AgentOrchestrator.internalHandleChat()
   ├── 1. Persist data: base64 -> <getUserAttachmentsDir()>/<attId>-<sanitizedName>
   ├── 2. Store lightweight URL (/data/attachments/<fileName>) in SQLite metadata_json
   ├── 3. Inject <user_attachments> & [Attached <type> "<name>" is saved at: <path>]
   └── 4. Pass intact base64 sdkAttachments (+ path/url) to runner.executeTurn()
   ▼
ClaudeSdkRunner.executeTurn() -> buildSdkPromptInput(prompt, attachments)
   └── Yields AsyncIterable<SDKUserMessage> with base64 image blocks before text block
```

- **Storage Path SSOT (`src/storage/Paths.ts`)**: `getUserAttachmentsDir(projectRoot)` resolves to `<projectRoot>/data/attachments` (or `<MULTIAGENT_HOME>/attachments` when `MULTIAGENT_HOME` is set).
- **Isomorphic Contract (`src/daemon/types.ts`)**: `MessageAttachment` includes `path?: string` and `url?: string` alongside `id`, `type: 'image' | 'file'`, `mimeType`, `data`, `name`, and `size`.
- **Static Attachment Serving (`src/web/server/vite-room-api-plugin.ts`)**: Serves `/data/attachments/*` and `/api/attachments/*` directly from `getUserAttachmentsDir(PROJECT_ROOT)` with MIME mapping (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`, `.pdf`) and `Cache-Control: public, max-age=31536000, immutable`.
- **Transport Parity (`messages-controller.ts`, `DaemonServer.ts`)**: Preserves `attachments` across HTTP fallback (`handlePostMessage` -> `dispatchOrchestratorMessage`), WebSocket RPC (`agent:chat`), and session history rehydration (`handleGetMessages`, `session:history`).

### 21.3 Claude Agent SDK Multimodal `SDKUserMessage` Builder (`ClaudeSdkRunner.ts`)
- **`normalizeImageAttachmentToBlock(att)`**:
  - Extracts base64 payload from `data:` URLs, raw base64 strings, or falls back to reading physical bytes from `att.path` on disk when `att.data` has already been replaced with a `/data/attachments/...` URL.
  - Normalizes `image/jpg` to `image/jpeg`; accepts `image/png`, `image/jpeg`, `image/webp`, and `image/gif`; safely returns `null` for unsupported MIME types (e.g. `image/svg+xml`) or missing disk files.
- **`buildSdkPromptInput(prompt, attachments)`**:
  - Returns a plain `string` when no valid image blocks are present (preserving text-only and non-image file behavior).
  - Returns an `AsyncIterable<SdkUserMessagePayload>` yielding a single `SDKUserMessage` (`type: 'user'`, `parent_tool_use_id: null`, `message.role: 'user'`) with `[...imageBlocks, { type: 'text', text }]` (defaulting empty prompt text to `'请分析以上附加的图片内容。'`).
- **`executeTurn`**: Passes `buildSdkPromptInput(prompt, attachments)` directly to `sdkQuery({ prompt: promptInput, ... })` for standard (non-bridge) turns.

### 21.4 Conformance & Verification Matrix (TASK-117)

| Requirement | Symbol / Artifact | Verification Command | Status |
| :--- | :--- | :--- | :--- |
| **AC-117-1** | `BotGroupChatPage` (`composer-card`, `composer-toolbar`, `w-8 h-8` uniform buttons, no clear button) | `npx tsx test/task-117-composer-align-and-multimodal-sdk.test.ts` (Checkpoint 1) & `test/task-117-dom-and-browser.test.ts` (Checkpoint B) | **VERIFIED (Desktop 1280×860 & Mobile 390×844)** |
| **AC-117-2** | `getUserAttachmentsDir` (`Paths.ts`), `MessageAttachment` (`types.ts`), `vite-room-api-plugin.ts`, `messages-controller.ts`, `DaemonServer.ts` | `npx tsx test/task-117-composer-align-and-multimodal-sdk.test.ts` (Checkpoints 2 & 4) | **VERIFIED** |
| **AC-117-3** | `AgentOrchestrator.internalHandleChat`, `ClaudeSdkRunner` (`normalizeImageAttachmentToBlock`, `buildSdkPromptInput`, `executeTurn`) | `npx tsx test/task-117-composer-align-and-multimodal-sdk.test.ts` (Checkpoints 3 & 4) & `test/task-117-dom-and-browser.test.ts` (Checkpoint A) | **VERIFIED** |
| **AC-117-4** | Full unit/SDK pipeline + headless Chromium DOM & upload dispatch | `npx tsx test/task-117-composer-align-and-multimodal-sdk.test.ts` & `NODE_ENV=test npx tsx test/task-117-dom-and-browser.test.ts` | **VERIFIED (100% GREEN)** |


---

## 21. Two-Tier Bottom-Aligned Composer & End-to-End Multimodal Image SDK Pipeline (TASK-117)

### 21.1 Two-Tier Vertical Composer Card & Toolbar Parity (`BotGroupChatPage.tsx`)
Aligning with Cindy / T3-code desktop composer ergonomics, `BotGroupChatPage.tsx` replaces the prior single-row inline input layout with a two-tier vertical card (`data-testid="composer-card"`, `flex flex-col gap-1`):
- **Top Tier (Full-Width Textarea)**: `<textarea rows={1}>` (`maxHeight: '144px'`, `overflowY: 'auto'`) occupies full card width without horizontal compression from flanking buttons, preserving IME composition protection (`isComposingRef`), `Shift/Cmd/Ctrl+Enter` newline modifiers, and `@`, `/`, `$`, `;` command menu mutual exclusion.
- **Bottom Tier (`data-testid="composer-toolbar"`)**: A dedicated bottom bar (`flex items-center justify-between gap-2 pt-1.5 mt-0.5 border-t border-border-default/20`) anchors the left `+` menu trigger (`data-testid="btn-add-context"`) and right action trigger (`data-testid="btn-stop-generating"` or `data-testid="btn-send-message"`) on the exact same horizontal baseline.
- **Uniform Action Geometry & Clear Button Removal**: All toolbar action buttons (`+`, `Stop`, `Send`) share uniform `w-8 h-8 rounded-xl` (32×32 px) dimensions; the redundant clear-input (`X` / `清空`) button is completely removed from `composer-card`.

### 21.2 End-to-End Multimodal Image Persistence & Claude Agent SDK Dispatch
Prior to TASK-117, pasted or uploaded images remained as frontend Base64 strings in message payloads and were never serialized into native Claude SDK multimodal blocks. TASK-117 establishes a five-stage pipeline matching T3-code `ClaudeAdapterV2`:

```text
[Web UI Paste / Upload] (BotGroupChatPage.tsx, AttachmentPreviewBar.tsx)
   │  attachments: [{ type: 'image', mimeType, data: 'data:image/png;base64,...' }]
   ▼
[Dual-Track Transport] (useRoomMessages.ts -> DaemonServer.ts 'agent:chat' / messages-controller.ts HTTP POST)
   ▼
[Orchestrator Persistence & Prompt Hint] (AgentOrchestrator.internalHandleChat + Paths.getUserAttachmentsDir)
   ├── Disk Write: <projectRoot>/data/attachments/<attId>-<sanitizedName> (or $MULTIAGENT_HOME/attachments)
   ├── SQLite metadata_json: lightweight URL '/data/attachments/<fileName>' (zero base64 bloat)
   ├── Static Route (vite-room-api-plugin.ts): serves /data/attachments/* & /api/attachments/* (immutable cache)
   ├── Prompt Context: injects <user_attachments> + [Attached <type> "<name>" is saved at: <path>]
   └── sdkAttachments: preserves intact base64 dataURL + physical att.path for runner.executeTurn()
   ▼
[Claude SDK Multimodal Builder] (ClaudeSdkRunner.ts: normalizeImageAttachmentToBlock + buildSdkPromptInput)
   ├── Text-only / non-image files -> plain string prompt
   └── Valid image blocks (png/jpeg/webp/gif; image/jpg -> image/jpeg; att.path disk fallback)
       -> AsyncIterable<SDKUserMessage> yielding { type: 'user', message: { role: 'user', content: [...imageBlocks, { type: 'text', text }] }, parent_tool_use_id: null }
```

### 21.3 Conformance & Verification Matrix (TASK-117)

| Requirement | Symbol / Artifact | Verification Command | Status |
| :--- | :--- | :--- | :--- |
| **AC-117-1** | `BotGroupChatPage.tsx` (`composer-card`, `composer-toolbar`, uniform `w-8 h-8 rounded-xl` `+`/`Send`/`Stop`) | `npx tsx test/task-117-composer-align-and-multimodal-sdk.test.ts` & `test/task-117-dom-and-browser.test.ts` | **VERIFIED (Desktop 1280×860 & Mobile 390×844)** |
| **AC-117-2** | `BotGroupChatPage.tsx` (zero clear-input `X` / `清空` button in `composer-card`) | `test/task-117-composer-align-and-multimodal-sdk.test.ts` (CP1) & `test/task-117-dom-and-browser.test.ts` (CP-B) | **VERIFIED** |
| **AC-117-3** | `Paths.ts` (`getUserAttachmentsDir`), `types.ts` (`MessageAttachment`), `AgentOrchestrator.ts`, `vite-room-api-plugin.ts`, `messages-controller.ts`, `DaemonServer.ts` | `npx tsx test/task-117-composer-align-and-multimodal-sdk.test.ts` (CP2, CP4) | **VERIFIED** |
| **AC-117-4** | `ClaudeSdkRunner.ts` (`normalizeImageAttachmentToBlock`, `buildSdkPromptInput`, `executeTurn`) | `npx tsx test/task-117-composer-align-and-multimodal-sdk.test.ts` (CP3) & `test/task-117-dom-and-browser.test.ts` (CP-A) | **VERIFIED** |

---

## 22. Session Tree Navigation, Context Inspector & Execution Parity (TASK-118)

### 22.1 Pure Session Routing (`router.tsx`, `SessionPage.tsx`)
- `/cc-agent/:sessionId` and `/sessions/:sessionId` route identically through `SessionRouteDispatcher` (`src/web/src/router.tsx`, `src/web/src/pages/cc-agent/SessionPage.tsx`), unifying direct session and chained `sdkSessionId` views without legacy redirect wrappers.

### 22.2 Hierarchical Stepped Session Tree & Grouping/Sorting (`Sidebar.tsx`, `sessionGrouping.ts`, `BotFilterToolbar.tsx`)
- **Stepped Tree Navigation (`Sidebar.tsx`, `SidebarSessionTreeRow.tsx`)**: Groups parent sessions and child threads/forks/`bot_sessions` into collapsible `SessionTreeNode` hierarchies (`_treeNode`), auto-expanding parent branches when the active route matches a child session or `botContext`.
- **Grouping, Sorting & Cap Expansion (`SidebarSessionControls.tsx`, `sessionGrouping.ts`)**:
  - `groupAndSortSessions()` supports `groupBy` (`'date' | 'folder' | 'status' | 'none'`), `sortBy` (`'updatedAt' | 'createdAt' | 'title'`), `sortOrder` (`'desc' | 'asc'`), and `pinnedFirst`.
  - Date buckets enforce a default display `cap` of `15` items (bypassed when searching) and reveal remaining items via `expandBucketCap` (`查看全部 (N 更多)…` / `View all`).
- **Inline Rename (`Sidebar.tsx`, `SidebarSessionTreeRow.tsx`)**: Pressing `F2` (when no input is focused) or double-clicking (`onDoubleClick`) triggers inline title editing (`startInlineRename` -> `commitInlineRename`).
- **Companion Page Grouping & Sorting (`BotsHomePage.tsx`, `BotRosterPage.tsx`, `BotFilterToolbar.tsx`)**: Share `BotsPagePrefs` (`localStorage` key `mo_bots_page_prefs`) via `BotFilterToolbar` (`botGrouping.ts`) for grouping (`department` / `status` / `model` / `none`) and sorting (`updatedAt` / `createdAt` / `name` / `status`, `desc` / `asc`).

### 22.3 Opt-In Context Snapshot Inspector (`SessionContextInspector.tsx`, `SettingsPage.tsx`)
- **Conditional Rendering Gate & Default-Collapsed Inspector**: `<SessionContextInspector defaultExpanded={false} />` mounts in `BotGroupChatPage.tsx`, `BotSessionPage.tsx`, and `SessionPage.tsx`, querying `GET /api/config/settings` on mount and subscribing to `window` `'mo:app-settings-changed'` (emitted by `SettingsPage.tsx`) for live synchronization. When `AppSettings.recordSessionContext` is `false` (default) or unresolved, `SessionContextInspector` returns `null` and does not render on conversation pages. Only when `recordSessionContext === true` does it render (collapsed by default) and query `/api/sessions/:id/context-snapshot` or `/api/rooms/:slug/context-snapshot` (`session-context-service.ts`) on expansion to inspect System Instruction, expandable Tool Declarations (`ToolDetailCard` + schema copy), and User #1.
- **Settings Toggle**: `SettingsPage.tsx` (`data-testid="toggle-record-session-context"`) binds `recordSessionContext` via `GET/PUT /api/config/settings` (`settings-controller.ts`, `data/app-settings.json`, default `false`) and emits `'mo:app-settings-changed'` on `window` so mounted conversation views update inspector visibility immediately. For storage and `mo-context-snapshot` JSONL line structure, see [session-physical-storage-topology.md](session-physical-storage-topology.md).

### 22.4 Step Timeline, Epitaxy Thinking, Queued/Steer & Streaming Markdown Parity
- **Step Timeline Axis (`StepTimelineGroup.tsx`)**: Renders tool steps on a fixed `20px` (`w-[20px]`) vertical axis with per-tool diff/output drawers, auto-collapsing when `steps.length >= 3` (`shouldAutoCollapse`). Used by `ExecutionStatusCard.tsx` and `AssistantExecutionCards.tsx`.
- **Epitaxy Thinking Stages (`ExecutionStatusCard.tsx`, `AgentThinkingIndicator.tsx`, `ThinkingCard.tsx`)**: `getThinkingStageText(elapsedSeconds)` progresses through `'Thinking…'` (`0–14s`), `'Still thinking…'` (`15–29s`), `'Thinking more…'` (`30–44s`), `'Thinking some more…'` (`45–59s`), and `'Almost done thinking…'` (`60s+`); live stopwatch text gates on `elapsedSeconds >= 2`; settled thoughts render `Thought for Xs` via `formatSettledThinkingDuration()`.
- **Dual-Lane `Queued` / `Steer` Execution (`useRoomMessages.ts`, `ComposerCard.tsx`, `BotSessionComposer.tsx`, `BotGroupChatPage.tsx`, `MessageItem.tsx`, `BotSessionTimeline.tsx`)**: Prompts submitted while generating enqueue as `Queued` drafts (`QueuedMessageDraft`, persisted via `StorageManager.saveInputQueueSnapshot`) and expose `Steer` (`onSteerNow` / `onSteerSend`) to abort the active run and inject mid-turn (`deliveryStatus === 'steered'`).
- **Streaming Markdown & Instant Scroll Anchoring (`MarkdownContent.tsx`, `MessageTimeline.tsx`)**:
  - `healStreamingMarkdown()` closes odd-count triple-backtick code fences mid-stream; `MarkdownBlockParser` renders GitHub-style Callout blocks (`[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!IMPORTANT]`, `[!CAUTION]`).
  - `MessageTimeline` maintains `isPinnedRef` (`distanceFromBottom <= 30px`), performs pre-paint `behavior: 'instant'` jumps on room mount, and compensates `scrollTop` by `scrollHeight - prevScrollHeightRef` when prepending older history.

### 22.5 Conformance & Verification Matrix (TASK-118)

| Requirement | Symbol / Artifact | Verification Command | Status |
|---|---|---|---|
| **AC-118-Backend** | `DatabaseSchema.ts` (`bot_sessions`), `AppSettings.ts`, `SessionContextSnapshot.ts`, `session-controller.ts`, `session-messages-controller.ts`, `settings-controller.ts` | `npx tsx test/task-118-backend.test.ts` | **VERIFIED (6/6 checkpoints)** |
| **AC-118-Frontend** | `SessionRouteDispatcher`, `Sidebar.tsx`, `sessionGrouping.ts`, `BotFilterToolbar.tsx`, `SessionContextInspector.tsx`, `StepTimelineGroup.tsx`, `ExecutionStatusCard.tsx`, `MarkdownContent.tsx`, `MessageTimeline.tsx` | `npx tsx test/task-118-frontend.test.ts` | **VERIFIED (Phase 1, 1b & 2 Chromium)** |
| **Type Safety** | `src/web` workspace | `cd src/web && npx tsc --noEmit` | **VERIFIED (0 errors)** |

---

## 23. Cross-Platform Workspace Folder Selection & Customizations Live Synchronization Parity (TASK-118-REMED)

### 23.1 Composer Folder Picker & Working Directory Pipeline (`ComposerProjectAndBranchMenu.tsx`, `ComposerCard.tsx`, `NewChatPage.tsx`)

In desktop web chat ergonomics, starting a new task or session requires binding the execution context to a selected project directory:

1. **Folder Selection Trigger & Dual Input Channels (`ComposerProjectAndBranchMenu.tsx`)**:
   - Replaces the inert placeholder row with an interactive trigger (`data-testid="btn-select-other-folder"`).
   - Toggles an inline folder configuration box (`data-testid="composer-custom-folder-box"`) supporting two complementary selection paths:
     - **Manual Text Input**: `<input data-testid="input-composer-custom-folder">` accepting Windows paths (e.g. `C:\Users\project`) and POSIX paths (e.g. `/home/user/project`), submitted via Enter key or the "添加" button (`data-testid="btn-confirm-composer-custom-folder"`).
     - **System Folder Dialog**: `data-testid="btn-trigger-system-folder-dialog"` attempts the File System Access API (`window.showDirectoryPicker()`), falling back to a hidden native file input (`<input type="file" webkitdirectory directory className="hidden" />`).
   - Dispatches the chosen directory via `onAddProjectFolder(item: ComposerProjectItem)`.
2. **Project Aggregation & Option Dispatch (`ComposerCard.tsx`)**:
   - Exports `ComposerSendOptions`:
     ```typescript
     export interface ComposerSendOptions {
       workingDir?: string;
       project?: string;
       isDialogue?: boolean;
     }
     ```
   - Fetches known workspace folders on mount from `/api/workspaces/folders` (`{ cache: 'no-store' }`) and merges them into the project catalog without duplicates.
   - Computes `workingDir` based on active project selection and provides it to `onSend(options)` via `handleTriggerSend()`.
3. **Session Creation Context Binding (`NewChatPage.tsx`)**:
   - `handleSend(options?: ComposerSendOptions)` extracts `options.workingDir` and includes it in `createSession({ ..., workingDir })`.
   - The backend `session-controller.ts` normalizes `workingDir` via `normalizePath()` and writes it to SQLite `sessions.cwd_path`.

### 23.2 Room Settings Workspace Directory Switcher (`GroupSettingsDrawer.tsx`, `rooms-controller.ts`)

Group chat rooms bind multi-agent collaboration to a shared workspace root:

1. **Workspace Section in Drawer (`GroupSettingsDrawer.tsx`)**:
   - Section container: `data-testid="drawer-workspace-section"`.
   - Displays the current path with an `ACTIVE` badge.
   - Provides a toggle button: `data-testid="btn-change-group-folder"`.
   - When opened, renders:
     - Direct text input: `data-testid="input-group-folder-path"`.
     - Confirmation button: `data-testid="btn-confirm-change-folder"`.
     - Fast-pick scrollable list populated from `/api/workspaces/folders`.
     - System folder dialog trigger: `data-testid="btn-trigger-room-system-dialog"`.
2. **Persistence & Feedback**:
   - Sends `PATCH /api/rooms/:slug` with `{ workspaceDir: path.trim() }`.
   - Upon success, displays toast confirmation, collapses the edit panel, and triggers `onRefreshRoom?.()` to reload room detail state.

### 23.3 Customizations Anti-Cache & Manual Refresh (`SkillhubLocalPage.tsx`, `useCapabilities.ts`)

When agent configurations or skills are edited on another workstation and synchronized via cloud/file sync tools, cached HTTP responses or stale SQLite connections cause the UI to display out-of-date settings:

1. **HTTP Request Cache Invalidation**:
   - All `fetch()` invocations in `useCapabilities.ts` (`fetchCapabilities`, `useCapabilities`) specify `{ cache: 'no-store' }`.
   - `SkillhubLocalPage.tsx` passes `{ cache: 'no-store' }` when querying `/api/bots` and `/api/skills`.
2. **Manual Refresh Control (`SkillhubLocalPage.tsx`)**:
   - Renders a prominent refresh button (`data-testid="btn-refresh-customizations"`) alongside the segment pill in the header.
   - Shows spinning animation (`animate-spin`) on the `RefreshCw` icon during execution.
   - Concurrently executes `refetchCaps()`, `loadSkills()`, and `/api/bots` retrieval.

### 23.4 Session Grouping Windows Folder Canonicalization (`sessionGrouping.ts`)

Sidebar session grouping by folder (`groupBy: 'folder'`) must not create separate bucket categories due to path separators or drive letter case variations:

- `resolveFolderMeta(workingDir)`:
  - Normalizes backslashes to forward slashes.
  - Forces drive letters to uppercase (e.g. `c:/` -> `C:/`).
  - Generates bucket key: on Windows paths (`/^[a-zA-Z]:\//`), folds key to lowercase `folder:c:/projects/myapp` while preserving display label casing (`MyApp`).
  - Ensures sessions located at `C:\Projects\MyApp` and `c:\projects\myapp\` collapse into the exact same folder bucket.

### 23.5 Conformance & Verification Matrix (TASK-118-REMED)

| Requirement | Implementation Component / Symbol | Verification Command | Status |
|---|---|---|---|
| Composer Folder Selection | `ComposerProjectAndBranchMenu.tsx` (`btn-select-other-folder`, `input-composer-custom-folder`) | `npx tsx test/task-windows-path-and-folder-cache.test.ts` (Test 4.1) | **VERIFIED** |
| Composer WorkingDir Forwarding | `ComposerCard.tsx` (`ComposerSendOptions`, `handleTriggerSend`) | `npx tsx test/task-windows-path-and-folder-cache.test.ts` (Test 4.2) | **VERIFIED** |
| NewChat WorkingDir Session Binding | `NewChatPage.tsx` (`handleSend`, `createSession`) | `npx tsx test/task-windows-path-and-folder-cache.test.ts` (Test 4.3) | **VERIFIED** |
| Room Settings Workspace Switcher | `GroupSettingsDrawer.tsx` (`btn-change-group-folder`, `btn-confirm-change-folder`) | `npx tsx test/task-windows-path-and-folder-cache.test.ts` (Test 4.4) | **VERIFIED** |
| Customizations Anti-Cache & Refresh | `SkillhubLocalPage.tsx`, `useCapabilities.ts` (`btn-refresh-customizations`, `cache: 'no-store'`) | `npx tsx test/task-windows-path-and-folder-cache.test.ts` (Test 4.5) | **VERIFIED** |
| Session Grouping Folder Meta | `sessionGrouping.ts` (`resolveFolderMeta`) | `npx tsx test/task-windows-path-and-folder-cache.test.ts` (Test 1.3) | **VERIFIED** |

