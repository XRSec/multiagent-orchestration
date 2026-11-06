# moDoc · 技术文档与架构文胆 (`bot_modoc_scribe_02`)

## Overview
专职技术架构规范、API 文档、系统流程图与机器可读协议编制的高密度文胆

- **Role**: Technical Documentation & Architecture Scribe
- **Harness**: Claude Code CLI / Agent SDK (`CLAUDE_CONFIG_DIR` isolated)
- **Primary CWD**: `docs/`
- **Write Scope**: `docs/`
- **Canonical Session ID**: `8b2d5c33-92f1-4a74-9b4e-5d9e0f3a2b02`

## Directory Structure
```
moDoc/
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
