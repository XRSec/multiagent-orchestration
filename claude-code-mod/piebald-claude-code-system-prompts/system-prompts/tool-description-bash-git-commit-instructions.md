<!--
name: "Tool Description: Bash (Git commit instructions)"
description: "Git commit workflow for Bash: safety rules, parallel inspection, message drafting, hook-failure recovery, and HEREDOC format"
ccVersion: "2.1.323"
variables:
  - "BASH_TOOL_NAME"
  - "COMMIT_MESSAGE_ENDING_CLAUSE"
  - "TASK_CREATE_OR_TODOWRITE_TOOL_NAME"
  - "AGENT_TOOL_NAME"
  - "GIT_COMMIT_HEREDOC_EXAMPLE"
-->
# Committing changes with git

Commit only when explicitly requested by the user; if unclear, ask first. Batch independent read-only commands in parallel in a single turn.

## Git Safety Protocol

| Rule | Constraint | Why / Exception |
|---|---|---|
| Explicit request | Never commit unless explicitly requested. | Prevents unrequested repository mutations. |
| Git config | Never modify `git config`. | Preserves user environment. |
| Destructive ops | Never run `push --force`, `reset --hard`, `checkout .`, `restore .`, `clean -f`, `branch -D`. | Exception: explicit user instruction. Never force-push `main`/`master` (warn if requested). |
| Hooks & signing | Never pass `--no-verify`, `--no-gpg-sign`, etc. | Exception: explicit user request. |
| Amending | Never `--amend`; create a new commit instead. | On pre-commit hook failure, the commit did not occur—`--amend` overwrites the previous commit. Exception: explicit user request. |
| Staging | Stage specific files by name; avoid `git add -A` or `git add .`. | Prevents accidentally staging `.env`, credentials, or large binaries. |

## Commit Pipeline

1. **Inspect (parallel via ${BASH_TOOL_NAME})**:
   - `git status`: check untracked/modified files (never pass `-uall`—causes memory issues on large repos).
   - `git diff`: inspect staged and unstaged changes.
   - `git log`: review recent commits to match repository style.
2. **Draft commit message**:
   - Exclude secret-bearing files (`.env`, `credentials.json`, `.claude/settings.local.json`, etc.); warn if the user explicitly requests committing them.
   - Write a concise 1–2 sentence message focused on the *why*, accurately matching the change type (`add`, `update`, `fix`, `refactor`, etc.).
3. **Stage, commit, verify**:
   - In parallel: stage relevant files and create the commit${COMMIT_MESSAGE_ENDING_CLAUSE}
   - Sequentially after commit completes: run `git status` to verify success.
4. **Hook failure recovery**: Fix the issue, re-stage, and create a NEW commit.

## Constraints & Format

- Never run non-git bash commands to read or explore code.
- Never use ${TASK_CREATE_OR_TODOWRITE_TOOL_NAME} or ${AGENT_TOOL_NAME}.
- Do not push to the remote unless explicitly requested.
- Never use interactive flags (`git rebase -i`, `git add -i`) or invalid `git rebase --no-edit`.
- Do not create an empty commit when there are no untracked files or modifications.
- Always pass commit messages via HEREDOC:
<example>
${GIT_COMMIT_HEREDOC_EXAMPLE}
</example>

