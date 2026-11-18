---
doc_id: DESIGN-PATTERNS-SHARD-01
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Attention Degradation Dynamics & Lossy Compaction Lifecycle

Parent index: [../INDEX.md](../INDEX.md)
Related shards: [02-cache-layers-and-instruction-budget.md](02-cache-layers-and-instruction-budget.md) · [04-blackboard-budget-and-arbitration.md](04-blackboard-budget-and-arbitration.md) · [05-multiagent-roi-and-memory.md](05-multiagent-roi-and-memory.md)

## 1. Five Attention Degradation Vectors

Bound active session context well below nominal `200k–1M` window limits.
Heterogeneous tool-heavy transcripts induce five predictable transformer attention failure modes long before hard token exhaustion.

| Degradation Vector | Underlying Mechanism | Empirical Threshold & Failure Mode | Architectural Mitigation |
| :--- | :--- | :--- | :--- |
| **64k Context Rot** | Raw shell stdout, JSON dumps, and lint chatter saturate sequence positions. | Linear instruction-adherence decay past `64,000` tokens; rising negative-constraint hallucinations. | Cap raw tool payloads (`<= 64` KB) and slice error logs to trailing `<= 40` lines. |
| **Multi-Turn Drift** | Autoregressive bias weights recent assistant tokens over distant system rules. | Fast/mid-tier models drop negative constraints or invent permissions after `15+` consecutive turns. | Enforce hard invariants via host hooks (`Exit Code 2`) and re-anchor goals at turn tails. |
| **$O(n^2)$ Dilution** | Softmax attention mass disperses across $n$ tokens as sequence depth expands. | Exponential attention weight decay on static system rules past `20` tool-heavy turns. | Isolate independent subtasks into fresh child subagent windows. |
| **25%–75% U-Curve Blind Zone** | Positional encodings favor sequence origin (Tier 1 prefix) and sequence tail. | Up to `60%` retrieval loss for paths, schemas, and rules stranded in the `25%–75%` middle band. | Pin static rules in Tier 1/2 prefixes and inject active task slices at the Tier 3 tail. |
| **Long-Error Distractor Hijacking** | Multi-thousand-line stack traces share dense lexical overlap with active code symbols. | Attention heads lock onto irrelevant frames, triggering phantom debugging or repeated failed commands. | Scrub and truncate gate logs before ingestion; trip `3-Fail` circuit breakers. |

---

## 2. Two-Stage Lossy Compaction Lifecycle

Treat `/compact` as a deterministic, tool-free semantic reset rather than a lossless archive.
Assume every intermediate turn envelope outside the structured `<summary>` payload is permanently purged.

### 2.1 Trigger Thresholds & Idle-Aware Cache Timing

| Trigger Policy | Activation Condition | Economic & Cognitive Rationale |
| :--- | :--- | :--- |
| **Active Burst Ceiling** | Context occupancy reaches `75%–80%` (hard ceiling `0.85`). | Reserves generation headroom for distillation before context overflow aborts the turn. |
| **Idle-Aware Early Compact** | Ephemeral prompt cache TTL (~`5` min) expired AND occupancy `>= 0.50`. | Prefix rewrite cost is already unavoidable on the next turn; compacting while cold avoids paying twice. |
| **Warm-Burst Hold** | Ephemeral cache warm AND occupancy `< 0.75`. | Never compact mid-burst; premature compaction invalidates warm prefix reads and drops active detail. |

### 2.2 Two-Stage `<analysis>` -> `<summary>` Distillation Contract

1. **Tool Invocation Suppression (`NO_TOOLS_PREAMBLE`)**:
   - Disable all tool declarations (`Read`, `Write`, `Bash`, MCP, subagent spawn) during compaction inference.
   - Redline: A compaction pass MUST NOT mutate files, run commands, or spawn child agents.
2. **Stage 1 Private Scratchpad (`<analysis>`)**:
   - Force chronological audit and dead-end filtering inside `<analysis>...</analysis>`.
   - Strip the entire `<analysis>` block in host code prior to injecting the compacted turn into history.
3. **Stage 2 Deterministic 9-Section `<summary>` Output Template**:

```xml
<summary>
1. Primary Goal & Operational Intent
2. Key Architectural Decisions & System Constraints
3. Files Modified, Created, or Inspected (Exact Repository-Relative Paths)
4. Current Implementation State & Validated Milestones
5. Test, Build & Verification Command Results
6. Environment & Runtime Configuration Parameters
7. User Explicit Preferences & Operational Redlines
8. Discovered Blockers, Regressions & Unresolved Errors
9. Next Actionable Steps (Ordered Priority Queue)
</summary>
```

