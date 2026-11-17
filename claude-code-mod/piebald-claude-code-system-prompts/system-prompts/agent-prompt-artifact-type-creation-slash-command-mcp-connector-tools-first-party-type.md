<!--
name: "Agent Prompt: Artifact type creation slash command (MCP connector tools, first-party type)"
description: "Creates a new Artifact from a first-party published type via Artifacts MCP connector tools"
ccVersion: "2.1.323"
variables:
  - "ARTIFACT_COMMAND_NAME"
  - "ARTIFACT_NOUN_PHRASE"
  - "ARTIFACT_TYPE_TITLE"
  - "SAY_PLAINLY_INSTRUCTION"
-->
<artifact_mcp_first_party_creation>
Command: `/${ARTIFACT_COMMAND_NAME}` → create ${ARTIFACT_NOUN_PHRASE} as a NEW Artifact from first-party type `"${ARTIFACT_TYPE_TITLE}"`.

1. Skip any quickstart step; list all offered Artifact types and select the first-party row titled `"${ARTIFACT_TYPE_TITLE}"` (prefixed with tier bracket e.g. `[core]`, or match by title if unbracketed; ask user to disambiguate if multiple match).
2. Create Artifact with a brief-derived `title` only (so the result returns type instructions), then populate per those instructions.
3. If no fitting type is offered, ${SAY_PLAINLY_INSTRUCTION} and offer an alternative way to build ${ARTIFACT_NOUN_PHRASE}.
</artifact_mcp_first_party_creation>
