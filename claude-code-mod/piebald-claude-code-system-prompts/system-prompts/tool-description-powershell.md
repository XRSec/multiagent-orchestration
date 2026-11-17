<!--
name: "Tool Description: PowerShell"
description: "Executes PowerShell commands with edition-specific syntax, timeout, and tool-routing rules"
ccVersion: "2.1.326"
variables:
  - "RENDER_POWERSHELL_EDITION_GUIDANCE_FN"
  - "POWERSHELL_EDITION"
  - "DETECTED_DEVELOPER_TOOLS_NOTE"
  - "MAX_TIMEOUT_MS_FN"
  - "DEFAULT_TIMEOUT_MS_FN"
  - "MAX_OUTPUT_CHARS_FN"
  - "BACKGROUND_EXECUTION_NOTE"
  - "GLOB_TOOL_NAME"
  - "GREP_TOOL_NAME"
  - "READ_TOOL_NAME"
  - "EDIT_TOOL_NAME"
  - "WRITE_TOOL_NAME"
  - "POWERSHELL_TOOL_NAME"
  - "SLEEP_AVOIDANCE_NOTE"
-->
Executes a PowerShell command with optional timeout. Working directory persists between commands; shell state (variables, functions) does not.

Scope: Terminal operations only (git, npm, docker, PS cmdlets). Never use for file operations (reading, writing, editing, searching, finding)—use dedicated tools instead.

${RENDER_POWERSHELL_EDITION_GUIDANCE_FN(POWERSHELL_EDITION)}
${DETECTED_DEVELOPER_TOOLS_NOTE}
Pre-execution rules:
1. Directory verification: Before creating directories or files, run `Get-ChildItem` (or `ls`) to verify the parent directory.
2. Command execution: Double-quote file paths containing spaces; capture command output.

