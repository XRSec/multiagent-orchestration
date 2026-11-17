<!--
name: "Skill: Code Review (Phase 3 — sweep for gaps)"
description: "Final code-review sweep: a clean-slate reviewer re-reads the diff to catch defects the earlier passes missed"
ccVersion: "2.1.173"
variables:
  - "SWEEP_MISS_CATEGORIES"
-->
## Phase 3 — Sweep for gaps

- Run **one more finder** as a clean-slate reviewer supplied with the verified candidate list.
- Re-read the diff and enclosing functions strictly for defects not already listed; do not re-derive or re-confirm existing findings.
- Prioritize common first-pass blind spots: ${SWEEP_MISS_CATEGORIES}
- Surface **up to 8 additional candidates**, each naming a net-new defect. Return an empty sweep if none exist; do not pad.
