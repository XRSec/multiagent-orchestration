---
doc_id: DOCS_PROPOSAL_SESSION_POLICY
status: PROPOSED
version: 0.4.0
last_verified: 2026-11-07
language: en-US
name: session-policy
description: PROPOSED lane, lock, loop-bound, resume-guard and abort rules on top of the owner lifecycle spec. Binds nothing.
type: DOCS_PROPOSAL
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/sessions.md, docs/architecture/, src/daemon/orchestrator/, src/daemon/blackboard/lifecycleHooks.ts, src/storage/, src/web/server/controllers/, MEMORY.md]
---

# [0] ROOT: SESSION POLICY (PROPOSED)

## [1] ROUTES
- [1.1] [lifecycle-spec](../architecture/session-lifecycle-compaction-and-rewind-specs.md) :: [LOAD_IF: owner design for resume, rewind, fork, compaction, crash recovery; it wins over this file]
- [1.2] [efficiency-catalog](../architecture/collaboration-efficiency-and-cache-memory-optimization.md) :: [LOAD_IF: owner items C1, P2, M4, X3, X4 cited here]
- [1.3] [sessions](../sessions.md) :: [LOAD_IF: need current behaviour and the isolation matrix]
- [1.4] [cross-review-proposal](cross-review-v2.md) :: [LOAD_IF: need reviewer and arbiter session rules or the attempt counter]

## [2] STATUS
- [2.1] **Superseded By Owner**: Resume by explicit id, invalid-resume recovery with handoff, runner cache per scope, abort via `interrupt()` and crash detection ship with the owner's lifecycle spec; they are dropped here.
- [2.2] **Remaining**: [3.1] lane key, [3.2] lock, [3.4], [3.5], [4.1]-[4.3], [5], [7]. Runtime bots only, not the owner's developer sessions. A ruling moves accepted rules into [sessions](../sessions.md) with the code.

## [3] PROPOSED INVARIANTS
- [3.1] **Lane Key**: Code resumes per room `sessions` row, shared by all bots in the room ([sessions](../sessions.md) [3.2]). Proposed: one lane per bot (`chat:<botId>:<room.id>`, `dm:<botId>:<directSessionId>`), and the canonical `room.id` for messages, cursors and sandboxes too.
- [3.2] **One Run Per Config Dir**: A cross-process lock allows 1 running `query()` per bot config dir; other lanes queue. Reason: several processes run orchestrators, two web routes build runners, and one runner accepts 2 concurrent turns ([sessions](../sessions.md) [4.6]). Aligned with owner X3 leases.
  - [3.2.1] **Lease**: Preferred: a lease row in `orchestrator.db`, created by `INSERT OR IGNORE` with own holder (1 row inserted = held), taken over by `UPDATE` where `expires_at<now`, renewed by `UPDATE` where `holder` matches, heartbeat < 1/3 TTL; 0 rows updated means not held, and a run whose renewal updates 0 rows stops.
  - [3.2.2] **File Fallback**: `<configDir>/.run.lock` created with `O_EXCL` holding host, PID, nonce and expiry, renewed like [3.2.1]. Stale takeover: atomic `rename` to a unique tombstone (a failed rename means another process won), then `O_EXCL` create, then re-read and run only if it holds own nonce; never delete a lock in place. PID liveness frees a lock only on the same host; across hosts only expiry does.
- [3.3] **Durability**: Superseded by lifecycle-spec invariants 3 and 7 and scenario 7. Gap: a DM's visible rows are empty, so its handoff is empty ([sessions](../sessions.md) [3.8]).
- [3.4] **Throwaway Judges**: Reviewers, distillers and scribes start new with `persistSession: false` and get no builder narrative; compatible with owner X4.
- [3.5] **Loop Units**: The host counts executed bot replies, threads included; only an authenticated human message resets a counter, not the client `role` field. SDK `maxTurns` stays a separate per-run cap. Owner M4 proposes a token budget plus novelty check instead ([6.6]).
  - [3.5.1] **Steps**: `max_consecutive_steps` caps one relay chain, each bot reply triggered by another bot's reply adding 1; `MEMORY.md` [3.2] tier 1.
  - [3.5.2] **Round**: `max_turns_per_round` caps all bot replies in the room since the last human message, across chains and `collaborate` fan-out.
  - [3.5.3] **Task**: AGENTS.md §4.4 stays a per-task checkpoint and never counts chat replies; inside a task the attempt cap of [review](../operating-model/review.md) [2.5] also applies.

