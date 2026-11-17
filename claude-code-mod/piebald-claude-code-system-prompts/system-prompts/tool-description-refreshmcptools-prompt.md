<!--
name: "Tool Description: RefreshMcpTools prompt"
description: "Refreshes one or all connected MCP servers tool lists and interprets per-server results"
ccVersion: "2.1.211"
-->
Re-query tool lists of connected MCP servers and update available tools.

- **Output**: Per-server `name`, refresh status, current tool count, and added/removed tool names. Disconnected servers report `not_connected` (never dials or re-dials connections; only re-reads over existing connections).
- **Parameters**: `server` (optional)—specific MCP server name; omit to refresh all connected servers.
