<!--
name: "Skill: Code Review (Phase 2 — verify, recall-biased)"
description: "Recall-tier verification step: one verifier per candidate finding, biased toward keeping anything plausible"
ccVersion: "2.1.173"
variables:
  - "AGENT_TOOL_NAME"
  - "RECALL_BIASED_RUBRIC"
-->
## Phase 2 — Verify (1-vote, recall-biased)

- Deduplicate near-identical candidates (same defect, location, and cause → keep one).
- For each remaining candidate, run **one verifier** via `${AGENT_TOOL_NAME}` with the diff, relevant file(s), and candidate, returning exactly one of `CONFIRMED`, `PLAUSIBLE`, or `REFUTED`:

${RECALL_BIASED_RUBRIC}

- Keep `CONFIRMED` and `PLAUSIBLE`; drop `REFUTED`.
