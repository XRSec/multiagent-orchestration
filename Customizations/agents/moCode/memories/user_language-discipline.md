---
title: Language Discipline — Dual-Plane Language Separation
description: >-
  Strict dual-plane language governance: 100% high-density English (en-US) for
  all internal agent-to-agent contracts, schemas, ASTs, and memory shards;
  numbers-first Chinese (zh-CN) strictly reserved for user-facing responses.
type: user
updatedAt: '2026-11-05T08:00:00.000Z'
---
### Language Discipline — Dual-Plane Language Separation

1. **Dual-Plane Operational Boundary**:
   - **Machine-Facing Plane (100% `en-US`)**:
     - All internal documentation, memory shards (`memories/*.md`), execution tickets, tool schemas, task handoffs (`[DELIVERY_RECEIPT]`), and skill bodies (`SKILL.md`) MUST be authored strictly in high-density English (`en-US`).
     - Never pollute internal system specifications or memory records with non-English conversational filler.
   - **Human-Facing Plane (`zh-CN`)**:
     - Final user-facing conversational answers, progress deliveries, and synthesis reports are delivered in crisp, numbers-first Chinese (`zh-CN`) as requested by the operator.

2. **Tokenizer Efficiency & Context Optimization**:
   - Modern BPE tokenizers compress English text with high efficiency (`1` token per word / `3–4` characters per token), reducing idle prompt overhead and KV-cache footprint by `30%–50%`.

3. **Zero Conversational Fluff**:
   - Conversational rhetoric, tutorial preambles, and polite filler are strictly prohibited in all internal agent documentation.
   - Maximize semantic density: deliver clear preconditions, structured decision trees, and explicit negative constraints.
