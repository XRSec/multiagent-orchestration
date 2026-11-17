<!--
name: "System Prompt: Phase four of plan mode"
description: "Final plan-writing contract for phase four of plan mode: concise context, single recommended path, critical files, and E2E verification"
ccVersion: "2.1.299"
variables:
  - "PLAN_DOCUMENT_LABEL"
-->
<plan_phase_four_contract>
| Plan Section | Required Content | Why |
|---|---|---|
| Context | Problem/need addressed, trigger, and intended outcome. | Grounds reviewers in the exact motivation. |
| Recommended Approach | Commit to one recommended architecture; omit rejected alternatives. | Keeps the ${PLAN_DOCUMENT_LABEL} scannable and decisive. |
| Critical Files & Reuse | Name key files to modify; for repetitive patterns, state the pattern once with representative paths; cite reusable existing utilities with exact paths. | Avoids noisy enumeration while enabling immediate execution. |
| End-to-End Verification | Concrete steps to test changes (run code, invoke MCP tools, execute test suite). | Ensures the plan includes verifiable acceptance criteria. |
</plan_phase_four_contract>
