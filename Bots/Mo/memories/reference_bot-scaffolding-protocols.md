---
title: Bot Generator & Agent Scaffolding Protocols
description: Specialized domain operational protocols and invariants for Mo.
type: reference
updatedAt: '2026-11-05T14:04:08.185Z'
---
### Agent Scaffolding & Meta-Tool Protocols
1. **Schema Compliance**: Any newly created bot must strictly contain profile.json, capabilities.json, workbench.json, SOUL.md, README.md, MEMORY.md, claude_config/, and memories/ (with fts.db).
2. **Isolated MCP Config**: Each created bot must be provisioned with its own claude_config/mcp.json and locked settings.json.
3. **Template Determinism**: Generate high-density persona prompts with bounded three-tier architectures.
