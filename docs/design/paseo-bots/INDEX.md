---
doc_id: PASEO-BOTS-INDEX
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Paseo Bots Orchestration Plugin (`@oliexe/paseo-bots`)

Parent router: [../INDEX.md](../INDEX.md). Governs the multi-agent orchestration plugin (`paseo-bots/`), binding bot/team configuration, isolated Managed Seats, Session Blackboards, dynamic 6-block system prompts, declarative Workflow DAG execution, Task Pyramid settlement, model fallback chains, scheduled routines, friction analytics, and React Native / Web surfaces.

## 1. Global Invariants

- **Zero Target-Repository Pollution**: Isolate all session CWDs, `.agents/skills`, `.claude/`, and immutable run snapshots inside `$PASEO_HOME/plugin-data/paseo-bots/` via `ensureManagedSessionHome` and `assertInsideManagedDataDir`; NEVER write plugin runtime artifacts into external target code repositories or host global user configs (`assertNotGlobalUserConfig`).
- **Decoupled Asset & Envelope Persistence**: Persist `bots.json` inside the version 4 outer envelope (`{ "version": 4, "values": ... }`) under a 75 KB ceiling while externalizing standing instructions to `souls/<botId>.md`, MCP definitions to `mcp-servers/<id>.json`, and custom artwork out of inline Base64 Data URLs.
- **Dynamic Role-Aware Prompt Assembly**: Synthesize every chat turn's system prompt dynamically at launch (`systemPrompt` -> `promptSections` Blocks 1–6) according to `resolveSessionRole` (`dm | team-lead | team-direct-specialist | dispatched-worker`), keeping main host sessions free of static subagent roster bloat.
- **Host-Deterministic DAG & Lease Settlement**: Enforce DAG topological order (`validateWorkflowDAG`), concurrency fanout caps (`reserveMemberSlot`), cross-process lock safety (`acquireLease` via `O_EXCL` + tombstone rename), and terminal state (`settleTask`) strictly in host code rather than trusting model prose claims.
- **Same-Provider Bounded Resilience**: Restrict automatic model failover (`runWithModelFallback`) to ordered `fallbackModels` within the active provider domain on transient capacity/quota errors, failing fast on auth, permission, or context-overflow faults.

## 2. Architecture Shards Router

| Shard | Scope & Codebase Anchors | Load Trigger |
| :--- | :--- | :--- |
| [01-configuration-and-storage.md](shards/01-configuration-and-storage.md) | Dual-directory layout, 3-way symlinks (`check-paseo-bots-link.mjs`), `bots.json` v4 envelope, decoupled `souls/` & `mcp-servers/`, procedural avatars, zero-pollution guards, direct Zod disk writes | Editing `bots.json`, `shared/bot.ts`, `server/souls.ts`, `server/mcp-servers.ts`, `server/claude-agents.ts`, `server/agy-agents.ts` |
| [02-seat-blackboard-and-prompts.md](shards/02-seat-blackboard-and-prompts.md) | Managed Seat topology (`ensureManagedSessionHome`), `targetProjectDirs` mounts, Session Blackboard (`TASK_MANIFEST.md`, `handoffs/`, `runs/`), `TEAM_SESSION_LABEL`, 6-block role-aware prompt assembly | Editing `server/bot-home.ts`, `server/prompt.ts`, `shared/groups.ts`, `shared/chat.ts`, `server/library.ts`, `server/memory-curator.ts` |
| [03-workflow-engine-and-routing.md](shards/03-workflow-engine-and-routing.md) | 3-tier routing (`resolveStepEngine`: `native`, `paseo-bot`, `run_workflow`), Kahn DAG waves, `<task_brief>` / `<worker_handoff>` / `<repair_brief>`, heartbeat stall/hard timeouts, orphan reconciliation, child chat auto-archival | Editing `shared/workflows.ts`, `server/workflow-runner.ts`, `server/tools/workflows.ts` |
| [04-task-pyramid-and-settlement.md](shards/04-task-pyramid-and-settlement.md) | L1/L2/L3 visibility pyramid, 15 `bots` MCP tools (`BOT_TOOLS`), `O_EXCL` file leases (`leases.ts`), monotonic `TaskRecord` settlement (`tasks.ts`), idempotent `TaskCard` outbox (`task-cards.ts`), `diedMidFlight` & restart recovery (`task-turns.ts`) | Editing `server/tasks.ts`, `server/leases.ts`, `server/task-cards.ts`, `server/task-turns.ts`, `server/tools/` |
| [05-fallback-routines-and-surfaces.md](shards/05-fallback-routines-and-surfaces.md) | Same-provider `runWithModelFallback`, `RoutineScheduler` (`daily/interval/once/cron/webhook`), 2-stage friction analytics (`bot-cleaner` -> `bot-analyst`), `BotsSurface`, `PartnerSettingsModal`, `WorkflowsScreen`, `ProtocolCard`/`TaskCard`, composer pill sandbox | Editing `server/chats.ts`, `server/scheduler.ts`, `server/analytics/`, `client/`, `index.client.tsx` |
| [06-client-ui-and-cds.md](shards/06-client-ui-and-cds.md) | CDS color tokens (`nativeTokens`, `brandClay`, `warmPaper`), single-stroke borders, `tabular-nums`, calibrated springs/easings (`useReduceMotion`), CJK IME (`isImeComposing`) & scroll-pinning (`canPinScrollToEnd`) edge guards | Editing `client/native.ts`, `client/motion.ts`, `client/keyboard.ts`, `client/chat/Stream.tsx`, `client/panel/controls.tsx`, `client/web.ts` |

## 3. Baseline Verification

- Typecheck plugin workspace: `npm --prefix paseo-bots run typecheck`
- Run unit and contract suites: `npm --prefix paseo-bots test`
- Verify host symlink topology: `node scripts/check-paseo-bots-link.mjs --strict`
