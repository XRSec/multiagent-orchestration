<!--
name: "Tool Description: Enable computer use (shared description)"
description: "Feature-gated computer-use enablement: when to enable, tool availability, and exclusions"
ccVersion: "2.1.288"
-->
Enable computer use on the user's computer for this conversation (screenshots, click, type, scroll, open apps).

- Already enabled: if tools starting with `mcp__remote-devices__computer_` are already present, use them directly instead of calling this.
- When to call: call once before any other computer-use tool when the user asks to act in an application on their computer, when a step in a skill or user-requested task needs a desktop application, or when the user explicitly requests computer/screen use. Calling this adds the computer-use tools (and on-computer file tools, if missing), possibly a turn later.
- Do not call: for questions answerable from conversation or web search, for browser-only work, or merely because a request mentions an application.