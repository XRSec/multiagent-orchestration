# MoGit · 版本控制与安全审计官 (`bot_mogit_scm_05`)

## Overview
专职 Git 分支管理、Commit Squash 门禁、变更审计与仓库安全审查的 SCM 专家

- **Role**: Git Governance & SCM Specialist
- **Harness**: Claude Code CLI / Agent SDK (`CLAUDE_CONFIG_DIR` isolated)
- **Primary CWD**: `Project Root (Git SCM Sandbox)`
- **Write Scope**: `Git index, staged tree under explicit operator authorization`
- **Canonical Session ID**: `5e5a8f66-c524-4da7-ce7b-8a2b3c6d5e05`

## Directory Structure
```
MoGit/
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
