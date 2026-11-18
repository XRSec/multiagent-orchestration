# Task Manifest — Open Claude UI (CDS) Optimization

- **Workflow**: `wf-moadmin-closed-loop`
- **Status**: `IN_PROGRESS` (`moadmin-plan` complete)
- **Scope**: `paseo-bots/client/**` and any other visible UI surfaces discovered in `multiagent-orchestration`

## 1. Objective & Constraints

Optimize all visible UI surfaces using `/open-claude-ui` (Claude Design System, CDS) invariants while respecting the host React Native (`react-native` / `react-native-web`) + `@getpaseo/plugin` `PluginTheme` architecture.

- **Host Fidelity**: Bridge CDS tokens, warm editorial surfaces, single-stroke borders, clay/accent role separation, calibrated spring/easing motion (`prefers-reduced-motion` aware), IME composition guards (`!(e.nativeEvent.isComposing || e.keyCode === 229)`), 150ms scroll-pinning cooldown, and `tabular-nums` natively into `paseo-bots/client/*`. Do NOT paste raw HTML/CSS or DOM-only Framer Motion into RN components.
- **Theme & Color Guardrails**: Clean light/dark theme parity; no pure `#000` (except code blocks `#0d0d0c`), no harsh `#fff` dark contrast, no raw `linear` or generic `ease` transitions.
- **Role Separation**: Clay/brand (`#c6613f` / `#d97757` / `#cc6b49`) for agent-initiated actions; accent blue (`#184f95` / `#6da7ec`) and focus shadow for UI focus/accent roles.
- **Security & Zero-Binary**: Zero `allow-same-origin` regressions; validate `postMessage` origins; zero `.ttf`/`.otf`/`.mp3`/`.wav` assets.

## 2. Acceptance Criteria (DoD)

- [ ] **DoD-1**: Recon inventory of all visible UI components and applicable `open-claude-ui` invariants/tokens/guards.
- [ ] **DoD-2**: Consistent CDS visual polish (warm editorial surface hierarchy, single-stroke borders, clay/accent role separation, typography & `tabular-nums` alignment) across Chat, Sidebar, Analytics, Team Graph, Workflows, Routines, Settings/Modals, Library, Panel, and shared `ui/*` primitives.
- [ ] **DoD-3**: Calibrated motion physics (`motion.ts` presets/curves, `prefers-reduced-motion` support) across interactive transitions, drawers, cards, and modals.
- [ ] **DoD-4**: IME composition guard on all text inputs/composers, 150ms scroll-pinning cooldown on chat/streaming lists, and zero security regressions.
- [ ] **DoD-5**: `paseo-bots` typecheck (`tsc --noEmit`), tests (`vitest run`), and applicable build checks pass with `Exit_Code: 0`.

## 3. DAG Stages & Boundaries

1. `moadmin-plan` (`bot-moadmin`): Intent analysis, DoD, manifest initialization. (Done)
2. `modeep-recon` (`bot-modeep`): Read-only inventory of `paseo-bots/client/**` + check `paseo-sidecar/`, `extensions/`, `tools/` for other visible UIs + map CDS specs (`cds-theme.css`, `component-map.md`, `AGENTS.md`).
3. `mocode-impl` (`bot-mocode`): Implement CDS token bridge, `motion.ts` physics + reduced-motion, IME/scroll guards, single-stroke borders, `tabular-nums`, and surface polish + unit tests.
4. `moci-verify` (`bot-moci`): Execute `tsc --noEmit`, `vitest run`, and static audits for color/motion/IME/security invariants.
5. `moadmin-review` (`bot-moadmin`): Zero-trust audit of `mocode-impl` and `moci-verify` proofs against DoD-1..5.
6. `modoc-writeback` (`bot-modoc`): Update `docs/` to document updated UI tokens, motion, and guard contracts.
7. `moadmin-finalize` (`bot-moadmin`): Memory distillation and `zh-CN` executive delivery.
