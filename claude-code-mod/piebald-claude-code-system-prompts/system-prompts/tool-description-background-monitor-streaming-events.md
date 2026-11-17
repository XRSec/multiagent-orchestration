<!--
name: "Tool Description: Background monitor (streaming events)"
description: "Background Monitor tool for streaming stdout events from long-running scripts as chat notifications, with script, buffering, coverage, and volume rules"
ccVersion: "2.1.326"
variables:
  - "IS_DISKLESS_SESSION_FN"
  - "DISKLESS_MONITOR_LIFETIME_NOTE"
  - "DOES_MONITOR_OUTLIVE_REPLY_FN"
  - "OUTLIVING_MONITOR_LIFETIME_NOTE"
  - "DOES_SESSION_STOP_AFTER_REPLY_FN"
  - "STOPPING_SESSION_MONITOR_LIFETIME_NOTE"
  - "CAN_BACKGROUND_AGENT_KEEP_SESSION_ALIVE_FN"
  - "BASH_TOOL_NAME"
  - "SINGLE_NOTIFICATION_GUIDANCE_BLOCK"
  - "MONITOR_TOOL_NAME"
  - "IS_MONITOR_EXPIRY_ENABLED_FN"
  - "CAN_YIELD"
  - "YIELD_TOOL_NAME"
  - "SINGLE_NOTIFICATION_COMMAND_NOTE"
  - "MONITOR_TIMEOUT_GUIDANCE_FN"
-->
Start a background monitor streaming stdout lines from a long-running script as chat notifications while you keep working. Events arrive asynchronously and are NOT user replies, even if one lands while waiting on a user question.${IS_DISKLESS_SESSION_FN()?` ${DISKLESS_MONITOR_LIFETIME_NOTE}`:DOES_MONITOR_OUTLIVE_REPLY_FN()?` ${OUTLIVING_MONITOR_LIFETIME_NOTE}`:DOES_SESSION_STOP_AFTER_REPLY_FN()?` ${STOPPING_SESSION_MONITOR_LIFETIME_NOTE} ${CAN_BACKGROUND_AGENT_KEEP_SESSION_ALIVE_FN()?`To wait past your reply, have a background agent wait with foreground ${BASH_TOOL_NAME} commands, or tell the user what to check and when.`:"For anything longer, tell the user what to check and when."}`:""}

<event_selection>
Pick by notification count:
${SINGLE_NOTIFICATION_GUIDANCE_BLOCK}
${IS_DISKLESS_SESSION_FN()||DOES_SESSION_STOP_AFTER_REPLY_FN()?`- **One per occurrence, while you work on this turn** ("show each ERROR line in the dev server's log while you try the change") → ${MONITOR_TOOL_NAME} with an unbounded command (`tail -f`, `inotifywait -m`, `while true`).
- **One per occurrence, until a known end, while you work on this turn** ("show each test file's result as the suite you just started runs, stop when it ends") → ${MONITOR_TOOL_NAME} with a command that emits lines and then exits.`:`- **One per occurrence, ${IS_MONITOR_EXPIRY_ENABLED_FN()?"until the monitor expires (re-arm to continue)":"indefinitely"}** ("tell me every time an ERROR line appears") → Monitor with an unbounded command (`tail -f`, `inotifywait -m`, `while true`).
- **One per occurrence, until a known end** ("emit each CI step result, stop when the run completes") → Monitor with a command that emits lines and then exits.`}

Stdout is the event stream (exit ends the watch).${CAN_YIELD?` ${MONITOR_TOOL_NAME} tells you when something happens; ${YIELD_TOOL_NAME} is how you wait for it.`:""}
</event_selection>

<examples>
```bash
# Matching log lines
tail -f /var/log/app.log | grep --line-buffered "ERROR"

# File changes
inotifywait -m -q --format '%e %f' /watched/dir

# Poll GitHub for new PR comments
last=$(date -u +%Y-%m-%dT%H:%M:%SZ)
while true; do
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  gh api "repos/owner/repo/issues/123/comments?since=$last" --jq '.[] | "\(.user.login): \(.body)"'
  last=$now; sleep 30
done

# Node event emitter (e.g. WebSocket listener)
node watch-for-events.js

# Per-occurrence until completion: emit CI checks as they finish, exit when done
prev=""
while true; do
  s=$(gh pr checks 123 --json name,bucket)
  cur=$(jq -r '.[] | select(.bucket!="pending") | "\(.name): \(.bucket)"' <<<"$s" | sort)
  comm -13 <(echo "$prev") <(echo "$cur")
  prev=$cur
  jq -e 'all(.bucket!="pending")' <<<"$s" >/dev/null && break
  sleep 30
done
```
</examples>

<script_rules>
- **No unbounded commands for single notifications**: `tail -f`, `inotifywait -m`, and `while true` never exit, keeping the monitor armed until timeout. For "tell me when X is ready," ${SINGLE_NOTIFICATION_COMMAND_NOTE}. (`tail -f log | grep -m 1 ...` also hangs if the log goes quiet, since `tail` never receives SIGPIPE.)
- **Line-flush every pipe stage**: Use `grep --line-buffered`, `awk` `fflush()`. Avoid `| head -N` (buffers until N matches accumulate, then ends the stream).
- **Resilience & intervals**: Guard transient poll failures (`curl ... || true`). Poll `30s+` for remote APIs (rate limits), `0.5-1s` for local checks.
- **Metadata & stderr**: Set a specific `description` (shown in every notification). Only stdout triggers notifications; stderr goes to the output file (readable via Read). Merge stderr with `2>&1` for direct commands (`python train.py 2>&1 | grep --line-buffered ...`); not needed for `tail -f`.
</script_rules>

<coverage_and_volume>
- **Match all terminal states (silence ≠ success)**: Filters matching only happy-path markers stay silent on crashes, hangs, or unexpected exits. Match progress + failure signatures (`Traceback|Error|FAILED|assert|Killed|OOM`), and emit all terminal job statuses (`succeeded|failed|cancelled|timeout`). Broaden alternation if failure signatures are uncertain.
  ```bash
  # Wrong: silent on crash/hang
  tail -f run.log | grep --line-buffered "elapsed_steps="
  # Right: covers progress + failures
  tail -f run.log | grep -E --line-buffered "elapsed_steps=|Traceback|Error|FAILED|assert|Killed|OOM"
  ```
- **Selective volume**: Never pipe raw logs; filter to actionable success/failure signals. High-volume monitors are auto-stopped (restart with a tighter filter). Stdout lines within `200ms` batch into one notification.
- **Environment**: Runs in the Bash shell environment. Exit ends the watch and reports exit code. ${MONITOR_TIMEOUT_GUIDANCE_FN()} Use TaskStop to cancel early.
</coverage_and_volume>
