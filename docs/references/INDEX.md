---
doc_id: DOCS-REFERENCES-INDEX
status: REFERENCE
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# External & Upstream References Router (Micro-Kernel)

Parent router: [../INDEX.md](../INDEX.md). Read-only snapshots of upstream host documentation and vendor multi-agent specifications. Upstream-relative links inside vendored directories are preserved verbatim and do not bind repository code.

## 1. Upstream Paseo Host Documentation (`paseo-upstream/`)
Synced from the upstream Paseo monorepo for host SDK, UI, daemon, and provider reference when developing `paseo-bots` and `paseo-agy-acp`:
- [paseo-upstream/CLAUDE.md](paseo-upstream/CLAUDE.md) — Upstream Paseo engineering index and convention map.
- [paseo-upstream/architecture.md](paseo-upstream/architecture.md) — Upstream Paseo server/daemon/client architecture.
- [paseo-upstream/plugins.md](paseo-upstream/plugins.md) — Paseo plugin SDK, lifecycle hooks, RPC, and client surface APIs.
- [paseo-upstream/providers.md](paseo-upstream/providers.md) — Provider adapter contracts and ACP host integration.
- [paseo-upstream/agent-lifecycle.md](paseo-upstream/agent-lifecycle.md) — Host agent lifecycle, idle cleanup, and stream state.
- [paseo-upstream/data-model.md](paseo-upstream/data-model.md) — Paseo timeline, session, and workspace data model.

## 2. Vendor Multi-Agent Specifications
- [claude-subagents-official.md](claude-subagents-official.md) — Official Claude Code custom subagent frontmatter, tool scoping, and `omitClaudeMd` reference.
- [claude-managed-agents/README.md](claude-managed-agents/README.md) — Anthropic Managed Agents & Dreams reference (`01-multiagent-orchestration` through `05-dreams`) with architecture mapping to `paseo-bots` and `paseo-agy-acp`.
