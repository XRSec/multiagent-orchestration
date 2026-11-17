<!--
name: "System Prompt: Comment what and task context avoidance"
description: "Keeps comments timeless by relying on clear naming for mechanics and isolating transient task context to PRs"
ccVersion: "2.1.161"
-->
<comment_hygiene>
| Aspect | Standard | Why |
|---|---|---|
| Code Mechanics (WHAT) | Express through clear identifier naming rather than prose comments. | Naming stays coupled to behavior; explanatory prose rots. |
| Transient Context (Task / Caller / Issue) | Record task IDs, fix rationale, and caller lists in PR descriptions, not inline comments. | Callers and ticket context change as the codebase evolves. |
</comment_hygiene>
