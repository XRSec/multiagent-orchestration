---
doc_id: DOCS_OM_ROLES
status: CURRENT
name: roles
version: 1.4.0
last_verified: 2026-11-07
language: en-US
description: Who plays each delivery role, the per-task separation rule and a pipeline name map. Load when assigning work.
type: DOCS_LEAF
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [AGENTS.md, src/storage/RuntimeEnvironment.ts]
---

# [0] ROOT: ROLE MAPPING

## [1] ROUTES
- [1.1] [task-lifecycle](task-lifecycle.md) :: [LOAD_IF: need the stage a role acts in]
- [1.2] [review](review.md) :: [LOAD_IF: need the reviewer procedure or dispute path]
- [1.3] [sessions](../sessions.md) :: [LOAD_IF: need how a role's agent session starts or is isolated]

## [2] ROLES
- [2.1] **Owner**: Human maintainers (repo admins) hold approvals, credentials, policy and `docs/decisions/`.
- [2.2] **Planner**: The root session and moAdmin (`bot_moadmin_director_03`, fallback dispatcher per AGENTS.md §4.5) write task orders, not `src/`.
- [2.3] **Implementer**: moCode for code, Mo for skills and bots, MoDeep for research; each reports doc changes under `## Doc update`.
- [2.4] **Test Owner**: MoCI (`bot_moci_sentinel_07`) writes acceptance checks and owns `test/`; its report is not the gate.
- [2.5] **Reviewer**: A read-only review subagent, since no Mo-Bot has a read-only scope.
- [2.6] **Merger**: MoGit (`bot_mogit_scm_05`) prepares the squash; the merge itself follows [task-lifecycle](task-lifecycle.md) [2.7].
- [2.7] **Doc Steward**: moDoc (`bot_modoc_scribe_02`) applies `## Doc update` sections in the same merge.
- [2.8] **Disputes**: No arbiter role exists; disputes go to a human maintainer ([review](review.md) [3.2]).

## [3] PIPELINE NAME MAP
- [3.1] **Scope**: The owner's personal builder/reviewer/verifier/committer pipeline governs developer sessions outside this repo's text; this map translates names only and decides no precedence.
- [3.2] **Builder**: Implementer [2.3].
- [3.3] **Reviewer**: Reviewer [2.5], procedure in [review](review.md).
- [3.4] **Verifier**: The gate runner of [delivery-rules](delivery-rules.md) [2.4.2], not an LLM verdict.
- [3.5] **Committer**: Merger [2.6] plus the human approval of delivery-rules [2.6].
- [3.6] **Orchestrator**: Planner [2.2].

## [4] DIRECTIVE FILES
- [4.1] **Standing Orders**: `AGENTS.md` and `docs/axioms/STANDING_ORDER.md`; size caps in [conventions](../_conventions.md). Interactive sessions load `AGENTS.md` through `CLAUDE.md` only where the checkout keeps the symlink; elsewhere `CLAUDE.md` is a stub or router ([conventions](../_conventions.md) [2.2.2]). Daemon bots get `Customizations/AGENTS.md` injected instead ([sessions](../sessions.md) [3.7]).
