<!--
name: "Tool Description: Artifact runtime capabilities guidance (app wording)"
description: "Guides loading the Artifact capabilities skill, preferring durable capabilities over browser storage, and reconciling self-saved versions"
ccVersion: "2.1.269"
variables:
  - "ARTIFACT_CAPABILITIES_SKILL_NAME"
  - "ARTIFACT_WATCH_MODE"
-->
<runtime_capabilities>
Depending on what is enabled for the user, a published page can declare `capabilities` to: read live/connected data, remember viewer actions, share state across viewers, identify the viewer, ask you a question, store user-added files, or give the viewer a file to save.

- **Prerequisite**: Whenever any capability would make the page more useful, you MUST load `${ARTIFACT_CAPABILITIES_SKILL_NAME}` before writing the artifact, and ALWAYS before passing `capabilities` or writing any `window.claude.*` runtime code.
- **Storage preference**: Prefer a state-persisting capability over browser storage; reserve `localStorage` for per-viewer conveniences.
- **Self-saved versions**: Some pages (e.g., an in-place edited document) save new versions of themselves. ${ARTIFACT_WATCH_MODE==="none"?"Such a save makes Claude's local file out of date, so Claude's next publish of that artifact conflicts, and Claude then re-reads the page, merges the changes and republishes.":"Such a save reaches this session like any other republish, as a notice on a watched artifact or a conflict on Claude's next publish, and Claude then re-reads the page, merges the changes and republishes."}
</runtime_capabilities>