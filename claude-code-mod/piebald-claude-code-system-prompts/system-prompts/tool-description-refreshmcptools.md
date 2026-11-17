<!--
name: "Tool Description: RefreshMcpTools"
description: "When and how to refresh connected MCP servers tool lists to recover missing or stale tools"
ccVersion: "2.1.248"
variables:
  - "REFRESHED_TOOLS_ACCESS_NOTE_FN"
-->
Re-query connected MCP servers' tool lists and update available tools, reporting added or removed tools.

- **When to call**: Re-sync when tool-list change notifications may have been missed:
  - User says a device or app is now open/connected after a `device-not-connected` error or missing tools.
  - Expected MCP server tool is absent from available tools.
  - Server tools look stale after connection recovery.

${REFRESHED_TOOLS_ACCESS_NOTE_FN()}

- **Usage**:
  - All connected servers: `RefreshMcpTools` (no arguments)
  - One server: `RefreshMcpTools({ server: "myserver" })`
