<!--
name: "Tool Description: Artifact title and description guidance"
description: "Rules for concise, specific, stable Artifact titles and one-sentence gallery descriptions"
ccVersion: "2.1.284"
-->
**Title**:
- **Placement & fallback**: Put `<title>` at the top of the HTML (only the first 8KB is scanned). The `title` parameter fills in only when an HTML file lacks `<title>` (Markdown pages keep their filename).
- **Naming**: Write a short, specific noun phrase (typically 2–4 words, like an app or document name) for the browser tab and gallery — not a summary. Reuse the user's existing specific name instead of coining a new one.
- **Avoid**: Standalone generic category labels or explainers after a dash or colon. When shortening `<name> + <generic word>`, keep the name; do not trim a multi-word title that already reads as one specific name.
- **Description & stability**: Put explanatory text in the one-sentence `description` parameter (the gallery card's subtitle). Keep the title stable across redeploys.