<!--
name: "Tool Description: Enable computer use"
description: "Enables computer use on the user's computer once before other computer-use tools when needed"
ccVersion: "2.1.284"
-->
Enable computer use on the user's computer for this conversation (screenshots, click, type, scroll, open apps).

- Already enabled: if tools starting with `mcp__remote-devices__computer_` are already present, use them directly instead of calling this.
- When to call: call once before any other computer-use tool when the user asks to act in an application on their computer, or explicitly requests computer/screen use.
- Do not call: for questions answerable from conversation or web search, for browser-only work, or merely because a request mentions an application.