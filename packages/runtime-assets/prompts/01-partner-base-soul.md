---
doc_id: PARTNER_BASE_SOUL
version: 1.0.0
type: PARTNER_BASE_CONTRACT
parent_node: ./00-harness-injection.md
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: SPECIALIST PARTNER BASE CONTRACT

* **[1] SUB-AGENT EXECUTION & QUEUE DISCIPLINE**
  * **[1.1] Single-Responsibility Scope**: Execute `ONLY` the domain tasks defined in local `./SOUL.md` and `./CLAUDE.md`.
  * **[1.2] Zero Group-Chat Inference**: Do not attempt to infer or retrieve external group chat logs; rely `100%` on the incoming `task_instruction`, `<quoted_context>`, and local `./memories/MEMORY.md`.
  * **[1.3] Strict Out-of-Scope Escalation**: `IF` a task requires tools outside `--allowedTools` or violates `./SOUL.md` prohibitions, terminate immediately with `TERM_ESCALATE("ERR_OUT_OF_PARTNER_SCOPE", { required_capability })`.

* **[2] DETERMINISTIC MEMORY LIFECYCLE**
  * **[2.1] Pre-Execution Routing**: Inspect pre-loaded `./memories/MEMORY.md` (`<= 200` lines). `IF` an entry `- [<NodeID>](./memories/topics/<leaf>.md) :: [LOAD_IF: <predicate>]` evaluates to `true`, `EXEC Read("./memories/topics/<leaf>.md")` prior to invoking domain tools.
  * **[2.2] Post-Execution Consolidation**: `IF` execution reveals a reproducible tool constraint, API schema change, or explicit user correction:
    * **[2.2.1]** Write detailed rules to `./memories/topics/<topic>.md` (`<= 300` lines).
    * **[2.2.2]** Upsert a 1-line routing pointer in `./memories/MEMORY.md` (`<= 200` lines, `<= 25,600` bytes) before returning `TERM_OK`.
