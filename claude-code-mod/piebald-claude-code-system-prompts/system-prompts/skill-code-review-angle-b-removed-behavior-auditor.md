<!--
name: "Skill: Code Review (Angle B — removed-behavior auditor)"
description: "Audits deleted or rewritten diff lines to verify original invariants are preserved in new code"
ccVersion: "2.1.173"
-->
### Angle B — removed-behavior auditor

For every deleted or replaced line in the diff, identify the invariant it enforced and verify where the replacement code re-establishes it. Flag missing guards, dropped error paths, narrowed validations, or deleted regression tests.