## [4] PROPOSED CHAT CHANGES
- [4.1] **Prompt Layout**: Withdrawn: fresh sessions with `persistSession: false` (they would disable the owner's resume and rewind). Kept: apply owner C1 and P2 on the resumed session: system prompt = stable parts only; user prompt = `GROUP_MEMORY.md` tail (<= 4096 B; none for DMs), then the delta since the cursor (<= 20 messages or 8192 B; code: 30 x 600 code points), then the new message.
- [4.2] **Fixes**: Advance the cursor in the reply-insert transaction; store `result.result`; give DMs their own `session_id`; delete the `mcp.json` write and the canned replies; set `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`; stop fabricating replies and tool calls in the web and bot chat routes; guard concurrent turns per runner; settle Primary CWD and update AGENTS.md and `MEMORY.md` in the same change. Done by owner: the discarded `getDeltaMessages` call.
- [4.3] **Resume Guard**: On top of the owner's unconditional resume, start new with a handoff when the fingerprint changes, for example after `setRoute` swaps the model (owner cache doc: a model switch invalidates the cache).
  - [4.3.1] **Fingerprint**: Lane key, model, cwd, config dir, stable-prompt hash, MCP set, tools, permission mode, hook set, `settingSources`, CLI version, and a hash of the env allowlist (provider base URL and auth scope id, never secret values).

## [5] PROPOSED TASK LANES
- [5.1] **Scope**: Only if `BlackboardOrchestrator` is wired; [cross-review-proposal](cross-review-v2.md) [3.3] gives the competing always-fresh rule and [6.1] decides.
- [5.2] **Build**: New builder session in worktree `<task>-a1`, own config dir.
- [5.3] **Rework**: k = attempts consumed ([cross-review-proposal](cross-review-v2.md) [3.3], classes per its [3.7.1]); cap 3. After a failed attempt with k = 1 -> resume the same builder if the fingerprint matches and the worktree holds only its commits, prompt = verdict or gate tail <= 2 KB. k = 2 or a failed precondition -> new session with `PRIOR_ATTEMPTS`. k = 3 -> `TERM_ESCALATE`.
- [5.4] **Infra**: Bound and end state per [cross-review-proposal](cross-review-v2.md) [3.7.1], [3.8.1] D1 and [3.8.4]; each re-run starts a new session from the committed HEAD.

## [6] OPEN QUESTIONS
- [6.1] **Affinity**: Resume the builder for attempt 2 then fresh, or always fresh per attempt as the cross-review proposal says?
- [6.2] **DM Memory**: Should a DM see any room memory?
- [6.3] **Cwd**: AGENTS.md §3 Primary CWD, or the sandbox layout?
- [6.4] **Transcript Mirror**: The owner treats SDK JSONL as the transcript; is a `PROJECT.md` F18 host mirror still needed, or is the claim removed?
- [6.5] **Lane Granularity**: One `sessions` row per room (code) or per bot per room ([3.1])?
- [6.6] **Loop Bound**: Fixed counters ([3.5]) or owner M4 token budget plus novelty?

## [7] PROPOSED CODE CHANGES
- [7.1] **PR 1**: Loop units [3.5] and canonical room id in `AgentOrchestrator.handleChat` and `StorageManager.addMessage`; stop `createRoom` overwriting tracked `groups/` files, or seed rooms from `room.json`.
- [7.2] **PR 2**: [4.1]-[4.2] in `RuntimeEnvironment.assembleTurnContext` and `AgentOrchestrator.handleChat`, on the resumed session.
- [7.3] **PR 3**: Abort by exact scope or a `runId` registry instead of substring match. Crash handling follows lifecycle-spec scenario 3 (offer resume or dismiss); no automatic re-queue.
- [7.4] **PR 4**: The [3.2] lock; env allowlist instead of `SENSITIVE_ENV_VARS_TO_STRIP`; no project-root mount for chat-only bots; a write-scope check extending `dangerousCommandGuardHook`; call or delete `validateBotIsolation`.
- [7.5] **PR 5**: [3.1] lane key and [4.3] guard after [6.5]; task lanes after [6.1].
- [7.6] **Acceptance**: Each fails on base first: bot-to-bot replies stop at the step cap without a human; slug and id share one cursor; a DM never enters another bot's delta; `agent:abort` stops only its target in < 2 s; 2 bots in one room never resume each other's id; 2 orchestrator processes sending to one bot never overlap its runs; the first chat on an empty DB leaves tracked `groups/` files unchanged.
