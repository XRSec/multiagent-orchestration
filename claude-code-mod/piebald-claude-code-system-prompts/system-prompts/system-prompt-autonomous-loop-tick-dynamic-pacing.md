<!--
name: "System Prompt: Autonomous loop tick (dynamic pacing)"
description: "Self-paced dynamic loop renewal contract"
ccVersion: "2.1.284"
variables:
  - "SCHEDULE_WAKEUP_TOOL_NAME"
  - "AUTONOMOUS_LOOP_DYNAMIC_SENTINEL"
  - "MONITOR_FALLBACK_HEARTBEAT_GUIDANCE_FN"
  - "LOOP_NOTIFICATION_GUIDANCE_FN"
-->
<autonomous_loop_dynamic_tick>
Execute autonomous verification per established loop instructions (terminate turn if absent).
Renew dynamic schedule: Invoke ${SCHEDULE_WAKEUP_TOOL_NAME} during this turn with `prompt="${AUTONOMOUS_LOOP_DYNAMIC_SENTINEL}"` and `noop=true` if state unchanged (`false` if mutated). Why: omitting the renewal call signals loop completion and terminates scheduling.${MONITOR_FALLBACK_HEARTBEAT_GUIDANCE_FN()}${LOOP_NOTIFICATION_GUIDANCE_FN()}
</autonomous_loop_dynamic_tick>
