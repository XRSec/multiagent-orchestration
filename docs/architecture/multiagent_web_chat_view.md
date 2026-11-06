# Multi-Agent Web Chat View & Execution Status Card Architecture Specification

## 1. Overview & Objectives
This document establishes the official engineering architecture and visual interaction contract for the `multiagent-orchestration` web frontend (`apps/web`), focusing specifically on:
1. **Multi-Agent Room Chat View**: Left/right split chat timeline aligning with Cindy & AGY aesthetic design guidelines.
2. **User Test Message Display**: Full support for real-time and mock user test messages ("测试我发的消息"), correctly styled and right-aligned with avatar and role badging.
3. **Execution Status Card**: Strictly mounted directly below each message bubble (`ExecutionStatusCard.tsx`), displaying Thinking breakdown, Tool execution trace, and Done metrics.
4. **Max-Height & Hidden Scrollbar Constraint**: Enforces maximum container height (`max-h-56` / `max-h-60`), activates vertical scrolling (`overflow-y: auto`) on overflow, and completely suppresses native scrollbars (`.no-scrollbar`, `scrollbar-width: none !important`, `::-webkit-scrollbar: display: none !important`).

---

## 2. Component Hierarchy & Data Flow

```
BotGroupChatPage (/bots/groups/:groupId)
  │
  ├── RoomHeader (Room Switcher, 7 Mo-Bots Avatars, Monotonic Sequence Badge)
  │
  ├── MessageTimeline (Auto-scroll, Monotonic Sequence Enforcer: a.sequence - b.sequence)
  │     │
  │     ├── MessageItem (User: Right / Bot: Left; 28px Avatar, 720px max width)
  │     │     │
  │     │     ├── ContentBubble (User: Accent Blue / Bot: Elevated Surface Card)
  │     │     │
  │     │     └── ExecutionStatusCard (Strictly Mounted Below Bubble)
  │     │           │
  │     │           ├── Status Header (Thinking/Tool/Done + Latency Timer)
  │     │           ├── ThinkingCard (Sparkles, Collapsible, Left Guide Rail)
  │     │           ├── ToolExecutingCard (Terminal, Code2, Args & Output Pre blocks)
  │     │           └── DoneSummaryCard (CheckCircle2, Total & Stage Time Breakdown)
  │     │
  │     └── AgentThinkingIndicator (Live Pulse when Bots are Processing)
  │
  └── Bottom Composer Card
        ├── MentionAutocompleteMenu (@moAdmin, @moCode, @moDoc, @MoCI, etc.)
        ├── Quick Slash Mode Bar (/goal, /teamwork, /boost, ⚡ 测试我发的消息)
        └── Rounded Input with Send Arrow
```

---

## 3. Strict CSS Scrollbar Suppression Invariant

To guarantee complete scrollbar invisibility across Chromium (Electron/Chrome), WebKit (Safari/iOS), Gecko (Firefox), and Windows Edge:

### 3.1 CSS Rules (`apps/web/src/index.css` & `src/styles/globals.css`)
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
```tsx
<div
  data-testid="status-scroll-container"
  className={`${maxHeightClass} overflow-y-auto no-scrollbar flex flex-col gap-2.5`}
  style={{
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    WebkitOverflowScrolling: 'touch'
  }}
>
```

---

## 4. Execution State Machine

```
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

## 5. Verification & Acceptance
- **Automated Test Suite**: `tests/test-group-chat-status-card.mjs` (7 Tiers, 54/54 assertions passing).
- **Adversarial Suite**: `tests/test-web-adversarial-stress.mjs` (6/6 stress suites passing, 313/313 assertions).
- **TypeScript & Vite Build**: `tsc -b && vite build` built in 2.08s with zero errors.
