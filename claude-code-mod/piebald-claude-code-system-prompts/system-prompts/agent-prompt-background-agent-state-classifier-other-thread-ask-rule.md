<!--
name: "Agent Prompt: Background agent state classifier other-thread ask rule"
description: "Treats asks posed and answerable in sibling project threads as non-blocking waits while keeping local/external asks gated"
ccVersion: "2.1.323"
-->
<other_thread_ask_rule>
| Ask Location & Target | Classification | Why |
|---|---|---|
| Question/go-ahead posed by another project thread (`[title](#cmsg_…)`) AND explicitly answerable there (not here) | Non-blocking wait (never `blocked`), even if agent says it cannot proceed without it. | The sibling thread owns that prompt and receives the user's answer. |
| Ask answerable in this thread, PR, Slack, email, main chat, or unspecified location; new request for user to carry elsewhere; go-ahead for agent to post/act elsewhere; or prior `blocked` state not answered/dropped/moved | `blocked` (standard gating rules apply). | Gate resolution depends on where the user answers, not where work lands. |
</other_thread_ask_rule>
