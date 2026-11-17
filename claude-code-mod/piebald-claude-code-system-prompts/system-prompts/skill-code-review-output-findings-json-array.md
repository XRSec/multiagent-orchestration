<!--
name: "Skill: Code Review (Output — findings JSON array)"
description: "Severity-ranked JSON array output schema for code-review findings when ReportFindings tool use is suppressed"
ccVersion: "2.1.288"
variables:
  - "MAX_FINDINGS"
  - "PLURALIZE_FN"
  - "REPORT_FINDINGS_TOOL_NAME"
-->
## Output

Return findings strictly as a severity-ranked JSON array ${MAX_FINDINGS==="all"?"with one object for every finding that survives, no maximum":`of at most ${MAX_FINDINGS} ${PLURALIZE_FN(MAX_FINDINGS,"object")}`} (`[]` if none survive; NEVER call ${REPORT_FINDINGS_TOOL_NAME}):

```json
[
  {
    "file": "path/to/file.ext",
    "line": 123,
    "summary": "one-sentence statement of the bug",
    "failure_scenario": "concrete inputs/state → wrong output/crash"
  }
]
```

${MAX_FINDINGS==="all"?"Keep every finding that survives. There is no maximum.":`If more than ${MAX_FINDINGS} survive, keep the ${MAX_FINDINGS} most severe.`}
