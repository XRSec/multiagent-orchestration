---
doc_id: MULTIAGENT_ORCHESTRATION_UPDATE_LEDGER
version: 2.1.0
description: Architectural evolution, core milestones, and subsystem status ledger.
type: CHANGE_LEDGER_AST
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: MULTIAGENT-ORCHESTRATION ARCHITECTURAL CHANGE LEDGER

* **[1] REPOSITORY DECOUPLING & GOVERNANCE (2026-11-03)**
  * **[1.1]** Decoupled root `AGENTS.md`, `CLAUDE.md`, and `UPDATE.md` from `CindyR/` sub-module symlinks; isolated project-level orchestrator contracts from client diet specs.
  * **[1.2]** Migrated authoritative protocols from `multiagent-orchestration-old/docs/` to `/docs/` (`100%` `en-US`, numbers-first, AST tree topology).
  * **[1.3]** Established persistent canonical memory hierarchy across root `MEMORY.md` and Claude Code global memory shards.

* **[2] CORE ARCHITECTURAL MILESTONES**
  * **[2.1] Web UI & Multi-Agent Group Ingestion (`52efa74`)**
    * **[2.1.1]** Integrated multi-agent room timeline into `apps/web/` with strictly monotonic message sequences.
    * **[2.1.2]** Bound `@partner` triggers to headless agent runtimes via `vite-room-api-plugin.ts` REST + SSE bridge.
    * **[2.1.3]** Validated via `7` end-to-end stress tests; achieved `TERM_OK(VICTORY_CONFIRMED)`.
  * **[2.2] Cindy Bot Group & Control Plane Distillation (`61daf15`)**
    * **[2.2.1]** Enforced multi-repository workspace mounting under `~/.multiagent-orchestration/groups/<room_slug>/`.
    * **[2.2.2]** Implemented control plane distillation: pre-flight validation, progressive disclosure, and `300s` prompt cache preservation.
  * **[2.3] Partner Studio & Streaming Queue (`e8876d9`)**
    * **[2.3.1]** Added Partner Studio workspace supporting Claude streaming queue, session topic forking, and `@bot` protocol routing.
  * **[2.4] Dual-Mode Orchestration Engine Foundation (`0e1e798`)**
    * **[2.4.1]** Established `@anthropic-ai/claude-agent-sdk` (primary in-process NDJSON) and native `claude` CLI headless pool (secondary fallback).
    * **[2.4.2]** Standardized Machine Action Protocol (`<!-- CINDY_MAP:BEGIN -->...<!-- CINDY_MAP:END -->`) and Dual-Channel Steering (`PreToolUse` mailbox + `control_request: interrupt`).
  * **[2.5] CindyR Single-Runtime Hardening & IPC Guardrails (`8e7a1b25`, `d2b44fc0`)**
    * **[2.5.1] Single-Runtime Diet**: Purged non-Claude runtimes; restricted `AddProviderWizard.tsx` gallery to exactly `2` targets (`Anthropic`, `Custom`); commented out `scanLocalCli()` and `SuggestionRow` in `ProvidersSection.tsx` (`0` residual local CLI suggestions).
    * **[2.5.2] Form Null-Safety & Tab Alignment**: Enforced `activeTab = 'claude-code'` default in `ProviderConnectionDialog.tsx`; injected `?? emptyRuntime(agent)` fallbacks (`0` `baseUrl` undefined crashes).
    * **[2.5.3] Navigation Guard**: Restored `providers: Boxes` icon in `SettingsSidebarNav.tsx` with `{Icon && <Icon ... />}` defensive guard.
    * **[2.5.4] IPC Stub Invariants**: Registered fallback stubs for `18` disabled voice channels in `bootstrap-electron.ts` (`voice-input:cancel`, `stop`, `start`, `speaker-filter:*`); eliminated unhandled promise rejections blocking the macOS Cocoa RunLoop (`IMKCFRunLoopWakeUpReliable`).
    * **[2.5.5] Multi-Instance Isolation**: Documented collision vector where `userDataDirName: 'Cindy'` causes `/Applications/Cindy.app` and dev `CindyR` to contend for `localDb.sqlite` WAL lock; established mandatory `--isolated=dev` execution boundary.
    * **[2.5.6] SkillHub Market Offline Fallback & SSL Noise Suppression**: Configured `cindySkillHubApiBaseUrl = ""` in `config/endpoint*.json` as manifest-level shutoff for offline/unreachable cloud market; updated `registerIpc.ts` (`skillhub:sync`, `list-market`, `list-categories`) and `autoSyncService.ts` to gracefully degrade on `UNSUPPORTED_CAPABILITY`/`NETWORK_ERROR` without logging fatal stack traces; added `{ enabled }` guard to `useCategoryList` in `SkillhubHomeView.tsx` (`0` SSL handshake reset errors, `0` log.error noise).
    * **[2.5.7] Remote Desktop Sidebar Menu Suppression**: Commented out `DropdownMenuSub` imports, `desktopTargets` filtering, and nested remote desktop submenu items in `MachineSwitcherMenu.tsx` (`0` residual remote desktop menu triggers when secondary online machines are detected).
  * **[2.6] Final Unified Documentation & Architecture Specs Consolidation**
    * **[2.6.1] Eager IPC Registration & Database Readiness Barrier**: Registered `maker:project-automation:*` eagerly in `registerMakerIpcsAfterSplash` with `15,000ms` `withLoader` asynchronous gate; enforced `await whenDbReady()` across `custom-mcp-registry`, `git-snapshot`, `session-archive-sync`, and `cindy-brain`.
    * **[2.6.2] Cold-Start Skill Projection & Dev CSP**: Deployed exponential backoff for `isGhostSkillProjectionBoundaryStableForOwner` with `skillsPostCommitStep` post-commit hook; injected `DEV_CSP` via `devCspPlugin` in `vite.renderer.config.ts`.
    * **[2.6.3] Database Switching Race Condition Guard**: Implemented `whenDbReady` queue barrier in `current.ts` and `setAccountSwitchReconnect` in `authManager` eliminating the `49ms` `DbClient not ready` window; made `pendingGhostCardReassignments` idempotent.
    * **[2.6.4] Frontend SSOT & Anti-Flicker Guard**: Unified companion creation in `BotProfileCreateForm.tsx` with dynamic `useSyncExternalStore` workspace default model binding; added `hydrateFromDatabase` lock in `botStore.ts`.
    * **[2.6.5] Deprecation & Purge of Pi and Codex**: Purged CLI probes, IPC handlers, and version checks from `binary-version.ts`; removed Codex and Pi rows from `AboutSection.tsx` and UI selectors; scoped engine to Claude Code exclusively.
    * **[2.6.6] Multi-Thread Concurrency Fault Tolerance**: Patched `readMessage` and `executionLane` in `chatServer.ts` to handle HTTP 400 `INVALID_INPUT` with `${room}:main` fallback; isolated pre-read errors in `claimBesideRuns` to ensure concurrent adjacent thread execution.

* **[3] SUBSYSTEM MATRIX**
  * **[3.1] Orchestration Core (`/`, `docs/`)**: Multi-agent orchestration engine, protocols, process pool, group storage.
  * **[3.2] Web Frontend (`apps/web/`)**: React timeline, SSE streaming, room management.
  * **[3.3] CindyR Client (`CindyR/`)**: Lightweight Electron desktop workbench (Claude Code single-runtime).
