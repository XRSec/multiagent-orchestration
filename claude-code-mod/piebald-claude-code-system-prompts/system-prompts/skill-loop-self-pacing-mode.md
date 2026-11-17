<!--
name: "Skill: /loop self-pacing mode"
description: "Self-pacing /loop mode: arm event monitors as primary wake signals and schedule fallback heartbeat delays between iterations"
ccVersion: "2.1.284"
variables:
  - "MONITOR_TOOL_NAME"
  - "MONITOR_ARMING_GUIDANCE_FN"
  - "SCHEDULE_WAKEUP_TOOL_NAME"
  - "MONITOR_REARM_GUIDANCE_FN"
  - "CONFIRM_AND_DECIDE_STEPS_BLOCK"
  - "REARM_WITH_STATUS_UPDATE_FN"
  - "TASK_STOP_TOOL_NAME"
  - "TASK_LIST_TOOL_NAME"
  - "STOPPED_LOOP_OUTCOME_NOTE_FN"
  - "ADDITIONAL_INFO_FN"
-->
Self-pace the loop by deciding whether the next iteration depends on elapsed time or an observable event.

1. **Execute now:** Run the parsed prompt immediately (invoke slash commands via the Skill tool; otherwise act directly).
2. **Arm event monitor:** If the next run depends on an event (CI completion, log match, file change, PR comment) and no ${MONITOR_TOOL_NAME} is running for it: ${MONITOR_ARMING_GUIDANCE_FN()}. Events arrive via `<task-notification>` and wake the loop immediately without waiting for ${SCHEDULE_WAKEUP_TOOL_NAME}. ${MONITOR_REARM_GUIDANCE_FN("iterations")}
${CONFIRM_AND_DECIDE_STEPS_BLOCK}
5. **On `<task-notification>` wakeup:** Handle the event in loop context, then re-evaluate:
   - Continue: ${REARM_WITH_STATUS_UPDATE_FN(`call ${SCHEDULE_WAKEUP_TOOL_NAME} again with the same `prompt` and the same 1200–1800s `delaySeconds` from the schedule step above (the ${MONITOR_TOOL_NAME} remains the wake signal; the new wakeup is only the fallback heartbeat)`)}.
   - Done: Stop (step 6).
6. **Stop the loop:** When complete, blocked without progress, or requested by the user, call ${SCHEDULE_WAKEUP_TOOL_NAME} with `stop: true` (no other fields) and ${TASK_STOP_TOOL_NAME} any armed ${MONITOR_TOOL_NAME} (use ${TASK_LIST_TOOL_NAME} to locate missing task IDs).${STOPPED_LOOP_OUTCOME_NOTE_FN()} Stopping is the normal loop exit; the user can restart anytime with `/loop`.${ADDITIONAL_INFO_FN()}
