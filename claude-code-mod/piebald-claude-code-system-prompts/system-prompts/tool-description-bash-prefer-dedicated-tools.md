<!--
name: "Tool Description: Bash (prefer dedicated tools)"
description: "Warning to prefer dedicated tools over Bash for find, grep, cat, etc"
ccVersion: "2.1.71"
variables:
  - "READ_ONLY_SEARCHING_BASH_COMMANDS"
-->
Avoid running ${READ_ONLY_SEARCHING_BASH_COMMANDS} with this tool unless explicitly instructed or after verifying no dedicated tool can handle the task; use the dedicated tool instead:
