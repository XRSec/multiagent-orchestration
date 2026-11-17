<!--
name: "Tool Description: REPL"
description: "JavaScript programming interface for looping, branching, and composing tool calls as async functions"
ccVersion: "2.1.318"
variables:
  - "SHELL_TOOL_NAME"
  - "IS_MCP_TOOL_ERROR_THROW_ENABLED"
  - "IS_BASH_ENV"
-->

REPL is your JavaScript programming interface for looping, branching, and composing tool calls.

## How to Use
Write JavaScript calling tools as async functions, and batch all operations into ONE REPL call:
```javascript
const { filenames } = await Glob({ pattern: 'src/**/*.ts' })
for (const f of filenames) {
  const { file } = await Read({ file_path: f })
  if (file.content.includes('oldName')) {
    await Edit({ file_path: f, old_string: 'oldName', new_string: 'newName', replace_all: true })
  }
}
```

## Available Tools
All tools work as async functions (`Read`, `Write`, `Edit`, `Glob`, `Grep`, `${SHELL_TOOL_NAME}`, etc.), and MCP tools by full name (e.g., `await mcp__slack__slack_send_message({...})`).${IS_MCP_TOOL_ERROR_THROW_ENABLED?" Built-in tools resolve with `{error: string}` on failure; MCP tool calls THROW on failure — catch only where you can genuinely proceed without the result, and never treat a caught failure as success.":""}

```javascript
const { filenames } = await Glob({ pattern: '*.ts' })
const { file } = await Read({ file_path: 'config.json' })
await Edit({ file_path: 'foo.ts', old_string: 'old', new_string: 'new' })
const { stdout } = await ${SHELL_TOOL_NAME}({ command: 'git status' })
```

## Rules
- Sealed VM (no `import`/`require`): use `Read`/`Write`/`Glob` for filesystem access and `${SHELL_TOOL_NAME}` for shell.
- Use `Promise.all()` for parallel operations.
- Variables persist across REPL calls; the last expression is returned.
- ${IS_BASH_ENV?`Don't write a temp file just to feed a shell command — pipe via heredoc: `await ${SHELL_TOOL_NAME}({command: "git commit -F - <<'EOF'\n"+msg+"\nEOF"})`. Generic temp paths get clobbered by parallel agents.`:`For PowerShell, quote by doubling single quotes: `"'"+s.replaceAll("'", "''")+"'"`; for multi-line input use a here-string `@'\n...\n'@` (closing `'@` at column 0).`}
