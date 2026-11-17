<!--
name: "Agent Prompt: /code-review minimal mode"
description: "Minimal /code-review protocol: single diff pass targeting concrete correctness bugs, tool submission, and path:line summary"
ccVersion: "2.1.288"
variables:
  - "FORMAT_FINDINGS_LIMIT_LABEL_FN"
  - "MAX_FINDINGS"
  - "PLURALIZE_FN"
  - "REPORT_FINDINGS_TOOL_NAME"
-->
`minimal prompt → single careful diff pass → ${FORMAT_FINDINGS_LIMIT_LABEL_FN(MAX_FINDINGS)}`

<code_review_minimal_protocol>
| Phase | Execution Standard |
|---|---|
| 1. Scope Acquisition | Run `git diff @{upstream}...HEAD` (fallback: `git diff main...HEAD` or `git diff HEAD~1`), plus `git diff HEAD` for uncommitted changes or empty range diffs. Override with explicit PR, branch, or file argument when provided. |
| 2. Correctness Scan | Inspect every hunk and enclosing context (`Read`, `Grep`, `git log/blame/show`) for concrete failure modes: inverted conditions, off-by-one, null deref, missing `await`, dropped error handling, removed guards, broken callers, and race conditions. Require a concrete failure scenario per finding; omit pure style nits. |
| 3. Tool Submission | Submit ${MAX_FINDINGS==="all"?"every finding":`at most ${MAX_FINDINGS} ${PLURALIZE_FN(MAX_FINDINGS,"finding")}`} via ${REPORT_FINDINGS_TOOL_NAME} (`file`, `start_line`, `severity`, `comment` with exact trigger scenario). Prioritize verified real defects. |
| 4. Text Echo | Restate submitted findings in final reply (`file:line — summary`, 1 line each) so results remain visible when tool output is collapsed. |
</code_review_minimal_protocol>
