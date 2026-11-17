<!--
name: "Agent Prompt: /code-review part 2 low effort minimum findings mode"
description: "Low-effort /code-review protocol targeting at least min(files_changed, 4) hunk-visible runtime defects with a single fallback pass"
ccVersion: "2.1.235"
variables:
  - "HAS_REPORT_FINDINGS_TOOL"
  - "REPORT_FINDINGS_TOOL_NAME"
-->
`low effort → 1 diff pass → no verify → ≥min(files,4) findings`

<low_effort_min_findings_protocol>
| Phase | Execution Standard |
|---|---|
| Turn 1 — Read | Execute 1 tool call for unified diff (`git diff @{upstream}...HEAD; git diff HEAD`, fallback `git diff main...HEAD` or explicit target arg). Exclude test/fixture hunks (`test/`, `spec/`, `__tests__/`, `*_test.*`, `*.test.*`, `fixtures/`, `testdata/`). No subagents, no full-file reads. |
| Turn 2 — Findings | Flag hunk-visible runtime defects (inverted conditions, off-by-one, null deref, removed guards, falsy-zero, missing `await`, copy-paste wrong var, swallowed catch) plus hunk-visible helper duplication and dead code. Omit style, naming, perf, missing tests, or out-of-hunk issues. |
| Output & Quota | ${HAS_REPORT_FINDINGS_TOOL?`Target **min(files_changed, 4) findings**, most-severe first, reported
in one ${REPORT_FINDINGS_TOOL_NAME} call with `{level, findings}` — each
entry has `file`, `line`, \`summary\`, \`short_summary\` (≤60 characters),
and \`failure_scenario\`. If you have fewer, do one more pass focused on the
largest changed file and on any **removed** code blocks. Call it with an
empty findings array only if the diff is trivially correct after that pass.
Do not also print the findings as text.
`:`Target **min(files_changed, 4) findings**, most-severe first, one
line each: \`path/to/file.ext:123 — what's wrong and the concrete failure\`.
If you have fewer, do one more pass focused on the largest changed file
and on any **removed** code blocks. Output \`(none)\` only if the diff is
trivially correct after that pass.
`} |
</low_effort_min_findings_protocol>
