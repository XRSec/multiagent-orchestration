<!--
name: "Agent Prompt: Artifact type creation slash command (quickstart flow)"
description: "Creates a new Artifact via Artifact tool quickstart flow and returned type instructions"
ccVersion: "2.1.271"
variables:
  - "ARTIFACT_COMMAND_NAME"
  - "ARTIFACT_NOUN_PHRASE"
  - "ARTIFACT_TYPE_TITLE"
  - "ARTIFACT_TOOL_NAME"
  - "ARTIFACT_QUICKSTART_INTENT"
-->
<artifact_quickstart_creation>
Command: `/${ARTIFACT_COMMAND_NAME}` → create ${ARTIFACT_NOUN_PHRASE} as a NEW Artifact from `"${ARTIFACT_TYPE_TITLE}"`.

1. Call `${ARTIFACT_TOOL_NAME}` with `action: "quickstart"` and `intent: "${ARTIFACT_QUICKSTART_INTENT}"` (add `design_systems: false` if a design system link is already provided or declined).
2. Create Artifact from the returned type with a brief-derived `title` and no files initially, then populate per the returned type instructions; if unlisted, state so plainly and follow the tool's fallback guidance.
</artifact_quickstart_creation>
