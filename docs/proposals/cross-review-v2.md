---
doc_id: DOCS_PROPOSAL_CROSS_REVIEW_V2
status: PROPOSED
name: cross-review-v2
version: 0.4.0
last_verified: 2026-11-07
language: en-US
description: PROPOSED cross-review ladder: gate, review, binding arbitration, fingerprints and bounds. Binds nothing until an owner ruling.
type: DOCS_PROPOSAL
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/operating-model/review.md, docs/proposals/session-policy.md, docs/axioms/STANDING_ORDER.md, src/daemon/orchestrator/BlackboardOrchestrator.ts, src/daemon/blackboard/blackboardMcp.ts, src/daemon/blackboard/lifecycleHooks.ts, src/daemon/blackboard/types.ts, AGENTS.md]
---

# [0] ROOT: CROSS-REVIEW LADDER V2 (PROPOSED)

## [1] ROUTES
- [1.1] [review](../operating-model/review.md) :: [LOAD_IF: need the rules that bind today and the current code facts]
- [1.2] [session-policy-proposal](session-policy.md) :: [LOAD_IF: need builder resume versus fresh-attempt rules]
- [1.3] [cross-review-v2-changes](cross-review-v2-changes.md) :: [LOAD_IF: need the code changes and doc updates this ladder implies]

## [2] STATUS
- [2.1] **Proposed**: Nothing here is in `src/` or binding. Current rules stay in [review](../operating-model/review.md) until a `docs/decisions/` entry rules on [4] and supersedes them. The attempt rules differ from review [2.5], which caps REVISE rounds only: [3.3] and [3.7.1] add one per-task counter shared by gate failures and verdicts, plus new consuming and non-consuming classes; [3.2] and [3.6] add reviewer independence and party separation.

## [3] PROPOSED RULES
- [3.1] **Three Decisions**: Gate = deterministic script, exit code. Review = read-only LLM verdict. Arbitration = a different role deciding whose defect a dispute or repeat failure is, binding. An LLM verdict never overrides a non-zero gate; a PASS never replaces the gate.
- [3.2] **Parties**: Implementer, acceptance owner (MoCI), reviewer and arbiter differ per task, and the arbiter is not the planner who wrote the order. Reviewer model differs from the implementer's and the arbiter's from both when the pool allows; else record `diversity: NONE` on the verdict and the PR, never block on it.
- [3.3] **Attempt**: One build dispatch; k = attempts consumed so far, cap 3, classes per [3.7.1]. Build = new session in the task worktree from the previous attempt's HEAD; `PRIOR_ATTEMPTS` (gate tail <= 40 lines plus findings) is the only carry-over. The FSM, not a bot, commits after the build, giving `attemptSha`. A build ending without a status change consumes the attempt as `INFRA`.
- [3.4] **Integrity**: Before the gate, with no LLM: a diff touching pinned acceptance paths, compared as canonical lowercase paths, -> REVISE(`SCOPE_VIOLATION`); a diff adding or changing a symlink (git mode `120000`) -> REVISE(`SCOPE_VIOLATION`).
- [3.5] **Gate**: Script in the task worktree asserts `HEAD == attemptSha` and a clean tree, runs the acceptance check, then `pnpm test:e2e` (plus `pnpm web:build` when `src/web` changed), and records `{sha, cmd, exit, tail}`.
- [3.6] **Review**: Only on gate exit 0. Per-role MCP server with only the reviewer projection (no `all`); `persistSession: false`; own config dir, not the live bot's; no `SessionStart` injection, on the live `AgentOrchestrator` path too; Read/Glob/Grep plus the verdict tool, no Bash; cwd = detached worktree at `attemptSha`; reads resolve realpath and are denied outside the worktree root. The implementer summary arrives only as `UNTRUSTED_CLAIMS`.
  - [3.6.1] **PASS Fields**: `diffSha == attemptSha`, `gateRef`, at least 1 claim checked against a file:line or gate output, and `findings[{class, file, text}]`.
  - [3.6.2] **High Risk**: The higher of a planner flag and a path-glob match. 2 blind reviewers (A correctness and tests, B safety, data and ops); any REVISE wins; only a human overturns it.
