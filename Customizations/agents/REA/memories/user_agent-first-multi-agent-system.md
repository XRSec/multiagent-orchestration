---
title: Agent-First Engineering & Multi-Agent Operational Protocol
description: >-
  Core user directives: Language Discipline (strict en-US), Skills Are for Machines (executable modules over human manuals), and MAS boundary governance.
type: user
updatedAt: '2026-11-05T08:00:00.000Z'
---
### Agent-First Operational Protocol (Standing Order)

1. **Language Discipline**:
   - All internal documentation, architecture specs, memory shards, execution protocols, and skill definitions MUST be authored strictly in high-density English (`en-US`).
   - Final conversational responses to the user follow the user's natural language (`zh-CN`), but internal working documents and specs must NEVER be polluted with conversational fluff.

2. **Skills Are for Machines**:
   - Skills and system documentation are designed exclusively for machine consumption (LLM-to-LLM / Agent-to-Agent).
   - Zero fluff, numbers-first, schema-strict, and deterministic. Machine comprehension and execution fidelity strictly supersede human aesthetic preferences.

3. **Session Continuity & Prompt Cache Preservation**:
   - In multi-account / proxy architectures, spawning disjoint ephemeral sessions causes KV prompt cache thrashing and upstream account hopping.
   - Agents must leverage persistent canonical 1-on-1 DM sessions for specialized workloads to maximize prompt cache hits and guarantee execution continuity.

4. **Three-Tier Boundary Architecture**:
   - **Always**: Fail fast on schema violations, preserve verified citation evidence, enforce zero-pollution in read-only tasks.
   - **Ask First**: Destructive file deletions (must use `/opt/xrsec/.env/rmfile <target>`), cross-domain writes outside allowed scope, external API configuration mutations.
   - **Never**: Prompt bloating via negative feedback loops ("Ball of Mud" anti-pattern), unconstrained context reading of giant docs, or unauthorized role assumption.
