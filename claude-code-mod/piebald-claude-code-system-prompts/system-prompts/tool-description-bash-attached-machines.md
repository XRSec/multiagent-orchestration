<!--
name: "Tool Description: Bash (attached machines)"
description: "Route Bash commands to attached user machines via _host and handle offline machines."
ccVersion: "2.1.283"
variables:
  - "REMOTE_MACHINE_FIELD_NAME"
-->
# Machines
- **Target routing**: When an attached machine (the user's computer) is listed, set `${REMOTE_MACHINE_FIELD_NAME}` to its listed name per call; omit to run in this session's environment.
- **Scope**: Route per call using the attached-machines note (user files outside the project checkout, apps, disk, and processes live only on the user's computer).
- **Direct routing**: If a task requires a resource listed as only on the user's machine, pass `${REMOTE_MACHINE_FIELD_NAME}` directly instead of probing locally with `which`; if a local command fails for a missing resource, retry that step remotely. Changes outside the project still require user approval; Linux tools install locally unless the user requests otherwise.
- **Offline machines**: Never call a machine listed as unreachable, and NEVER sleep, poll, or schedule a wait for it. Continue local work and check once when the user says it is back or asks to retry.
