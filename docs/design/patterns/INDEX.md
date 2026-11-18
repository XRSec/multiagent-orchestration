---
doc_id: DESIGN-PATTERNS-INDEX
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Cross-Runtime Agent Architecture Patterns Index

Runtime-agnostic engineering patterns governing attention economics, prompt cache topology, multi-agent anti-loop protocols, bounded blackboard state, quality arbitration, and progressive memory consolidation across Antigravity ACP, Claude Code, Codex, and Paseo harnesses.

Parent index: [../INDEX.md](../INDEX.md)

## Core Governing Principles

1. **Attention & Cache Conservation**: Treat context windows and instruction slots (`120–150` total rules) as scarce physical budgets; isolate volatile state downstream of static cache prefixes and freeze Byte-0 tool schemas at session spawn.
2. **Determinism in Host Code**: Enforce ordering, cursor watermarks, optimistic-lock versioning, path containment, and retry circuit breakers in host runtime code and OS hooks (`Exit Code 2`), never through repetitive prompt prose.
3. **Incremental & Bounded Coordination**: Transmit only cursor-sliced peer deltas (`lastSeenSequence`) and role-projected blackboard slices (`<= 1,400` tokens); default to a single agent whenever coordination overhead exceeds parallel critical-path savings.
4. **Pointer-First Memory**: Inject lightweight index pointers (`< 500` tokens) at session startup and consolidate raw episodic transcripts asynchronously offline.

## Pattern Shards

| Shard | Architectural Domain & Key Mechanisms |
| :--- | :--- |
| [shards/01-attention-and-compaction.md](shards/01-attention-and-compaction.md) | Five attention degradation vectors (`64k` rot, drift, $O(n^2)$ dilution, `25%–75%` U-curve, distractors), two-stage lossy compaction, reload matrix, and two-phase re-anchoring. |
| [shards/02-cache-layers-and-instruction-budget.md](shards/02-cache-layers-and-instruction-budget.md) | Three-tier prompt caching, `120–150` rule ceiling, `MUST`/`NEVER` deadlock calibration, lazy skill scoping (`disable-model-invocation`), and Byte-0 tool schema freezing. |
| [shards/03-groupchat-anti-loop-and-delta.md](shards/03-groupchat-anti-loop-and-delta.md) | 64-bit monotonic `sequence`, `(member, room, thread)` cursors, three cursor laws, code-point truncation, `<untrusted-json-block>` isolation, and five-dimensional anti-loop gates. |
| [shards/04-blackboard-budget-and-arbitration.md](shards/04-blackboard-budget-and-arbitration.md) | Five-scope `1,400`-token blackboard slicing (`G0` lock, `K=2` digest), `compactTouchedFiles` bucket folding, host-side versioning, and L1/L2/L3 SHA-256 quality arbitration. |
| [shards/05-multiagent-roi-and-memory.md](shards/05-multiagent-roi-and-memory.md) | Speedup law (`T_seq / (T_crit + C_coord)`), disjoint `allowedWritePaths`, five-part handoff contract, `MaxDepth <= 3` Advisor/P2P bounds, Invisible Partner `<500`-token index, and Dreams consolidation. |
