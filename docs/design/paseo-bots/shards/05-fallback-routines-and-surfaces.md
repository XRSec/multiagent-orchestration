---
doc_id: PASEO-BOTS-SHARD-05-FALLBACK-ROUTINES-SURFACES
status: CURRENT
version: 1.2.0
last_verified: 2026-11-23
language: en-US
---

# Shard 05: Same-Provider Model Fallback, Routines, Analytics & Client Surfaces

Parent index: [../INDEX.md](../INDEX.md). Governs ordered intra-provider model fallback chains, scheduled and webhook routines (`RoutineScheduler`), two-stage session friction analytics, and React Native / Web client surface contracts.

## 1. Same-Provider Ordered Model Fallback Chain

Confine automatic model failover strictly within the bot's active `provider` domain via `runWithModelFallback` (`paseo-bots/server/chats.ts`) and `startBotChat` / `sendBotMessage` (`paseo-bots/shared/chat.ts`), NEVER switching providers mid-session because native tool catalogs (`AGY_BASE_TOOLS`, `CLAUDE_BASE_TOOLS`, `CODEX_BASE_TOOLS`), approval modes (`modeId`), and session state are incompatible across provider runtimes.

```text
Primary Model (bot.model ?? defaultModel, bot.thinkingOptionId)
  │
  ├── [Success] ──> Return turn / chat result
  │
  └── [Error] ──> isTeamBotEligibleForFallback(bot) && isFallbackEligibleError(err) ?
                    ├── No  ──> Fail-Fast: re-throw original error immediately
                    └── Yes ──> Next deduplicated candidate in bot.fallbackModels[]
                                  ├── switchAgentModel(api, agentId, model, thinkingOptionId)
                                  ├── Emit FallbackEvent warning & retry action
                                  └── All candidates exhausted ──> throw ModelFallbackExhaustedError
```

- **Automation Scope Gate (`isTeamBotEligibleForFallback`)**:
  - Activates automatic failover exclusively when `Array.isArray(bot.fallbackModels) && bot.fallbackModels.length > 0` (`FallbackModelSchema`: `{ model: string, thinkingOptionId: string | null }`).
  - Ordinary non-bot Paseo chats and bots with `fallbackModels: []` never trigger silent model switching.
- **Candidate Deduplication & Multi-Provider Isolation (`resolveCandidateModels`)**:
  - Constructs `[primary, ...fallbackModels]` deduplicated by `(model, thinkingOptionId ?? null)`.
  - Stores secondary provider presets in `bot.providerConfigs` (`BotProviderConfigSchema`), where index `0` mirrors the active provider's top-level fields without cross-provider spillover.
- **In-Place Model Switch & Exhaustion Contract**:
  - On mid-session failover (`sendBotMessage`), `switchAgentModel` updates `modelId` and `thinkingOptionId` on the live session handle (`setModel` / `setAgentModel` / `setAgentThinkingOption`) before resending the message.
  - Exhausting every candidate on eligible errors throws `ModelFallbackExhaustedError` carrying `{ outcome: "exhausted", botId, provider, attemptedModels, lastError }`.

| Error Category (`isFallbackEligibleError` in `paseo-bots/shared/chat.ts`) | Eligible for Next Fallback? | Matched Signatures / HTTP Codes |
| :--- | :--- | :--- |
| Rate Limit & Token Throttling | **Yes** | `429`, `RESOURCE_EXHAUSTED`, `rate_limit`, `too many requests`, `tpm`, `rpm` |
| Quota & Billing Exhaustion | **Yes** | `insufficient_quota`, `usage limit`, `usagelimitexceeded`, `credit balance`, `billing` |
| Upstream Capacity & 5xx Overload | **Yes** | `500`, `502`, `503`, `504`, `529`, `overloaded`, `temporarily unavailable`, `high demand`, `server_error` |
| Model Unavailable / Deprecated | **Yes** | `model_not_found`, `unknown model`, `streamGenerateContent`, model `unavailable` / `not supported` / `deprecated` |
| User / Permission Denial | **No (Fail-Fast)** | `user denied`, `user rejected`, `approval denied`, `approval required`, `permission denied` |
| Context Overflow & Auth / Syntax | **No (Fail-Fast)** | `context overflow`, `context too long`, `prompt too long`, `401` / `403` credentials, schema validation errors |

## 2. Scheduled & Webhook Routine Execution (`RoutineScheduler`)

Execute recurring and webhook-triggered bot jobs in isolated background run chats via `RoutineScheduler` (`paseo-bots/server/scheduler.ts`, wired by `connectSchedulerHost` in `paseo-bots/server/connection.ts`), keeping automated turns separate from interactive operator threads.

| `RoutineScheduleSchema` (`kind`) | Parameters (`paseo-bots/shared/bot.ts`) | Trigger & Execution Semantics |
| :--- | :--- | :--- |
| `"daily"` | `time` (`HH:MM`), optional IANA `timeZone`, `weekdays` (`0..6`, Sunday = `0`) | Fires once per matching weekday at local `HH:MM` (`validTimeZone`) |
| `"interval"` | `minutes` (`5..1440` int) | Fires on fixed minute intervals while `routine.enabled === true` |
| `"once"` | `at` (ISO timestamp string) | Fires a single run at `at` without repeating |
| `"cron"` | `expression` (5-field cron), optional IANA `timeZone` | Evaluates `minute hour day-of-month month day-of-week` in `timeZone` or host local time |
| `"webhook"` | None (invoked via `routineWebhookRpc`) | Appends incoming `WebhookEvent` payload to routine prompt via `runPrompt` |

