---
doc_id: DOCS_CCMA_INDEX
status: CURRENT
name: claude-code-multiagent
version: 1.0.0
last_verified: 2026-11-13
language: en-US
description: Architectural branch index for Claude Code multi-agent topology, prompt caching, context lifecycle, and MCP governance.
type: DOCS_BRANCH_INDEX
parent_node: ../INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/standards/documentation-standards.md, docs/_conventions.md]
---

# [0] ROOT: CLAUDE CODE MULTI-AGENT ARCHITECTURE

## [1] PURPOSE & CORE INVARIANTS
Codifies architectural specifications, attention dynamics, instruction hierarchies, multi-agent collaboration patterns, virtual-to-physical runtime topologies, and MCP governance in Claude Code environments.

- **Invariant 1**: Prompt contexts must not store mutable orchestration state; state machines reside in external host runtimes or hooks.
- **Invariant 2**: Hard constraints and redlines are enforced by deterministic code hooks (`TERM_BLOCK`), never prose prompts.
- **Invariant 3**: Subagent processes remain physically isolated by `CLAUDE_CONFIG_DIR`, git worktrees, and strict MCP configs.

## [2] ROUTES: ARCHITECTURAL PROTOCOL SHARDS
- [2.1] [attention-compaction](shards/01_attention_compaction_lifecycle.md) :: [LOAD_IF: context rot, multi-turn instruction drift, attention dilution, lost-in-the-middle, /compact 9-section schema, token caps, or context reloading matrix]
- [2.2] [instruction-hierarchy](shards/02_instruction_hierarchy_cache_layers.md) :: [LOAD_IF: 3-tier prompt caching, __SYSTEM_PROMPT_DYNAMIC_BOUNDARY__, instruction budget ceiling, system-reminder paradox, CLI injection flags, file before string, Opus MUST sensitivity, or session resume snapshot delay]
- [2.3] [multiagent-patterns](shards/03_multiagent_orchestration_patterns.md) :: [LOAD_IF: custom subagents, workflows, agent teams, cross-session messaging, worktrees, EPAM Octobots, 3-layer context, or hooks pyramid]
- [2.4] [virtual-groupchat-memory](shards/04_virtual_groupchat_progressive_memory.md) :: [LOAD_IF: virtual group chat UI vs physical sessions, NDJSON stream parsing, parent_tool_use_id demuxing, CLAUDE_CODE_FORWARD_SUBAGENT_TEXT, mid-flight steering, or progressive disclosure pipeline]
- [2.5] [skill-mcp-governance](shards/05_agent_skill_mcp_governance.md) :: [LOAD_IF: Claude Desktop vs CLI constraints, desktop --verbose/--debug limitations, skill scoping and resolution priority, runtime isolation flags, immutable tool definitions / MCP cache preservation, or MCP server tool bus governance]
