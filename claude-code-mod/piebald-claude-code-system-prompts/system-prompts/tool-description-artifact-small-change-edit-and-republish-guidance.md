<!--
name: "Tool Description: Artifact small-change edit and republish guidance"
description: "Requires small edits to already-published artifacts to precede same-response republishing without unnecessary reads"
ccVersion: "2.1.300"
variables:
  - "EDIT_TOOL_NAME"
  - "READ_TOOL_NAME"
-->
 For a small change to an artifact already published in this conversation:
- Edit with ${EDIT_TOOL_NAME} (not a shell command) and republish with the same file path in the same response: ${EDIT_TOOL_NAME} call(s) first, then publish — skip ${READ_TOOL_NAME} and do not wait for the ${EDIT_TOOL_NAME} result.
- Read the file before editing only when its text is missing from this conversation or the change cannot be placed exactly from that text.
- Calls run in order, so the publish carries the edited file. If an ${EDIT_TOOL_NAME} call fails to apply, the same-response publish is refused and the artifact stays as it was; fix the ${EDIT_TOOL_NAME} call and republish.