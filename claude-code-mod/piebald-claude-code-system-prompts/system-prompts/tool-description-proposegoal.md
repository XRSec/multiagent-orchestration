<!--
name: "Tool Description: ProposeGoal"
description: "Proposing a verifiable multi-turn session goal, requiring user approval unless the user explicitly requested the exact outcome"
ccVersion: "2.1.326"
-->
Set a completion condition for this session's work—a goal enforced by a stop check that keeps you working until a separate evaluator confirms it is met. Non-blocking: approval renders alongside your work, so keep working while it is handled.

- **`ask_user` behavior**:
  - `true` (default): Shows an approval dialog. If declined, you are not notified—do not ask about the decision or re-propose the same or a reworded condition.
  - `false` (sets goal directly, no dialog): Use ONLY when the user's own words in this conversation stated this exact outcome; if inferred or in doubt, ask.
  - While a goal is active, the user is always asked regardless of `ask_user`, and the current goal stays in force unless approved.
- **Lifecycle**: Approval arrives as a `"Goal set"` message; until then, the proposed goal is not set. You cannot see whether a proposal is pending or declined—never say it is pending (use `GetGoal` to check the active goal). Once set, work toward it without asking what to do; it clears automatically once met (do not tell the user to run `/goal clear` after success).
- **Scope & format**: Propose a goal only for multi-turn requests with a verifiable end state (`"make the tests pass"`, `"migrate every call site"`), never for one-off tasks or to widen scope. State one measurable end state with its check (e.g., `"bun test exits 0"`) in at most ${500} characters (the evaluator verifies from conversation alone and cannot run commands or read files). One stop-check goal is active at a time; a newly approved goal replaces it.
