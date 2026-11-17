---
doc_id: ORCHESTRATOR_MCP_SPEC
version: 1.0.0
type: SPECIFICATION_TREE
parent_node: ../../AGENTS.md
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: HOST-INTERNAL ORCHESTRATOR MCP SPECIFICATION

* **[1] CHILD ROUTING TABLE**
  * `- [AGENTS](../../AGENTS.md) :: [LOAD_IF: need_parent_charter]`

* **[2] I/O & GUARDRAIL CONTRACTS**
  * **[2.1] Target Mount**: In-process stdio MCP server bound strictly to `lead-orchestrator`.
  * **[2.2] Tool Contracts**:
    * `dispatch_and_queue_partners`: Ingests `assignments: Array<{ partner_id, task_instruction, quoted_message_ids?, output_json_schema? }>`. Spawns child claude processes.
    * `await_partner_queue`: Ingests `ticket_ids: string[], wait_mode: "ALL" | "FIRST_COMPLETED"`. Yields Lead turn.
    * `steer_or_repair_partner`: Ingests `partner_id, target_session_id, mode: "STEER_IN_FLIGHT" | "REPAIR_COMPLETED", instruction`.
  * **[2.3] Invariants**:
    * `[2.3.1]` If user submits group message during `await_partner_queue`, host immediately resolves tool call with `USER_MID_FLIGHT_AMENDMENT` event.
    * `[2.3.2]` Specialists have zero direct access to this MCP server.

* **[3] EXECUTION DECISION TREE**
  * **[3.1] Step 1 [DISPATCH]**: Assign task ticket -> initialize partner child process.
  * **[3.2] Step 2 [SUSPEND & RESOLVE]**:
    * `├── IF (all subtasks finish)` -> Resolve promise with `QUEUE_COMPLETED` -> `TERM_OK`.
    * `└── IF (user mid-flight message arrives)` -> Break wait state with `USER_MID_FLIGHT_AMENDMENT` -> `TERM_OK`.
