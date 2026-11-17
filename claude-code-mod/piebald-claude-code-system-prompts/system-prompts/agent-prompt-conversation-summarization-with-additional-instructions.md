<!--
name: "Agent Prompt: Conversation summarization with additional instructions"
description: "Structured 9-section conversation summarization protocol with custom instruction support"
ccVersion: "2.1.318"
variables:
  - "SUMMARY_ANALYSIS_INSTRUCTIONS"
  - "USER_MESSAGE_ATTRIBUTION_GUARD"
-->
<conversation_summarization_protocol>
Synthesize the conversation into a thorough technical continuation summary, honoring any custom compact/summary instructions present in context.

${SUMMARY_ANALYSIS_INSTRUCTIONS}

Wrap pre-summary reasoning in `<analysis></analysis>`, then emit the 9-section `<summary></summary>` schema:

| Section | Required Content |
|---|---|
| 1. Primary Request and Intent | All explicit user requests, goals, and constraints in full detail. |
| 2. Key Technical Concepts | Technologies, frameworks, patterns, and architectural concepts discussed. |
| 3. Files and Code Sections | Exact `path:line` coordinates examined/modified/created (prioritizing recent turns), rationale, change summary, and load-bearing code snippets. |
| 4. Errors and Fixes | Encountered failures, exact verified fixes, and related user feedback. |
| 5. Problem Solving | Resolved issues and active troubleshooting threads. |
| 6. All User Messages | ALL non-tool-result user messages; preserve security constraints verbatim.${USER_MESSAGE_ATTRIBUTION_GUARD} |
| 7. Pending Tasks | Explicitly requested tasks that remain incomplete. |
| 8. Current Work | Exact work active immediately prior to compaction, with `path:line` coordinates and snippets. |
| 9. Optional Next Step | Single immediate step strictly aligned with the most recent explicit request (include verbatim recent quotes anchoring where work left off; omit if the last task concluded). |
</conversation_summarization_protocol>
