---
doc_id: DOCS_OM_DELIVERY_RULES
status: CURRENT
name: delivery-rules
version: 1.4.0
last_verified: 2026-11-07
language: en-US
description: Binding rules on facts, secrets, branches, the gate, acceptance integrity, approvals, scope and hygiene. Load before dispatching, gating or merging.
type: DOCS_LEAF
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [AGENTS.md, package.json]
---

# [0] ROOT: DELIVERY RULES

## [1] ROUTES
- [1.1] [operating-model](INDEX.md) :: [LOAD_IF: need lifecycle, review, roles or proof instead]
- [1.2] [review](review.md) :: [LOAD_IF: need the review or cross-review procedure behind the gate and approval rules]

## [2] BINDING RULES
- [2.1] **Facts**: State a number only with the command run this session and its raw output; never estimate, quote errors verbatim.
- [2.2] **Secrets**: Secrets live only in `.env` or the runtime store, never in argv, prompts, docs or commits; a bot never uses or prints secrets outside its slice.
- [2.3] **Branches**: Never commit to `main` directly; 1 task = 1 branch in `.agents/worktrees/<task>` with the smallest correct change. Squash before push (AGENTS.md §1.8); undo with `git revert`.
  - [2.3.1] **Ids**: Retry blocked work under a new task and branch name.
- [2.4] **Gate Decides**: The gate exit code on the committed tree decides done, not the implementer's report. Gate: the task's own acceptance check, then `pnpm test:e2e` (plus `pnpm web:build` when `src/web` changed) as regression.
  - [2.4.1] **No Proxy PASS**: Judge by the real gate, not a narrower test; never re-run it on unchanged code.
  - [2.4.2] **Deterministic Hands**: A deterministic script or a human maintainer runs the gate and the merge, never an LLM's message. Until that script exists, the merger runs the gate itself and attaches raw output (command, exit code, last lines); relayed results do not count.
- [2.5] **Acceptance Integrity**: An implementer never weakens, deletes or rewrites the tests or gate config judging its change; test changes go through MoCI and review.
  - [2.5.1] **Vacuity**: Confirm the task's acceptance check fails on the base before the change; one that passes untouched proves nothing. The regression suite is exempt.
  - [2.5.2] **No Fake Pass**: Tests never assert outputs copied from the implementation; mocks and dry runs are smoke tests, not results.
- [2.6] **Approvals**: Merge to `main` or release needs a human maintainer's approval on the GitHub pull request (review or merge by an admin); no bot output or bot-postable chat counts. Release, data migration and rewriting pushed history need 2 independent review PASSes and the most conservative verdict wins; squashing unpushed commits (AGENTS.md §1.8) is excluded.
- [2.7] **Scope**: Bots act only inside the approved plan and their AGENTS.md §3 write scope; ideas outside it are questions, not tasks. Escalate to a human maintainer for credentials, money, logins, policy, missing approval and the AGENTS.md §1.2, §1.5 and §4.4 checkpoints.
- [2.8] **Work Hygiene**: Every step reads, writes, tests or decides; no polling without a state change. Reuse code before writing new code.
  - [2.8.1] **Long Runs**: Run commands over 2 min once, in the background, to a log; commit work as it exists.
  - [2.8.2] **Sub-Agents**: Cap parallel sub-agents at 6-8 per session and pass the model explicitly; judgment roles (dispatch, review) hold rather than silently downgrade.
