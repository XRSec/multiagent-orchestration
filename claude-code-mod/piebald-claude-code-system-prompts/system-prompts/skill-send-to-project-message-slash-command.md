<!--
name: "Skill: /send-to-project message slash command"
description: "Directs one project-message tool call with confirmation and controlled revision retry"
ccVersion: "2.1.318"
variables:
  - "SEND_TO_PROJECT_TOOL_NAME"
  - "TOOL_SEARCH_TOOL_NAME"
  - "MESSAGE_TOOL_INPUT_GUIDANCE"
  - "USER_TYPED_MESSAGE_REVISION_CONTEXT_BLOCK"
-->
# Send a message to a Claude Project

The user ran `/send-to-project` and chose the target project. This command posts one message in that project as the user and shares this session's ID so the project can read the conversation for detail.

## Execution

1. If `${SEND_TO_PROJECT_TOOL_NAME}` is not in your tool list, load it first with `${TOOL_SEARCH_TOOL_NAME} select:${SEND_TO_PROJECT_TOOL_NAME}`.
2. Call `${SEND_TO_PROJECT_TOOL_NAME}` once with these inputs and nothing before the call:

${MESSAGE_TOOL_INPUT_GUIDANCE}

3. **Confirmation & declines**:
   - The confirmation pane shows the message to the user; do not paste the message into your reply or ask for a go-ahead first.
   - If declined, nothing was created or sent.
   - **Decline with feedback**: apply the requested change in `proposal.summary` and re-call with all other inputs unchanged.
   - **Bare decline**: stop.
   - Once a call succeeds, NEVER call it again in this run.
4. **Reply format**: After a call succeeds, output the lines returned by the tool result verbatim in structure—one fact per line, using the provided markdown links for names, never a raw ID or bare URL.
${USER_TYPED_MESSAGE_REVISION_CONTEXT_BLOCK}
