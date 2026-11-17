<!--
name: "Agent Prompt: Background agent state classifier ask-opens-message rule"
description: "Evaluates full message tail when the agent opens with its blocking ask before explanatory prose"
ccVersion: "2.1.292"
-->
<ask_opens_message_rule>
Scan the entire tail rather than only the final sentence: a direct user question or user-only dependency is a `blocked` gate regardless of position, unless resolved later in the same tail (answered by the agent itself, handled, or marked unnecessary). Self-answered rhetorical questions (`"Why did X fail? Y was stale…"`) and optional offers (`"if you want, I can also…"`) are `done`.
</ask_opens_message_rule>
