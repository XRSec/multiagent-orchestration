<!--
name: "Tool Description: Live Artifact watch guidance (app wording)"
description: "Guidance for live Artifact watches, merging newer published versions, comment auto-replies, watch status, and subscription reporting"
ccVersion: "2.1.274"
variables:
  - "HAS_ARTIFACT_COMMENTS"
  - "COMMENTS_OFF_SENTENCE"
  - "ARTIFACT_WATCH_CONFIRMATION_GUARD"
-->
**Watching**:
- Each publish result states whether this session began arming a watch on that artifact for external republishes (watches start no turn and send no notification).
- If an Artifact result opens with a newer-version notice, fetch the artifact's URL with `action: "read"` (not its local file) and merge your edits onto that version before publishing.
- If a publish is refused because the artifact changed, follow the refusal (which usually provides the version to merge).
- Actions: `action: "watch"` with `url` watches an artifact you did not just publish or restarts a stopped watch; `action: "status"` lists this session's watches (or one watch if `url` is given); `action: "unwatch"` with `url` stops a watch. Users can also view and stop watches in `/tasks`.${HAS_ARTIFACT_COMMENTS?' A comment sent to Claude on a watched artifact wakes this session only while that artifact's `status` row says auto-replies armed. A publish arms that when comment auto-replies are on for this session; so does `action: "watch"` on an artifact the person can edit whose link they gave in their own message. Plain comments never notify this session; Claude reads them with `action: "comments"` when the person asks.':COMMENTS_OFF_SENTENCE} ${ARTIFACT_WATCH_CONFIRMATION_GUARD}
