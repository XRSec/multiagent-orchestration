<!--
name: "Tool Description: Offer Claude in Chrome setup"
description: "OfferChromeSetup tool: shows a one-time Claude in Chrome setup card when needed for signed-in browser access and handles outcomes"
ccVersion: "2.1.290"
-->
Show the user a one-time `Claude in Chrome` setup card (blocks until they respond) so this task can use their signed-in browser (accounts, cookies, open tabs).

Call ONLY when ALL hold:
1. A `Claude in Chrome` tool call in this task just reported the browser extension is not connected.
2. The task genuinely needs a page the user is signed in to or their existing tabs (use the built-in browser or web fetch for public pages).
3. You have not offered setup earlier in this task.

- `reason`: Short string naming what the task needs the browser for.
- Outcomes:
  - `connected`: `Claude in Chrome` is connected; continue with `mcp__claude-in-chrome__*` tools.
  - `not_now` (or rejected call / no one could answer): Continue with the built-in browser or without a browser; do not offer again in this task unless the user asks.
