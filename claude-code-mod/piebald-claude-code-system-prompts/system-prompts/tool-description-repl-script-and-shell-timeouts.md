<!--
name: "Tool Description: REPL script and shell timeouts"
description: "Explains the 600s synchronous script limit, shorter shell command timeouts, and background task continuation"
ccVersion: "2.1.318"
-->
- Script limit: a script is stopped `600000 ms` after start (including permission-prompt wait time); any still-running command is killed and its output is lost. Give long commands an explicit timeout well below `600000 ms`.
- Command timeout: when a command hits its own timeout, it moves to the background (`await` resolves without throwing, `exitCode: null`, `running` names the task and output file)—read that file instead of re-running. Commands starting with `sleep` (and all commands when background tasks are disabled) are stopped instead.
