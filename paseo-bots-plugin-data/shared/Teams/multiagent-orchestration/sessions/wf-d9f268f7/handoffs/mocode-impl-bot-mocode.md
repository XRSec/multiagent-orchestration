已完成 `paseo-bots/client/**` 的 Claude Design System (CDS) 视觉层级、物理动效与交互边界保护实现，并通过全量类型检查与 983 个单元测试。

<worker_handoff>
STATUS: PASS
SUMMARY:
- Added CDS clay/brand tokens (`brandClay`, `brandClayPressed`, `brandClaySoft`, `warmPaper`) in [native.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/native.ts) and eliminated hardcoded `#000000`/`#ffffff`/`#fff` UI values across `native.ts`, `panel/controls.tsx`, `library/parts.tsx`, `chat/Composer.tsx`, `chat/stream/ui.tsx`, `launcher/BotLauncherCore.tsx`, and `launcher/BotLauncherPopover.tsx`.
- Expanded [motion.ts](file:///Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots/client/motion.ts) with calibrated CDS spring presets (`SPRING_BOUNCY`, `SPRING_SNAPPY`, `SPRING_GENTLE`, `SPRING_HEAVY_SNAP`), cubic-bezier `(0.16, 1, 0.3, 1)` easing (`CDS_EASE_OUT` / `CDS_WEB_CURVE`), `motionDuration`, and web `prefers-reduced-motion` support, wiring them into `ui/Columns.tsx`, `chat/Stream.tsx`, `chat/stream/ui.tsx`, `BotSidebarStatus.tsx`, and `web.ts`.
- Enforced single-stroke borders (`panel/controls.tsx` `Button` strips borders on `secondary`/`ghost`), clay vs accent role separation (`Composer.tsx`, `BotLauncherCore.tsx`, `TaskCard.tsx`), shared CJK IME composition guard `isImeComposing` (`keyboard.ts`, `FindBar.tsx`, `Stream.tsx`, `BotLauncherCore.tsx`), 150ms scroll-pinning cooldown `canPinScrollToEnd` (`Stream.tsx`), `tabular-nums` alignment (`controls.tsx`, `FindBar.tsx`, `TaskCard.tsx`, `WorkflowsScreen.tsx`), and added `tests/cds-ui.test.ts`.
TOUCHED_FILES:
- paseo-bots/client/native.ts
- paseo-bots/client/motion.ts
- paseo-bots/client/keyboard.ts
- paseo-bots/client/web.ts
- paseo-bots/client/panel/controls.tsx
- paseo-bots/client/library/parts.tsx
- paseo-bots/client/ui/Columns.tsx
- paseo-bots/client/BotSidebarStatus.tsx
- paseo-bots/client/WorkflowsScreen.tsx
- paseo-bots/client/chat/Stream.tsx
- paseo-bots/client/chat/FindBar.tsx
- paseo-bots/client/chat/Composer.tsx
- paseo-bots/client/chat/stream/ui.tsx
- paseo-bots/client/chat/stream/TaskCard.tsx
- paseo-bots/client/launcher/BotLauncherCore.tsx
- paseo-bots/client/launcher/BotLauncherPopover.tsx
- paseo-bots/tests/cds-ui.test.ts
VERIFICATION_PROOF:
  - Command: `cd /Users/xr/IDEA.localized/multiagent-orchestration/paseo-bots && npm run typecheck && npm test`
  - Exit_Code: `0`
  - Key_Output: `tsc --noEmit` exited `0`; `vitest run` passed `Test Files  90 passed (90)` and `Tests  983 passed (983)` in `4.52s` (including `tests/cds-ui.test.ts` 4 tests and `tests/chat-scroll.test.tsx` 10 tests). `rg -n "#000000|#ffffff|#fff\b|ease-out" paseo-bots/client` returned 0 code violations.
DOD_CHECKLIST:
  - [x] DoD-2 (CDS Visual Polish) -> Added `brandClay`/`warmPaper` tokens, stripped `#000000`/`#ffffff`/`#fff`, enforced single-stroke `Button` borders, and added `tabular-nums` on dynamic counts/timers.
  - [x] DoD-3 (Calibrated Motion Physics) -> Exported CDS spring presets & cubic-bezier `(0.16, 1, 0.3, 1)` curve in `motion.ts` and wired `useReduceMotion()` across `Columns.tsx`, `Stream.tsx`, `stream/ui.tsx`, `BotSidebarStatus.tsx`, and `web.ts`.
  - [x] DoD-4 (Interaction & Edge Guards) -> Applied shared `isImeComposing` guard in `FindBar.tsx`, `Stream.tsx`, and `BotLauncherCore.tsx`, plus 150ms `canPinScrollToEnd` cooldown in `Stream.tsx`.
  - [x] DoD-5 (Verification) -> `npm run typecheck` and `npm test` (`90` files / `983` tests) passed with `Exit_Code: 0`.
OPEN_ISSUES: None
</worker_handoff>