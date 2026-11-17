<!--
name: "Agent Prompt: /code-review unavailable-agent inline mode"
description: "Single-context sequential code-review protocol when subagent spawning is unavailable"
ccVersion: "2.1.213"
variables:
  - "REVIEW_MODE_TAG"
  - "REVIEW_LEAD_IN"
  - "AGENT_UNAVAILABLE_INSTRUCTIONS"
  - "DIFF_GATHERING_PHASE"
  - "ANGLE_COUNT"
  - "FINDER_ANGLES_BLOCK"
  - "CLEANUP_AND_ALTITUDE_CANDIDATES_NOTE"
  - "GAP_SWEEP_PHASE"
  - "OUTPUT_FORMAT_FN"
  - "MAX_FINDINGS"
  - "INLINE_REVIEW_DISCLOSURE"
-->
`${REVIEW_MODE_TAG}`

${REVIEW_LEAD_IN}

${AGENT_UNAVAILABLE_INSTRUCTIONS}
${DIFF_GATHERING_PHASE}## Phase 1 — Find candidates (${ANGLE_COUNT} angles, single pass)

Evaluate **${ANGLE_COUNT} angles** sequentially in the active context without spawning subagents, recording `file`, `line`, 1-line `summary`, and concrete `failure_scenario` for each candidate.

${FINDER_ANGLES_BLOCK}
${CLEANUP_AND_ALTITUDE_CANDIDATES_NOTE}
## Phase 2 — Dedup and self-check (no subagent verify)

Deduplicate overlapping candidates (same defect, location, and cause → retain one) and verify each survivor directly against the diff.
${GAP_SWEEP_PHASE}
${OUTPUT_FORMAT_FN(MAX_FINDINGS)}${INLINE_REVIEW_DISCLOSURE}
