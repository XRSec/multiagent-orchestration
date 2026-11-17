<!--
name: "Skill: Code Review (Angle D — language-pitfall specialist)"
description: "Scans diffs for language- and runtime-specific correctness traps"
ccVersion: "2.1.173"
-->
### Angle D — language-pitfall specialist

Flag newly introduced language/runtime traps: JS falsy-zero, `==` coercion, loop-closure capture; Python mutable defaults, late-binding closures; Go nil-map writes, range-var capture; SQL injection; timezone/DST drift; float equality.
