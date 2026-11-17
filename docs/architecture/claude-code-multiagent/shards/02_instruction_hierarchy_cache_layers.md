---
doc_id: ARCH-CCMA-SHARD-02
status: CURRENT
version: 1.0.0
last_verified: 2026-11-13
language: en-US
description: Three-tier prompt caching architecture, instruction budget capacity limits, system-reminder paradox, and CLI injection channels.
type: PROTOCOL_SHARD
parent_node: ../INDEX.md
allowed-tools: [Read, Write, Edit, Bash]
target: LLM_ENGINEERING
sources: [docs/standards/documentation-standards.md, docs/architecture/INDEX.md]
---

# Instruction Hierarchy, Cache Layers & Context Topology

## 1. Three-Tier Prompt Cache Architecture

Claude Code optimizes invocation latency and API operational costs via a deterministic three-tier prompt caching hierarchy leveraging Anthropic Prompt Caching breakpoints (`cache_control: {"type": "ephemeral"}`).

```
+-------------------------------------------------------------------------+
| Tier 1: Static System Prompt & Tool Schemas (Ephemeral 5-Min TTL)        |
| - Base Anthropic Coding System Prompt (~110 Engineering Directives)    |
| - Core JSON Tool Declarations (Read, Write, Edit, Bash, Glob, Grep)    |
+-------------------------------------------------------------------------+
                                    |
+-------------------------------------------------------------------------+
| Tier 2: Static Project & System State Prefix (Cache Boundary)           |
| - Root CLAUDE.md & Global MEMORY.md (within <system-reminder>)          |
| - Available Skills Directory Index (Name + Description only)           |
| - __SYSTEM_PROMPT_DYNAMIC_BOUNDARY__                                   |
+-------------------------------------------------------------------------+
                                    |
+-------------------------------------------------------------------------+
| Tier 3: Dynamic Turn Sequence (Append-Only Context Stream)              |
| - Dynamic Per-Turn Variables (Current Timestamp, Active Git Status)    |
| - Turn History: User Messages, Assistant Thoughts, Tool Call Envelopes |
| - Dynamic Compaction Checkpoint Marker                                  |
+-------------------------------------------------------------------------+
```

### 1.1 Cache Boundary Isolation (`__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__`)
Claude Code enforces an internal cache delimiter:
- **Upstream Prefix**: Contains deterministic, invariant instructions and tool schemas. Hashed once; hits cached tokens across turns.
- **Downstream Suffix**: Isolates high-frequency volatile elements (epoch timestamps, branch commit hashes, uncommitted file status). Volatile updates cannot invalidate upstream Tier 1 cache blocks.

---

## 2. Instruction Budget Ceiling & Baseline Consumption Dynamics

Prompt engineering in autonomous coding agents faces strict physical instruction capacity ceilings and baseline system overhead.

### 2.1 Baseline Consumption & Net Headroom
Claude Code's built-in system prompt and native tool declarations consume approximately 50 baseline instructions (~27,000–31,000 tokens baseline). This baseline overhead leaves narrow headroom of only ~30–70 custom instructions before reaching the 120–150 rule saturation cliff.

| Parameter | Threshold | Operational Consequence |
| :--- | :--- | :--- |
| **Built-in System Baseline** | ~50 rules (~27k–31k tokens) | Native Anthropic coding guidelines, tool schemas, and safety preambles. |
| **Available Custom Headroom** | ~30–70 custom rules | Safe operational budget for user instructions, `CLAUDE.md`, and skills before degradation. |
| **Adherence Saturation Ceiling** | 120–150 total rules | Capacity threshold beyond which instruction processing becomes non-linear. |
| **Uniform Adherence Decay** | >150 total rules | Failure mode is **not** FIFO (first-in-first-out) eviction. Error rates rise **uniformly across all rules** due to attention head contention. |

### 2.2 Architectural Implication
System architects MUST NOT add marginal instructions for edge cases. High-stakes constraints MUST migrate from system prompts into deterministic host-level hooks (PreToolUse / PostToolUse validation scripts).

---

## 3. The `<system-reminder>` Meta-Instruction Paradox

Claude Code wraps repository context, memory shards, and runtime notices in `<system-reminder>` XML tags:

```xml
<system-reminder>
Contents of <projectRoot>/CLAUDE.md:
...
</system-reminder>
```

