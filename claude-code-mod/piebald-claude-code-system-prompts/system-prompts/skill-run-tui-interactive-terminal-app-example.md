<!--
name: "Skill: Run TUI interactive terminal app example"
description: "Example for the Run app skill: drive an interactive terminal app with tmux, readiness polling, pane capture, key references, and cleanup"
ccVersion: "2.1.246"
-->
# Example: TUI / interactive terminal app

Interactive terminal apps (editors, REPLs, curses UIs) take over the terminal and cannot be driven directly by a bash tool. Wrap them in `tmux` as the primary agent workflow.

## The tmux pattern

1. Start the TUI inside a detached `tmux` session.
2. Send keystrokes with `tmux send-keys`.
3. Read screen contents with `tmux capture-pane`.
4. Clean up with `tmux kill-session`.

Raw `tmux` commands in the skill body are usually sufficient; extract a `driver.sh` in the skill directory only if launch/attach or polling gets repetitive.

## Example snippet

> ## Run (interactive, for agents)
>
> Start the TUI inside tmux:
>
> ```bash
> tmux new-session -d -s app -x 120 -y 40 './myapp'
> ```
>
> Poll until the ready marker appears (faster + more reliable than a fixed sleep -
> returns the instant the app is up, fails loudly if it isn't):
>
> ```bash
> timeout 10 bash -c 'until tmux capture-pane -t app -p | grep -q "Ready"; do sleep 0.2; done'
> tmux capture-pane -t app -p
> ```
>
> Send input (this example navigates to the Settings screen and toggles
> an option):
>
> ```bash
> tmux send-keys -t app 's'
> timeout 5 bash -c 'until tmux capture-pane -t app -p | grep -q "Settings"; do sleep 0.2; done'
> tmux send-keys -t app 'Down' 'Down' 'Space'  # navigate + toggle
> timeout 5 bash -c 'until tmux capture-pane -t app -p | grep -qF "[x]"; do sleep 0.2; done'
> tmux capture-pane -t app -p
> ```
>
> If you find yourself writing more than a couple of these poll lines, pull
> them into a `wait_for()` helper in a `driver.sh` next to the skill.
>
> Quit:
>
> ```bash
> tmux send-keys -t app 'q'
> tmux kill-session -t app 2>/dev/null || true
> ```
>
> ### Key reference
>
> | Key | Action |
> |---|---|
> | `j` / `k` or `Down` / `Up` | Navigate list |
> | `Enter` | Select |
> | `s` | Settings |
> | `q` | Quit |

## Checklist

- **Terminal size**: Specify known-good dimensions in `tmux new-session -x -y`.
- **Startup marker**: Poll (`until tmux capture-pane | grep -q X`) rather than fixed `sleep N`; state the exact ready string.
- **Keybinding reference**: Provide a table of primary keys as the TUI's "API".
- **Clean exit**: Document both the quit keystroke and `tmux kill-session` fallback.
- **Color/unicode quirks**: Note helpful `capture-pane` flags (`-e` for escape sequences, `-J` to join wrapped lines) if output is hard to read.

## Direct invocation (humans)

Also include the direct one-liner for interactive human use:

> ## Run (direct, for humans)
>
> ```bash
> ./myapp
> ```
>
> Press `q` to quit.
