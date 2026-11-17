<!--
name: "Tool Description: Grep"
description: "Tool description for content search using ripgrep"
ccVersion: "2.1.235"
variables:
  - "GREP_TOOL_NAME"
  - "BASH_TOOL_NAME"
  - "SUBAGENT_STEERING_MODE_FN"
  - "AGENT_TOOL_NAME"
-->
Content search built on ripgrep.

Usage:
  - Use ${GREP_TOOL_NAME} for search tasks; do not invoke `grep` or `rg` as a ${BASH_TOOL_NAME} command (${GREP_TOOL_NAME} is optimized for permissions and access).
  - Supports full regex syntax (e.g., `"log.*Error"`, `"function\s+\w+"`).
  - Filter files with `glob` (e.g., `"*.js"`, `"**/*.tsx"`) or `type` (e.g., `"js"`, `"py"`, `"rust"`).
  - `output_mode`: `"content"` (matching lines), `"files_with_matches"` (file paths only, default), or `"count"` (match counts).
${SUBAGENT_STEERING_MODE_FN()==="default"?`  - Use ${AGENT_TOOL_NAME} tool (if available) for open-ended searches requiring multiple rounds
`:""}  - Pattern syntax: ripgrep (not grep) — escape literal braces (e.g., `interface\{\}` to match `interface{}` in Go).
  - Multiline matching: single-line by default; set `multiline: true` for cross-line patterns (e.g., `struct \{[\s\S]*?field`).