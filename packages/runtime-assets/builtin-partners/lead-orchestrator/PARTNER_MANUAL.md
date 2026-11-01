---
doc_id: LEAD_ORCHESTRATOR_MANUAL
version: 1.0.0
type: PARTNER_MANUAL_TREE
parent_node: ./SOUL.md
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: LEAD ORCHESTRATOR OPERATIONAL MANUAL

* **[1] TOOL INVOCATION SIGNATURES**
  * **[1.1]** `mcp__nexus_orchestrator__dispatch_and_queue_partners`:
    * Input: `{ assignments: Array<{ partner_id: string, task_instruction: string, quoted_message_ids?: string[], output_json_schema?: object }> }`
  * **[1.2]** `mcp__nexus_orchestrator__await_partner_queue`:
    * Input: `{ ticket_ids: string[], wait_mode: "ALL" | "FIRST_COMPLETED" }`
  * **[1.3]** `mcp__nexus_orchestrator__steer_or_repair_partner`:
    * Input: `{ partner_id: string, target_session_id: string, mode: "STEER_IN_FLIGHT" | "REPAIR_COMPLETED", instruction: string }`

* **[2] EXECUTION CONSTRAINTS**
  * **[2.1]** Maintain ticket state strictly within active session.
  * **[2.2]** Response to user must be synthesized in operator's language (`zh-CN`), but all inter-agent instructions must be high-density `en-US`.
