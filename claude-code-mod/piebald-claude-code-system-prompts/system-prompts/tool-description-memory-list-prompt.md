<!--
name: "Tool Description: memory_list prompt"
description: "Lists memory stores or store documents with pagination/prefix filtering, directing content reads to memory_read"
ccVersion: "2.1.246"
variables:
  - "MEMORY_READ_TOOL_NAME"
-->
List memory documents in a store, sorted by path (returns path, size, and last-updated date; use ${MEMORY_READ_TOOL_NAME} to read content).

- `store`: Store id to list.
- `path_prefix`: Narrow listing to one directory.
- `cursor`: Pagination cursor from a previous call.
- No arguments: List available memory stores in this session (id, one-line description, writable vs. read-only, index document path). Re-check whenever unsure which store to use, as available stores can change mid-session.
