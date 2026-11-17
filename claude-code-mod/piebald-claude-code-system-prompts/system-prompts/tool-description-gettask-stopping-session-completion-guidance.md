<!--
name: "Tool Description: GetTask stopping-session completion guidance"
description: "Completes GetTask description for stopping sessions, requiring foreground wait before replying"
ccVersion: "2.1.314"
variables:
  - "GET_TASK_DESCRIPTION_PREFIX"
-->
${GET_TASK_DESCRIPTION_PREFIX}between your tool calls if it finishes while you are still working. After your reply you may not be notified on completion, so wait for needed results in the foreground before replying.