<!--
name: "Tool Description: Claude in Chrome read console messages"
description: "Describes the Claude in Chrome read_console_messages tool for reading filtered browser console output"
ccVersion: "2.1.173"
-->
Read browser console messages (`console.log`, `console.error`, `console.warn`, etc.) for the current domain from a specific tab. Call `tabs_context_mcp` first if you lack a valid tab ID. Always provide a filter `pattern` to avoid excessive irrelevant output.
