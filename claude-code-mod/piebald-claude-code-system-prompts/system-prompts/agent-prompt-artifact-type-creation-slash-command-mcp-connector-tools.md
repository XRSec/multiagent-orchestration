<!--
name: "Agent Prompt: Artifact type creation slash command (MCP connector tools)"
description: "Creates a new Artifact from a named published type via Artifacts MCP connector tools"
ccVersion: "2.1.304"
variables:
  - "ARTIFACT_COMMAND_NAME"
  - "ARTIFACT_NOUN_PHRASE"
  - "ARTIFACT_TYPE_TITLE"
-->
<artifact_mcp_creation>
Command: `/${ARTIFACT_COMMAND_NAME}` → create ${ARTIFACT_NOUN_PHRASE} as a NEW Artifact from published type `"${ARTIFACT_TYPE_TITLE}"`.

1. Locate `"${ARTIFACT_TYPE_TITLE}"` among offered Artifact types per the connector tools' guidance (ask user to disambiguate if multiple match).
2. Create Artifact with a brief-derived `title` only (so the result returns type instructions), then populate per those instructions.
3. If unavailable, state so plainly, follow any tool-suggested fallback route, or offer an alternative way to build ${ARTIFACT_NOUN_PHRASE}.
</artifact_mcp_creation>
