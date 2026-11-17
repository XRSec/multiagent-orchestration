<!--
name: "Tool Description: SearchSkills"
description: "Search user's claude.ai skills by keyword and render add cards when relevant"
ccVersion: "2.1.221"
-->
Search the user's claude.ai skills by keyword when an uploaded or enabled skill (reference doc or instruction set) could help complete the task.

Examples:
- "follow the team's PR guidelines" → `["pr", "review", "guidelines"]`
- "export this as a slide deck" → `["pptx", "slides", "presentation"]`

Result handling:
- Returns a ranked list (`id`, `name`, `description`, `enabled`).
- If results fit and `SuggestSkills` is available, call it to render the add card; otherwise relay relevant matches in text.
- If nothing is relevant, proceed without mentioning the search.
