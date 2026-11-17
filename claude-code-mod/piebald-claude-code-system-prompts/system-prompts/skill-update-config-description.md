<!--
name: "Skill: Update config description"
description: "Update-config skill description (settings.json hooks, perms, env)"
ccVersion: "2.1.173"
-->
Configure the harness via `settings.json` / `settings.local.json`.
- **Use hooks** for event-driven automation ("from now on when X", "each time X", "whenever X", "before/after X"); the harness executes hooks (not the model), so memory/preferences cannot fulfill them.
- **Also use for:** permissions (`allow X`, `add permission`, `move permission to`), env vars (`set X=Y`), hook troubleshooting, or any `settings.json` / `settings.local.json` edits (e.g., `"allow npm commands"`, `"add bq permission to global settings"`, `"move permission to user settings"`, `"set DEBUG=true"`, `"when session stops show X"`).
- **Suggest `/config`** for simple settings (`theme`, `model`).