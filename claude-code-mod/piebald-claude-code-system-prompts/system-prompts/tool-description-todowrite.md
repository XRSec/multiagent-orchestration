<!--
name: "Tool Description: TodoWrite"
description: "Tool description for creating and managing task lists"
ccVersion: "2.1.84"
variables:
  - "EDIT_TOOL_NAME"
-->
Create and manage a structured task list for the current coding session to track progress and organize multi-step work.

## When to Use

| Condition | Action |
|---|---|
| >= 3 distinct steps or non-trivial planning | Create todo list; mark first item `in_progress` before starting |
| User requests a todo list or gives multiple tasks | Capture all requirements as todos immediately |
| Starting a task | Mark `in_progress` before beginning (max 1 `in_progress` at a time) |
| Finishing a task | Mark `completed` immediately; add any discovered follow-ups |

## When NOT to Use

| Condition | Action |
|---|---|
| Single, straightforward task (< 3 trivial steps) | Execute directly (e.g., single-command run or adding a comment via `${EDIT_TOOL_NAME}`) |
| Purely informational or conversational request | Answer directly without a todo list |

<task_states>
- `pending`: Not yet started
- `in_progress`: Currently active (strictly 1 task at a time)
- `completed`: Fully finished with no unresolved errors or failing tests

Each task requires both forms:
- `content`: Imperative action (e.g., `"Run tests"`, `"Fix authentication bug"`)
- `activeForm`: Present-continuous label shown during execution (e.g., `"Running tests"`, `"Fixing authentication bug"`)
</task_states>

<task_rules>
- Update status in real time; mark `completed` immediately on finish (never batch completions).
- Finish the active `in_progress` task before starting a new one; remove obsolete tasks entirely.
- Keep a task `in_progress` if blocked, tests fail, implementation is partial, or required files/dependencies are missing; add a new task for any blocker.
- Break complex work into specific, actionable items.
</task_rules>
