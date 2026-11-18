---
doc_id: DESIGN-PATTERNS-SHARD-02
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Prompt Cache Layers, Instruction Budget & Tool Governance

Parent index: [../INDEX.md](../INDEX.md)
Related shards: [01-attention-and-compaction.md](01-attention-and-compaction.md) · [04-blackboard-budget-and-arbitration.md](04-blackboard-budget-and-arbitration.md)

## 1. Three-Tier Prompt Cache & Static/Volatile Boundary

Segregate prompt assembly by mutation rate across an explicit cache delimiter (`__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__`).
Mutating any byte upstream of a cache breakpoint invalidates `~27,000–31,000` baseline tokens and spikes TTFT and API cost on every turn.

| Cache Tier | Position & TTL | Permitted Artifacts | Cache Invalidation Hazard |
| :--- | :--- | :--- | :--- |
| **Tier 1: Byte-0 Prefix** | Byte 0 through tool + base system breakpoint (~5 min ephemeral TTL, refreshed on hit) | Lexicographically sorted JSON tool declarations and native harness system prompt. | Mid-session MCP tool registration/mutation, unsorted tool arrays, or model switching. |
| **Tier 2: Project Prefix** | Upstream of `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` | Root `AGENTS.md` / `CLAUDE.md`, `< 500`-token `MEMORY.md` index, and lazy skill headers (`name` + `description`). | Injecting timestamps, git diffs, or live blackboard snapshots inside the static manual. |
| **Tier 3: Turn Stream** | Downstream of `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` (append-only) | User messages, cursor-sliced peer deltas, epoch-gated blackboard tail blocks, thoughts, and tool calls/results. | Rewriting historical turns outside explicit `/compact` or rewind boundaries. |

### 1.1 Injection Channels, `<system-reminder>` Paradox & Keepalive Math

| Injection Channel | Mechanism | Operational Rule & Risk |
| :--- | :--- | :--- |
| `--append-system-prompt[-file]` / `_meta.antigravity.systemPrompt.append` | Appends role contract after native system prompt (file mounted before inline string). | **Preferred**: preserves ~110 native file-hygiene, git, and tool-safety heuristics. |
| `--system-prompt` / `systemPromptMode: 'replace'` | Replaces entire native harness system prompt. | **High Risk**: strips native tool heuristics and reminder trust declarations; reserve for bare single-shot classifiers. |
| `<system-reminder>` (`CLAUDE.md` / `MEMORY.md`) | Mounted as passive background environment context. | **Paradox**: models filter out persona, tone, and strict JSON output schemas placed here as non-urgent background facts; place active mandates in appended system prompts or Tier 3 turns. |
| Session Resume Snapshot | Restores serialized prefix on `--resume` / `session/resume`. | Disk edits to `AGENTS.md` or skills while idle do not take effect until `/compact` or a fresh session open. |

1. **Keepalive Break-Even Formula**:
   - For cache write multiplier $w = 1.25$ and cache read multiplier $r = 0.10$, issue idle keepalive pings only when expected idle pings satisfy:
     $$E[\text{pings}] < \frac{w - r}{r} = 11.5 \text{ pings}$$
   - Account for transcript side effects: every synthetic keepalive ping is a real model request appended to turn history.

---

## 2. Instruction Budget Ceiling & Deterministic Hooks Pyramid

Hold total active instructions across built-in preamble, root manual, bot persona, and loaded skill body below **`120–150` discrete rules**.
Exceeding `150` rules causes **uniform adherence decay across every rule simultaneously**, degrading safety redlines alongside style preferences.

| Budget Slice | Rule Allocation | Architectural Enforcement |
| :--- | :--- | :--- |
| **Harness Built-in Baseline** | `~50` rules (`27k–31k` tokens) | Fixed overhead of native coding heuristics, safety preambles, and tool schemas. |
| **Custom Operational Headroom** | `30–70` rules | Total shared budget across root manual (`<= 50–75` lines), bot role contract, and active skill body. |
| **Saturation Cliff** | `> 120–150` total rules | Attention head contention rises non-linearly; migrate edge-case checks into deterministic host hooks. |

### 2.1 Deterministic Hooks Pyramid

Offload enforceable invariants from prompt prose into OS/host lifecycle gates:
1. **`PreToolUse` (`Exit Code 2` / `TERM_BLOCK`)**:
   - Block `rm -rf`, out-of-scope write paths, symlink escapes, and credential reads deterministically before tool execution starts.
2. **`PostToolUse`**:
   - Run fast AST syntax, formatter, or lint checks on touched files immediately after writes.
3. **`Stop` / Turn-End Gate**:
   - Verify required test exit codes and turn-journal settlement before accepting turn completion.

### 2.2 Directive Tone Calibration Against Frontier Model Deadlocks

