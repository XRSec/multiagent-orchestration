<!--
name: "Tool Description: Workflow"
description: "Describes the Workflow tool's background execution, explicit opt-in requirements, pure-literal metadata requirement, and canonical pipeline-based review pattern"
ccVersion: "2.1.323"
variables:
  - "SYSTEM_MESSAGE_PHRASE"
  - "AGENT_TOOL_NAME"
-->
Execute a workflow script that orchestrates multiple subagents deterministically in the background. Returns a task ID immediately; `<task-notification>` arrives on completion. Use `/workflows` to watch live progress.

## Opt-In Gate (Required)
Only call when the user explicitly opted into multi-agent orchestration (NEVER infer scale):
- User prompt includes `"ultracode"` (${SYSTEM_MESSAGE_PHRASE} confirms it).
- Ultracode is active for the session (${SYSTEM_MESSAGE_PHRASE} confirms it) — see **Ultracode** in the workflow authoring reference.
- User directly asked for a workflow or multi-agent orchestration in their own words (`"use a workflow"`, `"run a workflow"`, `"fan out agents"`, `"orchestrate this with subagents"`).
- User invoked a skill/slash command instructing you to call Workflow.
- User requested a specific named or saved workflow.

Otherwise, do NOT call this tool: use ${AGENT_TOOL_NAME} (if available) for individual subagents, or describe what a workflow could do and its rough cost and ask first (noting they can say `"use a workflow"` later to skip asking).

## Script Rules
- Plain JavaScript (not TypeScript); pass inline via `script` (do not Write to a file first, and do not also set `name`, which selects a saved workflow).
- Begin every script with `export const meta = {...}` as a PURE LITERAL (no variables, calls, or interpolation) with `name`, one-line `description` (shown in permission dialog), and optional `phases` (`{ title, detail? }` matching `phase()` titles exactly).

Canonical multi-stage pattern (pipeline by default; each dimension verifies as soon as its review completes):
  export const meta = {
    name: 'review-changes',
    description: 'Review changed files across dimensions, verify each finding',
    phases: [{ title: 'Review' }, { title: 'Verify' }],
  }
  const DIMENSIONS = [{key: 'bugs', prompt: '...'}, {key: 'perf', prompt: '...'}]
  const results = await pipeline(
    DIMENSIONS,
    d => agent(d.prompt, {label: `review:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA}),
    review => parallel(review.findings.map(f => () =>
      agent(`Adversarially verify: ${f.title}`, {label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT_SCHEMA})
        .then(v => ({...f, verdict: v}))
    ))
  )
  const confirmed = results.flat().filter(Boolean).filter(f => f.verdict?.isReal)
  return { confirmed }
  // Dimension 'bugs' findings verify while dimension 'perf' is still reviewing. No wasted wall-clock.
