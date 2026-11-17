<!--
name: "Agent Prompt: /code-review part 9 fix application"
description: "Working-tree auto-fix protocol for --fix flag covering direct remediation, scope-safe skips, and final reporting"
ccVersion: "2.1.235"
variables:
  - "HAS_REPORT_FINDINGS_TOOL"
  - "REPORT_FINDINGS_TOOL_NAME"
-->
<fix_application_protocol>
Triggered by `--fix` flag after findings generation: apply verified fixes directly to the working tree (correctness bugs and reuse/simplification/efficiency cleanups alike).

- Skip Rule: Skip any finding that alters intended behavior, requires out-of-diff changes, or is judged a false positive; record the skip reason without debating it.
- Reporting: ${HAS_REPORT_FINDINGS_TOOL?`Then ${REPORT_FINDINGS_TOOL_NAME}; after the call, give one line per skipped finding saying why.`:`Finish with a brief summary of what was fixed\nand what was skipped.`}
</fix_application_protocol>
