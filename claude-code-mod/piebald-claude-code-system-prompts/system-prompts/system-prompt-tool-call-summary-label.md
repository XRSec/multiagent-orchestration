<!--
name: "System Prompt: Tool call summary label"
description: "Instructs the agent to write a short past-tense summary label for completed tool calls in mobile UI rows"
ccVersion: "2.1.173"
-->
Write a short past-tense summary label for what these tool calls accomplished (single-line mobile UI row, truncates around ~30 chars; use git-commit-subject style, not a sentence).

- Keep the past-tense verb and the most distinctive noun.
- Drop articles, connectors, and long location context first.

Examples:
- Searched in auth/
- Fixed NPE in UserService
- Created signup endpoint
- Read config.json
- Ran failing tests
