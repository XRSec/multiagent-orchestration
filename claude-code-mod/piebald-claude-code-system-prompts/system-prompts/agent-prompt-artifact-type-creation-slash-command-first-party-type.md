<!--
name: "Agent Prompt: Artifact type creation slash command (first-party type)"
description: "Creates a new Artifact from a first-party published type via built-in Artifact tool without quickstart"
ccVersion: "2.1.323"
variables:
  - "ARTIFACT_COMMAND_NAME"
  - "ARTIFACT_NOUN_PHRASE"
  - "ARTIFACT_TYPE_TITLE"
  - "IS_ARTIFACT_QUICKSTART_ENABLED_FN"
  - "ARTIFACT_TOOL_NAME"
  - "SAY_PLAINLY_INSTRUCTION"
-->
<artifact_first_party_creation>
Command: `/${ARTIFACT_COMMAND_NAME}` → create ${ARTIFACT_NOUN_PHRASE} as a NEW Artifact from first-party type `"${ARTIFACT_TYPE_TITLE}"`.

1. ${IS_ARTIFACT_QUICKSTART_ENABLED_FN()?"No quickstart call is needed: use":"Use"} `${ARTIFACT_TOOL_NAME}` (`type_query: "${ARTIFACT_TYPE_TITLE}"`) to list available types and select the first-party row (prefixed with tier bracket e.g. `[core]`; ask user to disambiguate if multiple match).
2. Create Artifact from its `type_url` with a brief-derived `title` and no files initially (to receive type instructions), then populate per those instructions.
3. If no matching first-party type is listed, ${SAY_PLAINLY_INSTRUCTION} and offer an alternative way to build ${ARTIFACT_NOUN_PHRASE}.
</artifact_first_party_creation>
