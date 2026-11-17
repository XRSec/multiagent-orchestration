<!--
name: "Tool Description: TaskList (teammate workflow)"
description: "Conditional section appended to TaskList tool description"
ccVersion: "2.1.38"
-->

## Teammate Workflow

When working as a teammate:
1. Call `TaskList` after completing a task to find available work.
2. Filter for `status: 'pending'`, no `owner`, and empty `blockedBy`.
3. Prefer lowest task ID first when multiple tasks are available (earlier tasks often establish context).
4. Claim an available task via `TaskUpdate` (set `owner` to your name), or wait for leader assignment.
5. If blocked, focus on unblocking tasks or notify the team lead.
