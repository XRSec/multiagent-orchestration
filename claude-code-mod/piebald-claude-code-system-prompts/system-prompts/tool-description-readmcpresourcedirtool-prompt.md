<!--
name: "Tool Description: ReadMcpResourceDirTool prompt"
description: "Lists direct children of an MCP directory resource using required server and uri parameters"
ccVersion: "2.1.186"
variables:
  - "DIRECTORY_MIME_TYPE"
-->
List direct children of a directory resource on an MCP server (`resources/directory/read`).

- `server` (required): MCP server name.
- `uri` (required): Directory resource URI.
- Non-recursive: Each entry has its own `uri`; subdirectories have `mimeType` `"${DIRECTORY_MIME_TYPE}"` (call again on a subdirectory `uri` to descend).
- Requires server support for directory listing; unsupported servers return an error.
