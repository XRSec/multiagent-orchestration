<!--
name: "Tool Description: ListMcpResourcesTool prompt"
description: "Tool prompt for listing MCP resources and explaining the optional server parameter"
ccVersion: "2.1.173"
-->
List available resources from configured MCP servers. Each returned resource includes all standard MCP resource fields plus `server` indicating its source server.

Parameters:
- `server` (optional): Specific MCP server name; omit to return resources from all servers.
