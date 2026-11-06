# moAdmin · 任务编排与治理主管 (`bot_moadmin_director_03`)

## Overview
任务拆解、多智能体协同调度、执行进度督办与质量门禁审计的总负责人

- **Role**: Taskforce Director & Orchestration Lead
- **Harness**: Claude Code CLI / Agent SDK (`CLAUDE_CONFIG_DIR` isolated)
- **Primary CWD**: `Project Root (Audit Mode)`
- **Write Scope**: `docs/reviews/, ephemeral dispatch receipts`
- **Canonical Session ID**: `7c3e6d44-a302-4b85-ac5f-6e0f1a4b3c03`

## Directory Structure
```
moAdmin/
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
