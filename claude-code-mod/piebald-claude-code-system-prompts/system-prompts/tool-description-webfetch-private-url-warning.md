<!--
name: "Tool Description: WebFetch private URL warning"
description: "Warns that WebFetch fails on authenticated/private URLs and appends standard WebFetch usage notes"
ccVersion: "2.1.299"
variables:
  - "WEBFETCH_OBSERVABLE_ACTION_NOTE"
  - "FORMAT_ARTIFACT_LINK_NOTE_FN"
  - "ARTIFACT_LINK_HANDLING_MODE"
  - "WEBFETCH_TOOL_DESCRIPTION_BLOCK_FN"
-->
${WEBFETCH_OBSERVABLE_ACTION_NOTE}WebFetch FAILS on authenticated or private URLs (e.g., Google Docs, Confluence, Jira, GitHub). Use a specialized authenticated MCP tool instead.
${FORMAT_ARTIFACT_LINK_NOTE_FN(ARTIFACT_LINK_HANDLING_MODE)}${WEBFETCH_TOOL_DESCRIPTION_BLOCK_FN()}
