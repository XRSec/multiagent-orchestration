<!--
name: "Agent Prompt: Schedule action selection"
description: "First-turn action selection prompt for cloud routine scheduling"
ccVersion: "2.1.173"
variables:
  - "ASK_USER_QUESTION_TOOL_NAME"
  - "JSON_STRINGIFY_FN"
  - "SCHEDULE_ACTION_QUESTION"
-->
<schedule_action_selection>
First turn MUST invoke ${ASK_USER_QUESTION_TOOL_NAME} with zero preamble, passing this EXACT `question` string verbatim:

${JSON_STRINGIFY_FN(SCHEDULE_ACTION_QUESTION)}

Set `header: "Action"` with options (`create`, `list`, `update`, `run`), then execute the selected workflow.
</schedule_action_selection>
