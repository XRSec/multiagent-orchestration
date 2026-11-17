<!--
name: "Tool Description: SendToProject work brief"
description: "Send an approved session brief to a new or existing claude.ai/code Project, saving memory and setup card"
ccVersion: "2.1.314"
-->
Send a session work brief to a Project (a `claude.ai/code` cloud workspace with a coordinator and worker threads).

<when_to_use>
- Final step of `/send-to-project`; works ONLY in the turn where the user ran `/send-to-project` (refuses anywhere else—tell the user to run `/send-to-project` first).
- In that turn, read folder context first with `${"SendToProjectContext"}`, then call this tool as soon as the brief is drafted.
- Requires Remote Control enabled for this session (refuses without it).
- Do not paste the brief into the conversation or ask for a go-ahead before calling (avoids double review).
</when_to_use>

<behavior>
Shows a confirmation pane spelling out every step and the brief; does nothing unless the user chooses Yes:
- Without `project_id`: creates a personal project named `project_name` with the brief's icon, color, and instructions; if `attach_git_remote` is true, attaches this folder's GitHub `origin` (read from git directly; no URL parameter exists and the brief carries no repos).
- With `project_id`: uses that existing project (creates nothing, adds no repo, keeps existing name/appearance/instructions).
- Saves the brief as markdown in project memory (`${"project-imported-context.md"}` + `MEMORY.md` entry), posts it as the project's setup card, and shares this session's Remote Control ID so the coordinator can read the session. Starts no threads (the user starts them from the setup card).
- Only project creation/lookup fails the whole call; later step failures appear as notes next to the project link—relay them to the user.
</behavior>

<inputs>
- `proposal`: brief matching `/send-to-project` schema (same as coordinator's `propose_project_setup`). MUST contain NO secrets, tokens, or credentials; copy identifiers verbatim; pass finished brief, never placeholders.
- Existing project (`project_id`): pass command's `project_id` unchanged, keep `project_name` as a plain label, omit `proposal.name`/`proposal.icon`/`proposal.color`/`proposal.instructions`, and set `attach_git_remote: false`.
- If user declines the pane: nothing was created/sent. Revise and retry with the full brief if they specified changes; stop on a bare decline (user will re-run `/send-to-project`).
- Never call again in the same run after a call succeeds (would duplicate project or setup card).
</inputs>
