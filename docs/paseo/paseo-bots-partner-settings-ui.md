---
doc_id: PASEO-BOTS-PARTNER-SETTINGS-UI
status: CURRENT
version: 1.0.0
last_verified: 2026-11-17
language: en-US
---

# Paseo Bots Partner Settings & TeamMap UI Specification

## 1. Scope & Coordinates

This specification governs the Partner Settings modal, `BotPanel` embedded rendering mode, and `TeamMap` bot-entry routing inside `@oliexe/paseo-bots` (`<projectRoot>/paseo-bots/client/`).

Primary codebase coordinates:
- Partner settings modal: `paseo-bots/client/settings/PartnerSettingsModal.tsx` (`PartnerSettingsModal`, `TargetSelectorRow`)
- Bot settings panel: `paseo-bots/client/panel/BotPanel.tsx` (`BotPanel`, `PanelHeader`, `SectionId`)
- Surface & TeamMap routing: `paseo-bots/client/BotsSurfaceReady.tsx` (`TeamMap` `onOpenBot`, `PartnerSettingsModal` mount)

---

## 2. Structural & Behavioral Invariants

1. **Two-Row Target Selector (`PartnerSettingsModal`)**:
   - The top selector splits Teams (`groups`) and Partners (`liveBots`) into two separate horizontal `TargetSelectorRow` strips (`partnerSettings.teamsGroup` on top, `partnerSettings.partnersGroup` below), separated from the active editor by a `1px` border divider.
   - Switching `target` or opening the modal resets `botSection` to `null`.

2. **Full `BotPanel` Reuse (`embedded` Mode)**:
   - Never assemble partial setting sections inside `PartnerSettingsModal` or secondary modals. When a bot is selected in `PartnerSettingsModal`, render the full `<BotPanel embedded ... />` (all 5 groups / 12 sections + search).
   - When `embedded` is `true` in `BotPanel`:
     - Omit the outer `flex: 1` wrapper and inner `ScrollView` so the parent `Modal.Content` owns scrolling.
     - Hide `PanelHeader` on the section list (`section === null`) to avoid duplicating the outer modal title and close button.
     - Keep `PanelHeader` with the back arrow (`onBack={() => onSection(null)}`) on section detail pages, omitting the redundant `X` close button (`onClose={undefined}`).

3. **Unified Entry State (`section: null`)**:
   - Both `PartnerSettingsModal` and `TeamMap` (`onOpenBot` in `BotsSurfaceReady.tsx`) open `BotPanel` directly to the full settings section list (`section: null`) rather than pre-drilling into `overview`.

---

## 3. Facts & Verification

| Fact | Location | Status | Verification |
|---|---|---|---|
| Two-row team/partner selector | `paseo-bots/client/settings/PartnerSettingsModal.tsx` (`TargetSelectorRow`) | CURRENT | `npm --prefix paseo-bots run typecheck` |
| Embedded `BotPanel` inside modal | `paseo-bots/client/settings/PartnerSettingsModal.tsx`, `paseo-bots/client/panel/BotPanel.tsx` | CURRENT | `npm --prefix paseo-bots run typecheck` |
| `TeamMap` opens `section: null` | `paseo-bots/client/BotsSurfaceReady.tsx` (`onOpenBot`) | CURRENT | `npm --prefix paseo-bots test` |
