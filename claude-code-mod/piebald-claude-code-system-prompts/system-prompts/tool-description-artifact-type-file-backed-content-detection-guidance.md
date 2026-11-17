<!--
name: "Tool Description: Artifact type file-backed content detection guidance"
description: "Inspect Artifact type index before writing to check file-backed content, read changed files, and republish safely"
ccVersion: "2.1.273"
variables:
  - "HAS_VERIFIED_INLINE_ARTIFACT_TYPE_INSTRUCTIONS"
  - "FORMAT_ARTIFACT_FILE_LIST_ACTION_FN"
  - "ARTIFACT_TYPE_INDEX_FILENAME"
  - "FORMAT_ARTIFACT_FILE_READ_ACTION_FN"
  - "FORMAT_ARTIFACT_FILE_UPDATE_PUBLISH_INSTRUCTIONS_FN"
  - "ARTIFACT_URL"
-->
${HAS_VERIFIED_INLINE_ARTIFACT_TYPE_INSTRUCTIONS?"Its type's instructions (below) name a type whose content may live in the Artifact's own files under `project/` rather than its store. Whether this Artifact's does":"It declares a shared store and carries an instructions file (below; found on it, not verified as the type's) naming a type whose content would live in the Artifact's own files under `project/`. Whether this Artifact's content does"} is determined by those instructions:
1. List its files (${FORMAT_ARTIFACT_FILE_LIST_ACTION_FN()}) and read `${ARTIFACT_TYPE_INDEX_FILENAME}` if present before writing anything.
2. If content is file-backed, read each file you will change (${FORMAT_ARTIFACT_FILE_READ_ACTION_FN()}) and ${FORMAT_ARTIFACT_FILE_UPDATE_PUBLISH_INSTRUCTIONS_FN(ARTIFACT_URL)}