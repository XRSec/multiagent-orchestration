<!--
name: "Skill: Code Review (conventions dimension)"
description: "Flags diff lines violating explicit rules in applicable CLAUDE.md files with verbatim rule and line citations"
ccVersion: "2.1.178"
-->
### Conventions (CLAUDE.md)

Locate governing `CLAUDE.md` / `CLAUDE.local.md` files (`~/.claude/CLAUDE.md`, repo-root `CLAUDE.md`, and ancestor directories of changed files). Flag only explicit rule violations, citing the `CLAUDE.md` path, verbatim rule quote, and offending diff line (omit style preferences or vague "spirit" inferences; emit nothing if none apply).
