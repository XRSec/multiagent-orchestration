---
doc_id: PROJ-INDEX
status: CURRENT
version: 1.1.0
last_verified: 2026-11-21
language: en-US
---

# Project Documentation Router (Micro-Kernel)

Branch router for repository-level topology, engineering philosophy, bot roster, delivery verification, documentation rules, and script/SCM governance. Parent router: [../INDEX.md](../INDEX.md). Root agent charter: [../../AGENTS.md](../../AGENTS.md).

## Global Invariants
- **Dual-Core & Micro-Plugin Production Scope**: Active production runtime comprises dual cores (`paseo-bots/`, `paseo-agy-acp/`) alongside decoupled micro-plugins (`paseo-feed/`, `paseo-long-session/`); `paseo-sidecar/` is `PAUSED / EXPERIMENTAL` and excluded from default execution paths.
- **Host-Enforced Capability & Seat Isolation**: Bot tool grants (`baseTools`), Managed Seats (`$PASEO_HOME`), and task settlement (`settleTask`) are enforced by host TypeScript code rather than prose persuasion.
- **Single Fact Ownership**: Authoritative bot, team, and workflow definitions live in [../../paseo-bots-plugin-settings/bots.json](../../paseo-bots-plugin-settings/bots.json) and source symbols; NEVER hardcode line numbers or user home paths.
- **Machine-First & Safe Operations**: Author internal specs in dense `en-US` (Rule First, no demo code), squash commits before push, and NEVER invoke `rm` or `rm -rf`.

## Shard Routing Table

| Shard | Load Condition (`LOAD_IF`) | Primary Scope |
| :--- | :--- | :--- |
| [shards/01-repository-overview.md](shards/01-repository-overview.md) | Inspecting repo layout, `$PASEO_HOME` symlinks, config/data SSOT, or module status | Dual-core engines (`paseo-bots/`, `paseo-agy-acp/`), micro-plugins (`paseo-feed/`, `paseo-long-session/`), 3-way symlink map, paused `paseo-sidecar/` boundary |
| [shards/02-agent-philosophy.md](shards/02-agent-philosophy.md) | Designing orchestration, prompts, context budgets, caching, or harness adapters | 10 core Agent engineering principles, rejected anti-patterns, and exact TypeScript code anchors |
| [shards/03-bot-fleet-and-teams.md](shards/03-bot-fleet-and-teams.md) | Routing tasks across bots, editing `bots.json`, or running multi-stage workflows | 15-Bot matrix (incl. `bot-chief`), capability mounts, 6 active teams, and 7-stage `wf-moadmin-closed-loop` DAG |
| [shards/04-delivery-and-verification.md](shards/04-delivery-and-verification.md) | Dispatching `<task_brief>`, auditing `<worker_handoff>`, running QA gates, or handling retries | Task lifecycle, MoCI 3-tier verdicts, Vacuity Check, Proof Triad, and 3-round repair cap |
| [shards/05-agent-first-docs-standard.md](shards/05-agent-first-docs-standard.md) | Creating, editing, auditing, or linting any `.md` file, `SKILL.md`, or manifest | `agent-first-docs` axioms, micro-kernel shard topology, `D1`–`D13` rules, read-only lint, same-commit write-back |
| [shards/06-script-and-git-standards.md](shards/06-script-and-git-standards.md) | Writing scripts, hooks, CLI tools, deleting files, or executing Git operations | `<= 500` line budget, complexity `<= 10`, exit codes, Safe Delete invariant, squash-before-push, symlink hooks |

## Progressive Read Rule
Load this router first, select at most the 1–2 shards matching your active task predicate, and jump directly to referenced source symbols when verifying implementation details.
