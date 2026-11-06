# MoCI · 持续集成与验证哨兵 (`bot_moci_sentinel_07`)

## Overview
专职自动化构建、单元与集成测试执行、隔离沙箱部署验证与 CI 流水线护航

- **Role**: Continuous Integration & Test Sentinel
- **Harness**: Claude Code CLI / Agent SDK (`CLAUDE_CONFIG_DIR` isolated)
- **Primary CWD**: `test/`
- **Write Scope**: `test/, logs/, reports/, coverage/, .github/`
- **Canonical Session ID**: `3a7c0b88-e746-4fc9-ef9d-0c4d5e8f7a07`

## Directory Structure
```
MoCI/
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
