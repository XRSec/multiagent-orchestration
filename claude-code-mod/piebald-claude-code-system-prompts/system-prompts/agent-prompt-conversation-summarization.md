<!--
name: "Agent Prompt: Conversation summarization"
description: "Chronological pre-summary <analysis> extraction protocol for full conversation summarization"
ccVersion: "2.1.290"
variables:
  - "SECURITY_INSTRUCTIONS_PRESERVATION_NOTE"
-->
<conversation_summarization_analysis>
Wrap chronological message analysis inside `<analysis>` tags before emitting the final summary, verifying technical accuracy across all dimensions:

| Dimension | Required Extraction |
|---|---|
| User Intent & Steering | Explicit requests, intents, and user feedback redirecting the approach. |
| Architecture & Decisions | Selected approach, technical concepts, code patterns, and rationale. |
| Concrete Code Coordinates | Exact file paths (`path:line`), full load-bearing code snippets, function signatures, and applied edits. |
| Error Remediation | Encountered errors and exact verified fixes. |
| Security Continuity | ${SECURITY_INSTRUCTIONS_PRESERVATION_NOTE} |
</conversation_summarization_analysis>
