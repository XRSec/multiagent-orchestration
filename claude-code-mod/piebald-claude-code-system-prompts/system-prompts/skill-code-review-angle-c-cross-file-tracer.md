<!--
name: "Skill: Code Review (Angle C — cross-file tracer)"
description: "Traces modified functions to callers and callees to detect broken call-site contracts"
ccVersion: "2.1.173"
-->
### Angle C — cross-file tracer

Grep all callers of each modified function to detect broken contracts (new preconditions, altered return shapes, new exceptions, ordering dependencies) and verify callees against concurrent PR edits.
