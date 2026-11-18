# Task Manifest — `wf-d9f268f7`

- **Workflow**: `wf-moadmin-closed-loop` (`moAdmin 全流程闭环编排`)
- **Task ID**: `wf-d9f268f7`
- **Status**: `IN_PROGRESS` (Stage 1: `moadmin-plan` complete)
- **Target Repo**: `multiagent-orchestration` (`paseo-bots/client/**` + any other discovered visible UI surfaces)

## 1. Objective & Architectural Constraints

Apply Claude Design System (CDS, `/open-claude-ui`) optimizations across all visible UI surfaces in `multiagent-orchestration` while respecting the host React Native (`react-native` / `react-native-web`) + `@getpaseo/plugin` `PluginTheme` architecture.

### Hard Constraints
1. **Host Stack Compatibility**: Do NOT paste raw HTML/CSS into React Native components. Adapt CDS tokens, surfaces, single-stroke borders, role separation, motion physics, and edge guards natively into `paseo-bots/client/theme.ts`, `native.ts`, `motion.ts`, `typography.ts`, and component stylesheets.
2. **Theme Parity & Color Discipline**: Support light and dark themes cleanly. Never introduce pure `#000` (except code blocks `#0d0d0c`) or harsh `#fff` dark contrast; avoid raw `linear` or generic `ease` transitions.
3. **Role Separation**: Reserve clay/brand (`#c6613f` / `#d97757` light, `#cc6b49` dark) for agent-initiated actions; reserve accent blue (`#184f95` / `#6da7ec`) and focus shadow for UI focus/accent roles.
4. **Edge Guards & Typography**: Enforce IME composition guard `!(e.nativeEvent.isComposing || e.keyCode === 229)` on all text inputs/composers, 150ms scroll-pinning cooldown on chat/streaming lists, single-stroke borders (strip borders on nested secondary buttons/chips inside bordered containers), and `tabular-nums` (`fontVariant: ['tabular-nums']`) on dynamic metrics.
5. **Security & Zero-Binary**: Zero `allow-same-origin` regressions on any iframe/web bridge; validate `postMessage` origins; never commit `.ttf`/`.otf`/`.mp3`/`.wav`.
6. **Surface Coverage**: Chat (`ChatPane`, `chat/stream/*`, `ProtocolCard`, `Composer`, `launcher/*`), Sidebar (`BotSidebar`, `BotSidebarStatus`, `PaseoSidebar`), Analytics (`analytics/*`), Team Graph (`teams/*`), Workflows (`WorkflowsScreen`), Routines (`RoutinesScreen`), Settings & Modals (`settings/*`, `BotDialogs`, `BotsSurfaceModals`), Library (`library/*`), Panel (`panel/*`), and shared primitives (`ui/*`, `theme.ts`, `motion.ts`, `typography.ts`), plus any additional UI surfaces discovered in `paseo-sidecar/`, `extensions/`, or `tools/`.

## 2. Definition of Done (DoD)

- [ ] **DoD-1 (Recon Inventory)**: Complete inventory of all visible UI components in `paseo-bots/client/**` (and any other repo UI surfaces), mapping current tokens, motion, IME/scroll guards, and `open-claude-ui` gaps.
- [ ] **DoD-2 (CDS Visual Polish)**: Warm editorial surface hierarchy (`surface-0`..`3` / hairline borders), single-stroke borders, clay/accent role separation, and `tabular-nums` alignment across all visible surfaces in light and dark modes.
- [ ] **DoD-3 (Calibrated Motion Physics)**: `motion.ts` presets/curves (`SPRING_BOUNCY`, `SPRING_SNAPPY`, `SPRING_GENTLE`, `SPRING_HEAVY_SNAP`, `[0.16, 1, 0.3, 1]` / RN `Animated`/`Easing` equivalents) with `prefers-reduced-motion` support across interactive transitions, drawers, cards, and modals.
- [ ] **DoD-4 (Interaction & Edge Guards)**: IME composition guard on all text inputs/composers, 150ms scroll-pinning cooldown on chat/streaming lists, and zero security regressions.
- [ ] **DoD-5 (Verification)**: `paseo-bots` typecheck (`npm run typecheck` / `tsc --noEmit`), unit/UI tests (`npm test` / `vitest run`), and any applicable build/verification checks pass with `Exit_Code: 0`.

## 3. Execution DAG & Specialist Assignments

| Stage ID | Bot | Responsibility & Boundary |
|---|---|---|
| `moadmin-plan` | `bot-moadmin` | Parse intent, define DoD, initialize session & repo `TASK_MANIFEST.md`. (Done) |
| `modeep-recon` | `bot-modeep` | Read-only recon of `paseo-bots/client/**` (`theme.ts`, `motion.ts`, `typography.ts`, `Composer.tsx`, `Stream.tsx`, `ui/*`, all screens/modals) + check `paseo-sidecar/`, `extensions/`, `tools/` for any visible UI + read CDS specs (`SKILL.md`, `component-map.md`, `cds-theme.css`, `AGENTS.md`). Output concrete component-to-CDS gap matrix. |
| `mocode-impl` | `bot-mocode` | Implement CDS token bridge, `motion.ts` physics + reduced-motion, IME/scroll guards, single-stroke borders, `tabular-nums`, and surface polish across all inventoried UI files. Add/update unit tests for guards/tokens/motion. |
| `moci-verify` | `bot-moci` | Run `tsc --noEmit`, `vitest run` (and check `bun test` / build), audit diff for `#000`/`#fff` violations, linear/ease transitions, IME guards, and security invariants. Issue `PASS`/`WARN`/`FAIL`. |
| `moadmin-review` | `bot-moadmin` | Zero-trust audit of `mocode-impl` and `moci-verify` `<worker_handoff>` proofs against DoD-1..5; trigger bounded repair if needed. |
| `modoc-writeback` | `bot-modoc` | Update relevant `docs/` specs (`*.md`) to reflect updated `paseo-bots/client` design tokens, motion, and guard contracts. |
| `moadmin-finalize` | `bot-moadmin` | Distill durable lessons to memory and deliver concise `zh-CN` executive summary. |

## 4. Risk Watchpoints

1. **React Native vs Web CSS Mismatch**: `paseo-bots/client` runs on React Native (`react-native` / `react-native-web`) with `PluginTheme`; raw CSS variables or DOM-only `Framer Motion` imports will break native builds. Bridge via JS/TS theme tokens and RN `Animated` / `Easing` + web-safe `prefers-reduced-motion` hooks.
2. **Test Runner Divergence**: `paseo-bots/package.json` defines `"test": "vitest run"` and `"typecheck": "tsc --noEmit"`. Verify whether `vitest run` and/or `bun test` works cleanly and report exact commands.
3. **Scope Creep & Unintended Functional Regressions**: Visual/motion/guard polish across 100+ client files risks breaking existing chat streaming, deep-link routing, or keyboard shortcuts; prioritize shared primitives (`theme.ts`, `motion.ts`, `typography.ts`, `ui/*`, `stream/ui.tsx`) before per-screen overrides.
