<!--
name: "Skill: /init CLAUDE.md and skill setup (new version)"
description: "Onboarding workflow to set up CLAUDE.md, skills, and hooks via codebase exploration, interviews, and proposal refinement"
ccVersion: "2.1.235"
variables:
  - "IS_IMPORT_ENABLED_FN"
  - "IMPORT_OFFER_NOTE"
-->
Set up a minimal `CLAUDE.md` (and optionally skills and hooks) for this repo. `CLAUDE.md` loads into every session, so include only what you would get wrong without it.

## Phase 0: Check for an existing CLAUDE.md

Run `cat ./CLAUDE.md` only (project-root file only; do not explore the tree yet). This branches Phase 1.

## Phase 1: Ask what to set up

Before the first `AskUserQuestion`, print this primer as normal assistant text:

> Quick context:
> - **CLAUDE.md** files give persistent instructions for a project, personal workflow, or organization, read at the start of every session.
> - **Skills** are packaged instructions invoked automatically on task match, or triggered with a slash command (e.g. `/frontend-design`, `/commit-push-pr`).
> - **Hooks** run shell commands automatically on lifecycle events (notify when blocked on input, auto-format after edits, enforce pre-commit checks) — deterministic and cannot be skipped.

Call `AskUserQuestion` with **only Q1** (do not include Q2 in the same call; `"Let the agent decide"` skips Q2).

- **If `CLAUDE.md` already exists**, ask: `"I found an existing CLAUDE.md. What would you like to do?"`
  - `"Review and improve it"` — Explore codebase changes and propose targeted edits. Routing: skip Q1/Q2 → Phase 2 → single Phase 3-lite question → Phase 4 diff-proposal → Phase 8.
  - `"Leave it, set up other things"` — Skip `CLAUDE.md`; go straight to skills and hooks. Routing: skip Q1, ask Q2 (rename 4th option to `"Neither — skip setup"`). If `"Neither — skip setup"` → Phase 8 (`"Nothing to set up — your CLAUDE.md is unchanged."`). Else: Phase 2 → Phase 3 proposal (no gap-fill interview) → Phases 6/7 per queue → Phase 8 (Phase 7 hook target default = `.claude/settings.json`).
  - `"Start fresh (replace it)"` — Discard it and write new file(s). Routing: continue to Q1 below.

- **If no `CLAUDE.md` exists** (or `"Start fresh"`):
  - **Q1:** `"Which CLAUDE.md files should /init set up?"`
    - `"Project CLAUDE.md"` — Team-shared instructions checked into source control (architecture, coding standards, workflows).
    - `"Personal CLAUDE.local.md"` — Private project preferences (gitignored: role, sandbox URLs, test data, workflow quirks).
    - `"Both project + personal"`
    - `"Let the agent decide"` — Fastest path: project `CLAUDE.md` plus fitting skills/hooks; no follow-on questions (approve before writing). Skips Q2; treat as project `CLAUDE.md` with no skills/hooks constraint.
  - **Q2:** `"Also set up skills and hooks?"`
    - `"Skills + hooks"` | `"Skills only"` | `"Hooks only"` | `"Neither, just CLAUDE.md"`
    - Q2 is a hint, not a filter — Phase 3 proposes what fits the codebase and notes any deviation.

## Phase 2: Explore the codebase

Launch a subagent to survey key files: manifests (`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pom.xml`, etc.), `README`, `Makefile`/build configs, CI config, existing `CLAUDE.md`, `.claude/rules/`, `AGENTS.md`, `.cursor/rules`, `.cursorrules`, `.github/copilot-instructions.md`, `.devin/rules/`, `.windsurf/rules/`, `.windsurfrules`, `.clinerules`, `.mcp.json`.
${IS_IMPORT_ENABLED_FN()?`
Also have the subagent do a cheap presence check (not a read — the contents are handled by the import adapters) for:
- OpenAI Codex config: ~/.codex/config.toml or ./.codex/
- Gemini CLI config: ~/.gemini/settings.json, ./.gemini/, or a GEMINI.md at project root

Record which of these exist — Phase 8 uses it.
`:""}
Detect:
- Non-standard build, test, and lint commands
- Languages, frameworks, and package manager
- Project structure (monorepo with workspaces, multi-module, or single project)
- Code style rules differing from language defaults
- Non-obvious gotchas, required env vars, or workflow quirks
- Existing `.claude/skills/` and `.claude/rules/` directories
- Formatter config (`prettier`, `biome`, `ruff`, `black`, `gofmt`, `rustfmt`, or unified script like `npm run format` / `make fmt`)
- Git worktree usage (`git worktree list`, relevant only if setting up `CLAUDE.local.md`)

Note what cannot be determined from code alone — these become interview questions.

## Phase 3: Fill in the gaps

Use `AskUserQuestion` only for what code cannot answer.

