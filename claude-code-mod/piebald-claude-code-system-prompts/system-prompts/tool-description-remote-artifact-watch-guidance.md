<!--
name: "Tool Description: Remote artifact watch guidance"
description: "Explains durable remote artifact wake subscriptions, registration, comment wakes, and watch-status reporting"
ccVersion: "2.1.271"
variables:
  - "HAS_ARTIFACT_COMMENTS"
  - "ARTIFACT_WATCH_STATUS_GUIDANCE"
  - "REMOTE_ARTIFACT_WATCH_NOTE"
-->
**Watching**:
- Durable wake subscription held by the artifact service (not a live connection): nothing streams between turns; this session wakes with a new turn when a watched artifact is republished elsewhere${HAS_ARTIFACT_COMMENTS?", or when a comment on it is sent to Claude":""}.
- On wake, re-read the artifact${HAS_ARTIFACT_COMMENTS?" (and its comments, on a comment wake)":""} before editing.
- Actions: each publish result reports whether watch registration started; `action: "watch"` with `url` watches an artifact you did not just publish; `action: "status"` lists registered watches and wake triggers (or one watch if `url` is given); `action: "unwatch"` with `url` stops a watch.${HAS_ARTIFACT_COMMENTS?' Plain comments never wake this session; Claude reads them with `action: "comments"` when the person asks.':ARTIFACT_WATCH_STATUS_GUIDANCE} ${REMOTE_ARTIFACT_WATCH_NOTE}
