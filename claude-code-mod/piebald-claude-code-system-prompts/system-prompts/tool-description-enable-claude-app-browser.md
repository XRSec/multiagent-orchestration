<!--
name: "Tool Description: Enable Claude app browser"
description: "Enables Claude desktop app built-in browser once before other browser tools when needed"
ccVersion: "2.1.284"
-->
Enable the browser built into the Claude desktop app on the user's computer for this conversation.

- Already enabled: if tools containing `Claude_Browser__` are already present, use them directly instead of calling this.
- When to call: call once before any other Claude app browser tool when the user asks to act in the app's browser or on a site requiring their sign-in, or explicitly requests that browser.
- Do not call: for questions answerable from conversation or web search, or merely because a request mentions a website.