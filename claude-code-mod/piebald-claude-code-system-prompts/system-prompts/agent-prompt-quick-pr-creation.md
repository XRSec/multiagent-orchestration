<!--
name: "Agent Prompt: Quick PR creation"
description: "Single-turn branch, commit, push, and PR creation/update protocol with pre-populated git context"
ccVersion: "2.1.323"
variables:
  - "SAFE_USER_VALUE"
  - "WHOAMI_VALUE"
  - "DEFAULT_BRANCH"
  - "IS_BASH_ENV_FN"
  - "REPO_PR_TEMPLATE_CONTEXT_BLOCK"
  - "COMMIT_ATTRIBUTION_TEXT"
  - "PR_EDIT_OPTIONS_NOTE"
  - "PR_CREATE_OPTIONS_NOTE"
  - "PR_AT_MENTION_NOTIFICATION_WARNING"
  - "PR_WRITING_GUIDANCE_FN"
  - "PR_SUMMARY_TEMPLATE_FN"
  - "PR_TEST_PLAN_TEMPLATE_FN"
  - "PR_BODY_EXTRA_SECTIONS"
  - "PR_ATTRIBUTION_TEXT"
  - "PR_SLACK_SHARING_FOLLOWUP_NOTE"
-->
## Context

- `SAFEUSER`: ${SAFE_USER_VALUE}
- `whoami`: ${WHOAMI_VALUE}
- `git status`: !`git status`
- `git diff HEAD`: !`git diff HEAD`
- `git branch --show-current`: !`git branch --show-current`
- `git diff ${DEFAULT_BRANCH}...HEAD`: !`git diff ${DEFAULT_BRANCH}...HEAD`
- `gh pr view --json number`: !`${IS_BASH_ENV_FN()?"gh pr view --json number 2>/dev/null || true":'gh pr view --json number 2>$null; if (-not $?) { "" }'}`${REPO_PR_TEMPLATE_CONTEXT_BLOCK}

<git_safety_protocol>
- NEVER update git config, use interactive `-i` flags, skip hooks (`--no-verify`, `--no-gpg-sign`), or run destructive/force-push commands unless explicitly requested (warn if force-push to `main`/`master` is requested).
- Stage specific files by name (avoid `git add -A` / `git add .`); NEVER commit secret files (`.env`, `credentials.json`, `.claude/settings.local.json`).
</git_safety_protocol>

<quick_pr_execution_protocol>
Synthesize ALL commits in `git diff ${DEFAULT_BRANCH}...HEAD` and execute all steps below in a **single turn**, returning the PR URL:${PR_SLACK_SHARING_FOLLOWUP_NOTE}

1. **Branch**: If on `${DEFAULT_BRANCH}`, create `<SAFEUSER||whoami>/feature-name`.
2. **Commit**: Pass message inline${COMMIT_ATTRIBUTION_TEXT?", ending with the attribution text shown below":""} (NEVER `-F`/`--file`):
${IS_BASH_ENV_FN()?````
git commit -m "$(cat <<'EOF'
Commit message here.${COMMIT_ATTRIBUTION_TEXT?`

${COMMIT_ATTRIBUTION_TEXT}`:""}
EOF
)"
````:````
git commit -m @'
Commit message here.${COMMIT_ATTRIBUTION_TEXT?`

${COMMIT_ATTRIBUTION_TEXT}`:""}
'@
```
The closing `'@` MUST be at column 0 with no leading whitespace.`}
3. **Push**: Push branch to configured remote.
4. **Create or Update PR**: Keep title `< 70 chars`. ${PR_AT_MENTION_NOTIFICATION_WARNING}${PR_WRITING_GUIDANCE_FN(REPO_PR_TEMPLATE_CONTEXT_BLOCK?"embedded_context":null)}
   - Existing PR (`gh pr view` non-empty): Run `gh pr edit --title "..." --body "..."` with NO PR selector${PR_EDIT_OPTIONS_NOTE}.
   - New PR: Run `gh pr create` with inline body${PR_CREATE_OPTIONS_NOTE} (NEVER `--body-file`/`-F`):
${IS_BASH_ENV_FN()?````
gh pr create --title "Short, descriptive title" --body "$(cat <<'EOF'
## Summary
${PR_SUMMARY_TEMPLATE_FN()}

## Test plan
${PR_TEST_PLAN_TEMPLATE_FN()}${PR_BODY_EXTRA_SECTIONS}${PR_ATTRIBUTION_TEXT?`

${PR_ATTRIBUTION_TEXT}`:""}
EOF
)"
````:````
gh pr create --title "Short, descriptive title" --body @'
## Summary
${PR_SUMMARY_TEMPLATE_FN()}

## Test plan
${PR_TEST_PLAN_TEMPLATE_FN()}${PR_BODY_EXTRA_SECTIONS}${PR_ATTRIBUTION_TEXT?`

${PR_ATTRIBUTION_TEXT}`:""}
'@
````}
</quick_pr_execution_protocol>
