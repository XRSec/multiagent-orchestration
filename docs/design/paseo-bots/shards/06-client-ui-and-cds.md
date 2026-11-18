---
doc_id: PASEO-BOTS-SHARD-06-CLIENT-UI-CDS
status: CURRENT
version: 1.0.0
last_verified: 2026-11-19
language: en-US
---

# Shard 06: Client UI, CDS Tokens, Motion & Edge Guards

Parent index: [../INDEX.md](../INDEX.md). Governs the Claude Design System (CDS) visual hierarchy, calibrated motion physics, and interaction edge guards implemented across `@oliexe/paseo-bots` (`paseo-bots/client/**`) on React Native (`react-native` / `react-native-web`) and `@getpaseo/plugin` `PluginTheme`.

## 1. Scope & Coordinates

- Color & surface tokens: `paseo-bots/client/native.ts` (`NativeTokens`, `nativeTokens`, `withAlpha`, `placeholderColor`)
- Motion physics & accessibility: `paseo-bots/client/motion.ts` (`SPRING_BOUNCY`, `SPRING_SNAPPY`, `SPRING_GENTLE`, `SPRING_HEAVY_SNAP`, `CDS_EASE_OUT`, `CDS_WEB_CURVE`, `motionDuration`, `useReduceMotion`)
- Keyboard & IME guard: `paseo-bots/client/keyboard.ts` (`isImeComposing`, `ImeLikeEvent`)
- Stream scroll-pinning guard: `paseo-bots/client/chat/Stream.tsx` (`SCROLL_PIN_COOLDOWN_MS`, `canPinScrollToEnd`)
- Shared controls & web bridge: `paseo-bots/client/panel/controls.tsx` (`Button`), `paseo-bots/client/web.ts`
- Verification suite: `paseo-bots/tests/cds-ui.test.ts`, `paseo-bots/tests/chat-scroll.test.tsx`

## 2. CDS Color Tokens & Role Separation

1. **Derived Theme Tokens (`nativeTokens`)**:
   - `nativeTokens(colors)` caches a `NativeTokens` record per `PluginTheme["colors"]` instance in a `WeakMap` and detects dark mode via relative luminance of `colors.surface0`.
   - Warm base constants: `WARM_INK = "#141413"` and `WARM_PAPER = "#f0efec"` (`warmPaper`).
   - Derived surfaces: `surfaceSidebar`, `surfaceSidebarSelected`, `surface3`, `surface4`, `borderAccent`, `foregroundExtraMuted`, `accentBright`, and `interactionHighlight`.
2. **Clay vs. Accent Role Separation**:
   - Agent-initiated actions, send/stop triggers, and active running indicators MUST use `brandClay` (`#d97757` light / `#cc6b49` dark), `brandClayPressed` (`#c6613f` light / `#b85a39` dark), and `brandClaySoft` (`withAlpha(brandClay, 0.14)` light / `0.18` dark) across `Composer.tsx`, `BotLauncherCore.tsx`, and `TaskCard.tsx`.
   - Standard UI focus, selection, and chrome controls MUST use `PluginTheme` `colors.accent` and `colors.accentForeground`.
3. **Zero Pure Black/White Literals**:
   - Hardcoded `#000000`, `#ffffff`, and `#fff` UI color literals are forbidden across `paseo-bots/client/**`; use `warmPaper`, `WARM_INK`, or `PluginTheme` semantic tokens.

## 3. Single-Stroke Borders & Tabular Numerals

1. **Single-Stroke `Button` Borders (`paseo-bots/client/panel/controls.tsx`)**:
   - `Button` renders `borderWidth: 1` only for `outline` and `default` variants.
   - `secondary` and `ghost` variants enforce `borderWidth: 0` to prevent double-bordered nested controls inside bordered cards or panels.
2. **Tabular Numerals (`tabular-nums`)**:
   - Dynamic counts, durations, match counters, badges, and KPI readouts MUST specify `fontVariant: ["tabular-nums"]` (`controls.tsx`, `FindBar.tsx`, `TaskCard.tsx`, `WorkflowsScreen.tsx`, `chat/stream/rows.tsx`, `analytics/DataAnalysisPane.tsx`, `analytics/SessionSelector.tsx`, `launcher/BotLauncherCore.tsx`).

