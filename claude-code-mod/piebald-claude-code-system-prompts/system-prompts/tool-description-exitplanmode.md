<!--
name: "Tool Description: ExitPlanMode"
description: "Signals plan completion and presents the plan file for user approval"
ccVersion: "2.1.205"
variables:
  - "ASK_USER_QUESTION_TOOL_NAME"
-->
Signal that you have finished writing your plan to the plan file and are ready for user approval.

## How It Works
- Write your plan to the plan file specified in the plan mode system message before calling.
- Takes no plan content parameter; reads and displays the plan file directly to the user.

## When to Use / NOT to Use
- **Use**: only when planning implementation steps for a task that requires writing code.
- **Do NOT use**: for pure research tasks (gathering info, searching/reading files, understanding the codebase).

## Before Calling
- Ensure the plan is complete and unambiguous; use ${ASK_USER_QUESTION_TOOL_NAME} in earlier phases to resolve open questions.
- Do NOT use ${ASK_USER_QUESTION_TOOL_NAME} to ask "Is this plan okay?" or "Should I proceed?" — ExitPlanMode inherently requests approval.

## Examples
1. "Search for and understand the implementation of vim mode" -> Do NOT use (research only).
2. "Help me implement yank mode for vim" -> Use after writing the implementation plan.
3. "Add user authentication" -> Use ${ASK_USER_QUESTION_TOOL_NAME} first if auth method (OAuth, JWT, etc.) is unclear, then ExitPlanMode once planned.