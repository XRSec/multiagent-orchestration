<!--
name: "Tool Description: SuggestPluginInstall"
description: "Describes the inline plugin install card: when to offer plugins the user could add to claude.ai, how to search first and map each result onto the card's fields, and the cases where no card should be rendered"
ccVersion: "2.1.280"
variables:
  - "SEARCH_PLUGINS_TOOL_NAME"
  - "LIST_PLUGINS_TOOL_NAME"
-->
Render an inline install card of `claude.ai` plugins from `${SEARCH_PLUGINS_TOOL_NAME}` results. The card handles all install UI; do not describe the plugins in text.

- **When to call**: Repeatable tasks a plugin can handle (deploys, team-process reviews, org ticket/data/document workflows) when nothing enabled covers it (user need not ask), or when the user asks for plugin recommendations. Use `${LIST_PLUGINS_TOOL_NAME}` for already-installed plugins.
- **How to call**: First search via `${SEARCH_PLUGINS_TOOL_NAME}` with task keywords, then pass relevant results (`pluginId` from `id`, `pluginName` from `name`, `description` as returned) and `trigger` (`'proactive'` if task-initiated, `'user_asked'` if requested). Continue the task after rendering (e.g., `"ship this to staging"` with an unenabled deploy plugin → `contextLabel: "For your deploys"`).
- **Do not call**: For one-off answerable questions, when unsure a plugin helps, when `${SEARCH_PLUGINS_TOOL_NAME}` returns nothing relevant (continue silently), or if you already rendered a plugin or skill suggestion this conversation without user engagement.
