# MoDeep Recon Report — CDS (`/open-claude-ui`) Gap Analysis

- **Workflow**: `wf-moadmin-closed-loop` (`wf-d9f268f7`)
- **Stage**: `modeep-recon` (Read-only reconnaissance)
- **Baseline**: `paseo-bots` `tsc --noEmit` exit `0`, `vitest run` `89` files / `961` tests passed. `bun --version` is `1.4.2` (`package.json` uses `vitest run`).

## 1. Visible UI Surface Inventory

1. **Primary Surface (`paseo-bots/client/**`)**:
   - **Core Tokens & Motion**: `native.ts`, `theme.ts`, `motion.ts`, `typography.ts`, `web.ts`, `ui/Columns.tsx`, `ui/HeaderButton.tsx`, `ui/Menu.tsx`, `ui/Tooltip.ts`, `panel/controls.tsx`.
   - **Chat & Stream**: `ChatPane.tsx`, `chat/Composer.tsx`, `chat/Stream.tsx`, `chat/FindBar.tsx`, `chat/Bookmarks.tsx`, `chat/Permission.tsx`, `chat/composer/*`, `chat/stream/*` (`ui.tsx`, `rows.tsx`, `ProtocolCard.tsx`, `TaskCard.tsx`, `TaskStageModal.tsx`, `HandoffCard.tsx`, `PlanCard.tsx`, `ProposalCard.tsx`, `QuestionForm.tsx`, `RoutineRunCard.tsx`, `ConnectCard.tsx`, `InteractionCard.tsx`, `SourceCards.tsx`, `details.tsx`).
   - **Launcher**: `launcher/BotLauncherCore.tsx`, `BotLauncherPopover.tsx`, `BotLauncherStyles.ts`, `CompactComposerSheet.tsx`, `ModelPickerPopover.tsx`, `AttachmentThumbStrip.tsx`, `ScrollablePills.tsx`.
   - **Sidebar & Navigation**: `BotSidebar.tsx`, `BotSidebarStatus.tsx`, `PaseoSidebar.tsx`, `BotsSurface.tsx`, `BotsSurfaceReady.tsx`, `BotsSurfaceModals.tsx`, `BotDialogs.tsx`, `AgyOrphanBanner.tsx`, `Splash.tsx`, `NewBotDefaults.tsx`.
   - **Screens & Subviews**: `WorkflowsScreen.tsx`, `RoutinesScreen.tsx`, `analytics/DataAnalysisPane.tsx`, `analytics/SessionSelector.tsx`, `teams/TeamMap.tsx`, `teams/TeamTabs.tsx`, `teams/TeamSheet.tsx`, `teams/TeamFileDialog.tsx`, `settings/PartnerSettingsModal.tsx`, `settings/WorkflowEditor.tsx`, `settings/WorkflowPipelinePreview.tsx`, `library/*`, `panel/*`.
2. **Secondary Repo Surface**: `paseo-sidecar/paseo-plugin/client/screen.tsx` (1 tracked TSX file; `extensions/` has `0` git-tracked files).
3. **Host Architecture**: React Native (`react-native` 0.81.5 / `react-native-web`) + `@getpaseo/plugin` `PluginTheme`. Raw HTML/CSS or Framer Motion DOM imports cannot be used in RN views.

## 2. CDS Invariant Gap Matrix

