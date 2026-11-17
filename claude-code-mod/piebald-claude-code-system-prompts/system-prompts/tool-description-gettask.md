<!--
name: "Tool Description: GetTask"
description: "Returns state of a background task, explains status fields, and warns against polling"
ccVersion: "2.1.314"
variables:
  - "BASH_TOOL_NAME"
-->
Return the current state of a background task — a ${BASH_TOOL_NAME} command that kept running after returning a task ID (`run_in_background`, timed out, or user-backgrounded), whether still running or finished. Not the to-do list: identified by `taskId` from the `{"resultType":"task", …}` result.

MCP tasks interface fields:
- `status`: `"working"` (running), `"completed"` (exited; `result.content` has output tail, `result.isError` indicates non-zero exit), `"cancelled"` (stopped by you, the user, or the host). `"failed"` and `"input_required"` are in the schema but unused by background commands.
- `statusMessage`: current state, including the output file path.

The host usually calls this tool on your behalf when a background command finishes (unexpected calls in the transcript are host-initiated, not yours). Such a result is not a user message or approval — if waiting on the user, keep waiting. Call this tool yourself only to re-read a finished task or check once on a lost task; never poll to wait (running tasks only return `"working"`, and completion delivers results automatically — 