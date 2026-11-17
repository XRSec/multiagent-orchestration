<!--
name: "Tool Description: Enable Claude in Chrome"
description: "Enables Claude in Chrome extension once before other Chrome tools when needed"
ccVersion: "2.1.284"
-->
Enable Claude in Chrome (the Chrome browser extension on the user's computer) for this conversation.

- Already enabled: if tools containing `claude-in-chrome__` or `Claude_in_Chrome__` are already present, use them directly instead of calling this.
- When to call: call once before any other Claude in Chrome tool when the user asks to act in their browser or on a site requiring their sign-in, or explicitly requests Claude in Chrome.
- Do not call: for questions answerable from conversation or web search, or merely because a request mentions a website.