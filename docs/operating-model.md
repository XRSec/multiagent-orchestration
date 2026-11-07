---
doc_id: DOCS_OPERATING_MODEL
name: operating-model
version: 1.1.0
description: Binding delivery rules, task lifecycle, role mapping and proof contract. Load when dispatching, gating, reviewing, merging or reporting a task.
type: DOCS_LEAF
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
locale: en-US
verified: 2026-11-07
sources: [AGENTS.md, MEMORY.md, package.json, src/daemon/blackboard/lifecycleHooks.ts, src/daemon/orchestrator/AgentOrchestrator.ts, src/storage/DatabaseSchema.ts, src/daemon/cli.ts, src/daemon/transport/DaemonServer.ts]
---

# [0] ROOT: OPERATING MODEL

## [1] ROUTES
- [1.1] [conventions](_conventions.md) :: [LOAD_IF: the task changes a doc]
- [1.2] [memory](../MEMORY.md) :: [LOAD_IF: storage layout or SQLite files]

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
- [2.8] **Work Hygiene**: Every turn reads, writes, tests or decides; no polling without a state change. Reuse code before writing new code.
  - [2.8.1] **Long Runs**: Run commands over 2 min once, in the background, to a log; commit work as it exists.
  - [2.8.2] **Sub-Agents**: Cap parallel sub-agents at 6-8 per session and pass the model explicitly; judgment roles (dispatch, review) hold rather than silently downgrade.

## [3] TASK LIFECYCLE TREE
- [3.1] **Status**: [3] and [4] are process guidance; no code in `src/` implements task orders, `TERM_*` outcomes or role mapping ([6.5]).
- [3.2] **Order**: moAdmin issues a task order naming Goal, Scope (paths), Forbidden, Deliverables and Acceptance (task-specific check). Any empty field -> `TERM_BLOCK(2)` back to moAdmin.
- [3.3] **Acceptance Check**: MoCI, not the implementer, commits the named check and runs it on the base. It passes untouched -> `TERM_BLOCK(2)`, rewrite acceptance; it fails -> [3.4].
- [3.4] **Build**: The implementer works in its worktree and never edits its task order; scope changes go to moAdmin -> [3.5].
- [3.5] **Gate**: Per [2.4.2], run the [2.4] gate on the committed tree. Non-zero exit -> [3.4] with the output tail and `git log --oneline -5`; a blocker (network, port clash, rate limit, missing secret) -> `TERM_BLOCK(2)`, goal stays open. Exit 0 -> [3.6].
- [3.6] **Review**: Read-only, whole diff first. Claims beyond evidence or a diff touching its own tests -> REVISE to [3.4], at most 3 rounds, then `TERM_ESCALATE`; no verdict means re-run only the review. PASS -> [3.7].
- [3.7] **Merge**: Squash-merge into `main` per [2.4.2] after gate PASS, review PASS and [2.6] approval -> `TERM_OK`. Approval missing -> `TERM_ESCALATE` to a human maintainer.

## [4] ROLE MAPPING
- [4.1] **Owner**: Human maintainers (repo admins) hold approvals, credentials, policy and `docs/decisions/`.
- [4.2] **Planner**: The root session and moAdmin (`bot_moadmin_director_03`, fallback dispatcher per AGENTS.md §4.5) write task orders, not `src/`.
- [4.3] **Implementer**: moCode for code, Mo for skills and bots, MoDeep for research; each reports doc changes under `## Doc update`.
- [4.4] **Test Owner**: MoCI (`bot_moci_sentinel_07`) writes acceptance checks and owns `test/`; its report is not the gate.
- [4.5] **Reviewer**: A read-only review subagent, since no Mo-Bot has a read-only scope.
- [4.6] **Merger**: MoGit (`bot_mogit_scm_05`) prepares the squash; the merge itself follows [3.7].
- [4.7] **Doc Steward**: moDoc (`bot_modoc_scribe_02`) applies `## Doc update` sections in the same merge.
- [4.8] **Standing Orders**: `AGENTS.md` (read via `CLAUDE.md`) and `docs/axioms/STANDING_ORDER.md`; size caps in [conventions](_conventions.md).

## [5] DONE AND PROOF
- [5.1] **Done**: Plans and specs are preparation; a build, fix or connect task is done only when code or config changed and the system works.
- [5.2] **Proof Triad**: A "works" or "ready" claim shows all 3: the diff changed this session; OS listener output with owning PID (`Get-NetTCPConnection -LocalPort 38080 -State Listen` or `netstat -ano | findstr 38080`); an end-to-end call (`GET /health` or WS `invoke` -> `invoke-result`) parsed into data.
  - [5.2.1] **Not Ready**: 401, 403, 502, a login redirect or an empty body. `pnpm gateway:status` (PID, configured `httpPort`) is extra evidence only.
- [5.3] **Self-Audit**: Keep working instead of reporting if an engineering task changed only markdown, a feature lacks code, an endpoint returns 401/403/502, a blocked item is closing, or 1 verified part covers others.
- [5.4] **Report Table**: Final task reports use columns sub-task | metric | baseline | change (paths, lines) | runtime evidence (gate exit code, PID and port, parsed response) | status (plan only, debugging, blocked, done); group-chat turns follow AGENTS.md §4.
- [5.5] **Null Result**: A measured "no improvement" is a valid result.

## [6] DOC VS CODE
- [6.1] **Test Command**: `MEMORY.md` [1.4] names `pnpm test` and `npx vitest run`; `package.json` has neither a `test` script nor `vitest`. Use `pnpm test:e2e`.
- [6.2] **Write Scopes**: AGENTS.md §3 and `Bots/*/SOUL.md` state write scopes; no code in `src/` enforces them, yet they bind.
- [6.3] **Command Guard**: `dangerousCommandGuardHook` (`src/daemon/blackboard/lifecycleHooks.ts`) blocks 5 Bash patterns (`rm -rf /`, `git push --force`, `git reset --hard`, `drop database`, `mkfs`) and Edit/Write to `.env` / `.env.<suffix>` with forward-slash paths; only `src/daemon/orchestrator/BlackboardOrchestrator.ts` attaches it.
- [6.4] **Turn Limit**: `AgentOrchestrator.ts` enforces `maxTurnsPerRound` with default 10; the AGENTS.md §4.4 limit is stored as `max_consecutive_steps` (default 5) in room config but no orchestrator enforces it.
- [6.5] **Gate and Merge**: No script runs the gate and refuses a merge on non-zero exit, and no code checks the [2.6] record; [2.4.2] is manual.
- [6.6] **Stale Leaf**: `dev-rules/ipc-and-sqlite.md` describes Electron IPC and `orchestration.sqlite`; storage truth is `MEMORY.md` [4.1].
