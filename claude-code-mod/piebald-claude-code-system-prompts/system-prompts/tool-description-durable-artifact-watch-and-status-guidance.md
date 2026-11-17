<!--
name: "Tool Description: Durable artifact watch and status guidance"
description: "Durable artifact watch subscriptions, comment wakes, status checks, and registration semantics"
ccVersion: "2.1.257"
variables:
  - "HAS_ARTIFACT_COMMENTS"
  - "COMMENTS_OFF_SENTENCE"
-->
**Watching for republishes** (durable wake subscription held by the artifact service, not a live connection):
- Wake behavior: this session wakes with a new turn when the watched artifact is republished elsewhere${HAS_ARTIFACT_COMMENTS?", or when a comment on it is sent to Claude":""}. Nothing streams in between, so on a wake re-read the artifact${HAS_ARTIFACT_COMMENTS?" (and its comments, on a comment wake)":""} before editing.${HAS_ARTIFACT_COMMENTS?' Plain comments never wake this session — read them with `action: "comments"` when the user asks.':COMMENTS_OFF_SENTENCE}
- Registration & actions: publishing an artifact starts registering its watch in the background (the result line reports whether registration began, was skipped, or was already registered). Use `action: "status"` (optionally with `url`) to list registered watches and their wake triggers, `action: "watch"` with `url` to watch an artifact you did not just publish, and `action: "unwatch"` with `url` to stop one.
- Reporting invariant: do not claim you are watching an artifact unless a watch result, `status`, or a publish result's "already registered" line confirms it ("arming" is not yet a watch).