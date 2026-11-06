---
name: script-standards
description: Use when writing, editing, or reviewing automation, ops, or analysis scripts (bash, Node.js, Python), including agent-generated ones. Not for application code or library packages.
---

# Script Standards

Goal: single-purpose scripts that headless agents and CI can run, parse, and re-run safely.
Planes: dev plane = repo scripts in `scripts/`; runtime plane = scripts written or run by agents in `partners/<id>/workspace/`.

## 1. Size and complexity
Why: a script should be reviewable in one read. Agents cannot count lines, so enforce by lint or hook.

| Item | Rule |
|---|---|
| File length | <=500 normal; 500-800 needs a one-line justification in the header; >800 split into runner + modules (`scripts/<tool>/` or `./lib/`) |
| Function length | <=50 lines |
| Cyclomatic complexity | <=10 |
| Abstraction | Minimal. No class hierarchies, metaprogramming, or heavy frameworks |
| Legacy edits | Leave cleaner than found. No unsolicited rewrites |

Enforce with: shellcheck, eslint (`complexity`, `max-lines`), ruff `C901`.

## 2. Header
3-4 comment lines right after the shebang (or docstring start):
1. Purpose  2. Context (why it exists)  3. Usage with core flags  4. Prerequisites (env vars, binaries; omit if none)

```bash
#!/usr/bin/env bash
# Purpose: Sync runtime partner symlinks and scaffold workspace sandboxes.
# Context: Runs on predev or when packages/runtime-assets change.
# Usage: ./scripts/link-agents.sh [--dry-run]
# Requires: bash 4+, node 18+

set -euo pipefail
trap 'echo "[ERROR] failed at line $LINENO" >&2' ERR
```

## 3. Runtime discipline
- Bash: `set -euo pipefail` is the first statement after the header, plus an ERR trap.
- Node: ES modules, `node:*` built-ins, handle `unhandledRejection` explicitly.
- Python: 3.10+, stdlib first. Why: fewer install failures in sandboxes.

## 4. Interface contract
- Inputs only via flags, env vars, or stdin. No interactive prompts (`read -p`, `input()`, `readline()`). Why: they hang headless runs.
- stdout = results (offer `--json` for machine parsing). stderr = logs.
- Provide `--help`. Provide `--dry-run` for anything that mutates state.
- Re-run safe (idempotent). If not, say so in the header and guard with a lockfile.
- Long-running scripts set a timeout.

| Code | Meaning |
|---|---|
| 0 | OK (`TERM_OK`) |
| 1 | General error: unhandled exception, missing dependency |
| 2 | Input or guardrail violation (`TERM_BLOCK`); matches PreToolUse hook block |
| 124 | Timeout |

## 5. Safety
- Write boundaries: dev plane writes only `dist/`, `.cache/`, `tmp/`. Runtime plane writes only `./workspace/` or OS temp. Enforce via sandbox or permission config, not wording.
- Deletion: no bare recursive `rm -rf`. If `$SAFE_RM` is set, use it. Otherwise delete only validated paths: `"${TARGET:?}"`, non-empty, inside the allowed root.
- Secrets: never hardcode keys, tokens, passwords, or absolute home paths. Dev: `[ -f .env ] && source .env`. Runtime: inherit parent env or MCP auth.

## 6. Placement
| Kind | Location |
|---|---|
| General dev/ops tools | `scripts/` |
| Partner workspace scripts | `partners/<id>/workspace/` or `packages/<pkg>/scripts/` |
| Browser/profiling automation | `ego-script/` or a dedicated package |
| Ephemeral diagnostics | prefix `tmp_` or `scratch_`; delete or archive when resolved |
