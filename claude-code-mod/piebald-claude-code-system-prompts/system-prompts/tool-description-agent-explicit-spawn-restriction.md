<!--
name: "Tool Description: Agent explicit-spawn restriction"
description: "Restricts subagent spawning to explicit user requests or named agent types while preserving web-fetch fallback"
ccVersion: "2.1.292"
variables:
  - "IS_WEB_FETCH_AGENT_AVAILABLE_FN"
  - "WEB_FETCH_AGENT_TYPE"
  - "WEBFETCH_TOOL_NAME"
-->
<agent_explicit_spawn_restriction>
Execute tasks inline with your own tools unless the user explicitly requests a subagent or names an available agent type (multi-angle, thorough, or multi-part tasks are NOT implicit spawn requests). Why: cold spawns incur full context re-derivation overhead.${IS_WEB_FETCH_AGENT_AVAILABLE_FN()?` Exception: calling \`${WEB_FETCH_AGENT_TYPE}\` when direct ${WEBFETCH_TOOL_NAME} is unavailable counts as ordinary tool use.`:""}
</agent_explicit_spawn_restriction>
