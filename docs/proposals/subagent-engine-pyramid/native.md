---
doc_id: DOCS_PROPOSAL_SUBAGENT_ENGINE_PYRAMID_NATIVE
status: PROPOSED
version: 0.1.0
last_verified: 2026-11-10
language: en-US
name: subagent-engine-pyramid-native
description: PROPOSED engine-A member write-back from the parent turn, its granularity and its limits. Binds nothing.
type: DOCS_PROPOSAL
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [paseo-bots/server/task-turns.ts, paseo-bots/server/tasks.ts, paseo-agy-acp/server/subagents.ts]
---

# [0] ROOT: NATIVE MEMBERS (PROPOSED)

## [1] ROUTES
- [1.1] [archive](archive.md) :: [LOAD_IF: closure versus death for a bot member]
- [1.2] [mechanism](mechanism.md) :: [LOAD_IF: the task record and the settle order]

## [2] OBSERVATION
- [2.1] **Source**: the parent chat's `agent.turn.after` reads its own timeline tail and keeps the tool calls after the last `user_message`, the same turn boundary as `lastTurn()`. A call counts when its `name` contains `invoke_subagent`, so a provider prefix does not hide it. Arguments come from `detail.input`, and only when `detail.type` is `unknown` (`@getpaseo/plugin` `dist/server/provider.d.ts`, `ProviderToolCallDetail`); a rendered detail such as `shell` or `plan` carries none, and a malformed one is treated as absent rather than thrown. The entry has no top-level `input`, so an implementation that reads one silently attributes every child to the parent bot: a fixture that puts `input` on the entry hides exactly that bug.
- [2.2] **Who Acts**: `TypeName` from the call's input is matched against the bot roster by id or name; an unknown name falls back to the parent chat's own bot. The roster is read through `host.bots()`, never hard-coded.
- [2.3] **Granularity**: a handle-less member's key is `native:<botId>`, so several children of one bot merge into one row on purpose. Parent-level evidence cannot separate them, and an invented count would be worse than a coarse one. Per-child identity needs a cross-package read of `SubagentRegistry` and is explicitly out of scope.

## [3] CLOSURE
- [3.1] **Same Callback**: an AGY child cannot outlive its parent turn, so the observation and the terminal state are written in one write: `done`, or `failed` when the turn carried `agent.lastError`. No `issued`/`running` row may survive the callback, because an open native member holds the line forever.
- [3.2] **Why One Write**: writing `issued` first and closing it afterwards would create a window in which the line is wedged by our own rule, and a crash between the two writes would leave that window permanent. One write has no window.
- [3.3] **No Diagnosis**: the child's status is the parent turn's evidence, not a verdict on which child failed. Attribution stays open.
- [3.4] **Order**: bot member first, native members second, settle last, so one evaluation sees the complete fact. A settled line is skipped entirely.

## [4] SLOTS AND GUARDS
- [4.1] **Instant Slot**: a native member is terminal in the same callback, so it occupies a fanout slot only momentarily. Do not special-case `native` out of `ACTIVE_MEMBER_STATUSES`: the state is honest, the duration is the point.
- [4.2] **The Guard Reads Open, Not Native**: settlement holds when any member is `issued` or `running`, which already covers a native child that nobody closed. The earlier rule "any handle-less native member blocks" was removed, because it would also block a child the parent turn had already reported terminal.
- [4.3] **Wedge Risk Stated**: if a future writer records a native member without closing it, the line hangs silently instead of settling early. That failure is harder to find than a wrong card, so a native write is always a write of a terminal state.
