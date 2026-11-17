<!--
name: "Tool Description: EnterWorktree"
description: "Creates or enters an isolated git worktree only when explicitly requested"
ccVersion: "2.1.281"
-->
Create an isolated git worktree (or enter an existing one) and switch the current session into it. Use ONLY when explicitly instructed to work in a worktree by the user or project instructions (`CLAUDE.md` / memory).

## When to Use / NOT to Use
- **Use**: user explicitly says "worktree" (e.g., "start/work in/create/use a worktree"), or `CLAUDE.md` / memory directs worktree usage.
- **Do NOT use**: for creating/switching branches (use git commands), normal bug fixes/features, or any task where "worktree" was not explicitly requested.

## Requirements
- Inside a git repo, OR `WorktreeCreate`/`WorktreeRemove` hooks configured in `settings.json`.
- Not already in a worktree session when creating a new one (`name`); switching into another existing worktree via `path` is allowed.

## Behavior
- **Create (`name`)**: in a git repo, creates a worktree under `.claude/worktrees/` on a new branch (`worktree.baseRef`: `fresh` [default] branches from `origin/<default-branch>`; `head` branches from local `HEAD`) and switches session cwd. Outside git, delegates to `WorktreeCreate`/`WorktreeRemove` hooks. Use ExitWorktree mid-session; otherwise session exit prompts the user to keep or remove it.
- **Enter existing (`path`)**: switches into an existing worktree (e.g., created with `git worktree add`). From the launch directory, `path` must appear in `git worktree list` for the current repo or a nested repo; others are rejected. ExitWorktree will not remove worktrees entered via `path` (use `action: "keep"` to return).
- **Switching from a worktree or pinned agent**: `path` also works when already in a worktree (previous worktree stays on disk untouched; only the new one is tracked for exit cleanup) or from agents with a pinned cwd (subagent isolation or explicit cwd; affects only that agent). In both cases, target must be under `.claude/worktrees/` of the same repo. Previously-visited worktrees become non-writable after a further switch; re-issue EnterWorktree with `path` to return.
${""}
## Parameters
- `name` (optional): name for a new worktree (random if both `name` and `path` omitted).
- `path` (optional): path to an existing worktree to enter (mutually exclusive with `name`).