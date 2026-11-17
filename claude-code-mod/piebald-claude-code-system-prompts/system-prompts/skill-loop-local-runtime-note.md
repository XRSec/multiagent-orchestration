<!--
name: "Skill: /loop local runtime note"
description: "Conditional /loop confirmation note stating local loops end on session close"
ccVersion: "2.1.173"
variables:
  - "ASK_USER_QUESTION_TOOL_NAME"
-->
 Only if ${ASK_USER_QUESTION_TOOL_NAME} cloud-offer was NOT shown (neither trigger condition applied) and not already answered, end confirmation on a separate italicized line: ${"`_Runs until you close this session · For durable cloud-based loops, use /schedule_`"}.