## 4. Calibrated Motion Physics & Reduced Motion

1. **Spring Presets (`CdsSpringConfig` in `paseo-bots/client/motion.ts`)**:
   - `SPRING_BOUNCY`: `{ stiffness: 600, damping: 30, mass: 1 }`
   - `SPRING_SNAPPY`: `{ stiffness: 320, damping: 28, mass: 1 }`
   - `SPRING_GENTLE`: `{ stiffness: 380, damping: 18, mass: 1 }`
   - `SPRING_HEAVY_SNAP`: `{ stiffness: 1200, damping: 80, mass: 0.1 }`
2. **Calibrated Easing Curves**:
   - `CDS_EASE_OUT = cubicBezier(0.16, 1, 0.3, 1)` drives React Native `Animated.timing` transitions (`ui/Columns.tsx`, `chat/Stream.tsx`, `chat/stream/ui.tsx`).
   - `CDS_WEB_CURVE = "cubic-bezier(0.16, 1, 0.3, 1)"` governs web CSS transitions (`web.ts`); generic `ease-out` literals are forbidden in `paseo-bots/client/**`.
3. **Reduced-Motion Gating**:
   - `useReduceMotion()` subscribes to `RN.AccessibilityInfo` (`isReduceMotionEnabled`, `reduceMotionChanged`) and web `window.matchMedia("(prefers-reduced-motion: reduce)")`.
   - `motionDuration(ms, reduceMotion)` returns `0` when `reduceMotion` is `true`; components (`Columns.tsx`, `Stream.tsx`, `stream/ui.tsx`, `TaskCard.tsx`, `BotSidebarStatus.tsx`, `web.ts`) skip or zero-duration animations when active.

## 5. Interaction & Scroll Edge Guards

1. **CJK IME Composition Guard (`isImeComposing`)**:
   - `isImeComposing(event)` in `paseo-bots/client/keyboard.ts` (and `chat/composer/logic.ts`) inspects `event.nativeEvent ?? event` and returns `true` when `isComposing` is truthy or `keyCode === 229` (WebKit/Safari IME marker).
   - Keyboard submit/navigation handlers in `Composer.tsx`, `FindBar.tsx`, `Stream.tsx`, and `BotLauncherCore.tsx` MUST return early when `isImeComposing(event)` is `true`.
2. **Scroll-Pinning Cooldown (`canPinScrollToEnd`)**:
   - `SCROLL_PIN_COOLDOWN_MS = 150` in `paseo-bots/client/chat/Stream.tsx`.
   - `canPinScrollToEnd(lastUserScrollAt, now, cooldownMs)` returns `true` only when `now - lastUserScrollAt >= cooldownMs`, preventing auto-scroll fighting for `150ms` after user scroll input.

## 6. Conformance Matrix

| Fact | Location | Status | Verification |
| :--- | :--- | :--- | :--- |
| `brandClay` / `warmPaper` tokens & 0 `#000000`/`#ffffff`/`#fff` | `paseo-bots/client/native.ts` | CURRENT | `npm --prefix paseo-bots test` (`tests/cds-ui.test.ts`) |
| Single-stroke `Button` borders & `tabular-nums` | `paseo-bots/client/panel/controls.tsx` | CURRENT | `npm --prefix paseo-bots run typecheck` |
| CDS springs, `CDS_EASE_OUT`, `CDS_WEB_CURVE`, `useReduceMotion` | `paseo-bots/client/motion.ts` | CURRENT | `npm --prefix paseo-bots test` (`tests/cds-ui.test.ts`) |
| `isImeComposing` guard & `150ms` `canPinScrollToEnd` | `paseo-bots/client/keyboard.ts`, `paseo-bots/client/chat/Stream.tsx` | CURRENT | `npm --prefix paseo-bots test` (`tests/cds-ui.test.ts`, `tests/chat-scroll.test.tsx`) |
