<!--
name: "Skill: Update Claude Code Config"
description: "Modifies configuration via settings.json files (hooks, permissions, env, MCP, plugins)"
ccVersion: "2.1.282"
variables:
  - "SETTINGS_FILE_LOCATION_PROMPT"
  - "HOOKS_CONFIGURATION_PROMPT"
  - "CONSTRUCTING_HOOK_PROMPT_FN"
-->
# Update Config Skill

Modify configuration by updating `settings.json` files.

## Hooks vs. Memory

Event-driven automation requires a **hook** in `settings.json`; memory/preferences cannot trigger automated actions.

| User Intent | Required Hook |
|---|---|
| "Before compacting, ask me what to preserve" | `PreCompact` |
| "After writing files, run prettier" | `PostToolUse` (`Write\|Edit` matcher) |
| "When I run bash commands, log them" | `PreToolUse` (`Bash` matcher) |
| "Always run tests after code changes" | `PostToolUse` |

Supported hook events: `PreToolUse`, `PostToolUse`, `PreCompact`, `PostCompact`, `Stop`, `Notification`, `SessionStart`.

## Core Rules

- **Read before write (CRITICAL):** ALWAYS read the target settings file first and merge changes; NEVER replace the entire file.
- **Clarify ambiguity:** Use `AskUserQuestion` when scope (`user`/`project`/`local`), array behavior (append vs. replace), or specific option values are unclear.

## `/config` Command vs. Direct Edit

| Method | Use For |
|---|---|
| Suggest `/config` | Simple settings: `theme`, `editorMode`, `verbose`, `model`, `language`, `alwaysThinkingEnabled`, `permissions.defaultMode` |
| Edit `settings.json` directly | Hooks, complex permission rules (`allow`/`deny`), `env` variables, MCP server config, plugin config |

## Workflow

1. Clarify ambiguous intent.
2. Read the target settings file with `Read`.
3. Merge new settings with existing entries (preserve existing arrays).
4. Apply changes with `Edit` (if the file does not exist, ask the user before creating it).
5. Confirm what changed.

## Merging Arrays

Append to `permissions` or `hooks` arrays rather than overwriting them:

```json
// WRONG (overwrites existing)
{ "permissions": { "allow": ["Bash(npm *)"] } }

// RIGHT (preserves existing + adds new)
{
  "permissions": {
    "allow": [
      "Bash(git *)",      // existing
      "Edit(.claude)",    // existing
      "Bash(npm *)"       // new
    ]
  }
}
```

${SETTINGS_FILE_LOCATION_PROMPT}

${HOOKS_CONFIGURATION_PROMPT}

${CONSTRUCTING_HOOK_PROMPT_FN()}

## Examples

### Adding a Hook
User: `"Format my code after you write it"`
1. Clarify formatter (`prettier`, `gofmt`, etc.).
2. Read `.claude/settings.json` (or create if missing).
3. Merge into existing hooks:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_response.filePath // .tool_input.file_path' | { read -r f; prettier --write \"$f\"; } 2>/dev/null || true"
      }]
    }]
  }
}
```

### Adding Permissions
User: `"Allow npm commands without prompting"`
1. Read existing permissions.
2. Merge `Bash(npm *)` into `permissions.allow`.

### Environment Variables
User: `"Set DEBUG=true"`
1. Confirm scope (global user vs. project).
2. Read target file and merge `{ "env": { "DEBUG": "true" } }`.

## Common Mistakes & Hook Troubleshooting

- **Avoid:** replacing instead of merging, editing the wrong scope file, leaving invalid JSON (silently disables settings), skipping `Read` before write.
- **If a hook does not run:**
  1. Read `~/.claude/settings.json` or `.claude/settings.json`.
  2. Validate JSON syntax.
  3. Verify `matcher` matches the tool name (`Bash`, `Write`, `Edit`, etc.).
  4. Verify hook `type` (`command`, `prompt`, or `agent`).
  5. Test the hook command manually.
  6. Run `claude --debug` to inspect hook execution logs.