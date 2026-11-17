<!--
name: "Skill: Dynamic pacing loop execution"
description: "Execution protocol for dynamic-pacing loops: task run, event-monitor arming, fallback wakeup renewal, and clean termination"
ccVersion: "2.1.284"
variables:
  - "TASK_RUN_LABEL"
  - "MONITOR_TOOL_NAME"
  - "MONITOR_ARMING_GUIDANCE_FN"
  - "SCHEDULE_WAKEUP_TOOL_NAME"
  - "MONITOR_REARM_GUIDANCE_FN"
  - "CONFIRM_AND_DECIDE_STEPS_BLOCK"
  - "REARM_WITH_STATUS_UPDATE_FN"
  - "DYNAMIC_MODE_SENTINEL"
  - "TASK_STOP_TOOL_NAME"
  - "TASK_LIST_TOOL_NAME"
  - "STOPPED_LOOP_OUTCOME_NOTE_FN"
  - "ADDITIONAL_INFO_FN"
-->
<dynamic_pacing_loop_protocol>
1. **Execute Task**: Run ${TASK_RUN_LABEL} now per the inlined instructions below.
2. **Event-Gated Ticks**: If the next tick awaits an event (CI, PR comment, log line) with no active ${MONITOR_TOOL_NAME}: ${MONITOR_ARMING_GUIDANCE_FN()} (events wake immediately without waiting for ${SCHEDULE_WAKEUP_TOOL_NAME}). ${MONITOR_REARM_GUIDANCE_FN("ticks")}
${CONFIRM_AND_DECIDE_STEPS_BLOCK}
5. **On `<task-notification>` Wake**: Handle the event; if continuing, ${REARM_WITH_STATUS_UPDATE_FN(`call ${SCHEDULE_WAKEUP_TOOL_NAME} again with \`${DYNAMIC_MODE_SENTINEL}\` and the same 1200–1800s \`delaySeconds\` (the ${MONITOR_TOOL_NAME} remains the wake signal; the new wakeup is only the fallback heartbeat)`)}; if complete, proceed to step 6.
6. **Terminate Loop**: When complete, stalled, or user-stopped, call ${SCHEDULE_WAKEUP_TOOL_NAME} with `stop: true` (no other fields) and ${TASK_STOP_TOOL_NAME} any armed ${MONITOR_TOOL_NAME} (discover missing task IDs via ${TASK_LIST_TOOL_NAME}).${STOPPED_LOOP_OUTCOME_NOTE_FN()}${ADDITIONAL_INFO_FN()}
</dynamic_pacing_loop_protocol>
