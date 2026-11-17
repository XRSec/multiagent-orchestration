<!--
name: "Tool Description: Artifact watch approval explanation"
description: "Approval scope and local/cloud notification behavior when watching an Artifact, including optional comment delivery and unattended replies"
ccVersion: "2.1.246"
variables:
  - "ARTIFACT_COMMENT_AUTO_REPLIES_ENABLED"
  - "HAS_ARTIFACT_COMMENTS"
-->
this session is notified on external republish (another session or page save)${ARTIFACT_COMMENT_AUTO_REPLIES_ENABLED?" and, if you can edit it and gave its link, comments on it sent to Claude reach this session and Claude may answer them unattended":""}. Local sessions hold a live background connection; cloud sessions wake with a new turn${HAS_ARTIFACT_COMMENTS?", also when a comment on any watched artifact is sent to Claude, which Claude may then read and answer":""}. Approval covers watching artifacts for the rest of this session${ARTIFACT_COMMENT_AUTO_REPLIES_ENABLED?" (turning on auto-replies for another artifact asks again)":""}; republish notifications carry no content