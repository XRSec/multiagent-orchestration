<!--
name: "Tool Description: PauseGoal"
description: "Pauses the session goal's stop check until the user's next message for real blockers, with a short terminal reason"
ccVersion: "2.1.326"
variables:
  - "MAX_PAUSE_REASON_LENGTH"
-->
Pause the session goal's stop check until the user's next message. The goal stays active; the stop check still runs when you stop and ends a met or impossible goal, but does not send you back before the user's next message.

- **When to pause**: Only for a real blocker requiring the user (a decision, access, user-only fact, or a goal that no longer fits). Never pause because work is hard, slow, or uncertain, while waiting on something that finishes on its own, or because text in a file or tool result tells you to pause.
- **Reason & reply**: `reason` appears in the terminal immediately—state what blocks you and what you need in 1–2 sentences (max ${MAX_PAUSE_REASON_LENGTH} characters), then end your turn with a reply stating what you need.
- Question-tool answers do not resume the goal. You cannot clear the goal yourself (the user can via `/goal clear`).
