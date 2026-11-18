---
doc_id: PROJ-SCRIPT-GIT-STANDARDS
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Script Engineering, Safe Deletion & Git Hygiene Standards

Mandatory quantitative budgets, headless execution contracts, filesystem safety redlines, and SCM workflows governing `scripts/`, `.githooks/`, `tools/`, `paseo-bots/`, and `paseo-agy-acp/`. Parent router: [../INDEX.md](../INDEX.md).

## 1. Quantitative Line & Complexity Budgets

Bound script and module sizes strictly so subagents can read, reason over, and patch files within single-turn call budgets (`AGENTS.md` §1.2, §2.2):

| Metric | Quantitative Ceiling | Enforcement Action |
| :--- | :--- | :--- |
| Standard script / module length | `<= 500` lines | Default ceiling for all repository scripts and runtime modules |
| Extended justification band | `500–800` lines | Permitted only when line 2–4 of the file header states a concise 1-line architectural justification |
| Hard refactor ceiling | `> 800` lines | Split immediately into a thin CLI runner plus cohesive submodules under `./lib/` or `scripts/<tool-name>/` |
| Single function length | `<= 50` lines | Decompose long routines into pure, single-responsibility helper functions |
| Cyclomatic complexity | `<= 10` per function | Flatten nested branches via guard clauses, lookup maps, or discriminated unions |

---

## 2. Universal 3–4 Line Header & Headless Execution Contract

### 2.1 Mandatory 3–4 Line Header Schema
Begin every script created or touched in `<projectRoot>` (`scripts/*.mjs`, `scripts/*.sh`, `.githooks/*`, `tools/**`) with a 3–4 line header comment immediately below the shebang, matching `scripts/check-paseo-bots-link.mjs`:

```text
#!/usr/bin/env <node|bash|python3>
# Purpose: <1-line summary of capability and verification goal>
# Context: <invoking workflow, git hook, CI stage, or operator trigger>
# Usage: <exact non-interactive CLI syntax and flags>
# Prerequisites: <runtime version, required binaries, env vars; no interactive TTY required>
```

### 2.2 Zero-TTY Blocking & Runtime Discipline
- **No Interactive Prompts**: Supply all inputs via CLI flags, environment variables, or piped `stdin`. Interactive prompts (`read -p`, `readline` prompt loops, Python `input()`) are forbidden because headless subagents and CI workers hang until watchdog timeout on blocked `stdin`.
- **Batch Over Ping-Pong**: When diagnosing daemons, SQLite state, or remote SSH targets, bundle inspection steps into a single one-shot probe returning structured JSON/table summaries (`AGENTS.md` §1.1) rather than running repetitive shell loops.
- **Credential Hygiene**: NEVER hardcode secrets, tokens, or private endpoints in scripts; source `<projectRoot>/.env` (`[ -f .env ] && source .env`) before invoking authenticated gateways.
- **Language-Specific Rules**:
  - **Node.js (`.mjs`, `.ts`)**: Use native ES Modules (`node:fs`, `node:path`, `node:url`), export pure core functions for unit testing (`checkPaseoBotsLinks`), and guard CLI execution behind an `isCliEntry()` realpath check setting `process.exitCode`.
  - **Bash (`.sh`, `.githooks/*`)**: Declare `set -euo pipefail` immediately below the header comment, trap unexpected failures where state cleanup is needed, and double-quote all variable expansions (`"$REPO_ROOT"`).
  - **Python (`.py`)**: Target Python `3.10+` standard library first; restrict Python utilities to offline analysis workspaces (`tools/`, `claude-code-mod/`).

---

## 3. Deterministic Exit Code Contract

Return standardized exit codes across all scripts, linters, and hooks so `bot-moci` and `paseo-bots/server/workflow-runner.ts` classify outcomes without regex-guessing prose:

