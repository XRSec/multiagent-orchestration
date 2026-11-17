<!--
name: "Agent Prompt: Project thread status card classifier ask-opens-message rule"
description: "Evaluates full message tail when the thread opens with its blocking ask before explanatory prose"
ccVersion: "2.1.292"
-->
<project_ask_opens_message_rule>
Scan the entire tail rather than only the final sentence: an owner-directed question or owner-only dependency sets `needs_reply` (answer/value) or `needs_approval` (go-ahead) wherever it sits (with `needs_you` naming that need), unless later in the same tail the thread marks it handled or unnecessary. Self-answered rhetorical questions in the next sentence are not gates.
</project_ask_opens_message_rule>
