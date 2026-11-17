<!--
name: "Skill: Update config settings file locations"
description: "Settings file scope locations and settings.json schema reference"
ccVersion: "2.1.318"
-->
## Settings File Locations

| File | Scope | Git | Use For |
|---|---|---|---|
| `~/.claude/settings.json` | Global | N/A | Personal preferences for all projects |
| `.claude/settings.json` | Project | Commit | Team-wide hooks, permissions, plugins |
| `.claude/settings.local.json` | Project | Gitignore | Personal overrides for this project |

Load order (later overrides earlier): user → project → local.

## Settings Schema Reference

### Permissions
```json
{
  "permissions": {
    "allow": ["Bash(npm *)", "Edit(.claude)", "Read"],
    "deny": ["Bash(rm -rf *)"],
    "ask": ["Edit(//etc/*)"],
    "defaultMode": "default" | "plan" | "acceptEdits" | "dontAsk",
    "additionalDirectories": ["/extra/dir"]
  }
}
```

**Rule syntax:**
- Exact match: `"Bash(npm run test)"`
- Prefix wildcard: `"Bash(git *)"` (matches `git`, `git status`, `git commit`, etc.)
- Tool only: `"Read"` (allows all `Read` operations)
- File paths: `"Edit(src/**)"` — path rules in `permissions` use `Edit(path)` for all file-writing tools (`Write`, `Edit`, `NotebookEdit`) and `Read(path)` for reads (`Write(path)`, `NotebookEdit(path)`, `Glob(path)` are not matched by file permission checks). Bare tool names (`"Write"`), deny/ask `Tool(param:value)` rules, and hook `if` conditions still use each tool's own name.

### Environment Variables
```json
{
  "env": {
    "DEBUG": "true",
    "MY_API_KEY": "value"
  }
}
```

### Model & Agent
```json
{
  "model": "sonnet",  // or "fable", "opus", "haiku", full model ID
  "agent": "agent-name",
  "alwaysThinkingEnabled": true
}
```

### Attribution (Commits & PRs)
```json
{
  "attribution": {
    "commit": "Custom commit trailer text",
    "pr": "Custom PR description text"
  }
}
```
Set `commit` or `pr` to `""` to hide that attribution. To hide all attribution, set both to `""` and `"sessionUrl": false`. Always use the object form, NOT `"attribution": false` (older CLI versions reject booleans here and skip the entire settings file).

### MCP Server Management
```json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["server1", "server2"],
  "disabledMcpjsonServers": ["blocked-server"]
}
```

### Plugins
```json
{
  "enabledPlugins": {
    "formatter@anthropic-tools": true
  }
}
```
Format: `plugin-name@source` (`claude-code-marketplace`, `claude-plugins-official`, or `builtin`).

### Other Settings

| Key | Purpose |
|---|---|
| `language` | Preferred response language (e.g., `"japanese"`) |
| `cleanupPeriodDays` | Days to retain transcripts locally before cleanup (default: `30`, min: `1`) |
| `respectGitignore` | Respect `.gitignore` (default: `true`) |
| `spinnerTipsEnabled` | Show tips in spinner |
| `timeFormat` | UI clock format: `"auto"` (default), `"12-hour"`, `"24-hour"`, `"24-hour-utc"`, or strftime (e.g., `"%H:%M"`) |
| `timeZone` | IANA time zone for UI times, e.g., `"UTC"` (default: system time zone) |
| `spinnerVerbs` | Customize spinner verbs (`{ "mode": "append" \| "replace", "verbs": [...] }`) |
| `spinnerTipsOverride` | Override spinner tips (`{ "excludeDefault": true, "tips": ["Custom tip"] }`) |
| `syntaxHighlightingDisabled` | Disable diff highlighting |