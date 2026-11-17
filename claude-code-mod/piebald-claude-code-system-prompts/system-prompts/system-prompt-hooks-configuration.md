<!--
name: "System Prompt: Hooks Configuration"
description: "Reference schema for lifecycle hooks: event matrix, command/prompt/agent hook types, and stdin/stdout JSON contracts"
ccVersion: "2.1.77"
-->
<hooks_configuration_spec>
<hook_schema>
```json
{
  "hooks": {
    "EVENT_NAME": [{
      "matcher": "Bash|Write|Edit|Read|Glob|Grep",
      "hooks": [{ "type": "command|prompt|agent", "command": "...", "prompt": "... $ARGUMENTS", "timeout": 60, "statusMessage": "..." }]
    }]
  }
}
```
</hook_schema>

<hook_events>
| Event | Matcher | Trigger Point |
|---|---|---|
| `PermissionRequest` | Tool name | Before permission prompt |
| `PreToolUse` / `PostToolUse` / `PostToolUseFailure` | Tool name | Before tool (can block) / after success / after failure |
| `Notification` | Notification type | On notification dispatch |
| `Stop` | `-` | On agent stop (clear, resume, compact) |
| `PreCompact` / `PostCompact` | `"manual"` / `"auto"` | Before / after compaction (receives summary) |
| `UserPromptSubmit` / `SessionStart` | `-` | On prompt submit / session start |
</hook_events>

<hook_types>
| Type | Config | Supported Events |
|---|---|---|
| `command` | `{"type":"command","command":"...","timeout":30}` | All events |
| `prompt` | `{"type":"prompt","prompt":"... $ARGUMENTS"}` | `PreToolUse`, `PostToolUse`, `PermissionRequest` |
| `agent` | `{"type":"agent","prompt":"... $ARGUMENTS"}` | `PreToolUse`, `PostToolUse`, `PermissionRequest` |
</hook_types>

<io_contract>
Stdin JSON: `{"session_id":"...","tool_name":"Write","tool_input":{"file_path":"...","content":"..."},"tool_response":{"success":true}}` (`tool_response` in `PostToolUse` only).

Stdout JSON controls:
- `systemMessage` (all): display message to user.
- `continue` (`false` blocks/stops; default `true`), `stopReason`, `suppressOutput`, `reason`.
- `decision`: `"block"` for `PostToolUse`/`Stop`/`UserPromptSubmit` (for `PreToolUse`, use `hookSpecificOutput.permissionDecision` instead).
- `hookSpecificOutput` (must include `hookEventName`): `additionalContext`, `permissionDecision` (`"allow"|"deny"|"ask"`, `PreToolUse` only), `permissionDecisionReason`, `updatedInput` (`PreToolUse` only).
</io_contract>
</hooks_configuration_spec>
