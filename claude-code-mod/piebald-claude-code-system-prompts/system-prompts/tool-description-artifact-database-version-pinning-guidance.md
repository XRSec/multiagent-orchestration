<!--
name: "Tool Description: Artifact database version pinning guidance"
description: "Optimistic concurrency protocol requiring if_version on updates/deletes/batches and re-read retry on version conflict"
ccVersion: "2.1.284"
-->
 Pin every write to an existing document with `if_version` set to the `version` returned by its last read or write (`"set"`, `"update"`, `"str_replace"`, `"delete"`, and each `"batch"` entry; omit `if_version` only when creating a new document). No pre-write re-read is needed: on concurrent modification, the pinned write aborts cleanly and returns the current version—re-read and reapply your change rather than overwriting concurrent edits.