- **Run Isolation**: Every scheduled or manual trigger (`routineRunNowRpc`) spawns a dedicated chat via `startChat` stamped with `ROUTINE_LABEL = "paseo-bots.routine"`; active runs can be inspected via `routineStatusRpc` or aborted via `routineCancelRunRpc`.
- **Results Thread Projection**: When `routine.resultsChatId` is configured, run completion appends a `ROUTINE_RUN_CARD` item (`RoutineRunCard` in `paseo-bots/client/chat/stream/RoutineRunCard.tsx`) to `resultsChatId` while retaining verbose tool execution logs inside the isolated run chat.
- **Unattended Scheduler Auth Breaker & Backoff (`connectSchedulerHost` in `server/connection.ts`)**: `isAuthConnectionError` inspects error messages and codes against `/password required|unauthorized|4401/i`; on auth faults, the background connector logs once, halts retry timers, and waits passively for `host.onAttach` instead of flooding daemon auth failures. Transient connection failures back off along `TRANSIENT_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000]` via `nextRetryDelayMs`.

## 3. Two-Stage Session Friction Telemetry Pipeline (`analytics/`)

Distill multi-harness conversation history into actionable skill and rule optimizations via `runAnalytics` (`paseo-bots/server/analytics/runner.ts`, `paseo-bots/shared/analytics.ts`), preventing raw multi-megabyte transcripts from overflowing the architect model's context window:

| Pipeline Stage (`input.stage`) | Executor / Module | Input -> Output Contract |
| :--- | :--- | :--- |
| `1. "extract"` | `loadSelectedSessions` (`analytics/sessions.ts`) or `loadHarnessSessions` (`analytics/harnesses.ts`) | Parses turns, tool calls, and `skillsRead` across harnesses within date range -> returns `digest` (`formatDigest`), `sessionCount`, `turnCount`, `byHarness`, `skillsDetected` |
| `2. "clean"` | `cleanInBatches` -> `ANALYTICS_CLEAN_BOT_ID` (`"bot-cleaner"`, `gemini-3.8-flash`) | Packs `formatSessionBlock` items into batches `<= input.maxChars` -> dispatches each batch via `askBot` -> returns concatenated friction summaries (`cleaned`) |
| `3. "analyze"` | `askBot` -> `ANALYTICS_ANALYZE_BOT_ID` (`"bot-analyst"`, `gemini-4-hydrogen`) | Consumes `cleaned` (never raw logs) -> produces execution ROI diagnosis and `AGENTS.md` / `SKILL.md` optimization `report` |

- **Telemetry RPC & History Persistence**: Exposed to the UI via `analyticsSessionsListRpc`, `analyticsRunRpc`, `analyticsHistoryListRpc`, and `analyticsHistoryDeleteRpc`, persisting completed runs through `saveAnalyticsRecord` (`paseo-bots/server/analytics/history.ts`).

## 4. React Native / Web Client Surfaces & Host Sandbox Boundaries

Build all cross-platform views on React Native + Unistyles (`paseo-bots/index.client.tsx`) with `en` / `zh-CN` localization (`paseo-bots/client/i18n/`), adhering strictly to Paseo's plugin extension boundaries:

