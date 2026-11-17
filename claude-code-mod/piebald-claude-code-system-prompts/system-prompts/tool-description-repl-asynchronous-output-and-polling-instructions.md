<!--
name: "Tool Description: REPL asynchronous output and polling instructions"
description: "Explains inline vs. dispatched REPL results, async event formats, Poll waiting, and duplicate-execution avoidance"
ccVersion: "2.1.318"
variables:
  - "MATH_OBJECT"
  - "GET_REPL_INLINE_WAIT_TIMEOUT_MS_FN"
  - "IS_REPL_JSON_EVENT_FORMAT_ENABLED"
  - "POLL_TOOL_NAME"
-->

<output_delivery>
- Scripts start in call order.
- Finishes within ~${MATH_OBJECT.round(GET_REPL_INLINE_WAIT_TIMEOUT_MS_FN()/1000)} s: returns inline as the `REPL` call's result (`<repl-output eval="N">` with `<log>` lines and `<result>` or `<error>`).
- Still running after ~${MATH_OBJECT.round(GET_REPL_INLINE_WAIT_TIMEOUT_MS_FN()/1000)} s: returns `(dispatched #N)`, continues running without blocking subsequent scripts, and delivers output as an ${IS_REPL_JSON_EVENT_FORMAT_ENABLED?'`<event kind="repl-eval">` element whose body is one JSON object (`eval` is the script's number, with its `log` lines and its `result` or `error`)':'`<event kind="repl-eval" eval="N">` element with the same children'} in a `${POLL_TOOL_NAME}` result or before your next turn, with an `<event kind="repl-status">` ${IS_REPL_JSON_EVENT_FORMAT_ENABLED?"element":"line"} showing pending work.
- A `(dispatched #N)` receipt means the script is running—do not re-issue it or it will run twice.
</output_delivery>

<waiting>
- `${POLL_TOOL_NAME}` returns as soon as an event arrives. If a script or background task (e.g., a context) is still running with nothing to deliver, `${POLL_TOOL_NAME}` ends just before prompt cache expiry (~5 min, or ~1 h on a 1-hour cache) with a status line of pending items so you can poll again.
- Calling `${POLL_TOOL_NAME}` in the same turn as `REPL` waits for that script (saving a round trip on long builds/tests; returns immediately if already finished).
- If nothing else is needed while a long script/context runs, end your turn—its result/notification starts the next turn at zero cost.
- Shell commands without an explicit timeout move to the background after 10 min; pass a longer timeout (up to 2 h) to await a long build.
</waiting>
