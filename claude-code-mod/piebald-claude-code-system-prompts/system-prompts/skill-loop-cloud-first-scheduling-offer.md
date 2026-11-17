<!--
name: "Skill: /loop cloud-first scheduling offer"
description: "Decision tree offering cloud scheduling before local session loops in /loop"
ccVersion: "2.1.101"
variables:
  - "ASK_USER_QUESTION_TOOL_NAME"
  - "CRON_CREATE_TOOL_NAME"
  - "SKILL_TOOL_NAME"
  - "BASH_TOOL_NAME"
-->

## Offer cloud first

<trigger_check>
Before any scheduling step, check whether EITHER condition holds:
- Parsed interval (rule 1 or 2) is **≥60 minutes**.
- Original input uses daily phrasing regardless of matched rule ("every morning", "daily", "every day", "each night", "every weekday").

If neither condition holds: continue to the sections below.
</trigger_check>

<cloud_offer_prompt>
If either condition holds, call ${ASK_USER_QUESTION_TOOL_NAME} first:
- `question`: "This loop stops when you close this session. Set it up as a cloud schedule instead so it keeps running?"
- `header`: "Schedule"
- `options`: `[{label: "Cloud schedule (recommended)", description: "Runs in Anthropic's cloud even after you close this session"}, {label: "This session only", description: "Runs in this terminal until you exit"}]`
</cloud_offer_prompt>

<branch_handling>
- **User selects Cloud schedule**:
  - Do NOT call ${CRON_CREATE_TOOL_NAME}.
  - Invoke the `schedule` skill via ${SKILL_TOOL_NAME} with `args` set to the original input verbatim (e.g., `${SKILL_TOOL_NAME}({skill: "schedule", args: "every morning tell me a joke"})`) and follow it to completion.
  - Do NOT tell the user to run `/schedule` manually.
  - **Stop immediately** — skip all sections below (no ${CRON_CREATE_TOOL_NAME}, no ${BASH_TOOL_NAME}, no immediate prompt execution).
- **User selects This session only**:
  - Parsed ≥60-minute interval (rule 1 or 2): continue below with that interval.
  - Daily phrasing only (rule 3, no parsed interval): do NOT call ${CRON_CREATE_TOOL_NAME}. Explain that a daily-cadence loop will not fire before session exit, suggest choosing Cloud schedule or re-running `/loop` with an explicit shorter interval (e.g., `/loop 1h <prompt>`), then stop.
</branch_handling>