| Client Surface / Module | File Coordinate | Architectural Role & Reuse Contract |
| :--- | :--- | :--- |
| `BotsSurfaceReady` & `TeamMap` | `paseo-bots/client/BotsSurface.tsx`, `client/BotsSurfaceReady.tsx`, `client/teams/TeamMap.tsx` | Primary workspace coordinating `TeamTabs`, `BotSidebar`, `TeamMap` (`workflowCountsByGroup`, `onOpenTeamWorkflows`, `onStartTeamChat`), `BotFeedPane`, `RoutinesScreen`, and `DataAnalysisPane`, consuming `feedKind`/`feedId`/`teamId`/`groupId`/`scope` deep-link params |
| `PartnerSettingsModal` | `paseo-bots/client/settings/PartnerSettingsModal.tsx` | Dual-row modal selector (Team row + horizontal Bot pill row) embedding `<BotPanel embedded />` (`client/panel/BotPanel.tsx`) so identity, soul, fallback chain, MCP/skills, and routines share one editor |
| `WorkflowsScreen` | `paseo-bots/client/WorkflowsScreen.tsx`, `client/settings/WorkflowEditor.tsx` | Top-level `WorkflowsRoute` (without redundant `BackBar`; all hooks unconditional before early returns), `WorkflowListEditor` (`onRunWorkflow`), inline `workflowRunRpc` goal runner, `TaskStageModal` drilldown, and team `Feed`/`Team Chat`/`Teams` quick links |
| `BotFeedPane` | `paseo-bots/client/BotFeedPane.tsx`, `server/feed-bridge.ts`, `shared/feed-view.ts` | Renders unified `index.jsonl` + read-only legacy channel merge (`readMergedBotFeed`), classifies `"workflow"` before `"delegated"` (`classifySource`), projects `workflowTaskId`/`workflowId`/`workflowStageId`/`workflowStageName` badges/pills, clears stale entries immediately on partner/filter switch, pins default-latest scroll (`canPinScrollToEnd`, `scrollWebListToEnd`, `watchWebListSize`) with `loadOlder` anchor restore, re-pins on `keyboardHeight` open with `flexShrink: 0` composer containment, and exposes header jumps (`onOpenActiveChat`, `onOpenWorkflows`, `onOpenTeam`) |
| `ProtocolCard` | `paseo-bots/client/chat/stream/ProtocolCard.tsx` | Renders `<task_brief>`, `<repair_brief>`, `<worker_protocol>`, and `<worker_handoff>` (segmented by `transformUserProtocolCards` / `transformAssistantProtocolCards` in `shared/protocol-cards.ts`) as localized (`en` / `zh-CN`) collapsible cards |
| `TaskCardView` & Stream Cards | `paseo-bots/client/chat/stream/TaskCard.tsx` | Renders L1 task and live DAG progress cards (`TASK_CARD`) with `onOpenTeamFeed` (`groupId`) and `onOpenSourceChat` (`sourceChatId`) quick links, alongside `HandoffCard`, `InteractionCard`, `ProposalCard`, `RoutineRunCard`, and `NativeConnectCard` |
| `PaseoSidebar`, `screen-navigation` & `BotLauncherPopover` | `paseo-bots/index.client.tsx`, `client/PaseoSidebar.tsx`, `client/screen-navigation.ts`, `client/navigation.ts` | Registers 3 sidebar pillars (`Bots`, `Team`, `Workflow` alongside `paseo-feed`'s `Feed`), deep-link helpers (`BOT_SCREENS`, `teamsScreen`, `workflowsScreen(scope?)`, `feedScreen(kind, id, title?)`, `teamChatScreen(groupId)`), `BotLauncherPopover` pills (`addComposerPill`), and `navigateToAgentChat` (`navigation.openAgent`) |

- **Unified `agent.open.before` Lifecycle & CLI Dispatch (`bot-lifecycle.ts`, `mcp-oauth-lifecycle.ts`, `paseo-chief-dispatch.mjs`)**: `registerBotSessionLifecycle` owns the sole `agent.open.before` hook (merging `oauthProxy` server mounts while `registerMcpOAuthLifecycle` passes `{ registerOpenHook: false }` to handle `agent.permission.before` exclusively), mounting `bots`/`composio` MCP and `PASEO_AGY_BOT_PROMPT_FILE` (`ensureAgyPromptFile` -> `resolveEffectiveSystemPrompt`) only when `LIFECYCLE_MOUNT_LABEL === "true"`. Official headless inspection and `bot-chief` dispatch run through `scripts/paseo-chief-dispatch.mjs`.
- **Agent Slash Commands (`/learn`, `/remember`, `/feed`, `/team`, `/workflows`)**: Registered in `paseo-bots/index.client.tsx` (`LEARN_COMMAND`, `REMEMBER_COMMAND` from `paseo-bots/shared/skills.ts` plus `/feed`, `/team`, `/workflows` deep-link routes) with `context: "agent"` inside Paseo's native agent view.
- **MCP OAuth Proxy & App Sign-In Cards (`McpOAuthProxy`, `NativeConnectCard`)**: `registerMcpOAuthLifecycle` (`paseo-bots/server/mcp-oauth-lifecycle.ts`, `McpOAuth`, `McpOAuthProxy`) brokers OAuth token exchange (`mcpOAuthStartRpc` / `mcpOAuthFinishRpc` / `mcpOAuthStatusRpc` / `mcpOAuthDisconnectRpc`), while Composio toolkit sign-ins render inline via `APP_SIGN_IN_CARD` (`NativeConnectCard` in `paseo-bots/client/chat/stream/ConnectCard.tsx`).

## 5. Conformance Matrix

| Requirement | Primary Anchor | Verification Command |
| :--- | :--- | :--- |
| Same-provider fallback & `isFallbackEligibleError` | `paseo-bots/shared/chat.ts`, `paseo-bots/server/chats.ts`, `runWithModelFallback` | `npm --prefix paseo-bots test -- shared/chat server/chats` |
| 5-mode `RoutineScheduler` & webhook dispatch | `paseo-bots/server/scheduler.ts`, `RoutineScheduleSchema` | `npm --prefix paseo-bots test -- scheduler` |
| 2-stage `bot-cleaner` -> `bot-analyst` pipeline | `paseo-bots/server/analytics/runner.ts`, `runAnalytics` | `npm --prefix paseo-bots test -- analytics` |
| Client TSX surfaces & protocol card segmentation | `paseo-bots/index.client.tsx`, `paseo-bots/shared/protocol-cards.ts` | `npm --prefix paseo-bots run typecheck && npm --prefix paseo-bots test -- protocol-cards` |
