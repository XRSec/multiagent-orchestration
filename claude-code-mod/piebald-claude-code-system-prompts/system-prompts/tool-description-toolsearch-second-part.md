<!--
name: "Tool Description: ToolSearch (second part)"
description: "Explains how queries match deferred tools and load their complete JSON Schema definitions for subsequent calls"
ccVersion: "2.1.178"
-->
 Matches `query` against the deferred tool list and returns full JSONSchema definitions inside `<functions>`. Once a tool's schema appears in the result, call it like any top-level tool.

- **Result format**: One `<function>{"description": "...", "name": "...", "parameters": {...}}</function>` line per matched tool inside `<functions>`.
- **Query forms**:
  - `"select:Read,Edit,Grep"` — fetch exact tools by name
  - `"notebook jupyter"` — keyword search, up to `max_results` best matches
  - `"+slack send"` — require `"slack"` in name, rank by remaining terms
