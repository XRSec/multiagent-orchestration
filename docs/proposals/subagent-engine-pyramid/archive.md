---
doc_id: DOCS_PROPOSAL_SUBAGENT_ENGINE_PYRAMID_ARCHIVE
status: PROPOSED
version: 0.1.0
last_verified: 2026-11-10
language: en-US
name: subagent-engine-pyramid-archive
description: PROPOSED member archive write-back, its task-line receipt and the state migration. Binds nothing.
type: DOCS_PROPOSAL
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [paseo-bots/server/task-turns.ts, paseo-bots/server/task-cards.ts, paseo-bots/shared/task-member.ts, paseo-bots/server/tasks.ts]
---

# [0] ROOT: MEMBER DEATH AND RECEIPTS (PROPOSED)

## [1] ROUTES
- [1.1] [mechanism](mechanism.md) :: [LOAD_IF: task record, slot reservation, settle order]
- [1.2] [cards](cards.md) :: [LOAD_IF: group card contract and settle preconditions]

## [2] WRITE-BACK
- [2.1] **Hook**: `paseo-bots/server/task-turns.ts` listens on `agent.archive.after` (`{agent, archivedAt}`) beside its `agent.turn.after` listener. No new hook name, no new file, and the listener is disposed with the others.
- [2.2] **Order**: the member is written `blocked_dead` first, the receipt second, the settle third. The record is what other readers trust, so a failed receipt must never lose the fact; the whole callback is wrapped and only logs, because an archive must not fail on bookkeeping.
- [2.3] **Closure Or Death**: an archive is a close, not a verdict. `diedMidFlight()` decides from the member record and the archived chat, never from the event type, which carries only `{agent, archivedAt}`.
- [2.4] **Decision Table**:
  - terminal member (`done`, `blocked_dead`, `dead`, `failed`) and no error: closure, state untouched, no receipt, settle only.
  - `issued` or `running`: death, so `blocked_dead` plus one receipt, and the line settles `blocked`.
  - `blocked_permission`: death, because nobody is left to approve, so `blocked_dead` plus one receipt.
  - any state with a non-empty `agent.lastError`: death, because an error outweighs an optimistic terminal state.
  - no member for that handle: settle only.
- [2.5] **Counterexample**: `daemon.autoArchiveAfterMerge` is enabled on this host and its reach into bot chats is unverified, so an archive can be routine housekeeping. Reading every archive as a death would publish a `blocked` verdict for a partner that had already delivered.
- [2.3] **Settled Lines Are Closed**: a task with `settledAt` is skipped, so a late archive neither rewrites its members nor appends a receipt.

## [3] RECEIPT
- [3.1] **Contract**: `paseo-bots/shared/task-member.ts` declares `TASK_MEMBER_CARD = {kind: "task-member", version: 1}` and `{taskId, handleId, botId?, status: "blocked_dead", at}`, with id `task-member:<taskId>:<handleId>` as the idempotency key: a member dies once per task.
- [3.2] **Landing**: the task's requester chat, from `handoffRequest()`, appended and never sent, so it starts no turn. Without a requester the member is still written and only the receipt is skipped.
- [3.3] **Why Not The Group**: a member dying is process, and the group holds one merged verdict per task; a receipt there would sit beside the later `blocked` card as two messages explaining one task.
- [3.4] **Window**: the idempotency read covers the last 200 entries rather than the group card's long window, because a receipt carries no budget and happens once, so a busy day is the real horizon. A lost receipt is accepted: the task fact survives, only the projection is missing.

## [4] MIGRATION
- [4.1] **Old `blocked`**: `parseRecord()` maps it to `blocked_dead`. That is safe because this host had no task files when the split shipped, not because the two states are equivalent; a file found later needs human judgement.
- [4.2] **Write-Time Migration**: the normalisation happens in place, so the next write of that record persists the new value. Reads never rewrite a file, writes always do, which is intended.
- [3.5] **What It Says**: the receipt means the member's chat was archived while its task was still open. It is not a judgement of the partner's work, and nothing else about the run is asserted.
