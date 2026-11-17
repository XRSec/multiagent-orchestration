<!--
name: "Agent Prompt: /simplify unavailable-agent inline mode"
description: "Single-pass inline /simplify cleanup protocol across 4 angles when the Agent tool is unavailable"
ccVersion: "2.1.213"
variables:
  - "AGENT_TOOL_NAME"
  - "DIFF_GATHERING_PHASE"
  - "REUSE_GUIDANCE"
  - "SIMPLIFICATION_GUIDANCE"
  - "EFFICIENCY_GUIDANCE"
  - "ALTITUDE_GUIDANCE"
-->
`/simplify → ${AGENT_TOOL_NAME} tool unavailable → single-pass inline cleanup → apply the fixes`

Scope: Code quality cleanup across reuse, simplification, efficiency, and altitude (omit correctness bug hunting, which belongs to `/code-review`). Because `${AGENT_TOOL_NAME}` is unavailable, evaluate all 4 angles sequentially in the active context without skipping any angle.

${DIFF_GATHERING_PHASE}
## Phase 1 — Review (4 cleanup angles, single pass)

Inspect the diff against each angle, recording `{file, line, summary, concrete_cost}`:

### Reuse

${REUSE_GUIDANCE}
${SIMPLIFICATION_GUIDANCE}
${EFFICIENCY_GUIDANCE}
${ALTITUDE_GUIDANCE}
## Phase 2 — Apply the fixes

Deduplicate overlapping line/mechanism findings and apply verified fixes directly to the working tree. Skip findings that alter behavior, require out-of-diff changes, or are false positives (record skip reason concisely). Close with a summary of applied vs. skipped fixes, explicitly disclosing that this ran as a single-pass inline review without `${AGENT_TOOL_NAME}` fan-out.
