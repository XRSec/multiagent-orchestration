<!--
name: "Tool Description: GetTask default completion guidance"
description: "Completes GetTask description with post-reply delivery and foreground wait for tasks terminated at final response"
ccVersion: "2.1.314"
variables:
  - "GET_TASK_DESCRIPTION_PREFIX"
-->
${GET_TASK_DESCRIPTION_PREFIX}between your tool calls if still working, or by starting a new turn if you have already replied. If that result is all you are waiting for, end your turn — unless `statusMessage` says it terminates at your final response, in which case fetch what you need from it first in the foreground.