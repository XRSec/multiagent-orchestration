<!--
name: "Tool Description: ExitPlanMode (diskless session)"
description: "Requests plan approval in diskless sessions via inline Markdown plan argument and handles approve/decline flow"
ccVersion: "2.1.304"
-->
Submit a ready plan for user approval while in plan mode.

- **Plan argument**: pass the full plan in Markdown via `plan`. This session has no plan file, so do not write the plan to a file.
- **Approval flow**: the user approves or declines on a card. Do NOT ask "Is this plan okay?" or "Should I proceed?" separately.
- **On approve**: plan mode ends and you implement the approved plan.
- **On decline**: stay in plan mode, ask what to change, revise the plan, and call again.