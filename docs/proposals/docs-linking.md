---
doc_id: DOCS_PROPOSAL_DOCS_LINKING
status: PROPOSED
name: docs-linking
version: 0.3.0
last_verified: 2026-11-07
language: en-US
description: PROPOSED doc layers, precedence, bot doc routing and a docs check. Binds nothing until an owner ruling.
type: DOCS_PROPOSAL
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/_conventions.md, docs/INDEX.md, docs/README.md, docs/standards/documentation-standards.md, AGENTS.md, src/storage/RuntimeEnvironment.ts, src/daemon/orchestrator/BlackboardOrchestrator.ts, src/daemon/orchestrator/ClaudeSdkRunner.ts]
---

# [0] ROOT: DOCS LINKING (PROPOSED)

## [1] ROUTES
- [1.1] [conventions](../_conventions.md) :: [LOAD_IF: need the rules that bind today, including the fact-owner registry]
- [1.2] [doc-standards](../standards/documentation-standards.md) :: [LOAD_IF: need the owner's D1-D13 rules and lint, which win over this file]
- [1.3] [session-policy-proposal](session-policy.md) :: [LOAD_IF: need where the memory tail and delta go in the prompt, or the resume fingerprint]

## [2] STATUS
- [2.1] **Done Already**: Branch `INDEX.md` files for `operating-model/`, `architecture/`, `dev-rules/`, `protocols/`, `reviews/` and `proposals/`; the fact-owner registry and byte definitions in conventions; the branch-hop read path.
- [2.2] **Proposed**: Everything in [3]-[5]; nothing here binds.

## [3] PROPOSED RULES
- [3.1] **Layers**: L0 root `AGENTS.md` (<= 6144 B); L1 `docs/README.md` (owner catalogue and status) plus `docs/INDEX.md` (router) plus a branch INDEX only for 3 or more children; L2 leaves (<= 8192 B); L3 evidence (specs, `reviews/`, `PROJECT.md`, `TEST_*.md`, `UPDATE.md`, `architecture.md`) read only through a cited section; vendored `claude-managed-agents/**` exempt by path; runtime state (`GROUP_MEMORY.md`, `claude_config/**`, `*.db`) never routed.
- [3.2] **Reachability**: Every tracked doc is reachable from `AGENTS.md` by links; its `parent_node` is its directory INDEX.
- [3.3] **Evidence Owns Nothing**: When a leaf needs a fact found only in L3, the leaf takes it over and cites the section.
- [3.4] **Two Precedence Axes**: What the system does: code/config > leaves > L3. What it should do: decisions > AGENTS.md > documentation-standards > STANDING_ORDER (format only) > leaves > `SOUL.md` > charter. A gap between them is a doc-vs-code entry, not a precedence win.
- [3.5] **Doc Gap**: When no leaf answers within the read path, add `## Doc gap: <question>` to the report; gaps are queued for a human, deduplicated, never auto-dispatched.

## [4] PROPOSED BOT ROUTING
- [4.1] **One Assembler**: Both orchestrators build prompts through `RuntimeEnvironment.assembleTurnContext`. System prompt, stable blocks only, in order: generated preamble (bot id, absolute `docs/INDEX.md` path, read rule), root `AGENTS.md`, `SOUL.md` (persona only), charter. The `GROUP_MEMORY.md` tail (<= 4096 B, cut at a line, with a truncation marker) and the blackboard go in the user prompt, as [session-policy-proposal](session-policy.md) [4.1] and owner C1 say, so memory appends never change the stable-prompt hash.
- [4.2] **Caps At Merge**: Byte caps are checked at merge time; at runtime the assembler only logs bytes per block, never refuses a run. The preset and the runner `systemPrompt` sit outside the cap.

## [5] PROPOSED CODE CHANGES
- [5.1] **Real CLAUDE.md**: Replace the `CLAUDE.md` symlink with a file importing `AGENTS.md`, after verifying the import loads in a live session. First in order: checkouts without symlink support load only a stub today ([conventions](../_conventions.md) [2.2.2]).
- [5.2] **Root Directives**: `RuntimeEnvironment.assembleTurnContext` reads root `AGENTS.md`, not `Customizations/AGENTS.md`.
- [5.3] **Blackboard Prompts**: `BlackboardOrchestrator` role runs use the assembler plus a role suffix instead of fixed one-line prompts.
- [5.4] **Docs Check**: Extend the owner's Lint (documentation-standards, D13 dead links included) with checks it lacks, run in the gate: byte caps for routing docs, reachability, `parent_node`, duplicate basenames.
- [5.5] **Ports**: Unify the `38080` literals behind `DaemonServer` `httpPort` and `MO_GATEWAY_URL`.
- [5.6] **Runtime Files**: Ignore and untrack committed `claude_config/**` runtime files after owner approval.

## [6] OPEN QUESTIONS
- [6.1] **Wording**: Language is settled by D11 (en-US specs, no mixing inside a section); open: zh-CN in charters, conventions wording over STANDING_ORDER [1.3], Node [2] holds rules in leaves?
- [6.2] **Canonical Trees**: `Customizations/agents/` canonical and `Bots/` legacy? Repo `groups/` canonical over `Customizations/group/`?
- [6.3] **Global Pipeline**: Keep only the [roles](../operating-model/roles.md) [3] name map, or scope the owner's personal pipeline out of this repo?
- [6.4] **Root Evidence Files**: Leave `PROJECT.md`, `TEST_*.md` and `UPDATE.md` at the root, or move them under `docs/`?
