<!--
name: "Tool Description: ExitWorktree"
description: "Returns the session to its original working directory and keeps or removes the session-created worktree"
ccVersion: "2.1.326"
-->
Exit a worktree session created by EnterWorktree and restore the original working directory.

## Scope & When to Use
- **Scope**: operates ONLY on worktrees created by EnterWorktree in this session. Never touches manual `git worktree add` worktrees, previous-session worktrees, or non-worktree directories. Calling outside an EnterWorktree session is a no-op (filesystem unchanged).
- **When to use**: call ONLY when the user explicitly asks to exit/leave the worktree or go back; never call proactively.

## Parameters
- `action` (required): `"keep"` (leave worktree directory and branch on disk for later/preserving changes) or `"remove"` (delete worktree directory and its branch unless created by a hook or git refuses).
- `discard_changes` (optional, default `false`): applies only to `action: "remove"`. Refuses removal if uncommitted files or unmerged commits exist unless `true`. If an error lists changes, confirm with the user before re-invoking with `discard_changes: true`. Also refuses while a task may be running in the worktree (wait, or ask user before stopping it, or use `keep`).

## Behavior
- Restores original working directory and clears CWD-dependent caches (system prompt sections, memory files, plans directory).
- Attached tmux session: killed on `remove`; kept running on `keep` (returns name for reattachment).
- Once exited, EnterWorktree can be called again for a fresh worktree.