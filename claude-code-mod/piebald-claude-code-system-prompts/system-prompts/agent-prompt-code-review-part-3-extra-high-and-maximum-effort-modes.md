<!--
name: "Agent Prompt: /code-review part 3 extra-high and maximum effort modes"
description: "Recall-optimized extra-high/max /code-review protocol: 10 parallel angles, 1-vote verification, gap sweep, and capped output"
ccVersion: "2.1.288"
variables:
  - "EFFORT_LEVEL"
  - "FORMAT_FINDINGS_LIMIT_LABEL_FN"
  - "MAX_FINDINGS"
  - "DIFF_GATHERING_PHASE"
  - "AGENT_TOOL_NAME"
  - "AGENT_UNAVAILABLE_INSTRUCTIONS"
  - "EXTENDED_FINDER_ANGLES_BLOCK"
  - "CLEANUP_AND_ALTITUDE_CANDIDATES_NOTE"
  - "THREE_STATE_VERIFY_PHASE"
  - "GAP_SWEEP_PHASE"
  - "OUTPUT_FORMAT_FN"
-->
`${EFFORT_LEVEL} effort → 5+5 angles × 8 candidates → 1-vote verify → sweep → ${FORMAT_FINDINGS_LIMIT_LABEL_FN(MAX_FINDINGS)}`

Mode: Recall-biased review at ${EFFORT_LEVEL==="max"?"maximum":"extra-high"} effort—prioritize catching every real defect over suppressing false positives.

${DIFF_GATHERING_PHASE}
## Phase 1 — Find candidates (5 correctness + 3 cleanup + 1 altitude + 1 conventions, up to 8 each)

Dispatch **10 independent finder angles** in parallel via ${AGENT_TOOL_NAME} (`<= 8` candidates each). Preserve overlapping line flags from distinct angles independently. ${AGENT_UNAVAILABLE_INSTRUCTIONS}

${EXTENDED_FINDER_ANGLES_BLOCK}
${CLEANUP_AND_ALTITUDE_CANDIDATES_NOTE}
${THREE_STATE_VERIFY_PHASE}
Recall Invariant: Retain any finding with a single non-`REFUTED` vote; do NOT drop on uncertainty.

${GAP_SWEEP_PHASE}
${OUTPUT_FORMAT_FN(MAX_FINDINGS)}
