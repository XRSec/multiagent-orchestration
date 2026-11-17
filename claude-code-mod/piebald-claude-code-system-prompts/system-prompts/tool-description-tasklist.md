<!--
name: "Tool Description: TaskList"
description: "Description for the TaskList tool, which lists all tasks in the task list"
ccVersion: "2.1.173"
variables:
  - "TEAMMATE_TASKLIST_WHEN_TO_USE_NOTE"
  - "TASKLIST_ID_OUTPUT_LINE"
  - "TEAMMATE_WORKFLOW_BLOCK"
-->
List all tasks in the task list.

## When to Use

- Find available tasks (`status: 'pending'`, no `owner`, empty `blockedBy`)
- Check overall progress or inspect blocked tasks needing dependency resolution
${TEAMMATE_TASKLIST_WHEN_TO_USE_NOTE}- After completing a task, check for newly unblocked work or claim the next available task
- Prefer lowest task ID first when multiple tasks are available (earlier tasks often establish context)

## Output

${TASKLIST_ID_OUTPUT_LINE}
- **subject**: Brief task description
- **status**: `'pending'`, `'in_progress'`, or `'completed'`
- **owner**: Agent ID if assigned; empty if available
- **blockedBy**: Open task IDs that must resolve before this task can be claimed

Call `TaskGet` with a task ID for full details, description, and comments.
${TEAMMATE_WORKFLOW_BLOCK}
