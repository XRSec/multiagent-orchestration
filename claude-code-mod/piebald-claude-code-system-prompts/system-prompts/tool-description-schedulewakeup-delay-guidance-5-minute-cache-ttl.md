<!--
name: "Tool Description: ScheduleWakeup delay guidance (5-minute cache TTL)"
description: "ScheduleWakeup delaySeconds guidance for 5-minute prompt-cache TTL sessions"
ccVersion: "2.1.284"
-->
## Picking `delaySeconds`

This session uses the default 5-minute Anthropic prompt-cache TTL (runtime clamps to `[60, 3600]`). Sleeping past `300s` incurs an uncached full-context read on wakeup.

| Window | Cache | When to use |
| :--- | :--- | :--- |
| `60s–270s` | Warm | Actively polling external state the harness cannot notify on (CI run, deploy, remote queue). |
| `300s–3600s` | Miss | Multi-minute waits, idle ticks, or long fallback heartbeat when another signal is primary. |

- **Never pick `300s`**: worst of both (pays the cache miss without amortizing it). Either drop to `270s` (stay in cache) or commit to `1200s+` (amortize one miss). E.g., for an ~8-minute CI run, sleep `~270s` twice rather than `60s` eight times.
- **Idle ticks** (no specific signal): default `1200s–1800s` (20–30 min) instead of burning cache 12×/hour; the user can interrupt anytime.
