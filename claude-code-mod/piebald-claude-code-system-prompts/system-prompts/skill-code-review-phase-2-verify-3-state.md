<!--
name: "Skill: Code Review (Phase 2 — verify, 3-state)"
description: "Precision-tier verification step: run one verifier per candidate finding, each voting CONFIRMED, PLAUSIBLE, or REFUTED"
ccVersion: "2.1.173"
variables:
  - "AGENT_TOOL_NAME"
  - "VERIFY_VOTE_DEFINITIONS"
-->
## Phase 2 — Verify (1-vote, 3-state)

- Deduplicate candidates targeting the same line or mechanism, keeping the one with the most concrete failure scenario.
- For each remaining candidate, run **one verifier** via `${AGENT_TOOL_NAME}` with the diff, relevant file(s), and candidate, returning exactly one verdict:

${VERIFY_VOTE_DEFINITIONS}

- Keep candidates voted `CONFIRMED` or `PLAUSIBLE`; drop all others.
