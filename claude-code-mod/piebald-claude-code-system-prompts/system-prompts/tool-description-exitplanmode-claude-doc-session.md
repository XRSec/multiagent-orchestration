<!--
name: "Tool Description: ExitPlanMode (Claude Doc session)"
description: "Requests plan approval (no args for Claude Doc, inline Markdown otherwise) and handles approve/decline flow"
ccVersion: "2.1.317"
-->
Submit a ready plan for user approval while in plan mode.

- **Plan argument**: check plan mode's reminder for plan location. If it is a Claude Doc, call with no arguments (a card copy cannot be edited and would drift from the Doc). Otherwise pass the full plan in Markdown via `plan`; do not write a plan file (this session has none).
- **Approval flow**: the user approves or declines on a card. Do NOT ask "Is this plan okay?" or "Should I proceed?" separately.
- **On approve**: plan mode ends and you implement the approved plan. For a Claude Doc, re-read it before starting so user edits are included.
- **On decline**: stay in plan mode, ask what to change, revise the plan in the same location (same Doc or new `plan`), and call again.