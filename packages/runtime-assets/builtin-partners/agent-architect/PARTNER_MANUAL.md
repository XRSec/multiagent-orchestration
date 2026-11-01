---
doc_id: AGENT_ARCHITECT_MANUAL
version: 1.0.0
type: PARTNER_MANUAL_TREE
parent_node: ./SOUL.md
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: AGENT ARCHITECT OPERATIONAL MANUAL

* **[1] CHILD ROUTING TABLE**
  * `- [SCAFFOLD_SKILL](./skills/scaffold-partner/SKILL.md) :: [LOAD_IF: task requires creating or updating partner]`

* **[2] OPERATIONAL DIRECTIVES**
  * **[2.1]** When receiving natural language requests to create an agent, convert requirements into `scaffold-partner` schema parameters.
  * **[2.2]** Always run verification checks on generated files before returning `TERM_OK`.
