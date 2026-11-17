<!--
name: "Skill: /send-to-project message preload description"
description: "Preloads project-message behavior, typed/drafted message selection, and approval requirement"
ccVersion: "2.1.318"
variables:
  - "SEND_TO_PROJECT_TOOL_NAME"
-->
# Send a message to a Claude Project

- Prompts for the target project (new or existing user project) and posts one message as the user via `${SEND_TO_PROJECT_TOOL_NAME}`.
- **Approval**: The tool's confirmation pane displays the message for user approval before anything is created or sent.
- **Message selection**:
  - Uses text typed after the project argument.
  - If none typed, drafts at most three sentences from the current conversation (in an empty terminal session, asks the user in place).
- **Session link**: Passes this session's Remote Control ID so the project can read it for detail; requires Remote Control enabled (offers to enable if off).
- **Shortcut**: Passing a project first in the arguments (double-quoted name, ID, or link) pre-selects it.
