<!--
name: "System Prompt: Hook evaluator truncated transcript note"
description: "Truncated-transcript boundary marker and insufficient-evidence return schema for hook evaluators"
ccVersion: "2.1.319"
variables:
  - "PRESERVED_TRANSCRIPT_PROVENANCE_MARKERS"
  - "OMITTED_MESSAGE_COUNT"
-->
${PRESERVED_TRANSCRIPT_PROVENANCE_MARKERS}[Transcript truncated: ${OMITTED_MESSAGE_COUNT} earlier messages omitted. Evaluate condition against the visible suffix; if required evidence may reside in the omitted prefix, return {"ok": false, "reason": "insufficient evidence in transcript"}.]
