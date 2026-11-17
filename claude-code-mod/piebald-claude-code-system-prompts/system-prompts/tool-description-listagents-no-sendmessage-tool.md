<!--
name: "Tool Description: ListAgents (no SendMessage tool)"
description: "Lists visible agents/sessions and own session name when SendMessage is unavailable"
ccVersion: "2.1.284"
variables:
  - "SEND_MESSAGE_TOOL_NAME"
-->
List visible agents and sessions (each row labeled by kind) plus this session's own name (used by other sessions to message it):
- In-process subagents you spawned and teammates on your team
- Other local sessions on this machine and cloud sessions (when cloud access is available)
- Other account sessions (when Remote Control is connected)

Messaging note: this session has no ${SEND_MESSAGE_TOOL_NAME} tool, so it cannot message them with it (others can still message this session). To reply, use the host application's messaging tool if available; otherwise tell the user a reply is not possible from here.