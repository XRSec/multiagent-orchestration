---
doc_id: DOCS_PROPOSAL_SUBAGENT_ENGINE_TASK_PYRAMID_CARDS
status: PROPOSED
version: 0.1.0
last_verified: 2026-11-10
language: en-US
name: subagent-engine-pyramid-cards
description: PROPOSED group card contract, landing rule, idempotency and flush for the dual-engine pyramid. Binds nothing.
type: DOCS_PROPOSAL
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [paseo-bots/server/task-cards.ts, paseo-bots/shared/task-card.ts, paseo-bots/server/task-turns.ts, paseo-bots/server/tasks.ts]
---

# [0] ROOT: GROUP CARDS (PROPOSED)

## [7] GROUP CARDS
- [7.1] **Contract**: `paseo-bots/shared/task-card.ts` declares `TASK_CARD = {kind: "task-card", version: 1}` and the payload `{taskId, title, status, summary <= 800 chars, memberCount, engines[], settledAt, version}`. Self-contained: a pruned task file can neither strand an old card nor invite a resend.
- [7.2] **Landing**: the team lead's newest unarchived chat, resolved through `paseo.agents.list()` and confirmed against the team with `primaryGroupForBot()`, so a partner-to-partner dispatch still lands on the lead's overview; the requester chat is the fallback when the lead has no chat, and a chat outside the team gets no card. The resolved destination is stored as `cardAgentId` and reused, so a routing change cannot split one card across two chats.
- [7.3] **Append Only**: `paseo-bots/server/task-cards.ts` appends `{type: "plugin", id: task-card:<taskId>:<version>, kind, data}` and never sends, so a card starts no turn. The append id is the idempotency key, but a projected entry carries no `id` (only `type`, `pluginId`, `kind`, `version`, `data`), so the tail-200 window lookup matches `kind` plus `data.taskId` and `data.version` (receipts: `data.taskId` + `data.handleId`); a shape anomaly or a card outside the window reads as absent and is appended once.
- [7.4] **Winner Publishes**: only the caller that got `settled: true` from `evaluateTask()` publishes, so two concurrent evaluators still produce one card. `publishedCardIds` on the record (last 8) is checked before the timeline window, so a replay is refused even after 200 entries moved past the card; bookkeeping writes (`cardAgentId`, `publishedCardIds`) keep the version, because the card id is derived from it.
- [7.5] **Turn Write-Back**: `paseo-bots/server/task-turns.ts` extends `agent.turn.after` and maps `chatStateOf()` (shared with `handoffStatus()`) to a member status: finished to done, permission and archived to blocked, error to failed; then the evaluator settles. A failure is logged, never fails the turn.
- [7.6] **Card Failure**: a card is queued under `plugin-data/task-cards/` before the append and removed after it; a failed append keeps the entry for the next flush (attach, turn end, timer). The terminal state never rolls back: the state is a fact, the card its projection.
- [7.7] **Quiet Bookkeeping**: `open_task` and `list_tasks` sit in `QUIET_TOOLS` (`paseo-bots/shared/bot-tools.ts`), so the host creates and rewrites task files with no approval prompt. This is the first precedent for a silent host write: its boundary is bookkeeping only, meaning no dispatch, no timeline entry and no card, and it is reusable only for state that stays invisible until a later, already-gated action.
- [7.8] **Settle Preconditions**: three phases in this order. An `issued` or `running` member holds the line. A `blocked_permission` member also holds it and publishes nothing, because a permission wait is not terminal: settling it would publish a `blocked` card and later a `done` card, two opposite verdicts on one task. Otherwise a `blocked_dead`, `failed` or `dead` member settles the line as `blocked`, and a line with none of those settles `done`. A native member holds the line only while it is still open (`issued` or `running`), which the first phase already covers; a native member its parent turn reported terminal is evidence and never blocks ([native](native.md)). The card summary is a raw tally of these states, never a translation into prose: the host does not explain the line for the model.
- [7.9] **Member Receipts**: a dead member gets one `task-member` receipt on the task line, never in the group, because the group carries one merged verdict per task and two messages would explain one task twice. Contract: [archive](archive.md) [3].
