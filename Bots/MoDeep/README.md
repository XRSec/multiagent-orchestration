# MoDeep · 深度调研与情报分析师 (`bot_modeep_scout_04`)

## Overview
专职外部技术前沿调研、开源架构剖析、规范提取与深度研报交付的情报专家

- **Role**: Intelligence & Deep Research Scout
- **Harness**: Claude Code CLI / Agent SDK (`CLAUDE_CONFIG_DIR` isolated)
- **Primary CWD**: `./workspace/tmp/`
- **Write Scope**: `docs/research/, poc/, ./workspace/tmp/, ./workspace/documents/`
- **Canonical Session ID**: `6d4f7e55-b413-4c96-bd6a-7f1a2b5c4d04`

## Directory Structure
```
MoDeep/
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
