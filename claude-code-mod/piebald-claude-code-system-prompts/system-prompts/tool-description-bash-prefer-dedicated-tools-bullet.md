<!--
name: "Tool Description: Bash (prefer dedicated tools bullet)"
description: "Bulleted warning to prefer dedicated tools over Bash for find, grep, cat, etc"
ccVersion: "2.1.133"
variables:
  - "READ_ONLY_SEARCHING_BASH_COMMANDS"
-->
- Avoid running ${READ_ONLY_SEARCHING_BASH_COMMANDS} with this tool unless explicitly instructed or after verifying no dedicated tool can handle the task; use the dedicated tool instead for a better user experience.
