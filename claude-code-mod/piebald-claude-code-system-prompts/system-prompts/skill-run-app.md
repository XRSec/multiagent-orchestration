<!--
name: "Skill: Run app"
description: "Launch and drive the project app through its real runtime surface using project run skills or fallback patterns"
ccVersion: "2.1.246"
-->
---
name: run
description: Launch and drive this project's app to see a change working. Use when asked to run, start, or screenshot the app, or to confirm a change works in the real app (not just tests). First looks for a project skill that already covers launching the app; otherwise falls back to built-in patterns per project type (CLI, server, TUI, Electron, browser-driven, library).
---

**Running means launching and interacting with the actual app** (CLI command, server socket, GUI window) — not running tests or importing internal functions.

## 1. Check for a project run skill

Repo run skills capture verified cold-start setup (`apt-get`, env vars, patches, driver). Discover them first:

```bash
d=$PWD; while :; do
  grep -Hm1 '^description:' "$d"/.claude/skills/*/SKILL.md 2>/dev/null
  [ -e "$d/.git" ] || [ "$d" = / ] && break
  d=$(dirname "$d")
done
```

- **Match found**: Read its `SKILL.md` and follow it verbatim (do not paraphrase or skip patches).
- **Multiple matches (mega-repo)**: Ask the user which unit to run.
- **Stale skill** (fails on setup unrelated to your change): Inform the user and offer to refresh it via `/run-skill-generator`.
- **No match**: Use the fallback patterns below.

## 2. Fallback patterns by project type

Follow the closest launch + first-interaction recipe; ignore any trailing "write the skill" section.

| Project type | Handle | Example |
|---|---|---|
| CLI tool | direct invocation, exit code, stdin/stdout | [examples/cli.md](examples/cli.md) |
| Web server / API | background launch + `curl` smoke | [examples/server.md](examples/server.md) |
| TUI / interactive terminal | tmux `send-keys` / `capture-pane` | [examples/tui.md](examples/tui.md) |
| Electron / desktop GUI | Playwright `_electron` REPL under xvfb | [examples/electron.md](examples/electron.md) |
| Browser-driven | dev server + `chromium-cli` script | [examples/playwright.md](examples/playwright.md) |
| Library / SDK | import-and-call smoke script at the package boundary | [examples/library.md](examples/library.md) |

Adapt the closest pattern if none fits exactly: use [examples/playwright.md](examples/playwright.md) (`chromium-cli`, no custom driver) for web apps and [examples/electron.md](examples/electron.md) (`_electron` REPL + tmux) for desktop apps.

## 3. Drive and verify

Do not stop at launching the entrypoint; verify user-visible behavior:

- **CLI**: Run a representative command; inspect exit code and output.
- **Server**: Request the affected route with `curl`; read the response body.
- **TUI**: Send navigation keys via `send-keys`; inspect `capture-pane`.
- **GUI**: Trigger an interaction and screenshot the window. Inspect the screenshot; a blank frame is a launch failure.

If fallback setup required installing packages, setting env vars, patching config, or writing a driver, recommend `/run-skill-generator` in your report so the setup is saved as a project skill; otherwise omit it.
