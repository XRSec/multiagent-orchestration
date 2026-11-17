<!--
name: "Tool Description: CronCreate"
description: "Describes the CronCreate tool for enqueuing one-shot or recurring cron-based jobs, with durable or session-only persistence, jitter and off-minute scheduling guidance"
ccVersion: "2.1.310"
variables:
  - "CRON_DURABLE_FLAG"
  - "CRON_CREATE_TOOL_NAME"
  - "MONITOR_TOOL_NAME"
  - "MATH_OBJECT"
  - "RECURRING_JITTER_FRACTION"
  - "RECURRING_JITTER_CAP_MS"
  - "ONE_SHOT_JITTER_MAX_MS"
  - "CRON_LIST_TOOL_NAME"
  - "CANCEL_TIMEFRAME_DAYS"
  - "CRON_DELETE_TOOL_NAME"
-->
Schedule a prompt to enqueue at a future time (recurring schedules and one-shot reminders). Uses standard 5-field cron in the user's local timezone (`minute hour day-of-month month day-of-week`; e.g., `"0 9 * * *"` = 9am local, no conversion).

## Schedule Types

| Type | `recurring` | Behavior | Example |
|---|---|---|---|
| One-shot | `false` | Fires once, auto-deletes. Pin `minute/hour/dom/month`. | `"30 14 <today_dom> <today_month> *"` (2:30pm today); `"57 8 <tomorrow_dom> <tomorrow_month> *"` (tomorrow morning) |
| Recurring | `true` (default) | Repeats on schedule. | `"*/5 * * * *"` (every 5m), `"0 * * * *"` (hourly), `"0 9 * * 1-5"` (weekdays 9am) |

## Off-Minute Scheduling

Avoid `:00` and `:30` marks for approximate requests to prevent fleet-wide API spikes:
- `"every morning around 9"` → `"57 8 * * *"` or `"3 9 * * *"` (not `"0 9 * * *"`)
- `"hourly"` → `"7 * * * *"` (not `"0 * * * *"`)
- `"in an hour or so"` → use the current minute, do not round.
- Use `:00` or `:30` only when the user names an exact time (`"at 9:00 sharp"`, `"at half past"`, meeting coordination). When in doubt, nudge a few minutes early or late.

${CRON_DURABLE_FLAG?`## Durability

By default (durable: false) the job lives only in this Claude session — nothing is written to disk, and the job is gone when Claude exits. Pass durable: true to write to .claude/scheduled_tasks.json so the job survives restarts. Only use durable: true when the user explicitly asks for the task to persist ("keep doing this every day", "set this up permanently"). Most "remind me in 5 minutes" / "check back in an hour" requests should stay session-only.`:`## Session-only

Jobs live only in this Claude session — nothing is written to disk, and the job is gone when Claude exits.`}

## Not for Live Watching

${CRON_CREATE_TOOL_NAME} polls at fixed wall-clock intervals. To watch a log file, process, or command output and react immediately to changes, use ${MONITOR_TOOL_NAME} instead — ${MONITOR_TOOL_NAME} streams events as they happen.

## Runtime Behavior

- Fires only while the REPL is idle (never mid-query). ${CRON_DURABLE_FLAG?"Durable jobs persist to .claude/scheduled_tasks.json and survive session restarts — on next launch they resume automatically. One-shot durable tasks that were missed while the REPL was closed are surfaced for catch-up. Session-only jobs die with the process. ":""}
- Jitter: Scheduler adds a fixed per-job offset — recurring jobs run up to ${MATH_OBJECT.round(RECURRING_JITTER_FRACTION*100)}% of period late (max ${RECURRING_JITTER_CAP_MS/60000} min); one-shot jobs on `:00`/`:30` run up to ${ONE_SHOT_JITTER_MAX_MS/1000} s early. Report the actual next run time from this tool or ${CRON_LIST_TOOL_NAME}, not the cron minute.
- Expiration: Recurring tasks auto-expire after ${CANCEL_TIMEFRAME_DAYS} days (fire once more, then delete). Inform the user of the ${CANCEL_TIMEFRAME_DAYS}-day limit when scheduling recurring jobs.
- Output: Returns a job ID for ${CRON_DELETE_TOOL_NAME}.
