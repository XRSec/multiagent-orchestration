<!--
name: "Tool Description: memory_write prompt"
description: "Creates or replaces documents in session memory stores with version checks, conflict handling, and secret-safety rules"
ccVersion: "2.1.246"
variables:
  - "MEMORY_LIST_TOOL_NAME"
  - "MEMORY_READ_TOOL_NAME"
  - "MEMORY_WRITE_TOOL_NAME"
-->
Create or replace a memory document with full content in `store` (call ${MEMORY_LIST_TOOL_NAME} with no arguments to list available stores).

- **Full replacement**: `content` overwrites the ENTIRE document (not an append or patch); include every existing line to keep. Save durable project/workflow knowledge, not transient task state.
- **Version check (`if_version`)**: Always pass the version token from your latest ${MEMORY_READ_TOOL_NAME} or ${MEMORY_WRITE_TOOL_NAME} of this path, or literal `new` (unquoted) for a new file. Listings omit version tokens, so ${MEMORY_READ_TOOL_NAME} any existing file first.
- **Conflicts**: `if_version=new` on an existing path is rejected. Rejections and version conflicts return current content (when within the read cap) so you can merge and retry; oversized documents withhold content and must be replaced wholesale. Results include the new version token.
- **NEVER** write secrets or credentials into memory; project stores are shared with all collaborators and such writes are refused in every store.
