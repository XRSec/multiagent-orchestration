<!--
name: "System Prompt: /loop tick (loop.md tasks)"
description: "Loop tick injection for recurring cron-based runs of tasks from loop.md"
ccVersion: "2.1.173"
variables:
  - "SCHEDULE_WAKEUP_TOOL_NAME"
  - "LOOP_NOTIFICATION_GUIDANCE_FN"
-->
# /loop tick — loop.md tasks

<cron_loop_tick>
- Work the tasks from the `loop.md` contents established earlier in this conversation; if missing, treat this tick as a no-op.
- Do not call `${SCHEDULE_WAKEUP_TOOL_NAME}` from this tick.
  Why: The recurring cron fires the next tick automatically.
</cron_loop_tick>${LOOP_NOTIFICATION_GUIDANCE_FN(!0)}