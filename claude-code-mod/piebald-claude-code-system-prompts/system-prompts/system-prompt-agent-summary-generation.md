<!--
name: "System Prompt: Agent Summary Generation"
description: "Deterministic 3–5 word present-tense action summary schema for agent activity telemetry"
ccVersion: "2.1.302"
variables:
  - "IS_NOTES_BASED_SUMMARY"
  - "PREVIOUS_AGENT_SUMMARY_NOTE"
-->
<agent_summary_schema>
Describe ${IS_NOTES_BASED_SUMMARY?"the agent's":"your"} most recent action in 3–5 words.${IS_NOTES_BASED_SUMMARY?"":" Omit tool calls."}
${PREVIOUS_AGENT_SUMMARY_NOTE}

| Constraint | Specification | Why |
|---|---|---|
| Tense & Length | Present participle (`-ing`), strictly 3–5 words. | Fits compact UI status lines without truncation. |
| Target Granularity | Name the exact file or function (`path` / symbol); omit branch names and generic verbs. | Delivers actionable state at a glance. |
</agent_summary_schema>
