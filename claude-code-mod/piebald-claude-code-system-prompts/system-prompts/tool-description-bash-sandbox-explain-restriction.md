<!--
name: "Tool Description: Bash (sandbox — explain restriction)"
description: "Explain which sandbox restriction caused the failure"
ccVersion: "2.1.282"
variables:
  - "IS_DESKTOP_DRIVEN_EXTERNAL_HOST_SESSION_FN"
-->
Briefly explain which sandbox restriction likely caused the failure, and note that the user can run `/sandbox` to ${IS_DESKTOP_DRIVEN_EXTERNAL_HOST_SESSION_FN()?"change the sandbox settings":"manage restrictions"}.
