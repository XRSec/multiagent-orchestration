<!--
name: "Tool Description: Claude in Chrome bridge disconnect error"
description: "Error message shown when a Claude in Chrome tool call fails because the Chrome extension disconnects mid-operation"
ccVersion: "2.1.173"
variables:
  - "CHROME_TOOL_NAME"
-->
"${CHROME_TOOL_NAME}" failed: Chrome extension disconnected mid-operation (usually transient: service worker restart, closed tab, or network blip; often reconnects automatically).
- Retry the same call in a few seconds.
- If it keeps failing, ask the user to switch to Chrome (wakes the extension) or verify the extension is logged in.
