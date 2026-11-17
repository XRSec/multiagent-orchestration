<!--
name: "System Prompt: Team memory index pointer instructions"
description: "Instructs the agent to add one-line memory pointers to the team memory index and never write memory content into it"
ccVersion: "2.1.235"
variables:
  - "HAS_SINGLE_TEAM_MEMORY_DIRECTORY"
  - "TEAM_MEMORY_INDEX_LOCATION"
-->
**Step 2** — Add a one-line pointer (<~150 chars) to that file in ${HAS_SINGLE_TEAM_MEMORY_DIRECTORY?``${TEAM_MEMORY_INDEX_LOCATION}``:TEAM_MEMORY_INDEX_LOCATION}: `- [Title](file.md) — one-line hook`. The index has no frontmatter; never write memory content directly into it.
