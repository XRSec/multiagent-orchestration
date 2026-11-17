---
doc_id: DOCS_PROPOSAL_SUBAGENT_ENGINE_TASK_PYRAMID
status: PROPOSED
version: 0.1.0
last_verified: 2026-11-10
language: en-US
name: subagent-engine-pyramid-design
description: PROPOSED dual subagent engines behind one host-owned task pyramid, with engine-scoped tool surfaces. Binds nothing.
type: DOCS_PROPOSAL
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [paseo-agy-acp/server/subagents.ts, paseo-bots/server/tools/bots.ts, paseo-bots/server/chats.ts, paseo-bots/server/relay.ts, paseo-bots/server/handoffs.ts]
---

# [0] ROOT: SUBAGENT ENGINES AND THE TASK PYRAMID (PROPOSED)

## [1] ROUTES
- [1.1] [mechanism](mechanism.md) :: [LOAD_IF: data model, hook points, the three defect fixes, stages, risks]
- [1.2] [rollout](rollout.md) :: [LOAD_IF: P0-P3 slices, acceptance, files per bot]
- [1.3] [sessions](../../sessions.md) :: [LOAD_IF: lane, config-dir, isolation behaviour]
- [1.4] [anti-loop](../../architecture/groupchat/06-anti-loop-defense-and-silent-skip.md) :: [LOAD_IF: why worker text stays out of the group timeline]

## [2] STATUS
- [2.1] **Binds Nothing**: `PROPOSED` ([conventions](../../_conventions.md) [2.8]); a ruling moves rules into leaves plus a `docs/decisions/` entry. Runtime change needs the owners of `paseo-bots/` and `paseo-agy-acp/`.
- [2.2] **Split For Budget**: This leaf holds the design; [1.1] holds the mechanism. Reason: [conventions](../../_conventions.md) [2.2] caps a `DOCS_*` leaf at 8192 B.
- [2.3] **Doc vs Code, Hooks**: `PluginHooks` (`@getpaseo/plugin` `lifecycle.d.ts`) offers `agent.turn.*`, `agent.permission.*`, `agent.archive.after`, `agent.create.*`, `agent.close.after`, `workspace.*`, `worktree.*` and nothing else: no `task.settle`, no bare `agent.archive`. Code wins, so settlement is an in-repo function and a new hook would be a host change outside this repository.
- [2.4] **Doc vs Code, Archived Reads**: `handoffStatus()` (`handoffs.ts`) maps `archivedAt` to `archived`; `readChat()` (`tools/bots.ts`) has no archived branch, so a dead worker reads `idle` with a stale reply ([1.1] [4.3]).

## [3] ENGINE MATRIX
- [3.1] **A, Native**: `invoke_subagent({TypeName, Role, Prompt})` and `send_message`; owner `SubagentRegistry` in `paseo-agy-acp/server/subagents.ts`. `childKey()` gives `` `${sessionId}:child:${nativeId}` ``, a brain-watch entry, not an agent row. `isChildResumable()` holds only while `!killedChildren.has(id)` and the child `isStopping()`; a killed child never returns and the parent turn ending drops the watch. Cheap, single shot, no own context or permission surface.
- [3.2] **B, Bot**: `ask_bot`, `check_chat`, `continueChat()` (`paseo-bots/server/tools/bots.ts`). Handle = a real agent id from `startChat()` (`chats.ts`), whose input already takes `agentId`, `group`, `askedByBotId`. Life: `ref.send(prompt, {messageId, activeTurnBehavior: "steer"})` re-enters the chat with its context; gates are archived, pending permission, running ([1.1] [4.1]). Independent session and context, resumable per work item at the cost of an agent row and a config dir; closes via `agent.turn.after` -> `HandoffNotifications` outbox -> one follow-up turn.
- [3.3] **C, Nested Native**: A native child inside a B chat: B durability, A cheapness. No third path in code; C is A inside B, member `engine` `native` plus `bot_id`, handle = chat id and `nativeId`.
- [3.4] **Selection**: By continuity, not cost. A second instruction later needs B, one answer inside this turn needs A, both needs two members ([5.2]).

## [4] PYRAMID AND INVARIANTS
- [4.1] **Three Layers**: L1 group = what moAdmin sees, one card per state transition (`issued`, `blocked`, `done`), no worker text. L2 task line = one user request, one merged unit, stable `task_id`, full process. L3 worker = any engine, any count within `budget.fanout`, never shared across tasks.
- [4.2] **I1 Worker Text Stays Out**: L3 output never enters the group timeline; the group gets host-composed cards only. A reply loop with card echo is the amplification path in [1.4].
- [4.3] **I2 One Merge Boundary**: The task line is the only merge point; cross-task transfer only through the L1 card (summary plus `task_id`), never shared context.
- [4.4] **I3 Card Budget**: Title, state, conclusion summary at most 800 characters, task line pointer; the blackboard keeps its owner budget.
- [4.5] **I4 Host-Enforced Fan-Out**: `tasks.budget.fanout` caps live members; the host refuses the dispatch and returns the member list. A prompt cannot raise it.
- [4.6] **I5 One Settler**: The host decides terminal state: every member terminal and every acceptance item present. moAdmin speaks last; a model claiming `done` changes nothing.

## [5] ENGINE GRANULARITY
- [5.1] **Conversation Level**: A bot declares `engine: "native" | "bot"`; `relay.mountTools(botId, agentId)` narrows the tool list by it, so an A chat has no `ask_bot` and a B chat has no `invoke_subagent`. Absence of the tool, not a prompt rule; the mount serves routines and handoffs too, so filtering keys on the caller.
- [5.2] **Task Level**: Mixing is allowed, recorded as `engine_reason` on the task card for audit only; a conversation is never locked to one engine.

## [6] NOT DOING
- [6.1] No change to `SubagentRegistry` ownership or `childKey()`, so the `brain-observer` and `brain-projector` projections stand; no cross-host session migration ([1.3] [4.1]).
- [6.2] No second bus: cards are timeline plugin items, task facts are SQLite rows. No model-decided topology: shape, fan-out and terminal state are host facts.

## [7] OPEN QUESTIONS
- [7.1] Is `engine` a bot property or a conversation property? [5.1] assumes the former for the mount surface and lets a task card mix.
- [7.2] Are `acceptance` items free text or closed checks? [4.6] needs machine-checkable items to avoid a model-judged `done`.
