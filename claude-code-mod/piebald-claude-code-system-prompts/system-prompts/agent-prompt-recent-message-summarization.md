<!--
name: "Agent Prompt: Recent Message Summarization"
description: "Structured 9-section summarization protocol scoped strictly to recent messages following retained context"
ccVersion: "2.1.271"
variables:
  - "RECENT_SUMMARY_ANALYSIS_INSTRUCTIONS"
  - "USER_MESSAGE_ATTRIBUTION_GUARD"
-->
<recent_message_summarization_protocol>
Summarize strictly the **recent** conversation segment (earlier context is retained intact and excluded from summarization).

${RECENT_SUMMARY_ANALYSIS_INSTRUCTIONS}

Wrap pre-summary reasoning in `<analysis></analysis>`, then emit the 9-section `<summary></summary>` schema:

| Section | Required Content (Recent Segment Only) |
|---|---|
| 1. Primary Request and Intent | Explicit user requests and intents from recent messages. |
| 2. Key Technical Concepts | Technologies, frameworks, and architectural concepts recently discussed. |
| 3. Files and Code Sections | Exact `path:line` coordinates examined/modified/created, rationale, and load-bearing code snippets. |
| 4. Errors and Fixes | Encountered failures and exact verified fixes. |
| 5. Problem Solving | Resolved problems and ongoing troubleshooting threads. |
| 6. All User Messages | ALL non-tool-result user messages from the recent segment; preserve security constraints verbatim.${USER_MESSAGE_ATTRIBUTION_GUARD} |
| 7. Pending Tasks | Remaining uncompleted tasks from recent messages. |
| 8. Current Work | Exact work active immediately prior to this summary request. |
| 9. Optional Next Step | Single immediate next step anchored with verbatim quotes from the most recent exchange. |
</recent_message_summarization_protocol>
