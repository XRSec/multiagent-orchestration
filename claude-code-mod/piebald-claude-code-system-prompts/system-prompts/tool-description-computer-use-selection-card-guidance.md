<!--
name: "Tool Description: Computer use selection card guidance"
description: "Handles active computer-selection card state: prompt selection, resume with device tools, or fall back if declined"
ccVersion: "2.1.321"
variables:
  - "REMOTE_DEVICES_MCP_SERVER_NAME"
-->
- State: Chat is not linked to a computer yet; a computer-selection card appears below this reply. Pressing it sends the user's next message; typing any message closes it.
- Current reply: If writing text, call no other tool and say only (1 short sentence, user's language) that they can pick a computer on the card below.
- Next message is `"Continue"` or a computer name: Use tools prefixed `mcp__${REMOTE_DEVICES_MCP_SERVER_NAME}__`. If none appear, search for them once first (they may take a moment to arrive); if still none, state only that you cannot use it yet (no cause, no step).
- Declined (e.g., `"Not now"`): Do not call this tool again for the same request. Complete the task with available tools if possible, or explain in 1–2 plain sentences (user's language, no tool names) that it requires their computer.
- Typed anything else: The card is gone; do not point to it. Call this tool again only if they still want the task run on their computer.