### 3.1 The Paradox Mechanism
1. **Host-Level Meta-Instruction**: Claude models are foundationally trained with an invariant: *`<system-reminder>` contents represent passive background context or operational environment facts; the model must not reply directly to them unless explicitly relevant to the active user prompt.*
2. **Behavioral Filter Inversion**: When system designers place critical role definitions, persona declarations, or primary task mandates inside `CLAUDE.md`, the model treats them as non-urgent passive references rather than active execution orders.

### 3.2 Role & Format Filtering
Due to the host meta-instruction ("should not respond unless highly relevant"):
- **Persona & Tone Blindness**: Persona definitions, tone restrictions, or stylistic behavioral directives placed within `<system-reminder>` are actively filtered out or ignored as irrelevant background noise during generation.
- **Output Format Stripping**: Strict formatting schemas (e.g., pure JSON enforcement, custom delimiter protocols) placed in `<system-reminder>` are frequently overridden by default conversational habits.
- **Engineering Resolution**:
  - Keep `CLAUDE.md` strictly focused on static system invariants, build targets, and path rules.
  - Enforce output format and tone via `outputStyle` in `settings.json` or host-level validators.
  - Inject active execution mandates through first-class user turns or CLI `--append-system-prompt` / `--append-system-prompt-file` flags.

---

## 4. Prompt Injection Channels: CLI Flag Evaluation

Configuring agent system instructions requires precise selection of CLI injection flags to preserve runtime capabilities.

| Parameter / Flag | Scope & Mechanism | System Impact & Risk Profile |
| :--- | :--- | :--- |
| `--system-prompt <content>` | **Hard Replacement** of the entire Claude Code system prompt. | **HIGH RISK**: Destroys 110+ Anthropic coding heuristics (file modification hygiene, safety checks, git workflows), wipes dynamic Git status tracking, strips native tool schemas, and breaks the critical trust declaration: `"The application adds system reminders to this conversation..."`, causing the model to distrust or reject subsequent `<system-reminder>` envelopes. |
| `--append-system-prompt <str>` | **Additive Concatenation** to the end of the base system prompt. | **RECOMMENDED**: Preserves all native engineering heuristics, tool schemas, and git state awareness while injecting custom domain boundaries. |
| `--append-system-prompt-file <path>` | **Additive File Injection** from local filesystem path. | **RECOMMENDED**: Preferred for enterprise configurations; enables automated mounting of versioned orchestrator guidelines without shell string escaping hazards. |
| `outputStyle` (in `settings.json`) | **Stylistic Post-Processing Filter** applied to model output. | Suitable for formatting restrictions, tone enforcement, or JSON schema output shaping. Bypassed during tool-calling sequences. |

### 4.1 Precedence Rule ("File Before String")
When both `--append-system-prompt-file` and `--append-system-prompt` are passed simultaneously, Claude Code evaluates `--append-system-prompt-file` first, followed by `--append-system-prompt` ("file before string"). File contents are mounted upstream of the inline string payload.

---

## 5. Model Sensitivity & Directive Tone Calibration

Instruction adherence varies significantly across model classes under identical directive wording:
- **Opus 4.5 / 4.6 Sensitivity**: Hyper-sensitive to aggressive imperatives (`MUST`, `NEVER`, ALL-CAPS mandates). When encountering ambiguous tool outputs or unexpected edge cases, hard negative directives induce over-cautious refusals, excessive hesitation, or execution deadlocks.
- **Calibration Protocol**:
  - Author prompts using objective, declarative constraints and heuristic guidance when targeting Opus models.
  - Offload hard non-negotiable boundaries from prompt prose to deterministic host hooks (`PreToolUse`, `TERM_BLOCK`).
  - Reserve imperative commands (`MUST`/`NEVER`) for safety-critical guardrails enforced across faster models (Sonnet / Haiku).

---

## 6. Session Resume Snapshot Delay

When resuming a session via `claude --resume <id>`:
- **Context Snapshotting Invariant**: Modifications made to repository `CLAUDE.md`, global memory files, or system prompt files while a session is inactive do **not** take effect immediately upon session resume. Claude Code restores context from the serialized session snapshot.
- **Update Activation Channels**:
  1. Triggering an explicit `/compact` cycle forces a disk re-read of project context files into `<system-reminder>`.
  2. Setting `snapshot: false` in session settings explicitly disables transcript snapshot caching on resumption.
