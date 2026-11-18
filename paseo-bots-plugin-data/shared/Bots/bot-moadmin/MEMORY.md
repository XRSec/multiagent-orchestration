# moAdmin (`bot_moadmin_director_03`) — Knowledge Index

- **Bot ID**: `bot_moadmin_director_03`
- **Initialized**: `2026-11-05T08:41:36.946Z`

## user
- **Agent-First & Language Discipline**: Author internal specs, memory shards, skills, and protocols in dense, rule-first `en-US`; reply to the operator in `zh-CN` while preserving code identifiers and verbatim quotes.
- **Desktop Full-Window Bots Views**: Render `paseo-bots` Analytics (`数据分析`) and Team Graph (`团队关系图`) views full-window on desktop rather than half-window split panes, and expose a session selector (including archived sessions) on the Analytics view.

## feedback
- **Bypass Unrendered `propose_changes` Cards**: Do not ask the operator to click `propose_changes` confirmation cards when creating or modifying Bots or Teams.
  - **Why**: Current chat client surfaces do not render `propose_changes` confirmation cards, leaving card-gated proposals unactionable.
  - **How to apply**: When the operator explicitly requests Bot or Team creation/modification, run `applyChanges` + `botSettings.schema.parse` from `paseo-bots/shared/changes.ts` via `bun -e` to write directly to `bots.json` (`$PROJECT_ROOT/plugin-settings/bots.json` / `paseo-bots-plugin-settings/bots.json`).
- **Wrap Direct `bots.json` Writes in Current Versioned Envelope (`version: 4`)**: Never write bare `botSettings.schema.parse(...)` output directly to `bots.json`, and do not downgrade the envelope version to `3`.
  - **Why**: `botSettings.schema.parse(...)` validates only the inner `values` payload while `BOT_SETTINGS_VERSION` in `paseo-bots/shared/bot.ts` is `4`; bare output fails Paseo settings loading and stale task prompts referencing `v3` cause schema version drift.
  - **How to apply**: Always read the existing `version` (currently `4`) and wrap direct `bots.json` disk writes as `{ "version": 4, "values": <parsed> }`.

## project
- **Pure Orchestrator Boundary**: `bot-moadmin` manages task decomposition (`.t3/TASK_MANIFEST.md`) and specialist dispatch (`bot-*` prefixed subagents via `invoke_subagent` / `send_message`), delegating all repository code and doc edits to domain bots.
- **Silent Routine Check Skip**: Output exact token `NO_REPLY` when invoked on no-delta routine checks (e.g., `moAdmin · Memory check`).
- **Workflow Runtime & Blackboard Contract (`paseo-bots`)**:
  - `runWorkflowDag` deduplicates `wf-` fallback `teamSessionId` prefixes, enforces `waitForFinish(stageTimeoutMs)` timeout failure detection, treats `<worker_handoff>` `STATUS: PARTIAL | BLOCKED | FAILED` as stage failures for bounded retry, and reuses an idle `stage.chatId` via `sendBotMessage` on `<repair_brief>` retries (falling back to `startChat` only when unavailable).
  - `reconcileOrphanWorkflows` (`paseo-bots/server/workflow-runner.ts`, `paseo-bots/index.server.ts`) guards in-flight runs via `activeWorkflowTaskIds`, settling stale `running` disk tasks on plugin startup (`staleAfterMs: 0`) and `bots.workflows.runs` reads (`DEFAULT_ORPHAN_STALE_MS`) while refreshing `TaskCard` state.
  - `buildStageBriefPrompt` injects `- SESSION_BOARD` and `- TASK_MANIFEST` paths into `<task_brief>`, eliminating path drift when team `cwd` is `null`; `parseWorkerHandoff` extracts all 6 canonical fields (`STATUS`, `SUMMARY`, `TOUCHED_FILES`, `VERIFICATION_PROOF`, `DOD_CHECKLIST`, `OPEN_ISSUES`) with Markdown bold/list tolerance.
  - Chat stream (`paseo-bots/shared/protocol-cards.ts`, `paseo-bots/client/chat/stream/ProtocolCard.tsx`, `rows.tsx`) segments `<task_brief>`, `<repair_brief>`, and `<worker_handoff>` outside fenced code blocks into collapsible `PASS`/`PARTIAL`/`BLOCKED`/`FAILED` cards (`en`/`zh-CN` i18n); partner chat links route through `navigateToAgentChat` (`paseo-bots/client/navigation.ts`) and single-pass `handledRouteRef` sync in `BotsSurfaceReady.tsx` to open existing `stage.chatId` sessions without blank-session resets.
  - `wf-moadmin-closed-loop` wires cross-hop `dependsOn` edges (`moci-verify` -> `["moadmin-plan", "mocode-impl"]`; `modoc-writeback` -> `["mocode-impl", "moadmin-review"]`) so QA and doc specialists receive upstream DoD and `TOUCHED_FILES` directly.
- **`paseo-bots/client` UI & CDS Adaptation**:
  - `paseo-bots/client` runs on React Native (`react-native` / `react-native-web`) + `@getpaseo/plugin` `PluginTheme` (`theme.ts`, `native.ts`, `motion.ts`, `typography.ts`), with `tsc --noEmit` and `vitest run` in `paseo-bots/package.json`.
  - CDS contracts implemented natively (never raw HTML/CSS): `brandClay`/`warmPaper` tokens with zero `#000000`/`#ffffff`/`#fff` UI values (`native.ts`), single-stroke `Button` borders (`panel/controls.tsx`), `tabular-nums` alignment, `motion.ts` spring/bezier presets + `useReduceMotion()`, `isImeComposing` (`keyboard.ts`) across inputs, and `150ms` `canPinScrollToEnd` cooldown (`Stream.tsx`).

## reference
- **Active Memory Shards**:
  - `user_agent-first-multi-agent-system.md`
  - `user_language-discipline.md`
  - `user_skills-are-for-machines.md`
  - `reference_taskforce-orchestration-protocols.md`
- **Key Implementation Pointers**:
  - Bot roster & workflows SSOT: `paseo-bots-plugin-settings/bots.json`
  - Settings mutation & schema helper: `paseo-bots/shared/changes.ts`, `paseo-bots/shared/bot.ts`
  - Workflow engine, contracts & live UI: `paseo-bots/server/workflow-runner.ts`, `paseo-bots/shared/workflows.ts`, `paseo-bots/shared/protocol-cards.ts`, `paseo-bots/client/chat/stream/ProtocolCard.tsx`, `paseo-bots/client/WorkflowsScreen.tsx` (`bots.workflows.runs` RPC)
  - CDS UI, motion & edge-guard spec: `docs/paseo/paseo-bots-client-ui-and-cds.md` (`paseo-bots/client/native.ts`, `paseo-bots/client/motion.ts`, `paseo-bots/client/keyboard.ts`)
  - Workflow architecture spec: `docs/paseo/paseo-bots-workflow-engine-and-routing.md` (`v1.2.0`)
  - Desktop Bots surface & chat routing: `paseo-bots/client/BotsSurfaceReady.tsx`, `paseo-bots/client/navigation.ts`
