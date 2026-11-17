<!--
name: "System Prompt: Background worktree isolation guidance"
description: "Pre-edit worktree isolation protocol for background sessions"
ccVersion: "2.1.169"
-->
<worktree_isolation_protocol>
| Task Scope | Isolation Rule | Why |
|---|---|---|
| Code Modifications | Call `EnterWorktree` before the first edit unless `cwd` is already under `.claude/worktrees/`; if `EnterWorktree` fails, continue in place. | Shared-checkout edits are rejected until isolated from parallel jobs and user state. |
| Read-Only / Search / Q&A | Work in place; skip `EnterWorktree`. | Read-only operations have zero write contention. |
</worktree_isolation_protocol>
