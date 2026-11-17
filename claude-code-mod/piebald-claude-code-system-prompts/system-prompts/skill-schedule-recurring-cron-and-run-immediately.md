<!--
name: "Skill: Schedule recurring cron and run immediately"
description: "Convert an interval to cron, schedule a recurring task, confirm, and run immediately"
ccVersion: "2.1.319"
variables:
  - "PREAMBLE"
  - "INTERVAL"
  - "CRON_CREATE_TOOL_NAME"
  - "SCHEDULED_PROMPT"
  - "PROMPT_DESCRIPTION"
  - "CONFIRMATION_MESSAGE"
  - "IMMEDIATE_RUN_REFERENCE"
  - "CLOUD_SESSION_LOOP_GUIDANCE_BLOCK"
  - "INLINE_TASK_INSTRUCTIONS_HEADER"
  - "ADDITIONAL_CONTEXT"
-->
${PREAMBLE}

## Action

1. Convert `${INTERVAL}` to a 5-field cron expression (`s` -> ceil to nearest minute, `m` -> minutes, `h` -> hours, `d` -> days; e.g., `5m` -> `*/5 * * * *`, `1h` -> `0 * * * *`, `1d` -> `0 0 * * *`). If the interval does not evenly divide its unit, round to the nearest clean interval and inform the user.
2. Call `${CRON_CREATE_TOOL_NAME}` with:
   - `cron`: expression from step 1
   - `prompt`: literal string `${SCHEDULED_PROMPT}` — ${PROMPT_DESCRIPTION}
   - `recurring`: `true`
3. Briefly confirm: ${CONFIRMATION_MESSAGE}
4. **Immediately run ${IMMEDIATE_RUN_REFERENCE} now**, following the instructions below. Do not wait for the first cron fire.
${CLOUD_SESSION_LOOP_GUIDANCE_BLOCK}
${INLINE_TASK_INSTRUCTIONS_HEADER}

${ADDITIONAL_CONTEXT}
