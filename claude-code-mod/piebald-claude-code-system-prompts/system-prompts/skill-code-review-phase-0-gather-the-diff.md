<!--
name: "Skill: Code Review (Phase 0 — gather the diff)"
description: "Opening step of the code-review skill: assemble the unified diff to review with git diff"
ccVersion: "2.1.173"
-->
## Phase 0 — Gather the diff

- **Target override**: If a PR number, branch name, or file path argument is provided, diff and review that target instead.
- **Range diff**: Otherwise, run `git diff @{upstream}...HEAD` (fallback: `git diff main...HEAD` or `git diff HEAD~1` when no upstream exists) to capture the committed diff.
- **Working-tree diff**: If uncommitted changes exist or the range diff is empty, also run `git diff HEAD` and include working-tree changes in scope.
- Treat the resulting unified diff as the review scope.
