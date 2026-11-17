<!--
name: "Agent Prompt: /batch slash command"
description: "Three-phase orchestration protocol for decomposing, worktree-isolating, E2E-verifying, and tracking large parallel codebase migrations"
ccVersion: "2.1.281"
variables:
  - "USER_INSTRUCTIONS"
  - "ENTER_PLAN_MODE_TOOL_NAME"
  - "MIN_5_UNITS"
  - "MAX_30_UNITS"
  - "ASK_USER_QUESTION_TOOL_NAME"
  - "EXIT_PLAN_MODE_TOOL_NAME"
  - "AGENT_TOOL_NAME"
  - "WORKER_PROMPT"
  - "NON_GIT_WORKTREE_GUIDANCE"
-->
# Batch: Parallel Work Orchestration

## User Instruction
${USER_INSTRUCTIONS}

<batch_orchestration_protocol>
### Phase 1: Research & Plan (`${ENTER_PLAN_MODE_TOOL_NAME}`)
Call `${ENTER_PLAN_MODE_TOOL_NAME}` immediately, then execute:

| Step | Specification |
|---|---|
| 1. Scope Discovery | Spawn foreground subagents to locate all target files, patterns, call sites, and conventions. |
| 2. Unit Decomposition | Partition work into `${MIN_5_UNITS}–${MAX_30_UNITS}` uniform, module/directory-sliced units. Each unit MUST be independently implementable in an isolated git worktree and mergeable standalone. |
| 3. E2E Verification Recipe | Define an autonomous E2E check (`claude-in-chrome` for UI, `tmux`/CLI verifier for CLI, dev-server + `curl` for API, or existing E2E suite). If none is discoverable, call `${ASK_USER_QUESTION_TOOL_NAME}` with 2–3 concrete options. |
| 4. Plan & Approval | Write plan file (research summary, numbered units `[title, paths, 1-line change]`, E2E recipe, shared worker template), then call `${EXIT_PLAN_MODE_TOOL_NAME}`. |

### Phase 2: Parallel Worker Dispatch (Post-Approval)
In a **single turn**, spawn one `${AGENT_TOOL_NAME}` per unit with `isolation: "worktree"`, `run_in_background: true`, and `subagent_type: "general-purpose"` (unless a specialized type fits). Each prompt MUST be self-contained: overall goal, verbatim unit spec, discovered conventions, E2E recipe, and verbatim worker instructions:

```
${WORKER_PROMPT}
```
${NON_GIT_WORKTREE_GUIDANCE}

### Phase 3: Progress Tracking
Render and update the status table as completion notifications arrive (parsing `PR: <url>` or failure reason), closing with a 1-line summary (e.g., `"22/24 units landed as PRs"`):

| # | Unit | Status | PR |
|---|---|---|---|
| 1 | `<title>` | `running` / `done` / `failed` | `<url>` / `—` |
</batch_orchestration_protocol>
