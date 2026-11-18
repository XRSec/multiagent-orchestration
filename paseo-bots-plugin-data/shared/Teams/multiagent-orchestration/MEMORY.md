# Team Memory — `multiagent-orchestration`

## project
- **Settings Envelope Invariant (`bots.json` `version: 4`)**: Direct disk writes to `paseo-bots-plugin-settings/bots.json` MUST validate inner values via `botSettings.schema.parse(...)` and preserve the outer versioned envelope `{ "version": 4, "values": <parsed> }` (`BOT_SETTINGS_VERSION` in `paseo-bots/shared/bot.ts`).
- **Workflow Runtime & Blackboard Protocol**:
  - `runWorkflowDag` (`paseo-bots/server/workflow-runner.ts`) deduplicates `wf-` prefixes on fallback session IDs, fails stages that time out or remain `running`/`initializing` past `waitForFinish(stageTimeoutMs)`, treats `<worker_handoff>` `STATUS: PARTIAL | BLOCKED | FAILED` as non-passing for bounded retries, and reuses idle `stage.chatId` sessions via `sendBotMessage` on `<repair_brief>` retries (falling back to `startChat` when unavailable).
  - `reconcileOrphanWorkflows` (`paseo-bots/server/workflow-runner.ts`, `paseo-bots/index.server.ts`) tracks live runners in `activeWorkflowTaskIds` and settles orphaned `running` disk tasks on startup (`staleAfterMs: 0`) and `bots.workflows.runs` reads (`DEFAULT_ORPHAN_STALE_MS`), refreshing `TaskCard` state so cards never hang across restarts.
  - `buildStageBriefPrompt` (`paseo-bots/shared/workflows.ts`) injects `- SESSION_BOARD` and `- TASK_MANIFEST` into every `<task_brief>`; closed-loop orchestrators keep repo `.t3/TASK_MANIFEST.md` and session blackboard `TASK_MANIFEST.md` synchronized.
  - Every dispatched specialist stage MUST end with a 6-field `<worker_handoff>` block (`STATUS`, `SUMMARY`, `TOUCHED_FILES`, `VERIFICATION_PROOF`, `DOD_CHECKLIST`, `OPEN_ISSUES`); `parseWorkerHandoff` tolerates Markdown bolding and list prefixes, while `segmentProtocolBlocks` + `ProtocolCard` (`paseo-bots/shared/protocol-cards.ts`, `paseo-bots/client/chat/stream/ProtocolCard.tsx`) render `<task_brief>`, `<repair_brief>`, and `<worker_handoff>` as collapsible themed status cards (`en`/`zh-CN` i18n).
  - Partner chat deep links (`TaskCard`, `TaskStageModal`) route via `navigateToAgentChat` (`paseo-bots/client/navigation.ts`) and single-pass `handledRouteRef` `bot-chat` sync in `paseo-bots/client/BotsSurfaceReady.tsx` so opening `stage.chatId` never triggers duplicate `openAgent` blank-chat resets.
- **`wf-moadmin-closed-loop` 7-Stage Cadence & Cross-Hop Visibility**:
  - Stages execute in topological order: `moadmin-plan` -> `modeep-recon` -> `mocode-impl` -> `moci-verify` (depends on `moadmin-plan`, `mocode-impl`) -> `moadmin-review` -> `modoc-writeback` (depends on `mocode-impl`, `moadmin-review`) -> `moadmin-finalize`.
  - Write-scope boundaries remain strictly segregated: `bot-moadmin` (orchestration/manifests/memory only), `bot-modeep` (read-only code recon), `bot-mocode` (implementation & unit tests), `bot-moci` (read-only QA verification), `bot-modoc` (`docs/` & `*.md` write-back only).
- **Engineering & Documentation Guardrails**:
  - Never invoke `rm` or `rm -rf`; always use universal safe delete (`SAFE_DELETE_BIN` or Node `fs.rmSync`).
  - Author internal specs, manifests, skills, and memory files in dense rule-first `en-US` with zero machine-specific absolute paths (D7); communicate with the operator in concise `zh-CN`.
- **`paseo-bots/client` CDS UI, Motion Physics & Edge Guards**:
  - `paseo-bots/client/native.ts` bridges CDS clay/paper tokens (`brandClay`, `brandClayPressed`, `brandClaySoft`, `warmPaper`) natively into `PluginTheme` with zero `#000000`/`#ffffff`/`#fff` UI violations; `panel/controls.tsx` `Button` strips borders on `secondary`/`ghost` for single-stroke containment, and numeric metrics/timers use `tabular-nums`.
  - `paseo-bots/client/motion.ts` exports calibrated spring/bezier presets (`SPRING_BOUNCY`, `SPRING_SNAPPY`, `SPRING_GENTLE`, `SPRING_HEAVY_SNAP`, `CDS_EASE_OUT`, `CDS_WEB_CURVE`) gated by `useReduceMotion()` (`prefers-reduced-motion`).
  - `paseo-bots/client/keyboard.ts` (`isImeComposing`) guards CJK IME composition across `Composer.tsx`, `FindBar.tsx`, `Stream.tsx`, and `BotLauncherCore.tsx`; `Stream.tsx` enforces a `150ms` `canPinScrollToEnd` cooldown.

## reference
- **Workflow Subsystem & UI Pointers**:
  - Engine & blackboard helpers: `paseo-bots/server/workflow-runner.ts`, `paseo-bots/shared/workflows.ts`, `paseo-bots/shared/protocol-cards.ts`
  - Live workflow runs RPC, protocol cards & routing UI: `paseo-bots/shared/rpc.ts` (`bots.workflows.runs`), `paseo-bots/index.server.ts`, `paseo-bots/client/WorkflowsScreen.tsx`, `paseo-bots/client/chat/stream/ProtocolCard.tsx`, `paseo-bots/client/navigation.ts`, `paseo-bots/client/BotsSurfaceReady.tsx`
  - CDS UI, motion & edge-guard spec: `docs/paseo/paseo-bots-client-ui-and-cds.md` (`paseo-bots/client/native.ts`, `paseo-bots/client/motion.ts`, `paseo-bots/client/keyboard.ts`)
  - Architecture & storage specs: `docs/paseo/paseo-bots-workflow-engine-and-routing.md` (`v1.2.0`), `docs/paseo/paseo-bots-configuration-and-storage.md`
