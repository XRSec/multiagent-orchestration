<!--
name: "Tool Description: Artifact browser storage guidance"
description: "Restricts localStorage/sessionStorage/IndexedDB to try/catch-wrapped per-viewer UI conveniences"
ccVersion: "2.1.271"
-->
**Browser storage**: `localStorage`, `sessionStorage`, and `IndexedDB` are origin-isolated to a single viewer's browser (surviving same-URL republishes, never shared across viewers/devices or readable by the agent) and may throw or return empty in private windows, previews, or thumbnail capture. Wrap all reads/writes in `try/catch`, ensure clean fallback rendering, and restrict usage to ephemeral per-viewer conveniences (active tab/filter, collapsed state, unsent draft)—route durable or shared state to runtime capabilities.
