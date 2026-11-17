---
doc_id: DOCS_OM_DOC_VS_CODE
status: CURRENT
name: doc-vs-code
version: 1.4.0
last_verified: 2026-11-07
language: en-US
description: Known doc-vs-code and doc-vs-doc gaps no topic leaf owns. Load when a doc claim conflicts with code or another doc.
type: DOCS_LEAF
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [MEMORY.md, PROJECT.md, package.json, Customizations/AGENTS.md, Customizations/agents/moAdmin/capabilities.json, src/daemon/blackboard/lifecycleHooks.ts, src/daemon/blackboard/BlackboardStore.ts, src/storage/DatabaseSchema.ts, src/storage/Paths.ts, src/daemon/orchestrator/AgentOrchestrator.ts, test/e2e/run-all-e2e.ts, docs/architecture/]
---

# [0] ROOT: DOC VS CODE

## [1] ROUTES
- [1.1] [review](review.md) :: [LOAD_IF: the gap concerns the review ladder, or cross-review code]
- [1.2] [sessions](../sessions.md) :: [LOAD_IF: the gap concerns sessions, step or round limits, config dirs or bot isolation]
- [1.3] [conventions](../_conventions.md) :: [LOAD_IF: fixing a gap means editing a doc]

## [2] DOC VS CODE
- [2.1] **Test Command**: `MEMORY.md` [1.4] names `pnpm test` and `npx vitest run`; `package.json` has neither a `test` script nor `vitest`. Use `pnpm test:e2e`.
  - [2.1.1] **Standalone Tests**: `test/session-lifecycle-rewind-compaction.test.ts`, `test/provider-config-cindy-flow.test.ts`, `test/blackboard-atomic.test.ts` and `test/daemon.test.ts` run via `npx tsx <file>`, outside `pnpm test:e2e`; a task touching them names that command as its acceptance check.
- [2.2] **Write Scopes**: AGENTS.md §3 and `Bots/*/SOUL.md` state write scopes; no code in `src/` enforces them, yet they bind ([conventions](../_conventions.md) [3.4]).
- [2.3] **Command Guard**: `dangerousCommandGuardHook` (`src/daemon/blackboard/lifecycleHooks.ts`) blocks 5 Bash patterns (`rm -rf /`, `git push --force`, `git reset --hard`, `drop database`, `mkfs`) and Edit/Write to `.env` / `.env.<suffix>` with forward-slash paths; `BlackboardOrchestrator` and `AgentOrchestrator` (every live daemon bot runner) attach it; the web session and bot chat routes do not.
- [2.4] **Round And Step Limits**: Owned by [sessions](../sessions.md) [6.1] and [6.5].
- [2.5] **Gate and Merge**: No script runs the gate and refuses a merge on non-zero exit, and no code checks the [delivery-rules](delivery-rules.md) [2.6] record; delivery-rules [2.4.2] is manual.
- [2.6] **Storage Claims**: Docs that describe storage the code does not have.
  - [2.6.1] **Stale Leaf**: `dev-rules/ipc-and-sqlite.md` describes Electron IPC and `orchestration.sqlite`; storage truth is `MEMORY.md` [4.1].
  - [2.6.2] **Blackboard DB Path**: `MEMORY.md` [4.1] and `UPDATE.md` [2.1] place it at `data/blackboard_ssot.db`, the `BlackboardStore` default, which only the dormant `BlackboardOrchestrator` uses. The live `AgentOrchestrator` opens a separate `<storageDir>/blackboard_ssot.db`. `architecture/repository-architecture-overview.md` says the daemon path uses no blackboard store and names a `.claude` DB fallback; neither holds.
  - [2.6.5] **Room Step Cap**: `architecture/repository-architecture-overview.md` §3.1 says `AgentOrchestrator` ignores `rooms.max_consecutive_steps`; `handleChat` now caps at `min(maxTurnsPerRound, rooms.max_consecutive_steps)` ([sessions](../sessions.md) [6.1]).
  - [2.6.3] **Phantom Tables**: `MEMORY.md` [4.1] lists `session_leases`, `idempotency_keys`, `bot_sessions` and `event_journal`; `src/storage/DatabaseSchema.ts` creates none of them and no code in `src/` names them.
  - [2.6.4] **Transcripts**: `PROJECT.md` F18 lists `storage/transcripts/{sessionId}.jsonl` persistence under a done milestone, and `architecture/paseo-architecture-and-claude-agent-sdk-integration.md` repeats it; no code in `src/` writes it (`Paths.ts` only names a directory in a comment).
- [2.7] **Model Fallback**: Bot primaries in `capabilities.json` match `MEMORY.md` [3.1]; REA (not a Mo-Bot) is `gemini-3.8-flash` first, and every bot falls back to it, so a fallback run loses model diversity.
- [2.8] **Lifecycle Spec Scenario 6**: The spec marks room blackboard rollback on rewind as target; `AgentOrchestrator` already calls `rollbackStateBefore`, a full latest-snapshot restore. The `SessionStart` hook fires on every start source, not only `compact`. Client-id and preview gaps: [sessions](../sessions.md) [6.7].

## [3] DOC VS DOC
- [3.1] **Two Directive Copies**: Root `AGENTS.md` and `Customizations/AGENTS.md` differ (the latter has no §6 docs route); bots read the latter ([sessions](../sessions.md) [3.7]).
- [3.2] **Parent Nodes**: `dev-rules/*.md` and `claude-managed-agents/README.md` set `parent_node: ../../AGENTS.md`, not their directory route; they are routed from [dev-rules](../dev-rules/INDEX.md) and [docs-index](../INDEX.md).
- [3.3] **Name Collision**: `dev-rules/orchestrator-mcp.md` and `protocols/orchestrator-mcp.md` share a basename.
- [3.4] **Vendored Links**: `claude-managed-agents/*` links point at upstream site-absolute paths; they are exempt from the relative-link check.
- [3.5] **Reviewer Role**: `architecture/multi-agent-linkage-reference-study.md` maps reviewer to MoCI with no gap; [roles](roles.md) [2.5] binds a read-only review subagent. Its L5 and owner X4 (reviewer never the author, different tier) are compatible with [cross-review-proposal](../proposals/cross-review-v2.md) [3.2].
- [3.6] **Catalogue Gap**: `docs/README.md` lists no `DOCS_*` doc (this tree, `sessions.md`, `_conventions.md`, `proposals/*`, branch `INDEX.md` files) and does not link `INDEX.md`; until the owner adds them, a `DOCS_*` doc's status lives in its front matter ([conventions](../_conventions.md) [2.3.3]).
