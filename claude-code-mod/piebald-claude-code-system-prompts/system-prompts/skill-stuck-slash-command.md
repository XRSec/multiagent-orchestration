<!--
name: "Skill: /stuck slash command"
description: "Diagnoses frozen or slow CLI sessions and reports confirmed hangs"
ccVersion: "2.1.242"
-->
# /stuck — diagnose frozen or slow sessions

Investigate suspected frozen, stuck, or slow sessions on this machine (excluding the current process) and report confirmed issues to `#claude-code-feedback`.

## Indicators of a stuck session

| Signal | Threshold / Value | Likely Cause |
|---|---|---|
| High CPU | `>=90%` sustained (sample twice, 1–2s apart) | Infinite loop (not a transient spike) |
| State `D` | First char of `ps` `state` (ignore `+`, `s`, `<`) | Uninterruptible sleep / I/O hang |
| State `T` | Stopped | Accidental `Ctrl+Z` |
| State `Z` | Zombie | Parent not reaping |
| High RSS | `>=4GB` | Memory leak causing sluggishness |
| Stuck child | `pgrep -lP <pid>` shows hung `git`/`node`/shell | Subprocess blocking parent |

## Investigation steps

1. **List session processes (macOS/Linux):**
   ```bash
   ps -axo pid=,pcpu=,rss=,etime=,state=,comm=,command= | grep -E '(claude|cli)' | grep -v grep
   ```
   Filter to rows where `comm` is `claude` or (`cli` with `"claude"` in the command path). Exclude the current shell/process PID.
2. **Inspect suspicious processes:**
   - List children: `pgrep -lP <pid>`
   - Re-sample high CPU after 1–2s to confirm sustained load
   - Inspect hung child command line: `ps -p <child_pid> -o command=`
   - Check debug log tail if session ID is known: `~/.claude/debug/<session-id>.txt`
3. **Optional stack dump (macOS, truly frozen process only):**
   - `sample <pid> 3` (large output; capture only when clearly hung and root cause is needed)

## Report

- **Healthy sessions:** Report directly to the user; do NOT post an all-clear to Slack.
- **Confirmed stuck/slow session:** Post to `#claude-code-feedback` (channel ID: `C07VBSHV7EV`) via Slack MCP (`ToolSearch` for `slack_send_message` if unloaded) using a two-message structure:
  1. **Top-level message:** One short line with hostname, CLI version, and terse symptom (e.g., `"session PID 12345 pegged at 100% CPU for 10min"`). No code blocks or details.
  2. **Thread reply (`thread_ts` = top-level `ts`):** Full diagnostic dump (PID, CPU%, RSS, state, uptime, command line, child processes, diagnosis, relevant debug log tail or `sample` output).
- **Fallback (Slack MCP unavailable):** Output the formatted report for the user to copy-paste into `#claude-code-feedback` and note to thread the details.

## Constraints

- Diagnostic only: NEVER kill or signal any processes.
- If the user supplied a specific PID or symptom, investigate that target first.