Author operational rules in calm, plain imperatives (`Validate path containment before reading`) and reserve uppercase `MUST` / `NEVER` strictly for irreversible security, zero-pollution, and destructive-deletion redlines:
- **Frontier Over-Refusal Trap**: High-reasoning models (Claude Opus 4.x, Gemini 4 Hydrogen) weight emphatic negative imperatives heavily; saturating prompts with dozens of `MUST` and `NEVER` directives induces hesitation spirals, false refusals, or execution deadlocks when tool outputs look ambiguous.
- **Single-Source Rule Placement**: State each rule once in its canonical shard (`Rule -> 1-line reason`), eliminating cross-file duplication that burns instruction slots without improving compliance.

---

## 3. Lazy Skill Scoping & Mutual-Exclusivity Rules

1. **Two-Stage Lazy Loading**:
   - Parse only YAML frontmatter (`name` + trigger-oriented `description`) into Tier 2 at startup.
   - Inject the full `SKILL.md` body (`5,000–25,000` chars max; split larger runbooks into `shards/*.md`) strictly upon `lookup_skill` / `Skill(name)` invocation.
2. **`disable-model-invocation: true` Mutual Exclusivity**:
   - Skills marked `disable-model-invocation: true` are human-invoked slash workflows only.
   - Redline: NEVER list a `disable-model-invocation: true` skill inside an agent's static `skills:` preload array; doing so triggers deterministic agent initialization failure.
3. **Scope Precedence & Directory Isolation**:
   - Resolve duplicate skill names strictly in `Managed (Enterprise) > User (~/.gemini/config/skills/ or ~/.claude/skills/) > Project` order.
   - Load subdirectory skills lazily only when files inside that directory are read, and isolate autonomous workers via explicit workspace flags (`--bare --add-dir` / scoped `workspaceRoots`) to prevent ambient user-skill bleed.

---

## 4. Byte-0 Tool Schema Freezing Invariant

Freeze the exact tool set, lexicographical order, and JSON parameter schemas at Byte 0 when spawning a session.
NEVER dynamically register, unregister, or mutate MCP tool schemas mid-session.

1. **Allowlist & Lexicographical Sort at Spawn**:
   - Intersect available tools with the bot's static roster allowlist (`--strict-mcp-config` / `paseo-bots-plugin-settings/bots.json`) and sort tool names deterministically before `initialize` / `session/new` so Tier 1 cache hashes remain byte-identical across turns.
2. **Progressive Tool Disclosure (`> 20` Tools)**:
   - Cap individual tool schemas at `<= 4,096` characters describing only parameters that change tool selection.
   - Defer large (`> 20` tool) MCP catalogues behind lazy discovery meta-tools (`call_mcp_tool` / `ToolSearch`) to preserve Tier 1 attention headroom.
3. **Repository Implementation Note (`paseo-sidecar`)**:
   - `paseo-sidecar/` prototyped a cross-runtime **Byte-0 Cache-Safe Meta-Tool Gateway** exposing `5` fixed meta-tools (`sidecar_discover`, `sidecar_load_skill`, `sidecar_describe_tool`, `sidecar_call_tool`, `sidecar_exec_batch`) so workspace switches never invalidate upstream prompt caches.
   - Current status: `paseo-sidecar` is **`PAUSED`** while native `paseo-agy-acp` and `paseo-bots` handle production workloads.

---

## 5. Cache & Governance Anti-Patterns & Conformance Gate

| Anti-Pattern | Measured Degradation | Deterministic Remediation |
| :--- | :--- | :--- |
| Embedding timestamps or live blackboard state in system prompt | `0%` Tier 1/2 cache hit rate; full `27k–31k` prefix re-billed every turn. | Isolate volatile state downstream of `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` as epoch-gated tail blocks. |
| Exceeding `150` combined rules across `AGENTS.md` + persona + skills | Uniform compliance drop across all rules including critical path boundaries. | Compress root `INDEX.md` / `AGENTS.md` (`<= 50–75` lines) and move hard checks to `PreToolUse` (`Exit Code 2`). |
| Preloading a `disable-model-invocation: true` skill on a subagent | Deterministic initialization crash on subagent spawn. | Exclude human-only slash skills from agent `skills:` arrays; validate roster manifests in CI. |
| Dynamic MCP tool addition/removal during an active session | Invalidates Byte-0 tool block and everything downstream in the KV cache. | Freeze sorted tool schemas at spawn (`mid_session_tool_mutations == 0`); route dynamic tools via meta-tool search. |

### Conformance Metrics

- Track `cache_read_share = cache_read / (input + cache_read + cache_write)` per bot; investigate any stationary multi-turn workflow dropping below `0.75`.
- Hash system prompts and tool arrays at session start; ship prompt mutations only when benchmark pass rates are non-inferior and first-segment tokens do not grow.
