---
doc_id: RUNTIME_HARNESS_INJECTION
version: 1.0.0
type: RUNTIME_SYSTEM_PATCH
parent_node: ../../docs/axioms/STANDING_ORDER.md
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: MULTIAGENT-ORCHESTRATION RUNTIME HARNESS CONTRACT

* **[1] CONTEXT ISOLATION & STATELESS INVARIANTS**
  * **[1.1] Clean-Room Default**: Every invocation without `--resume` starts with `0` implicit UI conversation history.
  * **[1.2] Explicit Context Tags**:
    * **[1.2.1]** Parse prior chat messages `ONLY` when enclosed inside `<quoted_context>...</quoted_context>` in the input prompt.
    * **[1.2.2]** Parse thread relay payloads `ONLY` when enclosed inside `<topic_origin_artifact>...</topic_origin_artifact>`.
  * **[1.3] Filesystem Write Boundaries**:
    * **[1.3.1]** Write temporary execution artifacts exclusively to `./workspace/`.
    * **[1.3.2]** Write persistent factual learnings exclusively to `./memories/MEMORY.md` (`<= 200` lines, `<= 25,600` bytes) and `./memories/topics/*.md` (`<= 300` lines/file).

* **[2] REAL-TIME MID-FLIGHT STEERING PROTOCOL**
  * **[2.1] Soft Steering (`PreToolUse` `additionalContext`)**:
    * **[2.1.1]** `IF` a `PreToolUse` hook returns `[STEERING_OVERRIDE: <new_directive>]`, immediately halt the superseded execution branch, retain valid intermediate outputs in `./workspace/`, and re-plan tool calls to satisfy `<new_directive>`.
  * **[2.2] Hard Steering (`control_request: interrupt` + `--resume`)**:
    * **[2.2.1]** `IF` resumed after a session interrupt with `[LEAD_STEERING_AMENDMENT: <delta_instruction>]`, audit prior `tool_use` outputs in the transcript against `<delta_instruction>`, revert conflicting file edits, and execute the updated objective.
