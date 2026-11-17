<!--
name: "Tool Description: Artifact preview action (in-session viewer)"
description: "Documents Artifact preview action behavior, output (screenshot, console errors, clickable outline), invocation rules, and failure fallback"
ccVersion: "2.1.292"
-->
**Preview**: `action: "preview"` with `file_path` opens the page in the in-session artifact viewer and returns a first-view image, console errors, and a clickable-elements outline.
- **When to run**: Run when the user asks how a page looks, or when an Artifact type's instructions require checking (if those instructions say not to check unless asked, they win).
- **Limitations**: The preview is a local check, not proof of external viewer output (internet-loaded web fonts and scripts may not render here).
- **Fallback**: If preview reports that it stopped, tell the user in one clause that you could not check how it looks here and continue; do not check another way instead.
