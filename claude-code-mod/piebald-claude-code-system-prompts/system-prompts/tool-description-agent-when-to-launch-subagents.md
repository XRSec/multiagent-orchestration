<!--
name: "Tool Description: Agent (when to launch subagents)"
description: "Subagent type selection and fork-vs-fresh dispatch contract for the Agent tool"
ccVersion: "2.1.326"
variables:
  - "TOOL_BASE_DESCRIPTION"
  - "DESCRIBES_SYSTEM_TURNS_FN"
  - "AVAILABLE_AGENT_TYPES_SYSTEM_MESSAGE_NOTICE"
  - "AVAILABLE_AGENT_TYPES_SYSTEM_REMINDER_NOTICE"
  - "PRO_PLAN_SUBAGENT_RESTRICTION_NOTE"
  - "CAN_FORK_CONTEXT"
  - "AGENT_TOOL_NAME"
  - "HAS_GENERAL_PURPOSE_AGENT"
  - "GENERAL_PURPOSE_AGENT_UNAVAILABLE_INSTRUCTIONS"
  - "SUBAGENT_BUDGET_NOTE"
-->
${TOOL_BASE_DESCRIPTION}. Select `subagent_type` to match required tools and capabilities.

${DESCRIBES_SYSTEM_TURNS_FN({model:e,describesSystemTurns:p})?AVAILABLE_AGENT_TYPES_SYSTEM_MESSAGE_NOTICE:AVAILABLE_AGENT_TYPES_SYSTEM_REMINDER_NOTICE}${PRO_PLAN_SUBAGENT_RESTRICTION_NOTE}

${CAN_FORK_CONTEXT?`Dispatch via ${AGENT_TOOL_NAME} with \`subagent_type\`: \`"fork"\` inherits full conversation context on your current model (\`model\` override ignored); ${HAS_GENERAL_PURPOSE_AGENT?"any other type (or omitted) starts a fresh agent (`general-purpose` default).":`any other type starts a fresh agent. ${GENERAL_PURPOSE_AGENT_UNAVAILABLE_INSTRUCTIONS}`}`:`Dispatch via ${AGENT_TOOL_NAME} with \`subagent_type\`. ${HAS_GENERAL_PURPOSE_AGENT?"Defaults to `general-purpose` when omitted.":GENERAL_PURPOSE_AGENT_UNAVAILABLE_INSTRUCTIONS}`}${SUBAGENT_BUDGET_NOTE===void 0?"":`

${SUBAGENT_BUDGET_NOTE}`}
