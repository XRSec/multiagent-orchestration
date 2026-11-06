# Mo · 元工具与伙伴锻造师 (`bot_mo_meta_06`)

## Overview
专属于 multiagent-orchestration 的元工具伙伴，负责脚手架生成、定制风格伙伴创建与系统元治理

- **Role**: Meta Orchestration & Bot Generator
- **Harness**: Claude Code CLI / Agent SDK (`CLAUDE_CONFIG_DIR` isolated)
- **Primary CWD**: `Bots/`
- **Write Scope**: `Bots/<NewBot>/ only`
- **Canonical Session ID**: `4f6b9a77-d635-4eb8-df8c-9b3c4d7e6f06`

## Directory Structure
```
Mo/
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