---

## 3. Post-Compaction Artifact Reload Matrix

Design rules, skills, and manifests around physical post-compaction survivorship:

| Artifact Class | Post-Compaction Fate | Deterministic Reload Source & Cap |
| :--- | :--- | :--- |
| **Tier 1 System Prompt & Tools** | Preserved verbatim | Retained in static Byte-0 cache prefix; untouched by compaction. |
| **Output Style / Host Validators** | Preserved verbatim | Enforced by host configuration (`settings.json` / schema validator). |
| **Root Manual (`AGENTS.md` / `CLAUDE.md`)** | Evicted, then reloaded | Re-read immediately from disk into Tier 2 context (`<= 200` lines / `25` KB cap). |
| **Memory Pointer Index (`MEMORY.md`)** | Evicted, then reloaded | Re-read from disk (`< 500` tokens target; `<= 200` lines / `25` KB hard cap). |
| **Subdirectory Rules (`<dir>/AGENTS.md`)** | Purged completely | Reloaded lazily on demand only when an agent reads a file inside `<dir>`. |
| **Git Status & Task Manifest** | Refreshed live | Re-probed from workspace Git status and on-disk `.t3/TASK_MANIFEST.md` / blackboard store. |
| **Recently Read Source Files** | Truncated / placeholder | At most `5` files kept; any file `> 5,000` tokens degrades to a path reference. |
| **Invoked Skill Bodies (`SKILL.md`)** | Purged or FIFO-capped | Capped at `5,000` tokens per skill, `25,000` tokens aggregate (FIFO eviction); re-read on re-invocation. |
| **Hook Notices & Transient Reminders** | Condensed | Distilled into `<summary>` slots `4` and `8`; never retained verbatim. |
| **Raw Tool Outputs & Shell Stdout** | Permanently purged | Survive exclusively as condensed facts inside `<summary>` slots `3`, `5`, and `8`. |

---

## 4. Two-Phase Re-Anchoring & Retention Steering

1. **Phase 1 (`PreCompact` Silent Disk Flush)**:
   - Flush active task IDs, blackboard epoch, cursor watermarks, and pending verification commands to disk (`.t3/TASK_MANIFEST.md` or SQLite WAL) before truncation starts.
   - Emit zero `hookSpecificOutput` fields that violate strict `PreCompact` hook schemas.
2. **Phase 2 (`SessionStart` / Post-Compact Tail Anchor)**:
   - Re-inject the locked root objective (`G0`), active task specification, and exact verification command at the tail of the post-compaction turn so execution resumes without exploratory re-reads.
3. **Static & Ad-Hoc Retention Steering**:
   - Declare persistent domain retention rules under `## Compact Instructions` in the root manual (retaining exact DB migration columns, edited test paths, and unresolved defect IDs while discarding raw linter dumps).
   - Steer manual compactions via `/compact focus on <subsystem>` to prioritize active subsystem state.

---

## 5. Compaction Anti-Patterns & Conformance Gate

| Anti-Pattern | Failure Mode | Required Engineering Pattern |
| :--- | :--- | :--- |
| Stating safety redlines only inside skill bodies | `/compact` purges invoked `SKILL.md` bodies, erasing the guardrail. | Enforce redlines in host `PreToolUse` hooks (`Exit Code 2`) and Tier 1/2 static manuals. |
| Leaving `<analysis>` reasoning unstripped | Reasoning scratchpad consumes post-compact tokens and re-introduces dead-end hypotheses. | Strip `<analysis>...</analysis>` in host code before committing `<summary>`. |
| Emitting custom JSON from `PreCompact` hooks | Strict harness hook validators reject unknown `hookSpecificOutput` keys and abort compaction. | Flush state silently to SQLite WAL / `.t3/TASK_MANIFEST.md` and exit `0` with clean stdout. |
| Compacting on every turn regardless of cache TTL | Destroys warm prefix cache reads (`r = 0.10`) and pays repeated cache-write (`w = 1.25`) penalties. | Gate early compaction (`>= 0.50` occupancy) on expired cache TTL; hold warm bursts until `0.75–0.85`. |

### Conformance Assertions

- Assert `NO_TOOLS_PREAMBLE` blocks `100%` of tool calls during compaction synthesis.
- Assert post-compaction context preserves exact repository-relative paths of all modified files in `<summary>` slot `3` and reloads root `AGENTS.md` within `<= 200` lines.
