---
doc_id: SPEC-OPT-COLLAB-CACHE-2026
status: PROPOSED
version: 0.2.0
last_verified: 2026-11-07
language: en-US
---

# Collaboration, Cache and Prompt Optimization Catalog

Optional techniques. Nothing changes until an item passes its metric in an A/B run (section 6). Vendor figures are parameters to re-check, not constants. Linkage mechanisms are in [multi-agent-linkage-reference-study.md](multi-agent-linkage-reference-study.md).

## 1. When several agents beat one workflow

This is a hypothesis with conditions. Multi-agent runs usually cost several times the tokens of one agent.

| Source of gain | Holds when | Fails when |
| :--- | :--- | :--- |
| Parallelism | Subtasks have disjoint write sets | Tasks form a dependency chain |
| Context purity | Subtasks need different knowledge | All Bots need the same large context |
| Independent verification | Reviewer differs in model or role | Same model and prompt, same blind spot |
| Isolation | Failures are common | Tasks are tiny and reliable |
| Checkpointing | Work spans many turns | Work ends in one turn |

```
speedup = T_sequential / (T_critical_path + C_coordination)
```

If `speedup <= 1` and quality does not improve, route to one Bot (M1).

## 2. Cache and memory

The runtime is the Claude Agent SDK, which places cache markers itself. Verify that. The host controls four things: byte stability of the prefix (order is tools, system, messages), tool list stability, session continuity (a model switch invalidates), and timing (default lifetime about five minutes, each hit refreshes it).

| ID | Technique | Rule | Risk | Metric |
| :--- | :--- | :--- | :--- | :--- |
| C1 | Epoch-gated blackboard | Keep the system prompt static. Inject the blackboard as a tail block only when its epoch changed. Today the snapshot sits in the system prompt, so each change invalidates the history behind it | Tail text may weigh less, so keep hard rules in the static part | Cache read share |
| C2 | Tool-set freezing | Sort tools by name and fix the set at spawn from the Bot allowlist | None | Mid-session tool changes, target 0 |
| C3 | Idle-aware compaction | If the cache already expired and the context ratio is at least 0.5, compact now because the rewrite is already paid. Otherwise wait for 0.85. Never compact mid-burst | Earlier detail loss | Cache write tokens from compaction |
| C4 | Keepalive or expiry | Formula below | A ping is a real request and enters the transcript | Gap between turns |
| C5 | Memory scoring and packing | Formulas below | A wrong score hides a fact, so log evictions | Retrieval recall, memory tokens per turn |

```
C4  prefix P, write multiplier w, read multiplier r
    keepalive wins when E[pings] < (w - r) / r
    with w = 1.25 and r = 0.1 that is about 11 pings, under an hour at 4.5 minute spacing

C5  score = importance * exp(-lambda * age) * (1 + alpha * ln(1 + hits))
    lambda = 0 for hard constraints; evict lowest score under a byte budget
    pack by score / tokens, skipping cards that do not fit; dedupe by content hash
```

Memory tiers: working (model context), episodic (`messages`, read by cursor), semantic (`MEMORY.md`, `GROUP_MEMORY.md`, indexed cards, read with a token budget).

## 3. Prompt optimization

| ID | Rule | Metric |
| :--- | :--- | :--- |
| P1 | Fixed skeleton: role, objective, constraints, inputs, output schema, done criteria. Stable first, volatile last | Cache read share |
| P2 | Send peer messages after the member cursor, never the whole timeline | Input tokens per turn |
| P3 | Handoff in five parts: observation, logic chain, caveats, conclusion, verification method. Evidence is path plus symbol | Handoff loss rate |
| P4 | State a length cap and a stop condition. Use the silent token when nothing is new | Output tokens per turn |
| P5 | One rule per line, positive form, rule before reason, no rule repeated across files | Prompt tokens |
| P6 | Keep tool descriptions to what changes tool choice | First-segment tokens |
| P7 | Add self-check or second-model review only for irreversible steps | Escaped defects per cost |
| P8 | Hash prompts. Ship a change only if a fixed task set is non-inferior and tokens do not rise | Pass rate |

Remove from prompts: politeness filler, restated tasks, capitalized emphasis, negation-only rules, personas with no behavior.

## 4. Session crossing

Lanes stay isolated. Crossing goes through artifacts, never raw transcripts.

| ID | Rule | Metric |
| :--- | :--- | :--- |
| X1 | Store `fact_provenance(fact_id, session_id, seq_from, seq_to, digest)`. On rewind to sequence `s`, mark facts with `seq_to >= s` as stale, hide them until the director reconfirms, and bump the blackboard epoch | Stale facts surviving a rewind, target 0 |
| X2 | Merge digests between a direct lane and a room lane by pull only, with source ranges so X1 can invalidate them | Tokens per turn |
| X3 | Scalars by compare-and-swap on version, logs append-only, task ownership by lease with expiry | Lost updates, target 0 |
| X4 | Pick a reviewer of a different model tier or role than the author, never the author | Catch rate per pair |

## 5. Linkage

| Topology | Protocol | Use when |
| :--- | :--- | :--- |
| Pipeline | Relay | Stage `i` output is the only input of stage `i+1` |
| Fan-out and fan-in | Dispatch | Subtasks are orthogonal |
| Shared blackboard | Blackboard store | Many read, few write |
| Cross-review | Reviewer role | Defects are costly and review is cheap |
| Director | Orchestration role | Routing needs judgment |

| ID | Rule |
| :--- | :--- |
| M1 | Route by rules before any model call. One domain and small, use one Bot. Strict chain, use a pipeline. Two ready subtasks with disjoint write paths, fan out. Irreversible change, add review |
| M2 | Dispatch critical-path nodes first. Width is the smallest of ready orthogonal nodes, free Bots and the token share. Nodes with slack wait |
| M3 | Start independent preparation while a dependency is pending. Discard on a changed premise |
| M4 | Replace fixed step counts with a per-round token budget and a novelty check. Two turns with no new claim end the round |
| M5 | Reference flow below |

The orthogonality test in M1 compares declared target paths with each Bot's `allowedWritePaths`.

```
moAdmin -> [ MoDeep research || moDoc spec ] -> moCode implement -> MoCI verify -> MoGit squash
                                                    ^                  |
                                                    +---- defects -----+
```

`Mo` stays off the delivery path. Spec drafting runs beside research and leaves the critical path.

## 6. Metrics and experiment protocol

| Metric | Definition |
| :--- | :--- |
| Cache read share | `cache_read / (input + cache_read + cache_write)` per Bot |
| Collaboration efficiency | `(quality_multi / quality_single) / (cost_multi / cost_single)` |
| Speedup | `T_single / T_multi` |
| Handoff loss | Required facts missing in the receiver's first turn, over required facts |
| Review catch rate | Seeded defects found, over seeded defects |

1. Fix the task set and the adoption thresholds before running.
2. Arm A is one Bot with the same tools. Arm B is the routed room.
3. Quality is the verification gate plus seeded-defect catch rate.
4. Repeat enough runs to separate the arms from noise and report the spread.
5. Adopt for a task class only if the spread excludes no change. Keep a rollback switch per item.

Order: C1 and C2, then M1, then X1, then P3 and P8, then C3 and C5, then M2 to M4.
