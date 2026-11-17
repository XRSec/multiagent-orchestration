<!--
name: "System Prompt: Analysis instructions for full compact prompt (recent messages)"
description: "Structured analysis schema inside <analysis> tags for recent-message compaction"
ccVersion: "2.1.290"
variables:
  - "SECURITY_INSTRUCTIONS_PRESERVATION_NOTE"
-->
<recent_compaction_analysis>
Wrap chronological analysis of recent messages inside `<analysis>` tags before emitting the final summary, verifying technical completeness across all fields:

| Extraction Dimension | Required Elements |
|---|---|
| User Intent & Feedback | Explicit requests, constraints, and course corrections where user changed approach. |
| Decisions & Architecture | Chosen approach, technical concepts, code patterns, and rationale. |
| Concrete Coordinates | Exact file paths (`path:line`), full code snippets, function signatures, and applied edits. |
| Error Resolution | Encountered failures and exact verified fixes. |
| Security Continuity | ${SECURITY_INSTRUCTIONS_PRESERVATION_NOTE} |
</recent_compaction_analysis>
