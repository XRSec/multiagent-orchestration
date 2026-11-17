<!--
name: "Tool Description: Task Get"
description: "Retrieve a task by ID with full details and comments"
ccVersion: "2.1.173"
-->
Retrieve a task by ID from the task list.

## When to Use

- Before starting work on a task, to get its full description and requirements
- To inspect task dependencies (`blocks`, `blockedBy`)

## Output

- **subject**: Task title
- **description**: Detailed requirements and context
- **status**: `'pending'`, `'in_progress'`, or `'completed'`
- **blocks**: Tasks waiting on this one
- **blockedBy**: Tasks that must complete before this one can start

## Rules

- Verify `blockedBy` is empty before starting work.
- Use `TaskList` for a summary of all tasks.
