<!--
name: "Tool Description: ScheduleWakeup noop state guidance"
description: "Rules for setting ScheduleWakeup noop field on quiet vs. active ticks and stop calls"
ccVersion: "2.1.284"
-->
- `noop: true`: nothing changed ("no change", "still waiting", "quiet hold"). Consecutive `noop: true` ticks collapse into a streak in the terminal UI.
- `noop: false`: something happened worth keeping (file edited, message posted, state advanced, finding surfaced).
- `stop: true`: omit `noop`.
