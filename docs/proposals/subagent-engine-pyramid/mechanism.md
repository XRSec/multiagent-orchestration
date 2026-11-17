---
doc_id: DOCS_PROPOSAL_SUBAGENT_ENGINE_TASK_PYRAMID_MECHANISM
status: PROPOSED
version: 0.1.0
last_verified: 2026-11-10
language: en-US
name: subagent-engine-pyramid-mechanism
description: PROPOSED task register, hook points, defect fixes, stages and risks for the dual-engine pyramid. Binds nothing.
type: DOCS_PROPOSAL
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [paseo-bots/server/handoffs.ts, paseo-bots/server/handoff-notifications.ts, paseo-bots/server/tools/bots.ts, paseo-bots/server/chats.ts, paseo-bots/shared/handoff.ts, paseo-agy-acp/server/agy-fork.ts, docs/proposals/session-policy.md]
---

# [0] ROOT: TASK REGISTER MECHANISM (PROPOSED)

## [1] ROUTES
- [1.1] [pyramid](design.md) :: [LOAD_IF: engines, layers, the five invariants, engine granularity]
- [1.2] [cards](cards.md) :: [LOAD_IF: card contract, landing rule, idempotency or flush]
- [1.3] [rollout](rollout.md) :: [LOAD_IF: P0-P3 slices, acceptance, files per bot]
- [1.4] [session-policy](../session-policy.md) :: [LOAD_IF: lease row semantics reused in [2.3]]

## [2] DATA MODEL
- [2.1] **Store**: The shipped `paseo-bots/server/tasks.ts` keeps task facts in JSON files under `pluginDataPath()/tasks/`, written with `atomicWrite()`. Reason: this package has no SQLite driver and adding one is out of scope; `node:sqlite` belongs to `paseo-agy-acp`.
- [2.2] **Layout, Shipped**: `tasks/<taskId>.json` holds `{taskId, groupId?, title, status, acceptance?, budget?, version, createdAt, updatedAt, settledAt, members[]}`, members inline as `{engine, botId?, handleId?, status, updatedAt}` and deduped by `handleId`. One file per task, so a settle rewrites one small file. A task id must match `^[A-Za-z0-9._-]{1,120}$` or it is percent-encoded, so it cannot escape the folder, and every write is re-read to prove the version survived.
- [2.3] **Lease, Shipped**: `paseo-bots/server/leases.ts` keeps `leases/<sha256(chatId)>.lock` with `{holder, nonce, expiresAt}` and a 120 s TTL: O_EXCL create, take over only after expiry by renaming the old lock to a tombstone, creating again and reading back a matching nonce, renew only on a matching nonce, release only this process's own nonce. Semantics: [1.4] [3.2.1]/[3.2.2].
- [2.4] **Restore**: recovered once per process on attach; a live turn is left alone, a gone agent is dead. Rules: [recovery](recovery.md) [2].
- [2.5] **Ownership**: `groupId` comes from `startChat({group})`, so `teamsOf()` resolves the team without a second registry.
- [2.6] **Bookkeeping Writes**: `cardAgentId` and `publishedCardIds` are written without bumping `version`, because a card id is `task-card:<taskId>:<version>`; a bump would turn a queued card into a new one that was never sent. The last 8 ids pair with the 200-entry window.

## [3] HOOK POINTS
- [3.1] **agent.turn.after (exists)**: Registered by `registerHandoffs` (`handoffs.ts`). Extend it to write member status, then ask the settler; the notification path stays as is.
- [3.2] **task.settle (in-repo, Shipped As `settleTask`)**: the task lease is taken, the file re-read, and a record that already has `settledAt` is returned untouched with `settled: false`; only a task without `settledAt` is written, at `version + 1`. The lock, not a SQL predicate, is what makes this idempotent. `upsertMember` stamps `updatedAt`, bumps the version and refuses a caller `expectedVersion` below the stored one. Not an SDK hook ([1.1] [2.3]).
- [3.3] **agent.archive.after, Shipped**: an archive is closure, so only a member that died mid-flight becomes `blocked_dead` with a task-line receipt; every archive then settles, and a settled line is skipped. Detail: [archive](archive.md).
- [3.6] **Native Members, Shipped**: engine-A children are read from the parent turn's tool calls and closed in the same callback with no open row left behind. Detail: [native](native.md).
- [3.4] **Card Emission**: Reuse `publishHandoff()`'s shape, `timeline.append({type: "plugin", id, kind, version, data})` with `kind: "task-card"` on the group agent. No second bus.
- [3.5] **Slot Reservation, Shipped**: `reserveMemberSlot()` decides under the task lease and returns three states: `accepted` with the record, `{reason: "fanout", inFlight, cap}`, and `{reason: "settled", record}`. A settled line returns rather than throws, so the dispatcher sees the refusal; `ask_bot` words it without creating a placeholder member or sending. `inFlightMembers()` counts `ACTIVE_MEMBER_STATUSES`: a permission wait holds its slot, a finished or dead member frees it.

