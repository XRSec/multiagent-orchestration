<!--
name: "Tool Description: Edit single replacement"
description: "Lean tool description for exact string replacement, requiring prior Read and line-prefix stripping"
ccVersion: "2.1.285"
variables:
  - "READ_TOOL_NAME"
  - "IS_TAB_AWARE_READ_SEPARATOR_ENABLED"
-->
Perform exact string replacement in a file.

- Prerequisite: ${READ_TOOL_NAME} the file in this conversation before editing, or the call fails.
- Matching: `old_string` must match the file exactly (including indentation) and be unique, or the edit fails. Strip the Read line prefix (${IS_TAB_AWARE_READ_SEPARATOR_ENABLED?"line number + a single tab or `:`":"line number + tab"}) before matching.
- Scope: set `replace_all: true` to replace every occurrence.