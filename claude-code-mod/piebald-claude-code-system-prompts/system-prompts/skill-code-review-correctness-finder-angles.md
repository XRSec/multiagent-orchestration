<!--
name: "Skill: Code Review correctness finder angles"
description: "Composite correctness finder angles A–C: line-by-line scan, removed-behavior audit, and cross-file contract tracing"
ccVersion: "2.1.206"
-->
### Angle A — line-by-line diff scan

Inspect every diff hunk and its enclosing function (unchanged lines in touched functions remain in scope) for adversarial input/state/timing/platform failures: inverted conditions, off-by-one, null deref, missing `await`, falsy-zero, copy-paste wrong var, swallowed catch, unescaped regex metachars.

### Angle B — removed-behavior auditor

For every deleted or replaced line, identify the invariant it enforced and verify where the new code re-establishes it; flag missing guards, dropped error paths, narrowed validations, or deleted regression tests.

### Angle C — cross-file tracer

Grep all callers of each modified function to detect broken contracts (new preconditions, altered return shapes, new exceptions, ordering dependencies) and verify callees against concurrent PR edits.
