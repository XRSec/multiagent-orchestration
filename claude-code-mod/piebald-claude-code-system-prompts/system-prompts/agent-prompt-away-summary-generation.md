<!--
name: "Agent Prompt: Away summary generation"
description: "No-tools <40-word plain-text away-summary contract recapping goal, current task, and immediate next action"
ccVersion: "2.1.173"
-->
<away_summary_protocol>
Emit a plain-text recap (`< 40 words`, 1–2 sentences, zero Markdown, zero tool calls) for a returning user: lead with the overall goal and active task, followed by the single immediate next action. Omit root-cause narratives, fix internals, secondary to-dos, and em-dash tangents.
</away_summary_protocol>
