<!--
name: "Tool Description: AskUserQuestion extended host guidance"
description: "Extended AskUserQuestion rules: ordering, text/number kinds, multiSelect defaults, optional labels, and follow-up loops"
ccVersion: "2.1.260"
-->

Extended questions (rendered by this host):
- **Ordering**: Put the most important question first.
- **Question `kind`**: Omit `kind` for choice questions (prefer choices when likely answers can be listed). Use `"kind": "text"` for open-ended text boxes (no options), and `"kind": "number"` with `"min"`/`"max"` (optional `"step"`, `"defaultValue"`, `"unit"`) for quantities.
- **`multiSelect`**: Set `multiSelect: true` on choice questions unless options are mutually exclusive (users are often still exploring).
- **Labels**: Optional `title` (one short line above questions), optional per-question `description` (one helper line), and optional option `description` (add only when the label alone is ambiguous).
- **No filler options**: Omit `"Other"` or `"Skip"` options — users can always enter custom text or skip. If the result requests more questions, call this tool again with follow-ups before executing the task.
