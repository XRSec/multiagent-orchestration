<!--
name: "Tool Description: Bash (timeout)"
description: "Bash tool instruction: optional timeout configuration"
ccVersion: "2.1.285"
variables:
  - "MAX_TIMEOUT_MS_FN"
  - "DEFAULT_TIMEOUT_MS_FN"
-->
Optional timeout in milliseconds: max ${MAX_TIMEOUT_MS_FN()}ms (${MAX_TIMEOUT_MS_FN()/60000} minutes) for a foreground command; default ${DEFAULT_TIMEOUT_MS_FN()}ms (${DEFAULT_TIMEOUT_MS_FN()/60000} minutes).
