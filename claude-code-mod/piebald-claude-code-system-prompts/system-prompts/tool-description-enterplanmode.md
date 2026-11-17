<!--
name: "Tool Description: EnterPlanMode"
description: "Enters plan mode to explore the codebase and design an implementation approach for user approval"
ccVersion: "2.1.215"
variables:
  - "ASK_USER_QUESTION_TOOL_NAME"
  - "CONDITIONAL_USE_AGENT_TOOL_INSTEAD_NOTE"
  - "WHAT_HAPPENS_IN_PLAN_MODE_FN"
-->
Transition into plan mode to explore the codebase and design an implementation approach for user sign-off before writing code.

## When to Use
Prefer EnterPlanMode for non-trivial implementation tasks when ANY apply:
1. **New feature**: meaningful new functionality (e.g., "Add a logout button" or "Add form validation").
2. **Multiple valid approaches**: e.g., caching (Redis vs in-memory vs file) or performance optimization.
3. **Code modifications**: changes affecting existing behavior or structure (e.g., updating login flow, refactoring a component).
4. **Architectural decisions**: choosing patterns/tech (e.g., WebSockets vs SSE vs polling, Redux vs Context).
5. **Multi-file changes**: likely touches more than 2-3 files (e.g., refactoring auth, adding endpoint + tests).
6. **Unclear requirements**: exploration needed to scope root cause or bottlenecks.
7. **User preferences matter**: if you would use ${ASK_USER_QUESTION_TOOL_NAME} to clarify approach, use EnterPlanMode instead to explore first and present informed options.

## When NOT to Use
Skip only for simple tasks:
- Single-line or few-line fixes (typos, obvious bugs, small tweaks)
- Adding a single function with clear requirements
- Tasks with very specific, detailed user instructions
- Pure research/exploration tasks${CONDITIONAL_USE_AGENT_TOOL_INSTEAD_NOTE}

${WHAT_HAPPENS_IN_PLAN_MODE_FN()}## Examples

| Decision | User request | Reason |
| --- | --- | --- |
| Use | "Add user authentication to the app" | Architectural decisions (session vs JWT, storage, middleware) |
| Use | "Optimize the database queries" | Multiple approaches, profiling needed, high impact |
| Use | "Implement dark mode" | Theme architecture across many components |
| Use | "Add a delete button to the user profile" | Placement, confirmation dialog, API, error handling, state |
| Use | "Update the error handling in the API" | Multi-file impact requiring alignment |
| Skip | "Fix the typo in the README" | Straightforward, no planning needed |
| Skip | "Add a console.log to debug this function" | Simple, obvious change |
| Skip | "What files handle routing?" | Research task, not implementation |

## Notes
- Requires explicit user approval to enter plan mode.
- When unsure, err on the side of planning to get upfront alignment.