<!--
name: "Skill: Code Review low effort expanded-findings mode"
description: "Low-effort /code-review protocol reading the diff once and targeting min(files_changed, MIN_FINDINGS_TARGET) hunk-visible runtime defects"
ccVersion: "2.1.288"
variables:
  - "FORMAT_FINDINGS_LIMIT_LABEL_FN"
  - "MAX_FINDINGS"
  - "HAS_REPORT_FINDINGS_TOOL"
  - "FORMAT_FINDINGS_LIMIT_PHRASE_FN"
  - "REPORT_FINDINGS_TOOL_NAME"
  - "MIN_FINDINGS_TARGET"
-->
`low effort → 1 diff pass → no verify → ${FORMAT_FINDINGS_LIMIT_LABEL_FN(MAX_FINDINGS)}`

<low_effort_expanded_review_protocol>
| Phase | Execution Standard |
|---|---|
| Turn 1 — Read | Execute 1 tool call for unified diff (`git diff @{upstream}...HEAD; git diff HEAD`, fallback `git diff main...HEAD` or explicit target arg). No subagents, no full-file reads. |
| Turn 2 — Findings | Flag hunk-visible runtime defects (inverted conditions, off-by-one, null deref, removed guards, falsy-zero, missing `await`, copy-paste wrong var, swallowed catch) plus hunk-visible helper duplication and dead code. Omit style, naming, perf, missing tests, or out-of-hunk issues. |
| Output & Quota | ${HAS_REPORT_FINDINGS_TOOL?`Report ${FORMAT_FINDINGS_LIMIT_PHRASE_FN(MAX_FINDINGS)}, most-severe first, in one
${REPORT_FINDINGS_TOOL_NAME} call with \`{level, findings}\` — each entry has
\`file\`, \`line\`, \`summary\`, \`short_summary\` (≤60 characters), and
\`failure_scenario\`.
Target at least min(files_changed, ${MIN_FINDINGS_TARGET}) findings — if you see fewer, widen to other hunks in the same diff before stopping. If fewer than ${MIN_FINDINGS_TARGET} genuine findings exist, report what you have. Do not also print the findings as text.
`:`Output ${FORMAT_FINDINGS_LIMIT_PHRASE_FN(MAX_FINDINGS)}, most-severe first, one line each:
\`path/to/file.ext:123 — what's wrong and the concrete failure\`.
Target at least min(files_changed, ${MIN_FINDINGS_TARGET}) findings — if you see fewer, widen to other hunks in the same diff before stopping. If fewer than ${MIN_FINDINGS_TARGET} genuine findings exist, emit what you have.
`} |
</low_effort_expanded_review_protocol>
