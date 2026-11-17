---
doc_id: ARCH-CCMA-SHARD-03
status: CURRENT
version: 1.0.0
last_verified: 2026-11-13
language: en-US
description: Native Claude Code multi-agent mechanisms, enterprise patterns, context decoupling, and deterministic hook pyramids.
type: PROTOCOL_SHARD
parent_node: ../INDEX.md
allowed-tools: [Read, Write, Edit, Bash]
target: LLM_ENGINEERING
sources: [docs/standards/documentation-standards.md, docs/architecture/INDEX.md]
---

# Multi-Agent Orchestration Patterns & Enterprise Architectures

## 1. Multi-Agent Framework Failure Modes

Traditional agentic frameworks (e.g., AutoGen, CrewAI, LangGraph) frequently suffer architectural collapse in complex autonomous coding pipelines.

```
Monolithic Multi-Agent Bloat:
+-------------------------------------------------------------+
| Framework Wrappers & Meta-Routing Prompts: 80-120 rules    | -> 60-80% of LLM
| Heavy JSON-RPC Function Envelopes & Schemas: 40-60 rules    |    Instruction Budget
+-------------------------------------------------------------+
                              v
| Available Budget Remaining for Actual Engineering Task:    | -> Critical Instruction
| Only 20-40 rules!                                          |    Decay & Amnesia
+-------------------------------------------------------------+
```

### Architectural Breakdown
- **Context Cannibalization**: The framework's own orchestration logic consumes 60%–80% of the model's 150–200 instruction saturation ceiling before repo files or problem statements are read.
- **Cognitive Drift**: Pervasive round-trip JSON wrapping induces syntax failures and tool invocation stutter.
- **Resolution**: Native Claude Code primitives decouple orchestration state from LLM context sequences.

---

## 2. Claude Code Native Multi-Agent Matrix

Claude Code provides five native architectural mechanisms for multi-agent workflows without framework overhead.

| Mechanism | Configuration Scope | Core Capabilities & Isolation Invariants |
| :--- | :--- | :--- |
| **Custom Subagents** | `.claude/agents/*.md`<br>`~/.claude/agents/*.md` | Defined via YAML frontmatter (`name`, `description`, `model`, `tools`, `omitClaudeMd: true`). Markdown body acts as dedicated system prompt. `omitClaudeMd: true` strips repo-level instructions to guarantee zero context contamination. |
| **Dynamic Workflows** | `.claude/workflows/*.js`<br>(Ultracode runtime) | Shifts state machine loops, retry budgets, branch arbitration, and verification gates into deterministic JavaScript. The LLM is invoked only for bounded semantic steps. |
| **Agent Teams** | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` | Native multi-agent collaboration with shared task boards and file-locked mailbox queues. Eliminates single-lead context exhaustion. |
| **Cross-Session Messaging** | `ListAgents`<br>`SendMessage`<br>`notify_when_idle` | Inter-agent coordination protocol operating over local Unix Domain Sockets (`Inbox Socket`). Enables non-blocking asynchronous dispatch, progress polling, and sibling signaling. |
| **Worktree Isolation** | `isolation: worktree`<br>`claude --worktree` | Spawns agent in a fresh, isolated Git worktree branch (`.claude/worktrees/*`). Eliminates working directory write collisions; auto-cleaned if uncommitted changes are absent. |

---

## 3. Enterprise Context Architectures

### 3.1 Three-Layer Context Architecture
To preserve instruction budget and maintain strict boundaries, context is split into three orthogonal tiers:

```
+--------------------------------------------------------------------------+
| 1. Root Invariants (<projectRoot>/CLAUDE.md, strictly <= 60 lines)       |
|    - Universal build, test, and lint commands                            |
|    - Hard security redlines (e.g., safe deletion invariants)            |
|    - Absolute exclusion of agent roles, personalities, or long schemas   |
+--------------------------------------------------------------------------+
                                     |
+--------------------------------------------------------------------------+
| 2. Scope Files (Directory-Level Rules, e.g., src/web/DIR.md)              |
|    - Architectural boundary invariants for target directory             |
|    - Allowed cross-boundary imports and package dependencies             |
|    - Excludes agent persona definitions                                  |
+--------------------------------------------------------------------------+
                                     |
+--------------------------------------------------------------------------+
| 3. Role Contracts (.claude/agents/<Role>.md)                             |
|    - 4 Core Handoff Contracts:                                           |
|      1. Definition of Done (DoD)                                         |
|      2. Structured Return Schema (Machine Action Protocol / JSON)        |
|      3. Scope Boundaries (Strict Allowed Write Paths & Tool Whitelist)   |
|      4. Deterministic Escalation Triggers (Circuit Breakers)             |
+--------------------------------------------------------------------------+
```

### 3.2 EPAM "Octobots" Pattern
An industrial multi-agent development architecture featuring:
- **6 Specialised Roles**: Director, Architect, Backend Developer, Frontend Developer, QA Sentinel, SCM Steward.
- **`SOUL.md` vs `CLAUDE.md` Separation**: `SOUL.md` encapsulates cognitive posture, analytical heuristics, and reasoning style; `CLAUDE.md` contains purely operational commands and build hooks.
- **Worker Branch Isolation**: Every agent role operates in a dedicated Git branch or linked worktree; direct commits to default branch are blocked.
- **SQLite Taskbox Persistence**: Communication and task assignments flow through an external SQLite database rather than expanding prompt context.
- **Issue-Scoped Resumable Sessions**: Every sub-task maps to an idempotent session identifier (`claude --resume <issue_id>`).

---

## 4. Deterministic Hooks Pyramid

Unenforceable prompt instructions ("please do not delete production data", "make sure to run tests before finishing") MUST be migrated to deterministic OS-level lifecycle hooks.

```
                     / \
                    /   \
                   / Stop\
                  / Hook  \       <- TaskCompleted/Stop: Final gate validation
                 /---------\
                / PostTool  \     <- PostToolUse: AST syntax check, linter, formatting
               /  Execution  \
              /---------------\
             /   PreToolUse    \  <- PreToolUse: Path traversal, command blocklist, safe delete
            /    Validation     \
           +---------------------+
```

### Hook Protocol & Deterministic Circuit Breaking
- **Exit Code 0**: Inspection passes; execution proceeds.
- **Exit Code 2 (`TERM_BLOCK`)**: Hard security or architectural violation. The Claude runtime immediately aborts the pending tool execution and injects the hook's stderr back to the model as an unbypassable constraint.
- **Prompts Suggest; Hooks Enforce**: Prompts define intent; hooks enforce non-negotiable invariants.
