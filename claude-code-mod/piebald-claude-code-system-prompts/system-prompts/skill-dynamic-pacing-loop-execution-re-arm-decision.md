<!--
name: "Skill: Dynamic pacing loop execution (re-arm decision)"
description: "Re-arm decision step for dynamic-pacing /loop ticks using ScheduleWakeup or stopping"
ccVersion: "2.1.284"
variables:
  - "SCHEDULE_WAKEUP_TOOL_NAME"
  - "MONITOR_TOOL_NAME"
  - "DYNAMIC_MODE_SENTINEL"
-->
Re-arming is a per-turn choice, not a default.
- **Continue loop** (next check is worth running): call ${SCHEDULE_WAKEUP_TOOL_NAME} with:
  - `delaySeconds`: if ${MONITOR_TOOL_NAME} is armed, use as fallback heartbeat (1200–1800s). Otherwise, pace by turn observations (quiet branch → longer; active work in flight → shorter) following the tool description's cache-aware delay guidance.
  - `reason`: one short sentence explaining the chosen delay.
  - `prompt`: literal string `${DYNAMIC_MODE_SENTINEL}` — automatically expands at fire time to full instructions (first fire, first fire post-compact, or edited `loop.md`) or a dynamic-pacing reminder (subsequent fires). Do not pass full instructions manually.
  - `noop`: `true` if the tick changed nothing ("still waiting", "quiet hold"); `false` if it performed work worth keeping (consecutive `noop: true` ticks collapse in the terminal).
- **End loop** (next check is not worth running): stop instead (step 6).