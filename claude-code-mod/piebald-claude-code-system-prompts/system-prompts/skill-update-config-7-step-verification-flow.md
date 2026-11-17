<!--
name: "Skill: update-config (7-step verification flow)"
description: "Guides hook construction and verification in 7 steps for the user's project environment"
ccVersion: "2.1.282"
variables:
  - "HOOKS_SETTINGS_MENU_COMMAND"
-->
## Constructing a Hook (with verification)

Given an event, matcher, target file, and desired behavior, execute all 7 steps to prevent silent hook failures:

1. **Dedup check:** Read the target file. If a hook already exists on the same event + matcher, display it and ask whether to keep, replace, or add alongside.
2. **Construct project-specific command:**
   - Extract stdin JSON payload safely via `jq -r` into a quoted variable or `{ read -r f; ... "$f"; }` — NEVER unquoted `| xargs` (splits on spaces).
   - Invoke the tool as this project runs it (`npx`/`bunx`/`yarn`/`pnpm`, Makefile target, or global binary).
   - Skip unsupported inputs (`--ignore-unknown` or extension guard).
   - Keep the command RAW (no `|| true`, no stderr suppression) until the pipe-test passes.
3. **Pipe-test the raw command:**
   - `Pre|PostToolUse` on `Write|Edit`: `echo '{"tool_name":"Edit","tool_input":{"file_path":"<a real file from this repo>"}}' | <cmd>`
   - `Pre|PostToolUse` on `Bash`: `echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | <cmd>`
   - `Stop`/`UserPromptSubmit`/`SessionStart`: `echo '{}' | <cmd>`
   Verify both exit code AND side effect. Fix failures and retest; once passing, wrap with `2>/dev/null || true` (unless the user wants a blocking check).
4. **Write JSON:** Merge into the target file per the Hook Structure schema. If creating `.claude/settings.local.json` for the first time, add it to `.gitignore` (`Write` does not auto-gitignore it).
5. **Validate syntax + schema:**
   `jq -e '.hooks.<event>[] | select(.matcher == "<matcher>") | .hooks[] | select(.type == "command") | .command' <target-file>`
   - Exit `0` + prints command = valid.
   - Exit `4` = matcher mismatch.
   - Exit `5` = malformed JSON or wrong nesting (broken `settings.json` silently disables ALL settings in that file; fix any pre-existing malformation too).
6. **Prove the hook fires** (for `Pre|PostToolUse` triggerable in-turn via `Edit` or `Bash`; skip to step 7 for `Stop`/`UserPromptSubmit`/`SessionStart`):
   - **Formatter on `PostToolUse`/`Write|Edit`:** Introduce a detectable violation via `Edit` (e.g., two blank lines, bad indentation, missing semicolon — NOT trailing whitespace, which `Edit` strips), re-read, and confirm the hook fixed it.
   - **Other hooks:** Temporarily prefix the command in `settings.json` with `echo "$(date) hook fired" >> /tmp/claude-hook-check.txt; `, trigger the matching tool (`Edit` or harmless `true` via `Bash`), and read the sentinel file.
   - **Cleanup:** ALWAYS revert the test violation and remove the sentinel prefix afterward, pass or fail.
   - **Watcher caveat:** If proof fails despite passing pipe-test and `jq -e`, the settings watcher is not watching `.claude/` (it only watches directories that had a settings file at session start). The hook is valid. ${HOOKS_SETTINGS_MENU_COMMAND?`Tell the user to open `${HOOKS_SETTINGS_MENU_COMMAND}` once (reloads config) or restart — you can't do this yourself; `${HOOKS_SETTINGS_MENU_COMMAND}` is a user UI menu and opening it ends this turn.`:"Tell the user to start a new session so the new settings load. You can't do this yourself."}
7. **Handoff:** ${HOOKS_SETTINGS_MENU_COMMAND?`Tell the user the hook is live (or needs `${HOOKS_SETTINGS_MENU_COMMAND}`/restart per the watcher caveat). Point them at `${HOOKS_SETTINGS_MENU_COMMAND}` to review, edit, or disable it later.`:"Tell the user the hook is live (or needs a new session per the watcher caveat), and that they can review, edit, or disable it later in the settings file you wrote."} Silent hook success is invisible in the UI by design ("Ran N hooks" only appears on error or slow execution).