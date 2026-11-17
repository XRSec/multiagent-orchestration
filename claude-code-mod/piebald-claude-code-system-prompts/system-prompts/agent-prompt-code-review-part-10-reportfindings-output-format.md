<!--
name: "Agent Prompt: /code-review part 10 ReportFindings output format"
description: "Deterministic output schema for /code-review submission via ReportFindings with severity ranking and cap enforcement"
ccVersion: "2.1.288"
variables:
  - "REPORT_FINDINGS_TOOL_NAME"
  - "MAX_FINDINGS"
  - "PLURALIZE_FN"
-->
<report_findings_schema>
Invoke ${REPORT_FINDINGS_TOOL_NAME} once with `{level, findings}` (empty array if zero survive). Omit duplicate text reports or published artifacts; the tool call is the sole deliverable.

| Field / Rule | Specification |
|---|---|
| Ranking & Cap | Rank most-severe first; submit ${MAX_FINDINGS==="all"?"every finding that survives, no maximum,":`at most ${MAX_FINDINGS} ${PLURALIZE_FN(MAX_FINDINGS,"entry","entries")}`} (${MAX_FINDINGS==="all"?"Keep every finding that survives. There is no maximum.":`If more than ${MAX_FINDINGS} survive, keep the ${MAX_FINDINGS} most severe.`}). |
| `file`, `line` | Exact target coordinate. |
| `summary`, `short_summary` | Full finding summary + compressed claim (`<= 60 chars`, zero rationale/consequence clause). |
| `failure_scenario` | Concrete trigger input/state and failure mode. |
| `category`, `verdict` | Kebab-case angle slug (`correctness`, `simplification`, `efficiency`, `reuse`, `altitude`, `conventions`, or specific slug like `test-coverage`), plus `verdict` when verified. |
</report_findings_schema>
