<!--
name: "Tool Description: SuggestConnectors"
description: "Describes the SuggestConnectors tool for resolving SearchMcpRegistry directoryUuid values into full connector payloads and install-state guidance"
ccVersion: "2.1.312"
-->
Resolve full connector payloads for `directoryUuid` values returned by `SearchMcpRegistry` or installed connectors' `server_id` values listed in your system prompt.

- Do not guess UUIDs or pass connector names.
- Returns `name`, `description`, `url`, `iconUrl`, sample tool names, and org-level `installState` for the user's `claude.ai` org.
- `installState` reflects org-level auth, not session availability — check `ListConnectors`'s `enabledInChat` before claiming a connector is usable in this session.
- If a relevant connector is not installed, tell the user they can connect it via `claude.ai`; this tool does not connect anything.
