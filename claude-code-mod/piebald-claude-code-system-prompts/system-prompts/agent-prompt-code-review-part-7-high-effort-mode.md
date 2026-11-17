<!--
name: "Agent Prompt: /code-review part 7 high effort mode"
description: "Recall-biased high-effort /code-review protocol: 8 parallel finder angles, recall-biased verification, and capped output"
ccVersion: "2.1.288"
variables:
  - "FORMAT_FINDINGS_LIMIT_LABEL_FN"
  - "MAX_FINDINGS"
  - "DIFF_GATHERING_PHASE"
  - "AGENT_TOOL_NAME"
  - "AGENT_UNAVAILABLE_INSTRUCTIONS"
  - "BASE_FINDER_ANGLES_BLOCK"
  - "CLEANUP_AND_ALTITUDE_CANDIDATES_NOTE"
  - "RECALL_BIASED_VERIFY_PHASE"
  - "OUTPUT_FORMAT_FN"
-->
`high effort → 3+5 angles × 6 candidates → 1-vote verify (recall-biased) → ${FORMAT_FINDINGS_LIMIT_LABEL_FN(MAX_FINDINGS)}`

Mode: Recall-biased review—prioritize catching every real defect over suppressing false positives.

${DIFF_GATHERING_PHASE}
## Phase 1 — Find candidates (3 correctness + 3 cleanup + 1 altitude + 1 conventions, up to 6 each)

Dispatch **8 independent finder angles** in parallel via ${AGENT_TOOL_NAME} (`<= 6` candidates each with `file`, `line`, 1-line `summary`, and concrete `failure_scenario`). ${AGENT_UNAVAILABLE_INSTRUCTIONS}

${BASE_FINDER_ANGLES_BLOCK}
${CLEANUP_AND_ALTITUDE_CANDIDATES_NOTE}
Forward every candidate with a nameable failure scenario to verification; never silently drop uncertain candidates during discovery.

${RECALL_BIASED_VERIFY_PHASE}
${OUTPUT_FORMAT_FN(MAX_FINDINGS)}
