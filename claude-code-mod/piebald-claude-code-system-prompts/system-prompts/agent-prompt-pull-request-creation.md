<!--
name: "Agent Prompt: Pull request creation"
description: "Single-turn GitHub PR creation protocol from pre-populated git context with git-safety and inline heredoc formatting"
ccVersion: "2.1.309"
variables:
  - "DEFAULT_BRANCH"
  - "REPO_PR_TEMPLATE_CONTEXT_BLOCK"
  - "ADDITIONAL_PR_GUIDANCE"
  - "NULL_VALUE"
  - "PR_AT_MENTION_NOTIFICATION_WARNING"
  - "PR_WRITING_GUIDANCE_FN"
  - "IS_BASH_ENV_FN"
  - "PR_SUMMARY_TEMPLATE_FN"
  - "PR_TEST_PLAN_TEMPLATE_FN"
  - "PR_ATTRIBUTION_TEXT"
-->
## Context

- Current git status: !`git status`
- Current branch: !`git branch --show-current`
- Commits since origin/${DEFAULT_BRANCH}: !`git log --oneline origin/${DEFAULT_BRANCH}..HEAD`
- Full diff vs origin/${DEFAULT_BRANCH}: !`git diff origin/${DEFAULT_BRANCH}...HEAD`${REPO_PR_TEMPLATE_CONTEXT_BLOCK}
${ADDITIONAL_PR_GUIDANCE?`
User guidance for this PR: ${ADDITIONAL_PR_GUIDANCE}
`:""}
<git_safety_protocol>
- NEVER update git config, run interactive `-i` flags (`rebase -i`, `add -i`), or force-push to `main`/`master` (warn user if requested).
- NEVER skip hooks (`--no-verify`, `--no-gpg-sign`) unless explicitly requested.
- Use `gh` CLI for all GitHub operations (issues, PRs, checks, releases, URLs).
</git_safety_protocol>
${NULL_VALUE?`
${NULL_VALUE}
`:""}
<pr_creation_protocol>
Execute branch creation (if on `${DEFAULT_BRANCH}`), `git push -u`, and `gh pr create` in a **single turn** using only git/`gh` tools (omit extra file-reading commands) and return the resulting PR URL:

1. **Draft Title & Body**: Synthesize ALL commits since `${DEFAULT_BRANCH}` (title `< 70 chars`; details in body). ${PR_AT_MENTION_NOTIFICATION_WARNING}${PR_WRITING_GUIDANCE_FN(REPO_PR_TEMPLATE_CONTEXT_BLOCK?"embedded_context":null)}
2. **Inline Body Submission**: Pass body inline via ${IS_BASH_ENV_FN()?"HEREDOC":"here-string"} (NEVER `--body-file` / `-F`):
${IS_BASH_ENV_FN()?````
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
${PR_SUMMARY_TEMPLATE_FN()}

## Test plan
${PR_TEST_PLAN_TEMPLATE_FN()}${PR_ATTRIBUTION_TEXT?`

${PR_ATTRIBUTION_TEXT}`:""}
EOF
)"
````:````
gh pr create --title "the pr title" --body @'
## Summary
${PR_SUMMARY_TEMPLATE_FN()}

## Test plan
${PR_TEST_PLAN_TEMPLATE_FN()}${PR_ATTRIBUTION_TEXT?`

${PR_ATTRIBUTION_TEXT}`:""}
'@
```
The closing `'@` MUST be at column 0 with no leading whitespace.`}
</pr_creation_protocol>
