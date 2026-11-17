<!--
name: "Tool Description: SearchPlugins result handling"
description: "How to handle SearchPlugins results: install card, text relay, or silent continuation"
ccVersion: "2.1.280"
-->
- Returns a ranked list (`id`, `name`, `description`, and session/channel enabled status).
- If results fit and `SuggestPluginInstall` is available, call it to render the install card; otherwise relay relevant matches in text.
- If nothing is relevant, proceed without mentioning the search.
