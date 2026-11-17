<!--
name: "Agent Prompt: /code-review part 8 GitHub comment posting"
description: "Inline GitHub PR comment posting protocol for --comment flag with gh CLI and terminal fallbacks"
ccVersion: "2.1.147"
-->
<github_comment_posting_protocol>
Triggered by `--comment` flag after findings generation.

| Target & Tool State | Action |
|---|---|
| GitHub PR + `mcp__github_inline_comment__create_inline_comment` | Post 1 inline comment per finding; attach a suggestion block only when it completely fixes the defect. |
| GitHub PR (MCP tool unavailable) | Fall back to `gh api repos/{owner}/{repo}/pulls/{pr}/comments`, or print findings to terminal. |
| Non-PR Target | Print findings to terminal and note `--comment` was ignored. |
</github_comment_posting_protocol>
