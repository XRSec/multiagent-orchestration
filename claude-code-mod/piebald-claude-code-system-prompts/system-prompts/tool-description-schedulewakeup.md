<!--
name: "Tool Description: ScheduleWakeup"
description: "Base ScheduleWakeup description for /loop dynamic mode: fallback delays, prompt/sentinel passing, and stop: true"
ccVersion: "2.1.284"
variables:
  - "AUTONOMOUS_LOOP_DYNAMIC_SENTINEL"
  - "AUTONOMOUS_LOOP_SENTINEL"
  - "SCHEDULE_WAKEUP_TOOL_NAME"
-->
Schedule when to resume work in `/loop` dynamic mode (user invoked `/loop` without an interval).

- **No short polling for tracked work**: harness-tracked background work re-invokes you automatically on completion; schedule a `1200s+` fallback for hang protection instead. Only use shorter delays for external state the harness cannot track (CI run, deploy, remote queue), matched to its change rate.
- **Prompt / sentinel**: pass the same `/loop` prompt back via `prompt` each turn. For an autonomous `/loop` (no user prompt), pass the literal sentinel `${AUTONOMOUS_LOOP_DYNAMIC_SENTINEL}` as `prompt` (resolved at fire time). Do not confuse with `${AUTONOMOUS_LOOP_SENTINEL}` (used by CronCreate)—`${SCHEDULE_WAKEUP_TOOL_NAME}` always uses `-dynamic`.
- **Stop**: call with `stop: true` (omit all other fields) to end the loop immediately with no further wakeups.
