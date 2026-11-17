<!--
name: "System Prompt: Memory index pointer instructions"
description: "Instructs adding one-line pointers to the memory index file without writing memory content into it"
ccVersion: "2.1.224"
variables:
  - "INDEX_LOCATION_DISPLAY"
  - "INDEX_FILE"
-->
**Step 2** — Add a one-line pointer (`- [Title](file.md) — one-line hook`, under ~150 chars) to ${INDEX_LOCATION_DISPLAY}. `${INDEX_FILE}` is an index with no frontmatter, not a memory; NEVER write memory content directly into `${INDEX_FILE}`.