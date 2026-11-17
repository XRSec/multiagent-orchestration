<!--
name: "Tool Description: Enable Claude app browser (shared description)"
description: "Feature-gated Claude app browser enablement: when to enable, tool availability, and exclusions"
ccVersion: "2.1.288"
-->
Enable the browser built into the Claude desktop app on the user's computer for this conversation.

- Already enabled: if tools containing `Claude_Browser__` are already present, use them directly instead of calling this.
- When to call: call once before any other Claude app browser tool when the user asks to act in the app's browser or on a site requiring their sign-in, when a step in a skill or user-requested task needs that browser or site, or when the user explicitly requests that browser. Calling this adds the browser tools (and on-computer file tools, if missing), possibly a turn later.
- Do not call: for questions answerable from conversation or web search, or merely because a request mentions a website.