- [3.7] **Classify**: Failures get one class and fingerprints.
  - [3.7.1] **Failure Classes**: `CODE_DEFECT`, `SCOPE_VIOLATION`, `CLAIM_UNSUPPORTED` and a gate failure consume an attempt. `TEST_DEFECT`, `SPEC_AMBIGUOUS` consume none only when the arbiter confirms them. `ENV_BLOCKER` consumes none and persists `BLOCKED_ENV`; once a human records it cleared, the gate re-runs once on the unchanged `attemptSha`. `INFRA` consumes none for a reviewer or arbiter, one for an implementer.
  - [3.7.2] **Fingerprints**: Tree = `git rev-parse <attemptSha>^{tree}`; 2 consecutive equal = stagnation. Failure = `sha256` of the class plus the sorted, newline-joined failing test ids; else of the last 40 lines (max 8 KB) of the gate tail after linear-time patterns (RE2-style, no nested quantifiers) strip timestamps, durations, hex ids and ports. Review failures use class plus sorted finding file paths, never LLM ids.
- [3.8] **Decide And Arbitrate**: Rules for the FSM step after each gate, review or arbitration.
  - [3.8.1] **Decide**: First match wins. D1 no valid reviewer or arbiter verdict -> rerun that role only, max 2, backoff 30 s then 60 s, then `BLOCKED_INFRA`. D2 `ENV_BLOCKER` -> `BLOCKED_ENV`, `TERM_BLOCK(2)`. D3 gate 0 and all PASS -> merge path. D4 dispute filed or failure fingerprint repeats, arbitrations < 2 and fingerprint not yet arbitrated -> arbitrate. D5 dispute filed, arbitration not allowed -> `BLOCKED_NEED_HUMAN`, `TERM_ESCALATE`. D6 stagnation -> `BLOCKED_NEED_HUMAN`. D7 k >= 3 or wall clock >= cap -> `BLOCKED_NEED_HUMAN` with a snapshot. D8 -> next attempt.
  - [3.8.2] **Arbitration**: Read-only sandbox like [3.6]; input is the attempt SHA, pinned acceptance, gate tail, findings and the implementer's `dispute` as `UNTRUSTED_CLAIMS`. Exactly 1 decision via `post_arbitration`: `CODE_DEFECT` (file:line; findings feed the next build and reviewer; attempt consumed), `TEST_DEFECT` (file:line plus patch text; `TERM_ESCALATE`, MoCI fixes under a new task id, a human re-queues the parent), `SPEC_AMBIGUOUS` (conflicting clauses; planner re-issues under a new id, max 2, then a human), `ENV_BLOCKER` (-> D2). No reviewer-error override; the arbiter never edits files.
  - [3.8.3] **Exits**: 1 task per `executeUserTurn` call. The loop backstop -> `BLOCKED_LOOP_CAP`, never a delivery message. Every `BLOCKED_*` state leaves only via a human `resume` or `abandon`. A full backlog rejects `create_task`.
  - [3.8.4] **Bounds**: Attempts 3, arbitrations 2 per task and 1 per fingerprint, infra reruns 2, stagnation 2, wall clock 60 min, re-issue chain 2. USD caps stay advisory until the SDK cost for gateway models is measured.

## [4] OPEN QUESTIONS
- [4.1] **Merge Target**: `architecture/repository-architecture-overview.md` sets the owner direction: merge `BlackboardOrchestrator` into the live `AgentOrchestrator` spine. Open: is the merged ladder the current 3-tier breaker, with the [review](../operating-model/review.md) [4.2]-[4.3] defects, or [3.8]?
- [4.2] **Models**: Primary tiers differ (QA sonnet, coder opus), but the arbiter shares the implementer's opus tier and every bot falls back to one model ([review](../operating-model/review.md) [4.4.1]). May the arbiter share the implementer's tier, and must [3.2] record `diversity: NONE` when a fallback fires?
- [4.3] **High-Risk List**: Do `src/storage/**`, orchestrator files, auth handling, `docs/` or `AGENTS.md` count beyond delivery-rules [2.6]?
- [4.4] **Arbiter Pool**: Who arbitrates [3.2] when moAdmin plans, MoCI owns acceptance and no read-only bot exists?
- [4.5] **Retry Backoff**: D1 uses 30 s and 60 s; STANDING_ORDER [3.1.3.2] says retry depth <= 2 with 1000 ms backoff. Does a ruling on D1 supersede it for infra reruns?