- **Project `CLAUDE.md`, both, or `"Let the agent decide"`:** Ask about codebase practices (non-obvious commands, gotchas, branch/PR conventions, required env setup, testing quirks). Skip items already in `README` or obvious from manifests. Do not mark any option `"recommended"`.
- **Personal `CLAUDE.local.md` or both:** Ask about the user, not the codebase (do not mark any option `"recommended"`):
  - Role on the team (e.g. `"backend engineer"`, `"data scientist"`, `"new hire onboarding"`)
  - Familiarity with codebase and languages/frameworks (to calibrate explanation depth)
  - Personal sandbox URLs, test accounts, API key paths, or local setup details
  - Only if Phase 2 found multiple git worktrees: ask whether worktrees are nested inside the main repo (e.g. `.claude/worktrees/<name>/` — upward walk finds main repo's `CLAUDE.local.md` automatically) or sibling/external (e.g. `../myrepo-feature/` — store personal content in `~/.claude/<project-name>-instructions.md` and put a 1-line `CLAUDE.local.md` stub `@~/.claude/<project-name>-instructions.md` per worktree; NEVER put this import in project `CLAUDE.md`).
  - Communication preferences (e.g. `"be terse"`, `"always explain tradeoffs"`, `"don't summarize at the end"`)
- **`"Review and improve"` path:** Ask one question: `"Has anything changed about how the team works since this CLAUDE.md was written (new conventions, commands, gotchas)?"` (`"No, nothing's changed"` | `"Yes — let me describe"` → free text if Yes), then skip to Phase 4.

**Synthesize proposal** from Phase 2 + gap-fill answers:
- **Hook:** deterministic, fast, per-edit shell command (formatting, linting a changed file).
- **Skill:** on-demand multi-step workflow (`/verify`, `/deploy-staging`, session reports).
- **CLAUDE.md note:** guidance shaping behavior without enforcement (conventions, communication style).

Include Q1 `CLAUDE.md` file(s) first with 1-line summaries, then skills/hooks/notes. On `"Leave it"`, omit `CLAUDE.md` bullets/notes. On `"Start fresh"` with Q1 = personal-only, note the existing project `CLAUDE.md` stays untouched. Note any Q2 deviation in one line at the top.

Print the proposal as normal text:
> Here's what I'd set up:
> • **[Artifact type: file/hook/skill/note]** — [one-line description]
> • …

Call `AskUserQuestion` (`"Does this look right?"`, e.g. `"Looks good — proceed"` | `"Drop the hook"` | `"Drop the skill"`; omit `preview` field).

**Build preference queue** from accepted proposal: `{type: hook|skill|note, description, target file, Phase-2-sourced details}`. Phases 6 and 7's hooks sub-bullet consume this queue; Phases 4/5 gate on approved file bullets; Phase 7's GitHub-CLI and linting checks always run.

## Phase 4: Write CLAUDE.md

Runs if approved or on `"Review and improve"`. Every line must pass: `"Would removing this cause mistakes?"` If no, cut it.

- **`"Review and improve"`:** Read existing file, compare against Phase 2 + Phase 3-lite, propose specific additions/removals as diffs with 1-line reasons. Confirm via `AskUserQuestion` (`"Apply these edits?"`: `"Apply all"` | `"Let me pick which"` | `"Skip — leave it as is"`) before writing.
- Consume `CLAUDE.md`-targeted `note` entries from the Phase 3 queue as concise lines in relevant sections (leave personal notes for Phase 5).

| Include | Exclude |
|---|---|
| Non-guessable build/test/lint commands (non-standard scripts, flags, sequences) | File-by-file structure or component lists |
| Code style rules differing from language defaults (e.g. `"prefer type over interface"`) | Standard language conventions |
| Testing instructions and quirks (e.g. `pytest -k 'test_name'`) | Generic advice (`"write clean code"`, `"handle errors"`) |
| Repo etiquette (branch naming, PR conventions, commit style) | Detailed API docs / long references (use `@path/to/import`) |
| Required env vars or setup steps | Frequently changing info (reference source with `@path/to/import`) |
| Non-obvious gotchas or architectural decisions | Long tutorials/walkthroughs (move to `@path/to/import` or skill) |
| Key parts from existing AI configs (`AGENTS.md`, `.cursor/rules`, `.cursorrules`, `.github/copilot-instructions.md`, `.devin/rules/`, `.windsurf/rules/`, `.windsurfrules`, `.clinerules`) | Commands obvious from manifests (`npm test`, `cargo test`, `pytest`) |

Be specific (`"Use 2-space indentation in TypeScript"`, not `"Format code properly"`). Do not repeat yourself or invent sections like `"Common Development Tasks"` or `"Tips for Development"` — include only facts from read files.

Prefix the file with:
```
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
```

For multi-concern projects, suggest `.claude/rules/` focused files (`code-style.md`, `testing.md`, `security.md`) optionally scoped with `paths` frontmatter. For monorepos/multi-module projects, mention subdirectory `CLAUDE.md` files (loaded when working in those directories) and offer to create them.

## Phase 5: Write CLAUDE.local.md

Runs if approved. Write a minimal `CLAUDE.local.md` at project root and add `CLAUDE.local.md` to `.gitignore`.
- Consume personal-targeted `note` entries from Phase 3 queue.
- Include: user's role and codebase familiarity, personal sandbox URLs/test accounts/local setup, personal workflow or communication preferences. Keep short.
- Sibling/external worktrees: write personal content to `~/.claude/<project-name>-instructions.md` and make `CLAUDE.local.md` a 1-line stub `@~/.claude/<project-name>-instructions.md` (user copies stub to each worktree; NEVER put in project `CLAUDE.md`). Nested worktrees (`.claude/worktrees/`) need no special handling.
- If `CLAUDE.local.md` exists: read it, propose additions, do NOT silently overwrite.

## Phase 6: Suggest and create skills

Runs if approved.
1. **Consume `skill` entries from Phase 3 queue:** Name from preference (`verify-deep`, `session-report`, `deploy-sandbox`), write body from interview + Phase 2 details. If mapping to an existing bundled skill (e.g. `/verify`), create an additive project skill with user constraints and note the bundled one remains. Ask a quick follow-up if underspecified.
2. **Suggest additional skills** for subsystem reference knowledge or repeatable workflows (provide name, 1-line purpose, repo fit).
3. Review existing `.claude/skills/` first; do not overwrite existing skills.
4. Create each at `.claude/skills/<skill-name>/SKILL.md`:
```yaml
---
name: <skill-name>
description: <what the skill does and when to use it>
---

<Instructions>
```
Both the user (`/<skill-name>`) and the agent can invoke skills by default. For side-effect workflows (`/deploy`, `/fix-issue 123`), add `disable-model-invocation: true` and use `$ARGUMENTS`.

## Phase 7: Suggest additional optimizations

Check environment and ask via `AskUserQuestion`, acting on each `"yes"` before moving on:
- **GitHub CLI:** Run `which gh` (or `where gh` on Windows). If missing AND `git remote -v` includes `github.com`, offer to install (enables direct commits, PRs, issues, code review).
- **Linting:** If Phase 2 found no lint config (`.eslintrc`, `ruff.toml`, `.golangci.yml`, etc.), offer to set up linting for fast feedback.
- **Proposal-sourced hooks:** Consume `hook` entries from Phase 3 queue (fallback: offer format-on-edit if Phase 2 found a formatter and no formatting hook is queued):
  1. **Target file:** project → `.claude/settings.json`; personal → `.claude/settings.local.json`. Ask once for all hooks only if `"both"` or ambiguous.
  2. **Event & matcher:**
     - `"after every edit"` → `PostToolUse`, matcher `Write|Edit`
     - `"when turn finishes"` / `"before I review"` → `Stop` (fires every turn, including read-only)
     - `"before running bash"` → `PreToolUse`, matcher `Bash`
     - `"before committing"` (literal git-commit gate) → not a `hooks.json` hook (matchers can't filter Bash command content); route to a git pre-commit hook (`.git/hooks/pre-commit`, husky, pre-commit framework). Probe if they meant `"before I review and commit output"` (`Stop`).
  3. **Load hook reference** (once per `/init` run, before first hook): invoke `Skill` tool with `skill: 'update-config'` and args `[hooks-only] <one-line summary>` (e.g. `[hooks-only] Constructing a PostToolUse/Write|Edit format hook for .claude/settings.json using ruff`).
  4. Follow **"Constructing a Hook"**: dedup check → construct for THIS project → pipe-test raw → wrap → write JSON → `jq -e` validate → live-proof (for `Pre|PostToolUse` on triggerable matchers) → cleanup → handoff.

## Phase 8: Summary and next steps

Recap written files and key points; remind the user to review/tweak and that `/init` can be re-run anytime. Then present a single prioritized to-do list of applicable optimizations:${IS_IMPORT_ENABLED_FN()?`
- If Phase 2 found Codex or Gemini CLI config: ${IMPORT_OFFER_NOTE} Put this first — it saves re-entering config they already have.`:""}
- Frontend detected (React, Vue, Svelte, etc.): `/plugin install frontend-design@claude-plugins-official` (design principles/component patterns); `/plugin install playwright@claude-plugins-official` (browser screenshot & visual bug fixing).
- Declined Phase 7 gaps (GitHub CLI, linting): list with 1-line benefit each.
- Missing/sparse tests: suggest setting up a test framework for self-verification.
- Always include: `/plugin install skill-creator@claude-plugins-official`, then `/skill-creator <skill-name>` to create or refine skills with evals.
- Always include: `/plugin` to browse official plugins or create custom ones.