## [4] KNOWN DEFECTS AND FIXES
- [4.1] **Running Gate Contradicts Steer, FIXED**: `continueChat()` threw on a running turn and then sent with `activeTurnBehavior: "steer"`, forcing the polling the transport already replaces. Fixed in `6040d8a00b`: a running or initializing chat accepts the steer and the call reports `appended` or `failed` with its message id, while a missing chat, foreign ownership and `pendingPermissions` still block.
- [4.2] **Lock Does Not Cross Processes, FIXED**: the process-local `continuing` set dies with the process. Fixed in `bc686f0243`: `acquireLease()` holds the lock in a file, so a restart or a second host cannot append to the same chat; the set is a fast path only.
- [4.3] **Archived Fails Silently, FIXED**: `handoffStatus()` mapped `archivedAt` to `archived` while `readChat()` had no archived branch, so a dead worker read `idle` and returned the previous turn as its current answer. Fixed in the same commit `6040d8a00b`: `readChat()` checks `agent.archivedAt` before permissions and running, returns state `archived` with `reply: ""` before any timeline read, `describeChat()` names the state and points to a new dispatch, and the handoff card can carry `archived`.
- [4.4] **ask_bot Blocks 50s**: `ASK_WAIT_MS = 50_000` inside an MCP call whose client budget is about 60s. Under a task, B dispatches async and returns the handle; the task barrier settles, not the tool call. `wait` stays for single-shot use.
- [4.5] **Schema Compatibility**: `HandoffRequestSchema` carries optional `taskId`/`engine`; a card without `taskId` degrades to an independent dispatch.

## [5] STAGES
- [5.1] **P0, Shipped**: optional `taskId`/`engine` in `handoff.ts`, `leases.ts`, and the `tasks.ts` API.
- [5.2] **P1, Shipped**: `ask_bot` writes the task line and its member when `task_id` is given, reserving the slot before the chat exists and rekeying it onto the chat the host assigned.
- [5.3] **P2, Shipped**: membership write on `agent.turn.after`, settle idempotence, and card emission through [cards](cards.md) [7].
- [5.4] **P3, Shipped**: the model-facing `open_task` / `list_tasks` (`tools/tasks.ts`), the `reserveMemberSlot()` gate, and lead landing through `agents.list()`.
- [5.5] **P3.1, Shipped**: settled lines refuse dispatch with a reason, `open_task` validates `group_id` before writing, listings report partners in flight, and settlement waits while an engine-A member has no observable handle ([cards](cards.md) [7.8]).
- [5.6] **P3.2a, Shipped**: members split into `blocked_permission` and `blocked_dead`, the pre-split `blocked` normalised on read in `parseRecord()` and never written again; `ACTIVE_MEMBER_STATUSES` becomes `issued`, `running`, `blocked_permission`; `evaluateTask()` holds on a permission wait ([cards](cards.md) [7.8]).
- [5.7] **P3.2b, Shipped**: `agent.archive.after` writes the member dead, appends one task-line receipt and settles ([archive](archive.md)).
- [5.8] **P3.3, Open**: `mountTools` engine filtering, `budget.steps` enforcement, and the engine-A member write-back.

## [6] RISKS
- [6.1] **Settlement Race**: Only the lock-rechecked read in [3.2] prevents two hooks settling one task into two cards.
- [6.2] **Card Amplification**: One card per task per state, and `blocked` only once the last live member is terminal.
- [6.3] **Dead Handle Drift**: [2.4] resolves on start; an unresolved handle is never settled `done`.
- [6.4] **Lease Authorises Nothing**: The lock serialises an append, not the append's landing before the worker's current turn. Delivery is only ever the verdict in [refs](refs.md) [1.2]; identity proof is in [2.3], and a failed put-back throws.
