---
doc_id: ARCH-CCMA-SHARD-05
status: CURRENT
version: 1.0.0
last_verified: 2026-11-13
language: en-US
description: Claude Desktop vs CLI constraints, skill scoping rules, isolation mechanisms, and MCP governance as a hardened tool bus.
type: PROTOCOL_SHARD
parent_node: ../INDEX.md
allowed-tools: [Read, Write, Edit, Bash]
target: LLM_ENGINEERING
sources: [docs/standards/documentation-standards.md, docs/architecture/INDEX.md]
---

# Agent Skills, MCP Governance & Runtime Isolation

## 1. Claude Desktop Constraints vs Claude Code CLI

Enterprise orchestration engines must account for runtime platform divergences between Claude Desktop and Claude Code CLI.

| Feature / Capability | Claude Code CLI | Claude Desktop | Architectural Impact |
| :--- | :--- | :--- | :--- |
| **CLI Parameter Acceptance** | Full flag catalogue supported (`--system-prompt`, `--append-*`, `--bare`, etc.). | **Restricted to `--verbose` and `--debug`** | `claude --desktop` accepts ONLY `--verbose` and `--debug`, rejecting all custom system prompt, append, or agent orchestration parameters. |
| **`--append-system-prompt`** | Supported directly via CLI flags. | **Unsupported** | Desktop lacks first-class CLI injection flags; requires workarounds. |
| **Output Style Customization** | Supported via CLI and `settings.json`. | Supported via `outputStyle` (`keep-coding-instructions: true`). | Partial workaround for desktop tone shaping without wiping core directives. |
| **Session Initialization Hooks** | Supported (`SessionStart` hook). | Supported (`SessionStart` hook in desktop config). | Allows dynamic prompt injection at turn 0, but consumes conversational context. |
| **Virtual Group Chat Hosting** | Native multi-process spawn & stream demuxing. | **Incompatible** | Desktop enforces a single monolithic conversation thread; cannot multiplex distinct subagent configs. |

---

## 2. Skill Scoping & Resolution Rules

Claude Code skills (`SKILL.md`) provide on-demand procedure playbooks without permanently saturating context.

### 2.1 Lazy Loading & Character Bounds
- **Startup Registration**: Claude Code parses only the skill `name` and `description` frontmatter at engine startup. This metadata occupies minimal Tier 2 prompt cache tokens.
- **Invocation Expansion**: The full instructional body is injected into context **only** when explicitly invoked via `Skill(name)` or slash command.
- **Instruction Bound**: Skill bodies are capped between 5,000 and 25,000 characters. Large runbooks MUST decompose into sibling shards.

### 2.2 Mutual Exclusivity Constraint
- The property `disable-model-invocation: true` prevents the LLM from calling the skill autonomously (human-only slash command).
- **Hard Rule**: A subagent definition (`.claude/agents/*.md`) MUST NOT list a skill in its `skills:` preload array if that skill declares `disable-model-invocation: true`. Doing so triggers runtime validation failures on agent initialization.

### 2.3 Resolution Priority Hierarchy
When duplicate skill names exist across levels, resolution adheres strictly to:
$$\text{Managed (Org/Enterprise)} > \text{User } (\sim/\text{.claude/skills/}) > \text{Project } (\text{.claude/skills/})$$

---

## 3. Runtime Isolation Mechanisms & Directory Scoping

Deterministic isolation prevents agent bleed and configuration cross-contamination across execution sandboxes.

| Flag / Parameter | Isolation Scope | Mechanics & Enforcement |
| :--- | :--- | :--- |
| `--bare --add-dir <path>` | **Filesystem & Skill Isolation** | Disables ambient global settings, user skills, and uncommitted plugins. Scopes skill and tool discovery strictly to `<path>`. |
| `--setting-sources project,local` | **Configuration Boundary** | Strips global user configurations (`~/.claude/settings.json`), ensuring agents execute solely against verified repository settings. |
| `isolation: worktree` | **Git State Isolation** | Spawns agent in a private linked git worktree, preventing branch dirtiness and file write collisions during concurrent multi-agent runs. |

### 3.1 Subdirectory-Scoped Skill Discovery
Subdirectory-scoped skills (`<subdir>/.claude/skills/`):
- **Engine Startup Omission**: Subdirectory-scoped skills are **not** discovered or registered into Tier 2 metadata at engine startup.
- **On-Demand Scope Ingestion**: They load strictly on-demand when an agent tool (`Read`) reads a file located within `<subdir>`, or when the directory path is explicitly registered at invocation via `--add-dir <path>`.

---

## 4. MCP Server as Hardened Tool Bus

Model Context Protocol (MCP) servers serve as typed, external process-isolated tool buses distinct from prompt-based skills.

```
                    +-----------------------------+
                    | Claude Code Subagent Engine |
                    +-----------------------------+
                       /                       \
        Prompt Layer  /                         \  RPC Process Boundary
                     v                           v
     +-------------------------+       +-----------------------------+
     | .claude/skills/*.md     |       | External MCP Server Process |
     | - Markdown instructions |       | - Typed JSON-RPC Interface  |
     | - Pruned on /compact    |       | - Server-Side Input Guards  |
     | - Context consumer      |       | - Invariant across /compact |
     +-------------------------+       +-----------------------------+
```

### 4.1 MCP Scoping Invariants
- **Strict Configuration Enforcement**: Subagents are isolated using `--mcp-config <path>` alongside `--strict-mcp-config`. This blocks ambient or unwhitelisted user-level MCP tools from leaking into restricted agent sandboxes.
- **Subagent Declaration**: Specialist agents specify allowed MCP servers in their markdown frontmatter:
  ```yaml
  mcpServers:
    - memory-sqlite
    - repo-ast-analyzer
  ```

### 4.2 Progressive Disclosure via MCP Tool Search
- Large tool catalogues (>20 tools) MUST NOT be dumped into Tier 1 tool schemas, which inflates system prompt tokens and dilutes attention.
- Defer non-critical tools to MCP Tool Search (`ToolSearch` meta-tool). Tool definitions must respect the 4,096-character schema limit.

### 4.3 Redline Placement Against Compaction Loss
- **Vulnerability**: Invariants stated only in prompt text or skill bodies are compressed or completely erased during `/compact` cycles.
- **Hardened Invariant**: System redlines (path validation, read-only constraints, rate limiting, and destructive command blocking) MUST be implemented within the MCP server code or host hooks (`PreToolUse`). Host-level code boundaries never undergo context compaction.

### 4.4 Immutable Tool Definitions & Prompt Cache Preservation
- **Tier 1 Cache Binding**: MCP server tool schemas form part of the static Tier 1 Prompt Cache block.
- **Dynamic Mutation Prohibition**: MCP servers MUST NOT dynamically register, unregister, or mutate tool signatures during an active running session.
- **Cache Invalidation Impact**: Any runtime tool schema mutation invalidates the upstream Tier 1 cache prefix, forcing a full recalculation and re-ingestion of the ~27,000–31,000 baseline system prompt tokens on subsequent turns.
