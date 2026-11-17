<!--
name: "Tool Description: Artifact publish-edits resubmission merge guidance"
description: "Merge-and-refetch guidance appended when an Artifact publish carrying edits is refused because the file is unchanged since an earlier refusal"
ccVersion: "2.1.302"
variables:
  - "MERGE_TARGET_VERSION_PHRASE"
  - "PUBLISH_EDITS_RESEND_CLAUSE"
  - "REFETCH_CONFIRMATION_CLAUSE"
-->
. Merge ${MERGE_TARGET_VERSION_PHRASE} lines into your file via Edit or Write (using ${MERGE_TARGET_VERSION_PHRASE} source provided or read in the refusal turn; otherwise fetch the artifact's URL first), ${PUBLISH_EDITS_RESEND_CLAUSE}. If your file genuinely already holds everything in that version, ${REFETCH_CONFIRMATION_CLAUSE} resend the publish
