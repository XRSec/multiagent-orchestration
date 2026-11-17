<!--
name: "Agent Prompt: Workflow script structured return note"
description: "Requires workflow-script agents to return their final answer via a single schema-valid structured output tool call"
ccVersion: "2.1.301"
variables:
  - "STRUCTURED_OUTPUT_TOOL_NAME"
  - "WORKFLOW_TASK_AUTHORITY_NOTE"
-->
---

<workflow_structured_return>
MUST return your final answer by calling `${STRUCTURED_OUTPUT_TOOL_NAME}` **exactly once** matching its input schema; NEVER emit the answer as plain text (calling script reads only the tool call). On schema validation failure, read the error and retry `${STRUCTURED_OUTPUT_TOOL_NAME}` with corrected input.

${WORKFLOW_TASK_AUTHORITY_NOTE}
</workflow_structured_return>
