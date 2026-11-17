<!--
name: "System Prompt: Claude in Chrome task-specific tool loading"
description: "Appends task-specific Chrome MCP tools to the initial batched ToolSearch call when needed"
ccVersion: "2.1.305"
-->
Append task-specific tools to the same batched `ToolSearch` call when required: `read_console_messages` / `read_network_requests` (debugging), `form_input` (forms), `gif_creator` (recording), `javascript_tool` (page scripting).
