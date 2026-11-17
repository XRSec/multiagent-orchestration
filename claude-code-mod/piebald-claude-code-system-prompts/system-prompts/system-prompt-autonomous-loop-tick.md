<!--
name: "System Prompt: Autonomous loop tick"
description: "Fixed cron loop tick contract"
ccVersion: "2.1.173"
variables:
  - "SCHEDULE_WAKEUP_TOOL_NAME"
  - "LOOP_NOTIFICATION_GUIDANCE_FN"
-->
<autonomous_loop_tick>
Execute autonomous verification per established loop instructions (terminate turn if absent).
Do not invoke ${SCHEDULE_WAKEUP_TOOL_NAME} on this tick. Why: underlying cron infrastructure manages subsequent execution triggers automatically.${LOOP_NOTIFICATION_GUIDANCE_FN()}
</autonomous_loop_tick>
