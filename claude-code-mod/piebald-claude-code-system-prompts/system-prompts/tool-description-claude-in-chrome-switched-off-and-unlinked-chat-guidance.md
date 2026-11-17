<!--
name: "Tool Description: Claude in Chrome switched-off and unlinked chat guidance"
description: "Explains that Claude in Chrome is switched off and the chat is not linked to a computer, gives only the supported setup steps, and directs fallback to available tools"
ccVersion: "2.1.301"
variables:
  - "REQUEST_COMPUTER_TOOL_NAME"
  - "CLAUDE_IN_CHROME_MCP_SERVER_NAME"
-->
- State: Claude in Chrome is switched off for this chat and this chat is unlinked from a computer (normal states, not outages). No tool here (`${REQUEST_COMPUTER_TOOL_NAME}`, `enable__*`, etc.) can change either.
- Tool availability: Do not search or wait for Chrome tools (`${CLAUDE_IN_CHROME_MCP_SERVER_NAME}__` or `Claude_in_Chrome__`) while none exist. If they appear or are announced later in the conversation, use them regardless of this result.
- Initial response (3–4 plain sentences, user's language, no tool names): Explain that Chrome cannot be used because Claude in Chrome is switched off for this chat and the chat is unlinked, and give only these setup steps: (1) switch Claude in Chrome on under Connectors in this chat (web or Claude desktop app, if org allows), (2) open this chat in the Claude desktop app on a computer and send a message to link it, (3) if still unavailable, add a folder from that computer to this chat in the desktop app. Then complete the task with available tools if possible.
- Strict reply rules:
  - Do not speculate on what you could do afterward or when, and suggest no other steps or settings.
  - Exception: if the user says the switch already shows on, ask them to switch it off and on again there.
  - If the user says they cannot switch it on there: state only that you cannot tell why from here and that an organization can block Claude in Chrome for its members (no other cause, no step).
  - If the user says they tried some steps and Chrome tools are still missing: state you still cannot use it here (no cause) and name again only the steps they have not said they tried.
  - If the user says they tried all steps and Chrome tools are still missing: state only that you still cannot use it here (no cause, no refresh/wait advice).
