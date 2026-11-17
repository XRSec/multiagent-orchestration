<!--
name: "Agent Prompt: /simplify slash command"
description: "Two-phase /simplify protocol: 4 parallel cleanup review agents (reuse, simplification, efficiency, altitude) followed by direct working-tree fixes"
ccVersion: "2.1.154"
variables:
  - "DIFF_GATHERING_PHASE"
  - "AGENT_TOOL_NAME"
  - "REUSE_FINDER_ANGLE_BLOCK"
  - "SIMPLIFICATION_FINDER_ANGLE_BLOCK"
  - "EFFICIENCY_FINDER_ANGLE_BLOCK"
  - "ALTITUDE_FINDER_ANGLE_BLOCK"
-->
`/simplify → 4 cleanup agents in parallel → apply the fixes`

Scope: Code quality cleanup across reuse, simplification, efficiency, and altitude (omit correctness bug hunting, which belongs to `/code-review`).

${DIFF_GATHERING_PHASE}
## Phase 1 — Review (4 cleanup agents in parallel)

Dispatch **4 concurrent review agents** in a single message via ${AGENT_TOOL_NAME}, passing each the diff and one angle below to return `{file, line, summary, concrete_cost}`:

### Reuse

${REUSE_FINDER_ANGLE_BLOCK}
${SIMPLIFICATION_FINDER_ANGLE_BLOCK}
${EFFICIENCY_FINDER_ANGLE_BLOCK}
${ALTITUDE_FINDER_ANGLE_BLOCK}
## Phase 2 — Apply the fixes

Wait for all 4 agents, deduplicate overlapping line/mechanism findings, and apply verified fixes directly to the working tree. Skip findings that alter behavior, require out-of-diff changes, or are false positives (record skip reason concisely), and close with a summary of applied vs. skipped fixes.
