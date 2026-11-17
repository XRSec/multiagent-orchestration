<!--
name: "Tool Description: WrapUp"
description: "Requires a recap and any pending user decision through WrapUp before the closing reply, explains when to call or skip it, and defines the next-step box's question-and-action behavior"
ccVersion: "2.1.317"
-->
Call once before your closing reply to populate the app's next-step box (a 2–3 sentence `recap`, plus one `ask` and action buttons when a user decision or next step is pending).

- **When to call**: Every turn where you changed files, ran commands, or completed multi-step work, and every turn ending with a question, choice, or go-ahead request (including turns pausing to ask before acting).
- **When to skip**: Short answers, pure conversation, brief read-and-explain turns, or turns ending in another tool's user prompt (e.g., plan approval).
- **Fields & language**: The box opens only for questions with answers — pass `actions` with `ask` (when nothing is pending, send `recap` alone and no box is drawn). Write `recap`, `ask`, and labels in the user's language.
- **Reply ordering**: Write your full closing reply as plain text *after* this call (`recap` never replaces it); writing it before this call risks truncation to a short summary.
