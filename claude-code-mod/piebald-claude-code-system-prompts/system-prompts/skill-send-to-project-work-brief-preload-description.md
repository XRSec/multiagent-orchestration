<!--
name: "Skill: /send-to-project work brief preload description"
description: "Preloads project work-brief transfer behavior, approval requirement, and Remote Control dependency"
ccVersion: "2.1.318"
variables:
  - "SEND_TO_PROJECT_TOOL_NAME"
-->
# Send this session’s work to a Claude Project

- Prompts for the target project (new or existing user project), drafts a short brief from the conversation (what the work is, current status, remaining work), and sends it via `${SEND_TO_PROJECT_TOOL_NAME}`.
- **Approval**: The tool's confirmation pane displays the brief for user approval before anything is created or sent.
- **Session link**: Stores the brief as the project's setup card and passes this session's Remote Control ID so its coordinator can read the session for detail; requires Remote Control enabled (offers to enable if off).
- **Shortcut**: Passing a project first in the arguments (double-quoted name, ID, or link) pre-selects it.
- **Privacy**: Nothing on this computer is read until the user runs the command.