| CDS Invariant | Current State in `paseo-bots/client` | Concrete Gaps & Targets |
|---|---|---|
| **Warm Editorial Surfaces & `#000`/`#fff` Ban** | `native.ts` derives `surface3`, `surface4`, `borderAccent` from `PluginTheme`. | Hardcoded `#000000` / `#ffffff` / `#fff` exist in: `native.ts:117,123` (mix anchors), `library/parts.tsx:109`, `panel/controls.tsx:350`, `chat/Composer.tsx:614,679`, `chat/stream/ui.tsx:31` (shimmer gradient), `launcher/BotLauncherCore.tsx:931,998,1112,1114`, `launcher/BotLauncherPopover.tsx:100,101`. Replace UI surface/text `#fff` with `colors.accentForeground` or warm `#f0efec` / `#fcfcfb`. |
| **Clay / Accent Role Separation** | Uses `colors.accent` for both UI focus rings (`theme.ts:38`, `controls.tsx`) AND agent send/submit buttons (`Composer.tsx:606`, `TaskCard.tsx:180,184`). | Zero CDS clay/brand tokens (`#c6613f` / `#d97757` light, `#cc6b49` dark) exist in `native.ts` or `theme.ts`. Add `brandClay` / `brandClayPressed` / `brandClaySoft` in `nativeTokens(colors)` (light `#d97757` / `#c6613f`, dark `#cc6b49`) for agent-initiated actions (Composer send, active agent indicator, thinking/running clay dot) while keeping `colors.accent` / `borderAccent` for UI focus rings and selection. |
| **Single-Stroke Borders** | `controls.tsx:73` `Button` sets `borderWidth: 1` for all variants including `secondary` (`tokens.surface3` border); nested chips/buttons inside bordered cards/composer sometimes carry borders. | In `controls.tsx` `Button`, strip border (`borderWidth: 0`) for `secondary` and `ghost` variants (or when `variant !== "outline"`), and audit `Composer.tsx` / `TaskCard.tsx` / `ProtocolCard.tsx` nested chips/pills for redundant borders inside bordered containers. |
| **Calibrated Motion Physics & Reduced Motion** | `motion.ts` only exports `useReduceMotion()`. `Columns.tsx:124-132` uses raw `Easing.out(Easing.cubic)` & `Animated.spring({ bounciness: 0 })` without `useReduceMotion()`. `BotSidebarStatus.tsx:110` uses `Easing.linear`. `web.ts:687` uses `transition: "opacity 80ms ease-out"`. `Stream.tsx:439` animates without `useReduceMotion()`. `TaskCard.tsx:219` renders static dot instead of clay breathing pulse. | Expand `motion.ts` with RN-compatible CDS presets (`SPRING_BOUNCY`: tension/friction or stiffness 600/damping 30, `SPRING_SNAPPY`: 320/28, `SPRING_GENTLE`: 380/18, `SPRING_HEAVY_SNAP`: 1200/80/mass 0.1, `CDS_EASING = Easing.bezier(0.16, 1, 0.3, 1)`). Wire `useReduceMotion()` into `Columns.tsx`, `Stream.tsx`, `BotSidebarStatus.tsx`, `chat/stream/ui.tsx` (`useShimmer`), and `TaskCard.tsx` (clay breathing dot). Replace `web.ts:687` `ease-out` with `cubic-bezier(0.16, 1, 0.3, 1)` and `duration: 0` when reduced motion is active. |
| **CJK IME Composition Guard** | `Composer.tsx:487` and `BotLauncherCore.tsx:637` already use `isImeComposing` (`isComposing || keyCode === 229`). | `FindBar.tsx:41` (`onKeyPress`) and `Stream.tsx:349` (`onKeyDown`) lack IME composition guards. Extract shared `isImeComposing` helper in `keyboard.ts` (or `theme.ts`) and apply to `FindBar.tsx`, `Stream.tsx`, `Composer.tsx`, `BotLauncherCore.tsx`, plus any `onKeyPress`/`onSubmitEditing` handlers in `QuestionForm.tsx`, `ModelPickerPopover.tsx`, `DataAnalysisPane.tsx`, `SessionSelector.tsx`. |
| **150ms Scroll-Pinning Cooldown** | `Stream.tsx:130-157` tracks `nearBottomRef` and `initialFollow` on `onScroll` / `onContentSizeChange`, but has **no** 150ms user-scroll cooldown timestamp (`lastUserScrollAt`). | Add `lastUserScrollAtRef` (updated on user scroll/wheel/touch drag) in `Stream.tsx` so `onContentSizeChange` never calls `scrollWebListToEnd` when `Date.now() - lastUserScrollAtRef.current < 150`. |
| **`tabular-nums` on Dynamic Metrics** | Already applied in `analytics/DataAnalysisPane.tsx`, `analytics/SessionSelector.tsx`, `chat/stream/rows.tsx:538`. | Missing `fontVariant: ["tabular-nums"]` on: `TaskCard.tsx:240` (`stageDuration`), `TaskCard.tsx` elapsed header timer & retry badges, `FindBar.tsx:86` (`position of total`), `ContextMeter.tsx` tooltip/labels, `WorkflowsScreen.tsx:110,172,232` (counts), `RoutinesScreen.tsx` timestamps/counts, `BotSidebarStatus.tsx` / `MemoryActivity.tsx` counters. |
| **Security & Zero-Binary** | Zero `allow-same-origin` iframes or `.ttf`/`.otf`/`.mp3`/`.wav` assets found in `paseo-bots/client/`. | Maintain clean baseline; do not introduce `allow-same-origin` or binary font/audio assets. |

