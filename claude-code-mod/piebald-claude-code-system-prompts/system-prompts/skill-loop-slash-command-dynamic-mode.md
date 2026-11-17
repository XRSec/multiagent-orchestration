<!--
name: "Skill: /loop slash command (dynamic mode)"
description: "Parses user input into an interval and prompt for scheduling recurring or dynamically self-paced loop executions"
ccVersion: "2.1.319"
variables:
  - "PR_STEWARD_LOOP_CHECK_BLOCK"
  - "ADDITIONAL_PARSING_NOTES_FN"
  - "CLOUD_SESSION_LOOP_GUIDANCE_BLOCK"
  - "CRON_CONVERSION_RULES"
  - "CRON_CREATE_TOOL_NAME"
  - "CANCEL_TIMEFRAME_DAYS"
  - "CRON_DELETE_TOOL_NAME"
  - "LOOP_CONFIRMATION_SUFFIX_FN"
  - "DYNAMIC_MODE_INSTRUCTIONS"
  - "USER_INPUT"
-->
# /loop — Schedule a Recurring or Self-Paced Prompt

Parse the input below into `[interval] <prompt…>` and schedule execution.

## Parsing (priority order)

1. **Leading token**: First whitespace-delimited token matching `^\d+[smhd]$` (e.g., `5m`, `2h`) is the interval; remainder is the prompt.
2. **Trailing `every` clause**: Ending `every <N><unit>` or `every <N> <unit-word>` (e.g., `every 20m`, `every 5 minutes`, `every 2 hours`) is the interval; strip it from the prompt. Match only time expressions (`check every PR` has no interval).
3. **No interval**: Entire input is the prompt; use **Dynamic mode**.

If the resulting prompt is empty, output usage `/loop [interval] <prompt>` and stop.

| Input | Parsed result | Rule |
|---|---|---|
| `5m /babysit-prs` | interval `5m`, prompt `/babysit-prs` | 1 |
| `check the deploy every 20m` | interval `20m`, prompt `check the deploy` | 2 |
| `run tests every 5 minutes` | interval `5m`, prompt `run tests` | 2 |
| `check the deploy` | dynamic mode, prompt `check the deploy` | 3 |
| `check every PR` | dynamic mode, prompt `check every PR` | 3 |
| `5m` | empty prompt -> show usage | — |
${PR_STEWARD_LOOP_CHECK_BLOCK}${ADDITIONAL_PARSING_NOTES_FN()}${CLOUD_SESSION_LOOP_GUIDANCE_BLOCK}
## Fixed-interval mode (rules 1–2)

Convert the interval to a cron expression:

${CRON_CONVERSION_RULES}

1. Call ${CRON_CREATE_TOOL_NAME} with `cron` (above), `prompt` (parsed prompt verbatim), `recurring: true`.
2. Confirm concisely: scheduled task, cron expression, human-readable cadence, auto-expiry after ${CANCEL_TIMEFRAME_DAYS} days, and early cancellation via ${CRON_DELETE_TOOL_NAME} (include job ID).${LOOP_CONFIRMATION_SUFFIX_FN()}
3. Execute the parsed prompt immediately without waiting for the first cron tick (invoke slash commands via the Skill tool; otherwise act directly).

## Dynamic mode (rule 3)

${DYNAMIC_MODE_INSTRUCTIONS}

## Input

${USER_INPUT}
