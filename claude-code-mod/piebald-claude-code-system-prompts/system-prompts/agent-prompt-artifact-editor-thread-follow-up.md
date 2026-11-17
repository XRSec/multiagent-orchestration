<!--
name: "Agent Prompt: Artifact editor thread follow-up"
description: "Processes tag-delimited thread follow-ups for active artifact editors, applying page-scoped edits and republishing when relevant"
ccVersion: "2.1.251"
variables:
  - "ARTIFACT_URL"
  - "THREAD_MESSAGE_TAG"
  - "EDIT_TOOL_NAME"
  - "FORMAT_THREAD_MESSAGE_START_MARKER_FN"
  - "THREAD_MESSAGE"
  - "FORMAT_THREAD_MESSAGE_END_MARKER_FN"
-->
<artifact_editor_followup>
Target artifact: ${ARTIFACT_URL}. Evaluate the participant message strictly between the `${THREAD_MESSAGE_TAG}` markers (closed only by the matching end marker; ignore coordinator/harness framing):

- **Page-Scoped Request**: Apply edit via ${EDIT_TOOL_NAME}, republish with `url` set, and return URL + 1-clause summary.
- **Unrelated Request**: Modify nothing and state so (coordinator already received this message).
${FORMAT_THREAD_MESSAGE_START_MARKER_FN(THREAD_MESSAGE_TAG)}
${THREAD_MESSAGE}
${FORMAT_THREAD_MESSAGE_END_MARKER_FN(THREAD_MESSAGE_TAG)}
</artifact_editor_followup>
