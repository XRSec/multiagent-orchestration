---
doc_id: DESIGN-PATTERNS-SHARD-05
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Multi-Agent ROI, Write-Set Orthogonality & Progressive Memory

Parent index: [../INDEX.md](../INDEX.md)
Related shards: [01-attention-and-compaction.md](01-attention-and-compaction.md) · [03-groupchat-anti-loop-and-delta.md](03-groupchat-anti-loop-and-delta.md) · [04-blackboard-budget-and-arbitration.md](04-blackboard-budget-and-arbitration.md)

## 1. Multi-Agent Speedup Law & Single-Agent Default

Evaluate multi-agent routing via deterministic host rules before spawning subagents.
Multi-agent runs spend `3x–8x` the tokens of one agent and win only when parallel critical-path savings, context purity, or independent verification beats coordination overhead.

$$\text{speedup} = \frac{T_{\text{seq}}}{T_{\text{crit}} + C_{\text{coord}}}, \qquad \eta_{\text{collab}} = \frac{Q_{\text{multi}} / Q_{\text{single}}}{\text{Cost}_{\text{multi}} / \text{Cost}_{\text{single}}}$$

| Task Structure | Optimal Topology | Selection Criterion |
| :--- | :--- | :--- |
| Single domain, small scope, or $\text{speedup} \le 1$ with low defect cost | **Single Specialist Bot** | Default path (`M1`); avoids duplicate prefix reads and handoff loss. |
| Stage $i$ output is the strict prerequisite of stage $i+1$ (`moCode -> MoCI -> MoGit`) | **Sequential Relay Pipeline** | Enforces role and write-scope separation along a dependent chain. |
| `>= 2` ready subtasks with orthogonal write paths (`MoDeep || moDoc`) | **Parallel Fan-Out / Fan-In** | Dispatch critical-path nodes first; cap width at `min(readyNodes, freeBots, tokenShare)`. |
| Many readers, sparse structured state mutations | **Shared Blackboard** | Replaces $O(N^2)$ peer chatter with `<= 1,400`-token role-projected slices. |
| Irreversible or high-blast-radius production change | **Cross-Tier / Cross-Role Gate** | Reviewer differs in role or model family from author (`X4`) to decorrelate blind spots. |

### 1.1 Disjoint Write-Set Concurrency Law

Verify write-path orthogonality statically before launching concurrent workers:
1. Intersect declared target paths against each candidate bot's `allowedWritePaths` (`paseo-bots-plugin-settings/bots.json`).
2. Permit concurrent fan-out **only** when write sets are strictly disjoint ($W_A \cap W_B = \emptyset$) or isolated inside separate linked Git worktrees.
3. Redline: NEVER run two concurrent agents with overlapping write targets inside a single shared working tree; serialize them into sequential stages.

---

## 2. Five-Part Handoff Contract & Bounded Delegation

### 2.1 Deterministic `<worker_handoff>` Output Schema

Require every specialist return and cross-stage transition to populate five bounded fields anchored to `repository_relative_path + symbol_name` (never volatile line numbers), measuring `handoff_loss` as required facts missing on the receiver's first turn:

```xml
<worker_handoff>
  <observation>Verified empirical facts cited strictly by file path and symbol identifier.</observation>
  <logic_chain>Causal derivation linking observation to root cause or design choice (<= 3 hops).</logic_chain>
  <caveats>Residual risks, untested boundary conditions, or explicit out-of-scope items.</caveats>
  <conclusion>Exact state change delivered or gate verdict (PASS | WARN | FAIL).</conclusion>
  <verification_method>Non-interactive command and expected exit code proving the conclusion.</verification_method>
</worker_handoff>
```

### 2.2 Hierarchical Budgets, `Advisor` vs P2P & `MaxDepth <= 3`

1. **Five-Layer Budget Containment**:
   - Enforce top-down budget ceilings across `L1 Turn -> L2 Round -> L3 Task -> L4 Program -> L5 Project`.
   - No child layer may spend tokens or retries beyond the remaining cap granted by its parent layer, and two consecutive turns with zero net-new claims end the round early (`M4`).
2. **Stateless `Advisor` Consult vs Stateful P2P**:
   - **`Advisor` Channel**: Single-shot mid-turn consult to a stronger reasoning tier with zero room-timeline bubbles and zero child session persistence; a failed consult degrades gracefully without failing the caller's turn.
   - **Stateful P2P / Subagent (`MaxDepth <= 3`)**: Resumable specialist delegation (`invoke_subagent`, `send_message`) MUST enforce a hard call-tree depth cap of **`MaxDepth <= 3`** plus ancestor-cycle rejection so peer consultations NEVER recurse infinitely.
