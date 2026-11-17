<!--
name: "Skill: /loop self-pacing mode (re-arm decision)"
description: "Re-arm decision step for self-paced /loop iterations: schedule next wakeup or stop"
ccVersion: "2.1.284"
variables:
  - "SCHEDULE_WAKEUP_TOOL_NAME"
  - "MONITOR_TOOL_NAME"
-->
Re-arming is a per-turn choice, not a default:
- **Stop (step 6)** if no further iteration is needed.
- **Re-arm** by calling ${SCHEDULE_WAKEUP_TOOL_NAME} with:
  - `delaySeconds`: If a ${MONITOR_TOOL_NAME} is armed, set the **fallback heartbeat** when no event fires (target 1200–1800s; avoid unneeded idle ticks). Without a ${MONITOR_TOOL_NAME}, choose the cadence from observed activity. Follow the tool description's cache-aware delay guidance.
  - `reason`: One short sentence explaining the chosen delay.
  - `prompt`: Full original `/loop` input verbatim, prefixed with `/loop ` so the next firing re-enters this skill (e.g., `/loop check the deploy`).
  - `noop`: `true` if this tick changed nothing ("still waiting", "quiet hold"); `false` if it produced work worth keeping (consecutive `noop: true` ticks collapse in the terminal).
