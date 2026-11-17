---
doc_id: DOCS_PROPOSAL_SUBAGENT_ENGINE_TASK_PYRAMID_ROLLOUT
status: PROPOSED
version: 0.1.0
last_verified: 2026-11-10
language: en-US
name: subagent-engine-pyramid-rollout
description: PROPOSED implementation split for the dual-engine task pyramid, one stage per dispatch, with acceptance per stage. Binds nothing.
type: DOCS_PROPOSAL
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/proposals/subagent-engine-pyramid/design.md, docs/proposals/subagent-engine-pyramid/mechanism.md, paseo-bots/server/tools/bots.ts, paseo-bots/server/tasks.ts, paseo-bots/server/relay.ts]
---

# [0] ROOT: IMPLEMENTATION SPLIT (PROPOSED)

## [1] RULES
- [1.1] **One Stage Per Dispatch**: A stage lands as one commit with its own acceptance; moCode implements, MoCI verifies, no stage opens the next.
- [1.2] **No Behaviour Change Without A Stage**: Anything not listed here is out of scope for this proposal, especially `paseo-agy-acp/server/subagents.ts`.
- [1.3] **Design Owners**: [pyramid](design.md) for shape, [mechanism](mechanism.md) for tables and hooks.

## [2] P0, FOUNDATION (moCode)
- [2.1] **Files**: `paseo-bots/shared/handoff.ts` (optional `taskId`, `engine` on `HandoffRequestSchema`), `paseo-bots/server/tasks.ts` (new: schema, `DatabaseSync`, lease, restore).
- [2.2] **Accept**: an old card without `taskId` still parses; a second process cannot hold the same lease; a restart reloads a `running` task.
- [2.3] **Check**: `pnpm -C paseo-bots typecheck && pnpm -C paseo-bots test`.

## [3] P1, REGISTER (moCode)
- [3.1] **Files**: `paseo-bots/server/tasks.ts`, `paseo-bots/server/tools/bots.ts` (`ask_bot` writes the member row), `paseo-bots/server/chats.ts` (pass `group` through the `ask_bot` dispatch), `paseo-bots/server/handoffs.ts` (card carries `taskId`).
- [3.2] **Accept**: a B dispatch lands in the requester's team and `teamsOf()` resolves it; the member row exists before the first `agent.turn.after`; a dispatch over `budget.fanout` is refused and mutates nothing.
- [3.3] **Check**: `pnpm -C paseo-bots test`, plus a manual dispatch against a two-bot team.

## [4] P2, SETTLEMENT (moCode)
- [4.1] **Files**: `paseo-bots/server/tasks.ts` (`settle`, `emitCard`), `paseo-bots/server/handoffs.ts` (extend the `agent.turn.after` hook), `paseo-bots/server/handoff-notifications.ts` (member-status receipt), new `agent.archive.after` registration in `paseo-bots/index.server.ts`.
- [4.2] **Accept**: two concurrent finishes produce one card; an archived member produces one `blocked` card and no `done`; a card carries title, state, summary within 800 characters, `task_id`.
- [4.3] **Check**: `pnpm -C paseo-bots test` with a double-settle case and an archive case.

## [5] P3, TOOL SURFACE AND GATES (moCode, then MoCI)
- [5.1] **Files**: `paseo-bots/server/relay.ts` (`mountTools` filter), `paseo-bots/shared/bot.ts` plus `paseo-bots-plugin-settings/bots.json` (`engine`), `paseo-bots/server/tools/bots.ts` (`continueChat` running gate, `readChat` archived branch).
- [5.2] **Accept**: a native chat has no `ask_bot` in the mounted tool list and a bot chat has no `invoke_subagent`; a steer into a running chat is accepted, a chat under `pendingPermissions` is refused; an archived chat reports `archived`.
- [5.3] **Check**: `pnpm -C paseo-bots typecheck && pnpm -C paseo-bots test`, then the full gate `pnpm -C paseo-agy-acp test` to prove the native engine is untouched.

- [5.4] **P2b, Shipped**: group card appended once per task version, member write-back on `agent.turn.after`, and settlement only from the winning evaluator.

## [6] STOP CONDITIONS
- [6.1] Any stage needing a new `PluginHooks` entry: stop, the change belongs to the Paseo host ([mechanism](mechanism.md) [3.2]).
- [6.2] Any stage needing a `SubagentRegistry` ownership change: stop, the projections break.
- [6.3] A card that cannot be produced idempotently: stop, settlement is the invariant, not the card.
- **P3, shipped**: `open_task` / `list_tasks`, fanout enforced by `reserveMemberSlot()`, cards routed to the team lead's chat, replay refused from `publishedCardIds`.