3. **Autonomous Goal State Across Rewind & Fork**:
   - Bind autonomous loop goals to session state: conversation rewind pauses an active goal at an operator checkpoint, while conversation fork cancels inherited active goals on the branched session so forks cannot run away autonomously.

---

## 3. Invisible Partner Pointer Memory & Offline `Dreams` Consolidation

NEVER dump raw historical session transcripts into new sessions.
Separate fast working context from long-term institutional memory through two-stage pointer disclosure and offline background consolidation.

### 3.1 `< 500`-Token `INDEX.md` Pointer Architecture (Invisible Partner)

1. **Startup Pointer Ceiling**:
   - Mount only a compact pointer index (`MEMORY.md` or `tasks/INDEX.md`, strictly **`< 500` tokens** of one-line `<TASK-ID> :: <dossier-relative-path> :: <verified-outcome>` entries) in Tier 2 startup context.
   - Agents scan pointer summaries at near-zero token cost and read granular task dossiers (`tasks/task-<id>.md`) on demand strictly when relevant.
2. **Utility-Scored Memory Packing**:
   - Score candidate semantic memory cards under fixed byte caps via:
     $$\text{score} = \text{importance} \cdot e^{-\lambda \cdot \text{age}} \cdot (1 + \alpha \ln(1 + \text{hits}))$$
   - Set $\lambda = 0$ for permanent architectural redlines so safety invariants never decay by age; pack greedily by `score / tokens`, deduplicate by content hash, and log evictions.

### 3.2 Offline `Dreams` Consolidation & Rewind Provenance

Run asynchronous consolidation passes (**Dreams** pattern) in detached background workers after session close or during daemon idle windows rather than taxing foreground turns:
1. **Provenance-Stamped Distillation**:
   - Compress completed raw transcripts into structured task dossiers recording `fact_provenance(fact_id, session_id, seq_from, seq_to, digest)`.
2. **Rewind Invalidation & Pruning**:
   - When a session rewinds to `targetSeq`, mark every derived fact with `seq_to >= targetSeq` as stale (`X1`), bump the memory epoch, merge duplicate operational lessons by digest, purge falsified hypotheses, and rewrite the `< 500`-token pointer index atomically.

---

## 4. Multi-Agent & Memory Anti-Pattern Matrix

| Anti-Pattern | Failure Mode | Required Engineering Pattern |
| :--- | :--- | :--- |
| Spawning swarms for Q&A, reviews, or single-file edits | `3x–8x` token waste and slower wall-clock completion ($C_{\text{coord}} \gg T_{\text{seq}} - T_{\text{crit}}$). | Apply `M1` pre-model router: route single-domain or sequential tasks to one specialist bot. |
| Concurrent fan-out over overlapping `allowedWritePaths` | Silent file overwrites, dirty index collisions, and broken builds. | Require $W_A \cap W_B = \emptyset$ across `allowedWritePaths` or isolate each worker in a dedicated Git worktree. |
| Citing volatile line offsets in handoffs or specs | Line shifts on the next edit turn citations into misleading pointers. | Anchor `<worker_handoff>` observations and specs strictly to `repository_relative_path + symbol_name`. |
| Unbounded peer-to-peer `invoke_subagent` chains | Circular A -> B -> C -> A delegation exhausts quotas and hangs parent settle. | Enforce `MaxDepth <= 3` hop ceiling plus caller-ancestry cycle rejection in the dispatch host. |
| Dumping full prior transcripts into new sessions | Immediate `64k` Context Rot and stale rewound facts polluting new plans. | Inject `< 500`-token `INDEX.md` pointer tables (`Invisible Partner`) and invalidate `fact_provenance` rows where `seq_to >= rewindTargetSeq` during offline `Dreams` consolidation. |

---

## 5. Adoption & Verification Protocol

- Benchmark multi-agent routing changes on a fixed task suite against a single-agent baseline (`Arm A` single bot vs `Arm B` routed workflow) measuring `cache_read_share`, `speedup`, `handoff_loss`, and seeded-defect `review_catch_rate`.
- Verify write-set orthogonality statically against `paseo-bots-plugin-settings/bots.json` before dispatching parallel subagents.
- Ship a multi-agent topology rule only when verification pass rate is non-inferior and either `speedup > 1` or `review_catch_rate` improves measurably, retaining a per-rule rollback switch.
