<!--
name: "Skill: /loop external wakeup handover"
description: "Handover rules for explicitly requested durable cloud-session loops using one pending send_later wakeup"
ccVersion: "2.1.319"
variables:
  - "SEND_LATER_TOOL_NAME"
  - "CLAUDE_CODE_REMOTE_MCP_SERVER_NAME"
  - "TOOL_SEARCH_TOOL_NAME"
  - "DELETE_TRIGGER_TOOL_NAME"
  - "CRON_DELETE_TOOL_NAME"
  - "SCHEDULE_WAKEUP_TOOL_NAME"
  - "CANCEL_TIMEFRAME_DAYS"
-->

<external_wakeup_handover>
- **Discovery & Offer**: If `${SEND_LATER_TOOL_NAME}` from `${CLAUDE_CODE_REMOTE_MCP_SERVER_NAME}` is available (load via ${TOOL_SEARCH_TOOL_NAME} if deferred), inform the user they can request a loop that survives session exit.
- **Activation**: Build this external loop ONLY when the user explicitly requests it.
- **Single-Pending Invariant**: In place of a local timer, maintain at most one pending `${SEND_LATER_TOOL_NAME}` call (held outside the container; wakes the session in a new container). If woken while a trigger is pending, cancel it via `${DELETE_TRIGGER_TOOL_NAME}` before arming another.
- **Message Format**: Write the `${SEND_LATER_TOOL_NAME}` message in plain language stating the next action, cadence, and stop date — NEVER as a `/loop` command.
- **Handover Cleanup**: Once the first `${SEND_LATER_TOOL_NAME}` call is accepted, cancel any local timer set for this loop (${CRON_DELETE_TOOL_NAME}, or ${SCHEDULE_WAKEUP_TOOL_NAME} with `stop: true`). Report the hand-over and skip finished-loop steps regardless of the tool result.
- **Lifecycle & Stop Limits**: Re-arm only while work remains unfinished; stop after at most ${CANCEL_TIMEFRAME_DAYS} days. If the user requests stop, cancel the pending trigger via `${DELETE_TRIGGER_TOOL_NAME}`.
- **Refusal Fallback**: If `${SEND_LATER_TOOL_NAME}` is refused, explain why to the user and keep a local timer running.
</external_wakeup_handover>