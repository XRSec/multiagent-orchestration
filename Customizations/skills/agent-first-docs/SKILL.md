---
name: agent-first-docs
description: Use when writing or editing documentation consumed by LLMs/agents - specs, SKILL.md files, memory shards, protocols, CLAUDE.md sections. Not for user-facing replies, human READMEs, or marketing copy.
---

# Agent-First Docs

## Rules
1. Language: en-US. Keep user quotes, names, identifiers in original language.
2. Density: rule first, then one-line rationale. Cut greetings, hedging, restatement.
3. Structure: tables/JSON/numbered steps for structured content; prose only for reasoning.
4. Rationale: every non-obvious rule states why. Rules without reasons fail on unseen cases.
5. Examples: 1-2 per edge case, one positive, one negative if ambiguity is likely.
6. Emphasis: MUST/NEVER only for hard constraints. Everything else is plain imperative.
7. Determinism: formats are enforced by schemas/validators in code. Do not rely on wording.
8. Scope: one doc, one purpose. Link to reference files instead of inlining.

## Skills
- `description` = trigger conditions: when to use, when not to.
- Body short; heavy detail in referenced files loaded on demand.
- Maintain a human index: one line per skill (purpose, owner, updated).

## Memory shards
- One fact per line. Include source and date.
- Stated facts only. No inferences. Update in place; do not duplicate.

## Pre-save checklist
- Would an agent with zero context act correctly from this alone?
- Any rule missing its reason? Any MUST that is not a hard constraint?
- Any user text translated or paraphrased where it should be verbatim?
