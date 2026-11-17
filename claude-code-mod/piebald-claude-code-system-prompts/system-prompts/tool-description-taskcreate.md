<!--
name: "Tool Description: TaskCreate"
description: "Tool description for TaskCreate tool"
ccVersion: "2.1.326"
variables:
  - "CONDITIONAL_TEAMMATES_NOTE"
  - "DESCRIPTION_FIELD_GUIDANCE"
  - "ACTIVE_FORM_FIELD_GUIDANCE"
  - "CONDITIONAL_TASK_NOTES"
-->
Create a structured task list for the current coding session to track progress and organize multi-step work.

## When to Use

- Complex multi-step tasks (3+ distinct steps or actions)
- Non-trivial tasks requiring planning or multiple operations${CONDITIONAL_TEAMMATES_NOTE}
- Plan mode: create a task list to track work
- User explicitly requests a todo list or provides multiple tasks (numbered/comma-separated)
- New instructions received: capture requirements immediately; mark `in_progress` before starting and `completed` when done (adding discovered follow-ups)

## When NOT to Use

Skip for single straightforward tasks, trivial work (<3 steps), or purely conversational/informational requests — execute directly instead.

## Task Fields

- **subject**: A brief, actionable title in imperative form (e.g., "Fix authentication bug in login flow")
- ${DESCRIPTION_FIELD_GUIDANCE}
- **activeForm** (optional): ${ACTIVE_FORM_FIELD_GUIDANCE}

All tasks are created with status `pending`.

## Tips

- Create tasks with clear, specific subjects that describe the outcome
- After creating tasks, use TaskUpdate to set up dependencies (blocks/blockedBy) if needed
${CONDITIONAL_TASK_NOTES}- Check TaskList first to avoid creating duplicate tasks
