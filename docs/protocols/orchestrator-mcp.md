# Protocol Specification: Host-Internal Orchestrator MCP (`nexus-orchestrator-mcp`)

## 1. Role and Operational Scope

`nexus-orchestrator-mcp` is an in-process, stdio-based Model Context Protocol server mounted exclusively to the Lead Coordinator session. It provides the structured primitives required to dispatch, await, steer, and repair background partner executions without exposing raw shell or process manipulation commands.

---

## 2. Tool Definitions

### 2.1 `dispatch_and_queue_partners`
Decomposes a user task into parallel or pipeline execution packets across specialized partner directories.

```json
{
  "name": "dispatch_and_queue_partners",
  "description": "Spawns asynchronous partner tasks according to their assigned domains.",
  "parameters": {
    "type": "object",
    "required": ["assignments"],
    "properties": {
      "assignments": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["partner_id", "task_instruction"],
          "properties": {
            "partner_id": { "type": "string" },
            "task_instruction": { "type": "string" },
            "quoted_message_ids": { 
              "type": "array", 
              "items": { "type": "string" },
              "description": "Optional message IDs from group timeline to inject as <quoted_context>"
            },
            "output_json_schema": { 
              "type": "object",
              "description": "Enforced structured output schema for the partner response"
            }
          }
        }
      }
    }
  }
}
```

### 2.2 `await_partner_queue`
Suspends the Lead Coordinator turn while worker subprocesses execute.

- **Inputs**:
  - `ticket_ids`: Array of task IDs returned by `dispatch_and_queue_partners`.
  - `wait_mode`: `"ALL"` | `"FIRST_COMPLETED"`.
- **Return Contract (Normal Completion)**:
  Returns completed task payloads, execution duration, and partner session UUIDs.
- **Return Contract (User Amendment Interruption)**:
  If the host detects a new user message on the group timeline during suspension, the host immediately resolves the promise with:
  ```json
  {
    "event_type": "USER_MID_FLIGHT_AMENDMENT",
    "user_new_message": "<amended_text>",
    "active_subtasks": [...],
    "instruction": "Evaluate user amendment and issue steer_or_repair_partner."
  }
  ```

### 2.3 `steer_or_repair_partner`
Directs real-time modification of an active task or requests rework on a completed task.

```json
{
  "name": "steer_or_repair_partner",
  "description": "Steers an active partner or repairs an existing partner session.",
  "parameters": {
    "type": "object",
    "required": ["partner_id", "target_session_id", "mode", "instruction"],
    "properties": {
      "partner_id": { "type": "string" },
      "target_session_id": { "type": "string" },
      "mode": { 
        "type": "string", 
        "enum": ["STEER_IN_FLIGHT", "REPAIR_COMPLETED"] 
      },
      "instruction": { "type": "string" }
    }
  }
}
```
