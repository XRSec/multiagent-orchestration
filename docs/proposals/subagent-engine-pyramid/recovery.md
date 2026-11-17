---
doc_id: DOCS_PROPOSAL_SUBAGENT_ENGINE_TASK_PYRAMID_RECOVERY
status: PROPOSED
version: 0.1.0
last_verified: 2026-11-17
language: en-US
name: subagent-engine-pyramid-recovery
description: PROPOSED restart recovery and settled-file pruning for the task register. Binds nothing.
type: DOCS_PROPOSAL
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [paseo-bots/server/task-turns.ts, paseo-bots/server/tasks.ts, paseo-bots/server/leases.ts]
---

# [0] ROOT: RESTART RECOVERY AND PRUNING (PROPOSED)

## [1] PROBLEM

A restart drops the turn that would have closed a member. The line then stays `running` for ever, settles nothing, and publishes no card, so the wedge is silent. Settled files also accumulate: `pruneSettled()` had no caller, so `tasks/` only grew.

## [2] RECOVERY RULE

`recoverInterrupted(host, paseo)` in `paseo-bots/server/task-turns.ts` reads engines, never timelines.

- [2.1] **Scope**: every task with no `settledAt`; a settled line is never touched, byte for byte.
- [2.2] **Live turn**: an `issued`/`running` member whose agent is present, unarchived, error-free and `running` or `initializing` is left alone. Its own `agent.turn.after` closes it; closing it here would settle work still in flight.
- [2.3] **Death**: a member whose agent is missing or archived becomes `blocked_dead`, an agent carrying `lastError` becomes `failed`; an agent present and clean becomes `done`, because a lost closing turn is the only remaining explanation.
- [2.4] **Parked member**: `blocked_permission` is closed only when the agent is gone or archived. While the agent exists the approval can still arrive, and the evaluator treats a wait as open ([cards](cards.md) [7.8]).
- [2.5] **Native member**: one without a `handleId` is skipped. Its parent turn owns the writeback ([native](native.md) [3]).
- [2.6] **Failure isolation**: one unreadable or busy line logs and skips; the rest of the folder still recovers. Each member gets exactly one `upsertMember`, then the existing `settleAndPublish` decides, so recovery cannot invent a second card.

## [3] TRIGGER

- [3.1] **Attach, once**: `registerTaskTurns` latches a flag before the first await and runs recovery from `host.onAttach`, so a repeated attach or an immediate replay does not run it twice.
- [3.2] **Never at import**: importing the module runs no recovery, otherwise tests and CLI paths would touch a real folder.
- [3.3] **Afterwards**: `pruneSettled()` once, then a 6 h timer with `unref()`. The settle window itself stays in `PRUNE_SETTLED_MS` ([mechanism](mechanism.md) [2.x]); the timer only decides when to look.

## [4] KNOWN GAPS

- [4.1] **Native orphan**: a parent that dies before its writeback leaves a handle-less native member open for ever; recovery skips it by design, and nothing else closes it.
- [4.2] **Prune window**: 7 days is fixed. A longer-lived audit need would have to read cards rather than task files, since cards are self-contained ([cards](cards.md) [7.1]).