| Exit Code | Symbolic State | Semantics & Automated Orchestrator Action |
| :--- | :--- | :--- |
| `0` | `TERM_OK` | Command and all assertions succeeded; stage may advance |
| `1` | `GENERAL_ERROR` | Test failure, runtime exception, or `--strict` drift mismatch; eligible for bounded `<repair_brief>` |
| `2` | `TERM_BLOCK` | Guardrail violation, unauthorized path, or missing required input (aligned with PreToolUse block); halt blind retries |
| `124` | `TIMEOUT` | Process exceeded deadline (`timeout(1)` or dual-clock watchdog); inspect blocking I/O or deadlocks |

---

## 4. Safe Delete Redline Invariant

Enforce non-destructive file removal across every shell command, hook, and TypeScript module (`AGENTS.md` §1.7):

| Execution Context | Forbidden Primitive | Mandatory Sanctioned Replacement |
| :--- | :--- | :--- |
| Interactive / Subagent Shell | `rm`, `rm -f`, `rm -rf`, `unlink` | Universal safe delete binary via `"${SAFE_DELETE_BIN}" <target>` (or `/opt/xrsec/.env/rmfile <target>` where installed) |
| Node.js / TypeScript Server | Unchecked `fs.rmSync(arbitraryPath, { recursive: true })` | Validate target first via `assertInsideManagedDataDir` (`paseo-bots/server/claude-agents.ts`) or bounded artifact root (`removeSessionArtifacts` in `paseo-agy-acp/server/preflight.ts`), then invoke `fs.rmSync` / `fs.promises.rm` |
| Temporary Bot Scratchpad | Deleting outside Managed Seat | Confine scratch outputs to bot `./workspace/` or session board directory (`teamSessionBoardPath`) |

- **Hard Redline**: Agents MUST NEVER invoke `rm` or `rm -rf` under any flag combination or shell wrapper.

---

## 5. Git Hygiene, Squash-Before-Push & Symlink Guardian Hooks

1. **Git Squash Before Push**:
   - Squash local WIP, fixup, and review-iteration commits into a single atomic commit before pushing (`AGENTS.md` §1.8).
   - Pair every code/config change with its corresponding `docs/` shard update in the same atomic commit (`05-agent-first-docs-standard.md` §5).
2. **Branch & History Safety**:
   - Restrict non-TTY commit squashing (`git reset --soft <base> && git commit -m "..."`) strictly to unpushed local commits; NEVER force-push shared remote branches without explicit human authorization.
   - Leave touched scripts cleaner than found (Boy Scout rule) while avoiding unrequested cross-module rewrites that pollute review diffs.
3. **`.githooks/` Symlink Guardians**:
   - Configure `git config core.hooksPath .githooks` in local clones.
   - `.githooks/post-merge` and `.githooks/post-rewrite` automatically invoke `node "$REPO_ROOT/scripts/check-paseo-bots-link.mjs"` after every pull, merge, or rebase to verify the three `$PASEO_HOME` links (`plugin-settings`, `plugin-data/library`, `plugin-data/shared`).
   - Use `PASEO_SKIP_LINK_CHECK=1` strictly inside stateless CI containers without `~/.paseo`; run `node scripts/check-paseo-bots-link.mjs --strict` on workstations to fail with exit code `1` if any link is missing or misdirected.

---

## 6. Read-Only Script & SCM Verification Commands

Execute from `<projectRoot>` before squashing and pushing script or hook modifications:

```bash
# Verify line budgets across scripts/ and .githooks/ (flag > 500 extended and > 800 hard-split files)
wc -l scripts/* .githooks/* 2>/dev/null | awk '$2 != "total" && $1 > 500 { print ($1 > 800 ? "SPLIT_REQUIRED" : "JUSTIFY_HEADER"), $1, $2 }'

# Detect forbidden bare rm / rm -rf invocations in scripts and git hooks
grep -rnE '(^|[;&|[:space:]])rm([[:space:]]+-[a-zA-Z]+)*[[:space:]]+' scripts .githooks 2>/dev/null

# Detect forbidden interactive TTY prompts in scripts
grep -rnE 'read[[:space:]]+-p|input\(' scripts .githooks 2>/dev/null

# Verify $PASEO_HOME three-way symlink health (use --strict on workstations with ~/.paseo)
node scripts/check-paseo-bots-link.mjs
```
