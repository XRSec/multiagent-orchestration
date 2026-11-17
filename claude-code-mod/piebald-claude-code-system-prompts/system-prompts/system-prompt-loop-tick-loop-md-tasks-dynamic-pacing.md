<!--
name: "System Prompt: /loop tick (loop.md tasks, dynamic pacing)"
description: "Loop tick injection for dynamic self-paced runs of tasks from loop.md"
ccVersion: "2.1.284"
variables:
  - "SCHEDULE_WAKEUP_TOOL_NAME"
  - "LOOP_FILE_DYNAMIC_SENTINEL"
  - "MONITOR_FALLBACK_HEARTBEAT_GUIDANCE_FN"
  - "LOOP_NOTIFICATION_GUIDANCE_FN"
-->
# /loop tick — loop.md tasks (dynamic pacing)

<dynamic_loop_tick>
- Work the tasks from the `loop.md` contents established earlier in this conversation; if missing, treat this tick as a no-op.
- Re-arm the loop this turn by calling `${SCHEDULE_WAKEUP_TOOL_NAME}` with `prompt: "${LOOP_FILE_DYNAMIC_SENTINEL}"` and `noop: true` (no changes) or `noop: false` (changes made).
  Why: This tick was scheduled via `${SCHEDULE_WAKEUP_TOOL_NAME}` rather than a recurring cron, so omitting the call ends the loop.
</dynamic_loop_tick>${MONITOR_FALLBACK_HEARTBEAT_GUIDANCE_FN()}${LOOP_NOTIFICATION_GUIDANCE_FN(!0)}