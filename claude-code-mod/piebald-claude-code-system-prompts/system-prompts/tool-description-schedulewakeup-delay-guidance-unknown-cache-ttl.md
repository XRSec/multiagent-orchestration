<!--
name: "Tool Description: ScheduleWakeup delay guidance (unknown cache TTL)"
description: "ScheduleWakeup delaySeconds guidance when prompt-cache TTL is unknown"
ccVersion: "2.1.284"
-->
## Picking `delaySeconds`

Runtime clamps to `[60, 3600]`. Waking inside the prompt-cache TTL reads context cached; waking past it reads uncached. Subscriber sessions use a 1-hour TTL (dropping to 5 min during usage overage); API-key, Bedrock, and Vertex sessions default to 5 min.

- Never schedule extra wakeups just to keep the cache warm (costs more than the miss).
- **External polling** (CI run, deploy, remote queue): match how fast state actually changes.
- **Idle ticks** (no specific signal): default `1200s–1800s` (20–30 min); the user can interrupt anytime.
- **5-minute TTL refinements**: `60s–270s` stays warm—prefer `270s` over `300s` when actively polling (`300s` pays the miss without amortizing it), and commit to `1200s+` rather than repeated `~300s` waits.
