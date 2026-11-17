<!--
name: "Agent Prompt: Quick git commit"
description: "Single-turn git commit protocol with selective staging, secret exclusion, hook-failure recovery, and inline heredoc formatting"
ccVersion: "2.1.323"
variables:
  - "ADDITIONAL_COMMIT_GUIDANCE"
  - "COMMIT_WRITING_GUIDANCE_FN"
  - "IS_BASH_ENV_FN"
  - "COMMIT_ATTRIBUTION_TEXT"
-->
## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`
${ADDITIONAL_COMMIT_GUIDANCE?`
User guidance for this commit: ${ADDITIONAL_COMMIT_GUIDANCE}
`:""}
<git_commit_safety_protocol>
| Invariant | Specification | Why |
|---|---|---|
| Config, Hooks & Interactive Flags | NEVER update git config, use `-i` interactive flags, force-push `main`/`master`, or skip hooks (`--no-verify`, `--no-gpg-sign`) unless explicitly requested. | Prevents destructive or hanging git operations. |
| Destructive & Remote Ops | NEVER run `push --force`, `reset --hard`, `checkout .`, `restore .`, `clean -f`, `branch -D`, or `git push` unless explicitly requested. | Scope is strictly local commit creation. |
| New Commit vs. Amend | Always create a NEW commit unless `amend` is explicitly requested; on pre-commit hook failure, fix, re-stage, and create a NEW commit (NEVER `--amend`). | Failed pre-commit hooks abort the commit, so `--amend` would overwrite the prior commit. |
| Selective Staging & Secrets | Stage specific file paths (avoid `git add -A` / `git add .`); NEVER commit secrets (`.env`, `credentials.json`, `.claude/settings.local.json`) or empty commits. | Prevents accidental secret leakage or binary bloat. |
</git_commit_safety_protocol>

<commit_execution_protocol>
Stage relevant files and create the commit in a **single turn** (using only git commands from the context above), then run `git status` to verify:

1. **Message**: Match repo commit style; state the 1–2 sentence "why" and accurate verb (`add` / `update` / `fix`).${COMMIT_WRITING_GUIDANCE_FN()}
2. **Inline Formatting**: Pass message inline via ${IS_BASH_ENV_FN()?"HEREDOC":"here-string"} (NEVER `-F`, `--file`, or `-t`):
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
</commit_execution_protocol>
