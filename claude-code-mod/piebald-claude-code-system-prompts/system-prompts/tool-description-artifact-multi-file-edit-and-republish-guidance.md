<!--
name: "Tool Description: Artifact multi-file edit and republish guidance"
description: "Batches Edit calls and artifact republishing in the same turn, skipping redundant reads when source is already in context"
ccVersion: "2.1.300"
variables:
  - "EDIT_TOOL_NAME"
  - "READ_TOOL_NAME"
-->
For multi-file edits or major page rewrites, apply changes via `${EDIT_TOOL_NAME}` (not shell commands) and issue the republish call with the same `file_path` in the **same turn** without intermediate `${READ_TOOL_NAME}` calls (read first only if source is absent from context or exact placement is uncertain). Calls execute sequentially: if any `${EDIT_TOOL_NAME}` fails, the paired publish is rejected and the artifact remains unchanged—fix the `${EDIT_TOOL_NAME}` call and republish.
