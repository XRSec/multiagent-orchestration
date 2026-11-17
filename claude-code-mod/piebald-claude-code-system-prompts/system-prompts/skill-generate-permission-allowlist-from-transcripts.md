<!--
name: "Skill: Generate permission allowlist from transcripts"
description: "Extracts frequent read-only tool-call patterns from session transcripts and merges them into project .claude/settings.json permissions.allow"
ccVersion: "2.1.326"
-->
# Fewer Permission Prompts

Analyze recent session transcripts for frequent read-only Bash and MCP tool calls, present a prioritized allowlist, and merge approved patterns into the project's `.claude/settings.json` under `permissions.allow`.

Pattern syntax: `Bash(foo *)`, `Bash(foo)`, `Bash(foo bar *)`, `mcp__slack__slack_read_thread`.

## Workflow

1. **Locate transcripts**
   - Path: `~/.claude/projects/<sanitized-cwd>/*.jsonl`.
   - Structure: JSON lines; inspect `assistant` messages with `message.content[]` items of `type: "tool_use"` (`name` = tool name; for `"Bash"`, `input.command` = shell string).
   - Scope: scan across all user project dirs (not only the current project), capped at the ~50 most-recently-modified `.jsonl` files.

2. **Extract tool-call frequencies**
   - `Bash`: parse `input.command`, strip wrappers (`sudo`, `timeout`, pipes, `&&`, env-var prefixes), and extract the leading command + first subcommand pair (e.g., `git status`, `gh pr view`, `ls`, `cat`).
   - MCP: record the full tool name verbatim (e.g., `mcp__slack__slack_read_thread`).
   - Count occurrences across all scanned transcripts.

3. **Filter to read-only (hard safety gates)**
   - Keep only non-mutating commands: `ls`, `cat`, `pwd`, `git status`, `git log`, `git diff`, `git show`, `git branch`, `rg`, `grep`, `find`, `head`, `tail`, `wc`, `file`, `which`, `echo`, `date`, `gh pr view`, `gh pr list`, `gh pr diff`, `gh issue view`, `gh issue list`, `gh run list`, `gh run view`, `gh api` (GET), `bun run typecheck`, `bun run lint`, `bun run test` (non-mutating), `docker ps`, `docker logs`, `kubectl get`, `kubectl describe`, `ps`, `top`, `df`, `du`, `env`, `printenv`, and MCP tools containing `read`/`get`/`list`/`search`/`view`.
   - Drop anything that writes, deletes, renames, pushes, merges, installs, or runs side-effecting builds/tests. When in doubt, omit.
   - **NEVER allowlist arbitrary code execution** (e.g., `Bash(python3:*)`), including anything in these categories:
     - Interpreters: `python`/`python3`, `node`, `bun`, `deno`, `ruby`, `perl`, `php`, `lua`, etc.
     - Shells: `bash`, `sh`, `zsh`, `fish`, `eval`, `exec`, `ssh`, etc.
     - Package runners: `npx`, `bunx`, `uvx`, `uv run`, etc.
     - Task-runner wildcards: `npm run *`, `yarn run *`, `pnpm run *`, `bun run *`, `make *`, `just *`, `cargo run *`, `go run *`, etc. (exact `Bash(bun run typecheck)` is allowed; `Bash(bun run *)` is NOT).
     - Directory-scoped interpreter starters: `pyright` in any form (invokes `python3` importing from cwd), and similar tools.
     - Privileged/exec tools: `gh api *`, `docker run`/`exec`, `kubectl exec`, `sudo`, and similar.

