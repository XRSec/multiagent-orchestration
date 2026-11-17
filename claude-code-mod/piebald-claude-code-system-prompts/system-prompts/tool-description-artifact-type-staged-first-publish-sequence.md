<!--
name: "Tool Description: Artifact type staged first-publish sequence"
description: "Staged multi-call publish sequence for Artifact types requiring an index and initial content file first, then remaining files"
ccVersion: "2.1.287"
variables:
  - "ARTIFACT_TYPE_FILE_STORAGE_CONFIG"
  - "ARTIFACT_TYPE_FIRST_PUBLISH_CONFIG"
  - "ARTIFACT_FIRST_PUBLISH_CALL_PREFIX"
-->
Write files at their relative paths under one folder in your scratchpad or working directory using your file-writing tool directly (it creates folders; no shell step or generator script) in this order:
1. `${ARTIFACT_TYPE_FILE_STORAGE_CONFIG.index}` FIRST, complete, ${ARTIFACT_TYPE_FIRST_PUBLISH_CONFIG.indexHolds} (and its `designSystems` record when using a design system).
2. ${ARTIFACT_TYPE_FIRST_PUBLISH_CONFIG.first}.
3. Publish ${ARTIFACT_TYPE_FIRST_PUBLISH_CONFIG.written} immediately in one call: ${ARTIFACT_FIRST_PUBLISH_CALL_PREFIX} ${ARTIFACT_TYPE_FIRST_PUBLISH_CONFIG.firstSent}, plus any design-system files. (${ARTIFACT_TYPE_FIRST_PUBLISH_CONFIG.onlyOne} is complete after this first call.)
4. Without pausing for the user, write ${ARTIFACT_TYPE_FIRST_PUBLISH_CONFIG.rest} and publish with the same `url` and `root` (all in one call, or incrementally via `file_path` for one new file's absolute path and `files` for other new ones). Send only unsent files per call; each publish retains previously sent files.
