---
doc_id: DOCS-ROUTER
status: CURRENT
version: 3.0.0
last_verified: 2026-11-18
language: en-US
---

# Documentation Router (Micro-Kernel)

Agent-first read-path router for `multiagent-orchestration`. Follow progressive disclosure: load the branch `INDEX.md` matching your task, then read only the specific shard needed. Full status catalogue: [README.md](README.md).

## Core Invariants
- **Internal Plane**: Author all docs, specs, skills, and manifests in dense `en-US` (Rule First + 1-line reason, zero demo code). Reply to the user in `zh-CN`.
- **Active Scope**: Production runtime comprises `paseo-bots/` and `paseo-agy-acp/`. `paseo-sidecar/` is `PAUSED / EXPERIMENTAL`.
- **Single Fact Owner**: Config defaults live in `paseo-bots-plugin-settings/bots.json` and source symbols; never hardcode line numbers or user home paths.

## 1. Project Documentation (`project/`)
Branch router: [project/INDEX.md](project/INDEX.md)
- [project/shards/01-repository-overview.md](project/shards/01-repository-overview.md) — Active dual-core layout, `$PASEO_HOME` symlinks, module boundaries.
- [project/shards/02-agent-philosophy.md](project/shards/02-agent-philosophy.md) — 10 core Agent engineering principles & code anchors.
- [project/shards/03-bot-fleet-and-teams.md](project/shards/03-bot-fleet-and-teams.md) — 14-Bot roster, tool-mount matrix, 6 teams, `wf-moadmin-closed-loop` DAG.
- [project/shards/04-delivery-and-verification.md](project/shards/04-delivery-and-verification.md) — Task lifecycle, `<task_brief>`/`<worker_handoff>`, Vacuity Check, Proof Triad.
- [project/shards/05-agent-first-docs-standard.md](project/shards/05-agent-first-docs-standard.md) — `agent-first-docs` rules, micro-kernel shard topology, D1–D13 lint, write-back.
- [project/shards/06-script-and-git-standards.md](project/shards/06-script-and-git-standards.md) — Script line/complexity budgets, exit codes, Safe Delete, Git squash & hooks.

## 2. Design Documentation (`design/`)
Branch router: [design/INDEX.md](design/INDEX.md)
- **Antigravity ACP Bridge** ([design/paseo-agy-acp/INDEX.md](design/paseo-agy-acp/INDEX.md)) — Dual-plane `.system_generated` Brain observer, Reactive Wakeup guard, 120s/600s watchdogs, `turn-journal`, SQLite `step_type=17` inspection, child subagents, Shadow-Git/native fork revert, `Steer` (`Interrupt & Replace`) vs `Queue`.
- **Paseo Bots Plugin** ([design/paseo-bots/INDEX.md](design/paseo-bots/INDEX.md)) — `bots.json` v4 & decoupled `souls`/`mcp-servers`, Managed Seats & Session Blackboard, 6-block role prompts, 3-tier router & Kahn Workflow DAG, L1–L3 Task Pyramid & file leases, same-provider model fallback, Routines, Analytics, RN surfaces.
- **Cross-Runtime Agent Patterns** ([design/patterns/INDEX.md](design/patterns/INDEX.md)) — Context Rot & compaction, Prompt Cache Byte-0 immutability & instruction budget, monotonic `lastSeenSequence` & `NO_REPLY` anti-loop, blackboard token slicing & 3-tier arbitration ladder, multi-agent ROI & progressive memory.

## 3. Research & External References
- [research/INDEX.md](research/INDEX.md) — 17 source-anchored technical audits, ACP peer surveys (`t3code`, `magpie`), and Paseo host recon reports.
- [references/INDEX.md](references/INDEX.md) — Upstream Paseo read-only docs (`paseo-upstream/`), Anthropic Managed Agents (`claude-managed-agents/`), and official Claude Subagents reference.
