<!--
name: "Tool Description: SendToProject message"
description: "Post one approved message as the user to a new or existing claude.ai/code Project without saving memory or setup card"
ccVersion: "2.1.318"
-->
Post one approved message as the user to a Project (a `claude.ai/code` cloud workspace with a coordinator and worker threads).

<when_to_use>
- Final step of `/send-to-project`; works ONLY in the turn where the user ran `/send-to-project` (refuses anywhere else—tell the user to run `/send-to-project` first).
- Requires Remote Control enabled for this session (refuses without it).
- Do not paste the message into the conversation or ask for a go-ahead before calling; the tool's confirmation pane handles review.
</when_to_use>

<behavior>
Shows a confirmation pane with the message; does nothing unless the user chooses Send:
- Without `project_id`: creates a personal project under the command's chosen name; if `attach_git_remote` is true, attaches this folder's GitHub `origin` (read from git directly).
- With `project_id`: posts to that existing project (creates nothing, adds no repo).
- Posts the message as the user with this session's Remote Control ID so the project's agent can read the session and answer there. Saves nothing to project memory and posts no setup card.
</behavior>

<inputs>
- `proposal`: takes only `summary` (the message). If the user typed their own message (via command or input field), the tool sends their verbatim text and ignores `summary` until they ask for a change. Otherwise draft in the user's voice in <=3 plain sentences, with NO secrets, tokens, or credentials.
- If user declines the pane: nothing was created/sent. Revise and retry if they specified changes; stop on a bare decline.
- Never call again in the same run after a call succeeds.
</inputs>
