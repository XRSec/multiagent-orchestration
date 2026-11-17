<!--
name: "Skill: Debugging"
description: "Session debugging protocol using live debug logs, [ERROR]/[WARN] filtering, settings inspection, and guide subagent lookup"
ccVersion: "2.1.235"
variables:
  - "DEBUG_LOGGING_WAS_ALREADY_ACTIVE"
  - "DEBUG_LOG_PATH"
  - "DEBUG_LOG_SUMMARY"
  - "ISSUE_DESCRIPTION"
  - "DAEMON_DEBUG_CONTEXT"
  - "GET_SETTINGS_FILE_PATH_FN"
  - "LOG_LINE_COUNT"
  - "CLAUDE_CODE_GUIDE_SUBAGENT_NAME"
-->
# Debug Skill

${DEBUG_LOGGING_WAS_ALREADY_ACTIVE?"":`## Debug Logging Activated
Debug logging was previously OFF. Inform the user logging is now active at \`${DEBUG_LOG_PATH}\`, ask them to reproduce the issue, then re-read the log (or restart with \`claude --debug\` for startup capture).
`}
## Session Debug Log
Path: `${DEBUG_LOG_PATH}`
${DEBUG_LOG_SUMMARY}

## Issue Context
${ISSUE_DESCRIPTION}
${DAEMON_DEBUG_CONTEXT||"No specific issue described; inspect debug log and summarize errors, warnings, and anomalies."}

## Settings Paths
- User: `${GET_SETTINGS_FILE_PATH_FN("userSettings")}` | Project: `${GET_SETTINGS_FILE_PATH_FN("projectSettings")}` | Local: `${GET_SETTINGS_FILE_PATH_FN("localSettings")}`

<debug_execution_protocol>
1. Review the issue description and last `${LOG_LINE_COUNT}` lines for log format.
2. Grep `${DEBUG_LOG_PATH}` for `[ERROR]`, `[WARN]`, stack traces, and failure patterns.
3. Spawn `${CLAUDE_CODE_GUIDE_SUBAGENT_NAME}` when product/feature behavior clarification is needed.
4. Report root cause concisely in plain language with concrete remediation steps.
</debug_execution_protocol>
