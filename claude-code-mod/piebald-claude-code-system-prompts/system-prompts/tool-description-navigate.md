<!--
name: "Tool Description: Navigate"
description: "Browser navigate tool for opening URLs and moving forward or backward in tab history"
ccVersion: "2.1.268"
-->
Navigate to a URL or move forward/back in browser history.

- **Standalone URL navigation** (not inside `browser_batch`): `tabId` may be omitted; `tabs_context_mcp{createIfEmpty:true}` runs automatically, navigates the first tab in the session's group, and appends the tab list and IDs to output.
- **Explicit `tabId` required**: Inside `browser_batch`, for `url:"back"`/`"forward"`, when targeting a specific tab, or when preserving state across multiple tabs in the session's group.
