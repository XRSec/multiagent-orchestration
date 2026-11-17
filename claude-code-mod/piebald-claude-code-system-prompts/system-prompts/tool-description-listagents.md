<!--
name: "Tool Description: ListAgents"
description: "Lists agents and local/cloud/remote sessions available for SendMessage"
ccVersion: "2.1.239"
variables:
  - "SEND_MESSAGE_TOOL_NAME"
-->
List agents you can ${SEND_MESSAGE_TOOL_NAME} to (each row labeled by kind):
- In-process subagents you spawned and teammates on your team
- Other local sessions on this machine
- Cloud sessions (when cloud access is available; receives messages but cannot message back — do not ask it to reply, read its answer in its own transcript)
- Remote Control sessions on other machines and cloud sessions (when Remote Control is connected)

Addressing: send with `${SEND_MESSAGE_TOOL_NAME}({to: "<name>", message: "..."})`, copying the exact name from the row. Append ` [ref]` only when a bare name is ambiguous (duplicate names or disambiguation error).