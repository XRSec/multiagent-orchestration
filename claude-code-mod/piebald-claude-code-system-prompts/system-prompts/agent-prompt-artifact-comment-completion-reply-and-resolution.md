<!--
name: "Agent Prompt: Artifact comment completion reply and resolution"
description: "Post-action reply and thread-resolution protocol for Artifact comment workers"
ccVersion: "2.1.269"
variables:
  - "RENDER_ARTIFACT_ACTION_REFERENCE_FN"
  - "FORMAT_ARTIFACT_ACTION_FN"
-->
<artifact_comment_completion_protocol>
| Thread State | Required Action |
|---|---|
| Comment marked `"awaiting reply"` | Post a concise completion reply stating what was done (even if an earlier reply exists). |
| No `"awaiting reply"` + existing reply covers ask | Skip duplicate reply. |
| Thread open + conversation inactive | Resolve via ${RENDER_ARTIFACT_ACTION_REFERENCE_FN('Artifact tool, action "resolve"',()=>FORMAT_ARTIFACT_ACTION_FN("resolve"))}. |
| Thread already resolved | Leave resolved; never attempt to reopen (human-only action). |
</artifact_comment_completion_protocol>
