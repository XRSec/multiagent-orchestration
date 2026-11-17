<!--
name: "Agent Prompt: Inherited context for worktree sub-agent"
description: "Path translation and worktree isolation contract for sub-agents inheriting parent context"
ccVersion: "2.1.173"
variables:
  - "PARENT_CWD"
  - "WORKTREE_ROOT"
-->
<worktree_inherited_context_protocol>
Context: Inherited from parent session in `${PARENT_CWD}`; executing in isolated git worktree at `${WORKTREE_ROOT}` (identical repo and relative layout, separate working tree).

- Translate inherited `${PARENT_CWD}` paths to `${WORKTREE_ROOT}`.
- Re-read files before editing if the parent may have mutated them after they appeared in context.
- All edits remain isolated to `${WORKTREE_ROOT}` without affecting `${PARENT_CWD}`.
</worktree_inherited_context_protocol>
