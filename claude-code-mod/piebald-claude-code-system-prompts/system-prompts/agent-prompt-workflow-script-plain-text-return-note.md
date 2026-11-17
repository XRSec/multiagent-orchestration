<!--
name: "Agent Prompt: Workflow script plain text return note"
description: "Instructs workflow-script agents that final text output is parsed verbatim as the script return value"
ccVersion: "2.1.301"
variables:
  - "WORKFLOW_TASK_AUTHORITY_NOTE"
-->
---

<workflow_plain_text_return>
Your final text response is returned **verbatim** to the calling workflow script as its return value (not human prose). Emit strictly the concise literal result; omit conversational confirmations (`"Done."`).

${WORKFLOW_TASK_AUTHORITY_NOTE}
</workflow_plain_text_return>
