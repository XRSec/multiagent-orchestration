<!--
name: "Agent Prompt: Project thread status card classifier other-thread ask rule"
description: "Treats asks posed and answerable in sibling linked Project threads as non-blocking waits while keeping local/external asks gated"
ccVersion: "2.1.323"
-->
<project_other_thread_ask_rule>
| Ask Location & Target | Classification | Why |
|---|---|---|
| Question/go-ahead posed by another linked Project thread (`[title](#cmsg_…)`, not a single-message `[title](#cmsg_…/cmsg_…)`) AND explicitly answerable there (not here) | Non-blocking wait (never `needs_reply` or `needs_approval`), even if this thread claims it cannot proceed without it. | The sibling thread's own card displays and receives that answer. |
| Ask answerable in this thread, PR, Slack, email, main chat, or unspecified location; new request to carry elsewhere; go-ahead for this thread to post/act elsewhere; or prior `blocked` state not answered/dropped/moved | Standard `needs_reply` / `needs_approval` gating applies. | Gate resolution depends on where the owner answers, not where work lands. |
</project_other_thread_ask_rule>
