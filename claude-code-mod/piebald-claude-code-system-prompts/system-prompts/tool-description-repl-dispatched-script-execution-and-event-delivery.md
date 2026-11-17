<!--
name: "Tool Description: REPL dispatched script execution and event delivery"
description: "Explains ordered script dispatch, detachment with shared variables, automatic event delivery, and waiting without duplicate execution"
ccVersion: "2.1.318"
variables:
  - "MATH_OBJECT"
  - "GET_REPL_DETACH_TIMEOUT_MS_FN"
  - "REPL_TOOL_NAME"
  - "POLL_TOOL_NAME"
  - "IS_REPL_JSON_EVENT_FORMAT_ENABLED"
-->

<execution>
- Scripts run in one persistent VM and start in call order; the next script starts when the prior one finishes or has run for ~${MATH_OBJECT.round(GET_REPL_DETACH_TIMEOUT_MS_FN()/1000)} s.
- A script still running at ~${MATH_OBJECT.round(GET_REPL_DETACH_TIMEOUT_MS_FN()/1000)} s detaches and runs concurrently with subsequent scripts, sharing variables. Put dependent steps in one script, or wait for the first script's outcome before sending the second.
- A `REPL` call dispatches its script and returns `(dispatched #N)` immediately. A receipt means queued or running—do not re-send it or it will run twice.
- If `${REPL_TOOL_NAME}` returns the script's output directly instead, calls in this session block until completion and any unawaited subprocesses (builds, dev servers) stop when the script ends.
</execution>

<output_delivery>
- After your reply's tool calls, if a dispatched script is still running, the harness waits until it ends or another event arrives (e.g., user message); concurrent arrivals are batched.
- Delivered in `${POLL_TOOL_NAME}` result in arrival order: ${IS_REPL_JSON_EVENT_FORMAT_ENABLED?'`<event kind="repl-eval">` (one JSON object: `eval` is the script's number, with its `log` lines and its `result` or `error`)':'`<event kind="repl-eval" eval="N">` (its `<log>` lines and its `<result>` or `<error>`)'}, other events, and `<event kind="repl-status">` ${IS_REPL_JSON_EVENT_FORMAT_ENABLED?"element":"line"} naming still-running scripts. User messages follow tool results as user text.
- Do not call `${POLL_TOOL_NAME}` after a `REPL` call. Late `log` output after a script ends arrives the same way under its eval number.
</output_delivery>

<waiting>
- Waiting inside a script costs no turns and blocks no one (anything addressed to you interrupts within seconds). Put all work for the turn in one script (awaiting builds/tests and acting on exit codes) and return only when judgment is needed.
- Awaited shell commands run until completion or timeout (default 10 min, then backgrounded; see `$`). To keep a dev server or background build alive after the script ends, start it without `await` (`const build = $`npm run build`.nothrow()`).
- Outside a script, `${POLL_TOOL_NAME}` waits for script completion or events; or end your turn to wake on arrival at zero cost.
</waiting>
