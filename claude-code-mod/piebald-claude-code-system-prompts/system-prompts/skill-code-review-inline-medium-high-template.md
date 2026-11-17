<!--
name: "Skill: Code Review inline medium/high template"
description: "Single-context 8-angle inline code-review protocol with deduplication and minimum-findings target"
ccVersion: "2.1.288"
variables:
  - "REVIEW_EFFORT_SUMMARY"
  - "FORMAT_FINDINGS_LIMIT_LABEL_FN"
  - "MAX_FINDINGS"
  - "REVIEW_EFFORT_INTRO"
  - "REVIEW_ANGLE_SHARED_INTRO"
  - "REVIEW_CORRECTNESS_ANGLES"
  - "REVIEW_REUSE_ANGLE"
  - "REVIEW_SIMPLIFICATION_ANGLE"
  - "REVIEW_EFFICIENCY_ANGLE"
  - "REVIEW_ALTITUDE_ANGLE"
  - "REVIEW_CONVENTIONS_ANGLE"
  - "REVIEW_CANDIDATE_PRECEDENCE_NOTE"
  - "FORMAT_REVIEW_OUTPUT_WITH_MINIMUM_FINDINGS_FN"
  - "REVIEW_OUTPUT_FORMATTER_FN"
  - "DEFAULT_MAX_FINDINGS"
-->
`${REVIEW_EFFORT_SUMMARY} → ${FORMAT_FINDINGS_LIMIT_LABEL_FN(MAX_FINDINGS)}`

${REVIEW_EFFORT_INTRO}

${REVIEW_ANGLE_SHARED_INTRO}
## Phase 1 — Find candidates (3 correctness + 3 cleanup + 1 altitude + 1 conventions, up to 6 each)

Evaluate **8 independent finder angles** sequentially in THIS context (do NOT spawn subagents), surfacing `<= 6` candidates per angle (`file`, `line`, 1-line `summary`, concrete `failure_scenario`):

${REVIEW_CORRECTNESS_ANGLES}
${REVIEW_REUSE_ANGLE}
${REVIEW_SIMPLIFICATION_ANGLE}
${REVIEW_EFFICIENCY_ANGLE}
${REVIEW_ALTITUDE_ANGLE}
${REVIEW_CONVENTIONS_ANGLE}
${REVIEW_CANDIDATE_PRECEDENCE_NOTE}
Retain every candidate with a concrete failure scenario without pre-filtering uncertain items.

## Phase 2 — Dedup only (no verify)

Pool all candidates, deduplicate near-duplicates (same defect, location, and cause → keep one) without re-judging or running verifiers, and sort by severity.

${FORMAT_REVIEW_OUTPUT_WITH_MINIMUM_FINDINGS_FN(REVIEW_OUTPUT_FORMATTER_FN,DEFAULT_MAX_FINDINGS)(MAX_FINDINGS)}
