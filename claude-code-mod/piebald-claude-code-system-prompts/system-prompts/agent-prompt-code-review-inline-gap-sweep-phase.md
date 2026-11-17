<!--
name: "Agent Prompt: /code-review inline gap sweep phase"
description: "Same-context gap sweep phase scanning diff and enclosing functions for unlisted defects"
ccVersion: "2.1.213"
variables:
  - "SWEEP_FOCUS"
-->
## Phase 3 — Sweep for gaps

Execute one additional pass in the current context (no subagent) against the diff and enclosing functions, scanning strictly for defects absent from the deduplicated list: ${SWEEP_FOCUS}
