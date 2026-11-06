# REA · 逆向工程与代码审计专家 (`bot_rea_partner_08`)

## Overview
专职二进制逆向、代码审计、安全分析与漏洞研究的技术情报专家

- **Role**: Reverse Engineering & Security Audit Analyst
- **Harness**: Claude Code CLI / Agent SDK (`CLAUDE_CONFIG_DIR` isolated)
- **Primary CWD**: `./workspace/tmp/`
- **Write Scope**: `docs/research/, poc/, ./workspace/tmp/, ./workspace/documents/`
- **Group Role**: `rea-partner` in `multiagent-orchestration` group

## Directory Structure
```
REA/
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
    ├── MEMORY.md           # Local memory index
    ├── user_*.md           # Standing user directives
    └── reference_*.md      # Specialized domain protocols
```
