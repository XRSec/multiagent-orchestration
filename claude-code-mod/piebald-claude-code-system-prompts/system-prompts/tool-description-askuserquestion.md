<!--
name: "Tool Description: AskUserQuestion"
description: "AskUserQuestion description with plan mode switching and pre-approval questioning constraints"
ccVersion: "2.1.295"
variables:
  - "ASKUSERQUESTION_BASE_DESCRIPTION"
  - "ENTER_PLAN_MODE_TOOL_NAME"
  - "EXIT_PLAN_MODE_TOOL_NAME"
-->
${ASKUSERQUESTION_BASE_DESCRIPTION}
Plan mode: Switch into plan mode with ${ENTER_PLAN_MODE_TOOL_NAME} (not this tool). In plan mode, use this tool to clarify requirements or choose approaches BEFORE finalizing the plan. NEVER ask "Is my plan ready?", "Should I proceed?", or reference "the plan" — the user cannot see the plan until you call ${EXIT_PLAN_MODE_TOOL_NAME} for approval.
