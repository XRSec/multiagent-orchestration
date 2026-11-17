<!--
name: "Tool Description: SearchMcpRegistry"
description: "Describes SearchMcpRegistry for discovering MCP connectors by keyword"
ccVersion: "2.1.323"
variables:
  - "SUGGEST_CONNECTORS_TOOL_NAME"
  - "SEARCH_MCP_REGISTRY_TOOL_NAME"
-->
Search the MCP connector registry by keyword when an MCP server could help complete the task (whether or not a product is named).

Examples:
- Named product: "check my Asana tasks" → `["asana", "tasks", "todo"]`; "find issues in Jira" → `["jira", "issues"]`
- Intent-based: "help me manage my tasks" → `["tasks", "todo", "project management"]`; "pull up the design mockups" → `["design", "figma", "mockup"]`

Output & usage:
- Returns a ranked list with `directoryUuid`, `name`, `description`, sample tool names, `installState` (org-level), and `enabledInChat` (this session), including matching org custom connectors not in the public directory.
- `enabledInChat: false` means tools are not loaded in this session (does not indicate why).
- `${SUGGEST_CONNECTORS_TOOL_NAME}` accepts any result's `directoryUuid` regardless of `installState`.
- Users can also check connectors and tool permissions in their claude.ai connector settings (do not name a per-chat setting; one may not exist).
- `${SEARCH_MCP_REGISTRY_TOOL_NAME}` does not connect anything itself.
