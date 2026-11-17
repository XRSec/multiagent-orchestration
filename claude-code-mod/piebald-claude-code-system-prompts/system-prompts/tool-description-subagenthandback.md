<!--
name: "Tool Description: SubagentHandback"
description: "Describes the SubagentHandback tool a subagent calls exactly once to deliver its full final report to the agent that spawned it, noting that the call ends the run and plain-text endings are not delivered"
ccVersion: "2.1.285"
variables:
  - "SUBAGENT_HANDBACK_TOOL_NAME"
-->
Deliver your final report to your caller (the spawning agent) via `${SUBAGENT_HANDBACK_TOOL_NAME}({message: <your full report>})`.

- Call once when work is complete; the call ends your run immediately, so finish everything else first and include all required details in that single report.
- Do not use for progress updates or questions; there is no recipient parameter (only goes to your caller).
- Plain text written at the end of your run is NOT delivered; only a report sent via `${SUBAGENT_HANDBACK_TOOL_NAME}` reaches your caller.
