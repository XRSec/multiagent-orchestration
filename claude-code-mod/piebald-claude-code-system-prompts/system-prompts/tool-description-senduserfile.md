<!--
name: "Tool Description: SendUserFile"
description: "Surface generated deliverable files to the user as file cards"
ccVersion: "2.1.323"
variables:
  - "STATUS_FIELD_GUIDANCE"
-->
Surface deliverable files (diagrams, reports, screenshots, build artifacts) as file cards.

<when_to_send>
- Send deliverables as produced (complete drafts or meaningful updates), not batched at the end.
- Do NOT send routine working files (scratch, debug output, partial fragments, incremental edits); re-send only on meaningful change.
</when_to_send>

<fields>
- `files`: existing local paths (absolute or cwd-relative; verify with `ls` if unsure—tool does not fetch URLs or render raw content).
- `caption`: optional one-liner of context (`"the failing case is row 42"`, `"before vs after"`); omit if self-explanatory.
- ${STATUS_FIELD_GUIDANCE}
- `display`: `'render'` for inline side-panel view (charts, HTML, diagrams, images); `'attach'` for save-and-open files (source code, spreadsheets, external docs); omit to let client decide.
</fields>

Example: `SendUserFile({ files: ["report.md"], caption: "Here's the report.", status: "normal" })`