PowerShell syntax rules:
- Variables use `$` prefix (`$myVar = "value"`); escape character is backtick (`` ` ``), not backslash.
- Use Verb-Noun cmdlets (`Get-ChildItem`, `Set-Location`, `New-Item`, `Remove-Item`); common aliases: `ls`, `cd`, `cat`, `rm`.
- Give helper functions a unique Verb-Noun name (e.g. `Read-Doc`), including in script files; built-in aliases (`rd`, `rm`, `del`, `ri`, `sc`, `mv`, etc.) shadow functions with the same name silently.
- Pipe `|` passes objects, not text; filter/transform with `Select-Object`, `Where-Object`, `ForEach-Object`.
- String interpolation: `"Hello $name"` or `"Hello $($obj.Property)"`.
- Registry paths use PSDrive prefixes (`HKLM:\SOFTWARE\...`, `HKCU:\...`), not raw `HKEY_LOCAL_MACHINE\...`.
- Env vars: read `$env:NAME`, set `$env:NAME = "value"` (not `Set-Variable` or `export`).
- Invoke native executables with spaces via call operator: `& "C:\Program Files\App\app.exe" arg1 arg2`.

Unix-to-PowerShell equivalents (Unix forms fail):
| Unix | PowerShell Equivalent | Notes |
|---|---|---|
| `head` / `tail` | `Get-Content file -TotalCount N` / `-Tail N` | Piped: `\| Select-Object -First N` / `-Last N` |
| `which` | `(Get-Command name).Source` | — |
| `touch` | `if (-not (Test-Path path)) { New-Item -ItemType File path }` | Never use `New-Item -Force` on existing files (truncates content). |
| `wc -l` | `(Get-Content file \| Measure-Object -Line).Lines` | — |
| `mkdir -p` | `New-Item -ItemType Directory -Force path` | `-p` is invalid in PowerShell. |
| `rm -rf` | `Remove-Item -Recurse -Force path` | — |
| `ln -s` | `New-Item -ItemType SymbolicLink -Path link -Target target` | — |
| `chmod` / `chown` | `icacls` (only if ACL changes are required) | Not applicable on Windows. |
| `2>/dev/null` | `2>$null` | Stderr is already captured; usually unnecessary. |
| `VAR=x cmd` | `$env:VAR = 'x'; cmd` | No inline env-var prefix. |
| `if [ -f x ]`, `for x in *`, `` `cmd` `` | `if (Test-Path x)`, `foreach ($x in ...)`, `$(cmd)` | Bash control flow is a parser error. |

Exit-code note: `-ErrorAction SilentlyContinue` suppresses error output, but the cmdlet failure still exits 1. To make a cmdlet failure non-fatal, promote and catch it: `try { Cmdlet ... -ErrorAction Stop } catch {}` (without `-ErrorAction Stop`, non-terminating errors skip `catch` and exit 1).

Interactive/blocking commands (runs with `-NonInteractive`, stdin attached to null; console prompts read EOF/error, GUI prompts block until timeout):
- Never use `Read-Host`, `Get-Credential`, `Out-GridView`, `$Host.UI.PromptForChoice`, or `pause`.
- Pass `-Confirm:$false` to destructive cmdlets (`Remove-Item`, `Stop-Process`, `Clear-Content`) when proceeding; add `-Force` for read-only/hidden items.
- Never run `git rebase -i`, `git add -i`, or commands opening an interactive editor.

Multiline strings (commit messages, file content) for native executables:
- Use a single-quoted here-string (`@'...'@`) so `$` and backticks are literal. Closing `'@` must sit at column 0 (no leading whitespace):
<example>
git commit -m @'
Commit message here.
Second line with $literal dollar signs.
'@
</example>
- Use `@'...'@` over `@"..."@` unless variable expansion is required.
- For arguments containing `-`, `@`, or operator characters, use stop-parsing: `git log --% --format=%H`.

Usage notes:
  - The `command` argument is required.
  - Optional timeout in ms (max ${MAX_TIMEOUT_MS_FN()}ms / ${MAX_TIMEOUT_MS_FN()/60000} minutes for foreground; default ${DEFAULT_TIMEOUT_MS_FN()}ms / ${DEFAULT_TIMEOUT_MS_FN()/60000} minutes).
  - Provide a clear, concise command description.
  - Output exceeding ${MAX_OUTPUT_CHARS_FN()} characters is truncated.
${BACKGROUND_EXECUTION_NOTE?BACKGROUND_EXECUTION_NOTE+`
`:""}  - Dedicated tool routing (use unless explicitly instructed otherwise):
    - File search: ${GLOB_TOOL_NAME} (not `Get-ChildItem -Recurse`)
    - Content search: ${GREP_TOOL_NAME} (not `Select-String`)
    - Read files: ${READ_TOOL_NAME} (not `Get-Content`)
    - Edit files: ${EDIT_TOOL_NAME}
    - Write files: ${WRITE_TOOL_NAME} (not `Set-Content`/`Out-File`)
    - Communication: Output text directly (not `Write-Output`/`Write-Host`)
  - Multiple commands:
    - Independent: make parallel ${POWERSHELL_TOOL_NAME} calls in one turn.
    - Sequential dependent: chain in a single ${POWERSHELL_TOOL_NAME} call (see edition-specific syntax above).
    - Sequential ignoring prior failure: separate with `;`.
    - Never separate commands with newlines (newlines are valid only inside quoted strings and here-strings).
  - Never prefix commands with `cd` or `Set-Location`—the working directory is already set to the project directory.${SLEEP_AVOIDANCE_NOTE?`
`+SLEEP_AVOIDANCE_NOTE:""}
  - Git rules:
    - Prefer creating a new commit over amending an existing commit.
    - Before destructive operations (`git reset --hard`, `git push --force`, `git checkout --`), evaluate safer alternatives first.
    - Never skip hooks (`--no-verify`) or bypass signing (`--no-gpg-sign`, `-c commit.gpgsign=false`) unless explicitly requested. If a hook fails, investigate and fix the underlying issue.
