---
doc_id: SPEC-PARTNER-CONTRACT-LEGACY
status: HISTORICAL
version: 1.0.0
last_verified: 2026-11-10
language: en-US
description: Legacy "Folder-as-an-Agent" directory layout specification. Superseded by agent-definition-specification.md.
superseded_by: agent-definition-specification.md
---

# Specification: "Folder-as-an-Agent" (Partner Contract)

> **HISTORICAL NOTICE (2026-11-10)**: This document describes the legacy multi-file partner contract (`partners/<id>/manifest.json`, `SOUL.md`, `capabilities.json`). It has been **superseded** by the Claude Code native sub-agent specification: [agent-definition-specification.md](agent-definition-specification.md). The runtime maintains backward compatibility for legacy directories via `StorageManager.buildBotRecordFromLegacyDir()`.

## 1. Principle of Encapsulation

Every digital persona or tool-specialist agent is defined strictly as an isolated directory within the filesystem. All identity assets, tool definitions, execution policies, and long-term memory shards must reside within this boundary.

---

## 2. Directory Layout and File Invariants

```text
partners/<partner_id>/
├── SOUL.md                 # System persona, core domain scope, prohibitions
├── CLAUDE.md               # Operational workflows and command parameters
├── mcp.json                # Partner-exclusive Model Context Protocol server configuration
├── manifest.json           # Host UI metadata, tool whitelist, model specifications
├── .claude/
│   ├── settings.json       # PreToolUse hook configuration and local permission overrides
│   └── skills/             # Modular reusable Standard Operating Procedures (SKILL.md)
│       └── <skill_name>/
│           └── SKILL.md
├── memories/               # Dual-write memory sharding
│   ├── MEMORY.md           # Primary index file (first 200 lines / 25KB auto-injected)
│   └── topics/*.md         # Categorized deep domain memory shards
└── workspace/              # Sandboxed scratchpad for file operations
```

---

## 3. Component Specifications

### 3.1 `manifest.json` (Host Registration Contract)
The host reads `manifest.json` on startup to register the partner into the UI roster and Lead Coordinator catalog:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PartnerManifest",
  "type": "object",
  "required": ["id", "name", "model", "summary_for_lead", "allowed_tools"],
  "properties": {
    "id": { "type": "string" },
    "name": { "type": "string" },
    "avatar": { "type": "string" },
    "model": { "type": "string", "default": "claude-sonnet-4-6" },
    "summary_for_lead": { 
      "type": "string",
      "description": "High-density summary of domain expertise for the Lead Coordinator's dispatch decisions"
    },
    "allowed_tools": {
      "type": "array",
      "items": { "type": "string" },
      "description": "CLI tool whitelist (e.g., Read, Edit, mcp__rea__*, Bash(r2 *))"
    },
    "stateless_by_default": { "type": "boolean", "default": true }
  }
}
```

### 3.2 Memory Ingestion & Dual-Write Architecture
1. **Auto-Injection**: On every spawn, the host inspects `memories/MEMORY.md`. If present, the first 200 lines (or $\le 25\text{KB}$) are injected into the agent prompt.
2. **Subagent Self-Update**: The partner's `SOUL.md` directs the model to use `Edit` or `Write` on `memories/MEMORY.md` whenever new permanent rules, edge cases, or corrections occur.
3. **Human In-The-Loop (HITL) Curation**: The host UI provides a direct Markdown editor bound to `memories/MEMORY.md`. Human edits take effect instantly on the subsequent run without requiring model retraining or prompt recompilation.

---

### 3.3 Frontend Component SSOT & Default Model Binding
1. **Unified Creation Form**: `BotProfileCreateForm.tsx` serves as the Single Source of Truth (SSOT) across both full-screen guided companion onboarding view and modal dialog (`0` duplicated form implementations).
2. **Dynamic Model Synchronization**: Companion onboarding form dynamically binds to the workspace default model via `useSyncExternalStore` (`0` hardcoded model desynchronization).
3. **Anti-Flicker Store Hydration**: `hydrateFromDatabase()` in `botStore.ts` acquires an in-flight promise lock during SQLite hydration, eliminating false-empty companion lists in renderer views.

---

### 3.4 Ghost Skill Projection Boundary & Dev CSP
1. **Cold-Start Skill Projection**: Skill projection across account boundaries enforces `isGhostSkillProjectionBoundaryStableForOwner` with exponential backoff retry (`max_retries: 3`, factor: `1.5`) and post-commit hook `skillsPostCommitStep` in `authManager`.
2. **Dev CSP Compliance**: Development Content Security Policy (`DEV_CSP`) is injected via `devCspPlugin` in `vite.renderer.config.ts` with loopback origin matching (`localhost`, `127.0.0.1`) in `csp.ts`.
