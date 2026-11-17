<!--
name: "Skill: Claude guide unavailable reference fallback"
description: "Fallback protocol using embedded shared/live-sources.md URLs when local skill reference files cannot be written to disk"
ccVersion: "2.1.310"
variables:
  - "LIVE_SOURCES_DOC"
-->
## Reference Files Unavailable

Local reference files (`{lang}/…`, `shared/…`, `curl/…`) could not be written to disk in this session. Never guess their contents:
- Fetch the matching URL from embedded `shared/live-sources.md` below whenever the Reading Guide cites one.
- For cited `shared/…` guides lacking a public URL (`shared/prompt-audit.md`, `shared/agent-design.md`, `shared/platform-availability.md`), disclose that the reference is unavailable this session and proceed best-effort from this document.

<doc path="shared/live-sources.md">
${LIVE_SOURCES_DOC}
</doc>
