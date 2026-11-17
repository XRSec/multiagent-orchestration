<!--
name: "Tool Description: Session artifact watch lifecycle"
description: "Live artifact watch setup, version-merge before republish, comment auto-replies, session restore, and status rules"
ccVersion: "2.1.274"
variables:
  - "ARTIFACT_TOOL_NAME"
  - "HAS_ARTIFACT_COMMENTS"
  - "COMMENTS_OFF_SENTENCE"
-->
**Watching for republishes**:
- **Auto-subscribe on publish**: publishing starts a background live-change subscription (result line reports started, skipped, or already connected; `status` shows actual connection; reconnects automatically on drop).
- **Manual watch & actions**: `action: "watch"` with `url` watches an un-published artifact or restarts a stopped watch (external republishes start no turn and send no notification). `action: "status"` lists watches (pass `url` for one); `action: "unwatch"` with `url` stops one.
- **Version merge**: if an Artifact result warns of a newer published version, fetch the URL via `${ARTIFACT_TOOL_NAME}` (`action: "read"`, not your local file) and merge edits before publishing. If a publish is refused due to change, follow the refusal's version to merge.${HAS_ARTIFACT_COMMENTS?' A comment on a watched artifact that is sent to Claude wakes this session, but only while that artifact's `status` row says auto-replies armed (when comment auto-replies are on for this session, a publish arms those, and so does `action: "watch"` on an artifact the user can edit whose link the user gave in their own message — never on one the user can only view); plain comments never notify this session — read them with `action: "comments"` when the user asks.':COMMENTS_OFF_SENTENCE}
- **Lifecycle & scope**: watches are session-local (visible/stoppable in `/tasks`) and only held by main-loop sessions (interactive, SDK, or background—never subagent, teammate, or print sessions).
- **Resume**: ${HAS_ARTIFACT_COMMENTS?"After a `--resume` or `--continue` in an interactive terminal, the watch on the artifact this session most recently published or read usually comes back, along with every watch that was replying to comments (replying again, unless the user had stopped it); other clients may restore nothing. `status` shows what is armed.":"After a `--resume` or `--continue` in an interactive terminal, the watch on the artifact this session most recently published or read usually comes back; other clients may restore nothing. `status` shows what is armed."}
- **Truthfulness**: do not claim you are watching an artifact unless a watch result, `status`, or a publish result's `"already connected"` line confirms it (`"arming"` is not yet a watch).
