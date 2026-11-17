<!--
name: "Skill: Code Review inline xhigh mode"
description: "Recall-biased 10-angle inline /code-review protocol with deduplication, gap sweep, and capped output"
ccVersion: "2.1.288"
variables:
  - "FORMAT_FINDINGS_LIMIT_LABEL_FN"
  - "MAX_FINDINGS"
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
-->
`xhigh effort → 10 inline angles → dedup (no verify) → sweep → ${FORMAT_FINDINGS_LIMIT_LABEL_FN(MAX_FINDINGS)}`

Mode: Recall-biased extra-high inline review—prioritize catching every real defect over suppressing false positives.

${REVIEW_ANGLE_SHARED_INTRO}
## Phase 1 — Find candidates (5 correctness + 3 cleanup + 1 altitude + 1 conventions, up to 8 each)

Evaluate **10 independent finder angles** sequentially in THIS context (do NOT spawn subagents), surfacing `<= 8` candidates per angle and preserving overlapping line flags from distinct angles:

${REVIEW_CORRECTNESS_ANGLES}
### Angle D — language-pitfall specialist

Flag newly introduced language/framework traps: JS falsy-zero, `==` coercion, loop-closure capture; Python mutable defaults, late-binding closures; Go nil-map writes, range-var capture; SQL injection; timezone/DST drift; float equality.

### Angle E — wrapper/proxy correctness

For added/modified wrappers (caches, proxies, decorators, adapters), verify every method delegates to the wrapped `delegate` instance rather than re-entering via a global/session/registry, and confirm all caller-used methods are forwarded.

${REVIEW_REUSE_ANGLE}
${REVIEW_SIMPLIFICATION_ANGLE}
${REVIEW_EFFICIENCY_ANGLE}
${REVIEW_ALTITUDE_ANGLE}
${REVIEW_CONVENTIONS_ANGLE}
${REVIEW_CANDIDATE_PRECEDENCE_NOTE}
## Phase 2 — Dedup only (no verify)

Pool all candidates, deduplicate near-duplicates (same defect, location, and cause → keep one) without dropping on uncertainty or running verifiers, and sort by severity.

## Phase 3 — Sweep for gaps

Execute one additional inline pass over the diff and enclosing functions scanning strictly for unlisted defects (`<= 8` additional candidates, zero padding): dropped guards/anchors in moved/extracted code, second-tier footguns (dataclass default evaluated once, `hash()` non-determinism, lock-scope shrink, side-effecting predicates), test setup/teardown asymmetry, and flipped config defaults.

${FORMAT_REVIEW_OUTPUT_WITH_MINIMUM_FINDINGS_FN(REVIEW_OUTPUT_FORMATTER_FN,15)(MAX_FINDINGS)}
