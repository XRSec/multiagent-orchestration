<!--
name: "Tool Description: Artifact title and description guidance (app wording)"
description: "App-worded rules for concise distinctive Artifact titles, gallery descriptions, and stable naming"
ccVersion: "2.1.271"
-->
**Title**:
- Put `<title>` at the top of the HTML (only the first 8KB is scanned); `title` parameter fills in only when HTML lacks `<title>` (Markdown pages keep their filename).
- Use a distinctive name for the tab and gallery (typically 2–4 words), not a summary, a generic label, or `<name> -/: <explainer>`.
- When a natural title pairs a name with a generic word, keep the name; do not trim a multi-word title that already reads as one specific name.
- Put the explanation in the one-sentence `description` parameter (the gallery card's subtitle), and keep the title stable across redeploys.