## 3. Recommended Implementation Strategy for `bot-mocode`

1. **Shared Foundation First**:
   - `paseo-bots/client/native.ts`: Add CDS clay/brand tokens (`brandClay`, `brandClayHover`, `brandClaySoft`) and warm neutral fallbacks (eliminate raw `#ffffff` / `#000000` in UI surfaces).
   - `paseo-bots/client/motion.ts`: Export RN-compatible CDS spring/easing constants (`SPRING_BOUNCY`, `SPRING_SNAPPY`, `SPRING_GENTLE`, `SPRING_HEAVY_SNAP`, `CDS_EASE_OUT`) and helper `withReducedMotion(...)`.
   - `paseo-bots/client/keyboard.ts`: Export shared `isImeComposing(event)` guard.
   - `paseo-bots/client/panel/controls.tsx`: Enforce single-stroke border discipline (`Button` `secondary`/`ghost` `borderWidth: 0`), fix `#ffffff` switch thumb, add `tabular-nums` to `StatusBadge` when numeric.
2. **Chat & Stream Guards + Polish**:
   - `paseo-bots/client/chat/Stream.tsx`: Add 150ms scroll-pinning cooldown (`lastUserScrollAtRef`), IME guard on `onKeyDown`, `useReduceMotion()` on scroll-to-bottom button animation.
   - `paseo-bots/client/chat/FindBar.tsx`: Add `isImeComposing` guard and `fontVariant: ["tabular-nums"]` on match counter.
   - `paseo-bots/client/chat/Composer.tsx` & `launcher/BotLauncherCore.tsx`: Use `brandClay` for agent-send action & active clay indicator; strip redundant borders on nested composer pills; replace `#ffffff` with `colors.accentForeground` / warm off-white.
   - `paseo-bots/client/chat/stream/ui.tsx`, `ProtocolCard.tsx`, `TaskCard.tsx`, `TaskStageModal.tsx`: Respect `useReduceMotion()`, use `brandClay` for agent-initiated/running states, add `tabular-nums` to all durations/counts, and replace `#ffffff` shimmer stop with warm off-white `#f0efec`.
3. **Navigation, Sidebar, Screens & Sidecar**:
   - `paseo-bots/client/ui/Columns.tsx`, `BotSidebarStatus.tsx`, `web.ts`: Wire `motion.ts` presets + `useReduceMotion()` and replace `ease-out` / `Easing.linear` (except continuous spin where reduced motion swaps to static indicator).
   - `WorkflowsScreen.tsx`, `RoutinesScreen.tsx`, `library/parts.tsx`, `analytics/*`, `teams/*`, `settings/*`: Apply `tabular-nums` to counts/timers, remove `#ffffff` hardcoded fills, ensure single-stroke borders.
   - `paseo-sidecar/paseo-plugin/client/screen.tsx`: Inspect and align any hardcoded `#000`/`#fff`/missing `tabular-nums` if needed.
4. **Tests**: Add Vitest unit tests covering `motion.ts` presets, `keyboard.ts` `isImeComposing`, `nativeTokens` clay/accent separation, and `Stream.tsx` 150ms scroll-pinning cooldown logic.
