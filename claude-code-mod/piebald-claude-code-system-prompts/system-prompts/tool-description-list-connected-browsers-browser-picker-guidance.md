<!--
name: "Tool Description: list_connected_browsers (browser picker guidance)"
description: "Appended to list_connected_browsers: when to prompt the user to pick a browser and call select_browser/switch_browser"
ccVersion: "2.1.274"
variables:
  - "ASK_USER_TOOL_NAME"
  - "ASK_USER_QUESTION_TOOL_NAME"
  - "CHROME_CONFIRMATION_OPTION_LABEL"
-->
- **Default**: do not call before using the browser when one browser is connected or already selected for this session.
- **Disambiguation**: only if a browser tool reports multiple connected browsers with none selected, or the user asks to change browsers, prompt with ${ASK_USER_TOOL_NAME(ASK_USER_QUESTION_TOOL_NAME)}: list one option per connected browser, local-computer browsers first (display name as label, `deviceId` in parentheses), plus a final option labeled exactly `"${CHROME_CONFIRMATION_OPTION_LABEL}"`.
- **Action**: call `select_browser` with the chosen `deviceId`, or `switch_browser` for the final option. Never pick one yourself.