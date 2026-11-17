<!--
name: "Tool Description: ListMcpResourcesTool"
description: "Tool description for listing available MCP resources from all configured servers or a specific server"
ccVersion: "2.1.173"
-->
List available resources from configured MCP servers; each resource object includes `server`.

Examples:
- All servers: `listMcpResources`
- Specific server: `listMcpResources({ server: "myserver" })`
