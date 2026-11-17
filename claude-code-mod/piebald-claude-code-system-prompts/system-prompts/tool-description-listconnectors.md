<!--
name: "Tool Description: ListConnectors"
description: "Lists installed claude.ai MCP connectors, filters by keyword, and interprets org-level and chat-enabled status"
ccVersion: "2.1.323"
variables:
  - "SEARCH_MCP_REGISTRY_TOOL_NAME"
  - "SUGGEST_CONNECTORS_TOOL_NAME"
-->
List MCP connectors installed for the user's `claude.ai` org when asked what connectors they have.

- Filter: pass `keywords` to filter by topic; omit to list all.
- Output fields: `name`, `description`, `connected` (org-level; `null` means status check unavailable — treat as unknown, not disconnected), and `enabledInChat` (whether tools are loaded in this session; `false` does not state why).
- Settings: direct users to check connector status and tool permissions in `claude.ai` connector settings; do not name a per-chat setting (none may exist).
- Recommendations: to suggest connectors the user does not have, use ${SEARCH_MCP_REGISTRY_TOOL_NAME} → ${SUGGEST_CONNECTORS_TOOL_NAME}; this tool does not connect anything.
