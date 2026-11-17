<!--
name: "Agent Prompt: Artifact type creation slash command"
description: "Discovers a named published Artifact type via built-in Artifact tool, creates the Artifact, and follows returned instructions"
ccVersion: "2.1.265"
variables:
  - "ARTIFACT_COMMAND_NAME"
  - "ARTIFACT_NOUN_PHRASE"
  - "ARTIFACT_TYPE_TITLE"
  - "ARTIFACT_TOOL_NAME"
-->
<artifact_type_creation>
Command: `/${ARTIFACT_COMMAND_NAME}` → create ${ARTIFACT_NOUN_PHRASE} as a NEW Artifact from `"${ARTIFACT_TYPE_TITLE}"`.

1. List Artifact types via `${ARTIFACT_TOOL_NAME}` (`type_query: "${ARTIFACT_TYPE_TITLE}"`) and select `"${ARTIFACT_TYPE_TITLE}"` (ask user to disambiguate if multiple match).
2. Create Artifact from `type_url` with a brief-derived `title` and no files initially, then populate per the returned type instructions; if unlisted, state so plainly and offer an alternative way to build ${ARTIFACT_NOUN_PHRASE}.
</artifact_type_creation>
