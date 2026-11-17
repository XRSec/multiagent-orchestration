<!--
name: "Tool Description: Enable Claude in Chrome (shared description)"
description: "Feature-gated Claude in Chrome enablement: when to enable, tool availability, and exclusions"
ccVersion: "2.1.288"
-->
Enable Claude in Chrome (the Chrome browser extension on the user's computer) for this conversation.

- Already enabled: if tools containing `claude-in-chrome__` or `Claude_in_Chrome__` are already present, use them directly instead of calling this.
- When to call: call once before any other Claude in Chrome tool when the user asks to act in their browser or on a site requiring their sign-in, when a step in a skill or user-requested task needs their browser or such a site, or when the user explicitly requests Claude in Chrome. Calling this adds the Chrome tools (and on-computer file tools, if missing), possibly a turn later.
- Do not call: for questions answerable from conversation or web search, or merely because a request mentions a website.