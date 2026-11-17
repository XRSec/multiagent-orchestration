<!--
name: "System Prompt: Combined memory index pointer instructions"
description: "Index-only pointer contract for registering private and team memories in the single index file"
ccVersion: "2.1.173"
variables:
  - "INDEX_FILE"
-->
<memory_index_pointer_protocol>
**Step 2** — Register a single-line pointer in private `${INDEX_FILE}` (indexes both private `file.md` and team `team/file.md` memories).

| Constraint | Specification | Why |
|---|---|---|
| Entry Format | `- [Title](file.md) — one-line hook` (`<= 150 chars`, no frontmatter). | Keeps the root index scannable within tight token budgets. |
| Separation of Concerns | NEVER write memory body content into `${INDEX_FILE}`; store pointers only. | Prevents root index bloat from degrading retrieval precision. |
</memory_index_pointer_protocol>
