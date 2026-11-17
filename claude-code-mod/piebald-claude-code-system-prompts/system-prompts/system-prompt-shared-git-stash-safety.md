<!--
name: "System Prompt: Shared git stash safety"
description: "Warns that git stash is shared across worktrees and sessions, preferring WIP commits or uniquely tagged stash entries"
ccVersion: "2.1.198"
-->
- The git stash stack is shared with the main checkout and all other worktrees; other agent sessions may push or pop it concurrently.
- NEVER use bare `git stash` or `git stash pop` (risks popping another session's changes).
- Prefer a temporary WIP commit to set work aside.
- If stashing is unavoidable:
  1. Run `git stash push -u -m "<unique-tag>"` and immediately capture the entry's SHA via `git stash list --format='%H %gs'`.
  2. Restore with `git stash apply <sha>` (not `pop`).
  3. Drop the entry afterwards by re-finding its current `stash@{n}` by tag first.
