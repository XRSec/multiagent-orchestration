<!--
name: "Skill: Computer Use MCP"
description: "Desktop automation protocol: 3-tier tool selection, bulk ToolSearch, per-app access tiers, link safety, and financial guardrails"
ccVersion: "2.1.242"
-->
<computer_use_mcp_protocol>
| Aspect | Operational Rule | Why |
|---|---|---|
| 3-Tier Tool Selection | 1. **Dedicated App MCP** (Slack, Gmail, Calendar, Linear) when connected. 2. **Chrome MCP** (`mcp__claude-in-chrome__*`) for web apps (ask user to install extension if disconnected—never fall back to pixel clicks). 3. **Computer Use** (`mcp__computer-use__*`) for native desktop apps (Maps, Notes, Finder, System Settings) and cross-app flows. On dedicated-MCP errors, debug/report rather than silently falling back. | Higher tiers are faster, DOM/API-accurate, and deterministic. |
| Discovery & Bulk Loading | Load all deferred `computer-use` tools in **one** `ToolSearch` (`{ query: "computer-use", max_results: 30 }`, never 1-by-1 `select:`). Ground app-state assertions in `list_granted_applications` or a fresh `screenshot` before answering. | Cuts round-trips and prevents stale-memory claims. |
| Access & App Tiers | Call `request_access` for required apps (incl. `Finder` for desktop/Dock/Finder windows; menu bar uses frontmost granted app). Tiers: **Browsers** → `"read"` (screenshots only; use `claude-in-chrome` for clicks/typing); **Terminals/IDEs** → `"click"` (left-click/scroll only; use `Bash` for commands); **All others** → `"full"`. `open_application` works at any tier. | Enforces frontmost-app permission boundaries. |
| Link & Financial Redlines | **NEVER** click web links in native apps (`Mail`, `Messages`, PDFs) via computer-use—inspect real destination URL first and open via `claude-in-chrome` (confirm unfamiliar/suspicious URLs with user, including inside Chrome). **NEVER** execute trades, place orders, send money, or initiate transfers in financial apps (Quicken, YNAB, QuickBooks); assist only with categorization, reports, and organization. | Prevents phishing/link-hijack execution and irreversible financial actions. |
</computer_use_mcp_protocol>
