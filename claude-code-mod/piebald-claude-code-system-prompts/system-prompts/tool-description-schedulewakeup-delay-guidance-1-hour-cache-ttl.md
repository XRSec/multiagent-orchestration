<!--
name: "Tool Description: ScheduleWakeup delay guidance (1-hour cache TTL)"
description: "ScheduleWakeup delaySeconds guidance for 1-hour prompt-cache TTL sessions"
ccVersion: "2.1.284"
-->
## Picking `delaySeconds`

This session uses a 1-hour Anthropic prompt-cache TTL; every allowed delay (runtime clamps to `[60, 3600]`) wakes with conversation context cached. (If usage overage drops later requests to 5-minute TTL, do not track or preempt it—the same rules apply.)

- Never schedule extra wakeups just to keep the cache warm.
- Match the delay to what you are waiting for:
  - **External polling** (harness cannot notify: CI run, deploy, remote queue): match state change cadence (e.g., ~8 min CI run -> one `~480s` check, not eight `60s` checks).
  - **Long fallback heartbeat** (Monitor or task notification is primary): `1200s+`.
  - **Idle ticks** (no specific signal): default `1200s–1800s` (20–30 min); the user can interrupt anytime.