4. **Drop already auto-allowed commands** (omit from suggestions and config):
   - **Always auto-allowed (any args)**: `cal`, `uptime`, `cat`, `head`, `tail`, `wc`, `stat`, `strings`, `hexdump`, `od`, `nl`, `id`, `uname`, `free`, `df`, `du`, `locale`, `groups`, `nproc`, `basename`, `dirname`, `realpath`, `cut`, `paste`, `tr`, `column`, `tac`, `rev`, `fold`, `expand`, `unexpand`, `fmt`, `comm`, `cmp`, `numfmt`, `readlink`, `diff`, `true`, `false`, `sleep`, `type`, `expr`, `seq`, `tsort`, `pr`, `echo`, `ls`, `cd`.
   - **Zero args only**: `pwd`, `whoami`, `alias`.
   - **Exact forms**: `claude -h`, `claude --help`, `node -v`, `node --version`, `python --version`, `python3 --version`, `ip addr`.
   - **Safe flags only (validated)**: `xargs`, `file`, `sed` (read-only expressions), `sort`, `man`, `help`, `netstat`, `ps`, `base64`, `grep`, `egrep`, `fgrep`, `sha256sum`, `sha1sum`, `md5sum`, `tree`, `date`, `hostname`, `which`, `lsof`, `pgrep`, `tput`, `ss`, `fd`, `fdfind`, `aki`, `rg`, `jq`, `uniq`, `history`, `arch`, `ifconfig`, `find` (blocks `-delete`/`-exec`/`-execdir`/`-ok`/`-okdir`/`-fprint*`/`-fls`/`-files0-from`), `printf` (blocks any `-flag`), `test` (blocks `-v`/`-R`/`-a`/`-o`).
   - **All git read-only subcommands** (still prompt in untrusted repos; adding rules would trust them globally across repos, so add none): `git status`, `git log`, `git diff`, `git show`, `git blame`, `git branch`, `git tag`, `git remote`, `git ls-files`, `git ls-remote`, `git config --get`, `git rev-parse`, `git describe`, `git stash list`, `git reflog`, `git shortlog`, `git cat-file`, `git for-each-ref`, `git worktree list`, etc.
   - **All gh read-only subcommands**: `gh pr view`, `gh pr list`, `gh pr diff`, `gh pr checks`, `gh pr status`, `gh issue view`, `gh issue list`, `gh issue status`, `gh run view`, `gh run list`, `gh workflow list`, `gh workflow view`, `gh repo view`, `gh release view`, `gh release list`, `gh api` (GET), `gh auth status`, etc.
   - **Docker read-only subcommands**: `docker ps`, `docker images`, `docker logs`, `docker inspect`.
   - **Source of truth**: `src/tools/BashTool/readOnlyValidation.ts` (`READONLY_COMMANDS`, `READONLY_NOARGS`, `READONLY_EXACT`, `COMMAND_ALLOWLIST`) and `src/utils/shell/readOnlyCommandValidation.ts` (`GIT_READ_ONLY_COMMANDS`, `GH_READ_ONLY_COMMANDS`, `DOCKER_READ_ONLY_COMMANDS`, `RIPGREP_READ_ONLY_COMMANDS`). Grep these files if working in this repo and unsure.

5. **Select narrowest pattern form**
   - Multi-variant command (`brew list`, `brew list --versions`): `Bash(brew list *)` (space before `*` required for prefix matching).
   - Single exact invocation: `Bash(foo)` (no wildcard).
   - MCP: full tool name verbatim (no wildcard).
   - NEVER widen a pattern past the read-only or arbitrary-execution rules above.

6. **Prioritize**: sort by count descending, drop items with `< ~3` occurrences, and cap at the top ~20.

7. **Present table**: output a markdown table with columns `#`, `Pattern`, `Count`, `Notes`:

   | # | Pattern | Count | Notes |
   |---|---------|-------|-------|
   | 1 | `Bash(brew list *)` | 142 | installed packages |
   | 2 | `Bash(gh pr list)` | 87 | open PRs |
   | 3 | `mcp__slack__slack_read_thread` | 54 | Slack thread reads |

8. **Merge into `.claude/settings.json`**
   - Target ONLY current project `.claude/settings.json` (NEVER `~/.claude/settings.json` or `.claude/settings.local.json`); create if absent.
   - Preserve existing keys and `permissions.allow` entries; deduplicate without removing entries or reordering unrelated fields.
   - NEVER add to `permissions.deny` or `permissions.ask`, and NEVER modify any other settings field.

9. **Report**: summarize added rules (count + examples), pre-existing rules, and skipped patterns with reasons (e.g., dropped `rm`/`git push` as non-read-only; dropped `cat`/`ls` as already auto-allowed).