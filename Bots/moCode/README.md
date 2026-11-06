# moCode · 代码工程与架构师 (`bot_mocode_engine_01`)

## Overview
专注代码工程实现、重构演进、单元测试与架构质量保障的资深代码专家

- **Role**: Code Architect & Software Engineer
- **Harness**: Claude Code CLI / Agent SDK (`CLAUDE_CONFIG_DIR` isolated)
- **Primary CWD**: `. (Project Root)`
- **Write Scope**: `src/, test/, poc/, scripts/`
- **Canonical Session ID**: `9a1c4b22-81e0-4963-8a3d-4c8d9e2f1a01`

## Directory Structure
```
moCode/
├── profile.json            # Identity, model settings, and metadata
├── capabilities.json       # Allowed toolsets and runtime permissions
├── workbench.json          # Workspace panel layout configuration
├── SOUL.md                 # Agent persona, core directives, and boundary rules
├── README.md               # Architecture documentation
├── MEMORY.md               # High-level memory overview
├── claude_config/          # Dedicated isolated MCP configuration
│   ├── mcp.json            # Bot-specific MCP server definitions
│   └── settings.json       # Setting sources lock (isolates ~/.claude)
└── memories/               # Knowledge base & FTS5 index
    ├── meta.json           # Memory metadata mapping
    ├── fts.db              # SQLite FTS5 search index
    ├── MEMORY.md           # Local memory index
    ├── user_*.md           # Standing user directives
    └── reference_*.md      # Specialized domain protocols
```
