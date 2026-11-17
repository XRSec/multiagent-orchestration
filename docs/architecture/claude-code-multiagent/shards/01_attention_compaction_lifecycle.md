---
doc_id: ARCH-CCMA-SHARD-01
status: CURRENT
version: 1.0.0
last_verified: 2026-11-13
language: en-US
description: Attention degradation dynamics, compaction lifecycle mechanics, context reload matrix, and custom distillation controls.
type: PROTOCOL_SHARD
parent_node: ../INDEX.md
allowed-tools: [Read, Write, Edit, Bash]
target: LLM_ENGINEERING
sources: [docs/standards/documentation-standards.md, docs/architecture/INDEX.md]
---

# Attention Dynamics, Context Rot & Compaction Lifecycle

## 1. Context Rot & Attention Degradation Dynamics

Context expansion in LLM-based autonomous coding agents induces predictable cognitive decay governed by transformer attention topology.

| Degradation Vector | Underlying Mechanism | Empirical Impact on Agent Execution |
| :--- | :--- | :--- |
| **Context Rot** | Progressive saturation of the sequence context window with heterogeneous token types (raw Bash output, JSON dumps, prose, lint logs). | Instruction following degrades linearly after 64k tokens; hallucination frequency increases on negative constraints. |
| **Multi-Turn Instruction Drift** | Autoregressive bias and attention dispersal in multi-turn execution loops. | Smaller/faster models (e.g., Haiku 5.5 / Haiku 3.5) push back against negative constraints, hallucinate permissions, or drop system rules after 15+ turns. |
| **$O(n^2)$ Attention Dilution** | Full self-attention calculates dot-product affinities across all $n$ active tokens. As $n$ increases, softmax probability mass disperses over irrelevant token spans. | Attention weights assigned to system prompt instructions decay exponentially as turn depth exceeds 20 turns. |
| **"Lost in the Middle" U-Curve** | Position encoding biases attention saliency toward the sequence origin (system prompt prefix) and sequence tail (latest user/tool turns). | Directives, file paths, and interface constraints located between 25% and 75% of context depth suffer up to 60% retrieval failure. |
| **Distractor Sensitivity** | Large tool outputs (e.g., 2,000-line test stack traces, deep AST traversals) contain lexical overlapping tokens that hijack transformer attention heads. | Agent diverges into debugging non-reproducing side issues or repeats already-failed shell commands. |

---

## 2. `/compact` Internal Execution Mechanics

Compaction is an atomic context reset pipeline that swaps an expanding conversation transcript for a structured semantic snapshot driven by the canonical `BASE_COMPACT_PROMPT`.

### 2.1 Trigger Boundaries
- **Automatic Threshold**: Reaching 75%–80% of window capacity (e.g., >160,000 tokens on a 200,000-token window).
- **Manual Invocations**: Explicit `/compact` or targeted `/compact focus on <target>` commands issued by user or parent orchestrator.

### 2.2 Execution Pipeline & Two-Stage Distillation Protocol
The harness executes context distillation via `BASE_COMPACT_PROMPT` under strict execution boundaries:
1. **Tool Invocation Suppression (`NO_TOOLS_PREAMBLE`)**: The compaction prompt injects a hard operational directive disabling all tool schemas (`Read`, `Write`, `Bash`, MCP). The model cannot spawn child calls during compaction.
2. **Stage 1 (Scratchpad Reasoning)**: The summarizer first reasons through prior context, decisions, and file states inside private `<analysis>` scratchpad tags. The Claude Code harness strips the `<analysis>` block prior to injecting the compacted summary into the conversation stream.
3. **Stage 2 (XML Tag Wrapper Contract)**: The final distilled context MUST be wrapped in `<summary>` tags surrounding the 9 deterministic sections.
4. **Lossy Truncation**: All intermediate turn history, tool execution envelopes, and raw output streams outside the `<summary>` payload are pruned.

### 2.3 9-Section Compaction Output Schema
The summarizer model MUST compile remaining state inside the `<summary>` wrapper into the following deterministic sections:

```markdown
<summary>
1. Primary Goal & Operational Intent
2. Key Architectural Decisions & System Constraints
3. Files Modified, Created, or Inspected (Exact Paths)
4. Current Implementation State & Validated Milestones
5. Test, Build & Verification Results
6. Environment & Configuration Parameters
7. User Explicit Preferences & Operational Redlines
8. Discovered Blockers, Regressions & Unresolved Errors
9. Next Actionable Steps (Ordered Priority Queue)
</summary>
```

---

## 3. Context Reloading Matrix Across Compaction

Post-compaction execution resets the active conversation while reloading persistent artifacts from physical storage.

| Artifact Type | Post-Compaction Fate | Reload Mechanism / Source |
| :--- | :--- | :--- |
| **Static System Prompt** | Preserved verbatim | Static Tier 1 prompt cache block; unaffected by compaction. |
| **Output Style Directives** | Preserved verbatim | Loaded via `outputStyle` configuration in `settings.json`. |
| **Root `CLAUDE.md`** | Evicted from memory; reloaded from disk | Re-read immediately from `<projectRoot>/CLAUDE.md` into `<system-reminder>` (capped at 200 lines / 25KB). |
| **Global `MEMORY.md`** | Evicted from memory; reloaded from disk | Re-read from `~/.claude/projects/<slug>/memory/MEMORY.md` into `<system-reminder>` (capped at 200 lines / 25KB). |
| **Subdirectory `CLAUDE.md`** | Pruned completely | Reloaded on-demand specifically when an agent tool (`Read`) reads a file in that directory scope. |
| **Git Status & Active Plans** | Reloaded automatically | Freshened git status snapshot and active plan files are re-injected from disk/environment into context. |
| **Recent Files** | Truncated / Reference Conversion | Maximum 5 files preserved; files exceeding 5,000 tokens convert to lightweight placeholder references. |
| **Invoked Skill Bodies** | Pruned completely | Capped at 5,000 tokens per skill, 25,000 tokens total aggregate across all skills, with FIFO eviction of oldest invoked skills. Full bodies re-read only upon re-invocation. |
| **Hook History & Directives** | Distilled into milestones | Temporary directives and hook execution histories are summarized into semantic milestones; never preserved verbatim. |
| **Tool Results & Bash Output** | Purged | Semantic diffs and outcomes survive exclusively via `<summary>` 9-section schema. |

---

## 4. Custom Compaction Guidance & Steering

System engineers steer compression fidelity through static configuration and dynamic arguments.

### 4.1 Static Guidance: `## Compact Instructions`
Engineers append custom retention policies within the root `CLAUDE.md`. The compaction prompt extracts this section and binds it as an invariant during summary synthesis:

```markdown
## Compact Instructions
- Retain exact database schema migrations, column names, and table constraints.
- Retain exact file paths of all edited TypeScript test suites.
- Discard raw linter outputs and npm dependency audit reports.
- Preserve all unresolved issue IDs and security review verdicts.
```

### 4.2 Dynamic Steering: `/compact focus on ...`
Operators and orchestration engines pass ad-hoc distillation targets via CLI or slash invocation:
- Syntax: `/compact focus on <domain-target>`
- Behavior: Appends dynamic extraction bias to the compression prompt, forcing priority preservation on designated subsystems (e.g., `/compact focus on authentication middleware and session state machine`).
