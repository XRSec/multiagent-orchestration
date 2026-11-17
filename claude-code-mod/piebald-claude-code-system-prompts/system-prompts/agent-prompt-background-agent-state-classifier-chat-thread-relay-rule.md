<!--
name: "Agent Prompt: Background agent state classifier chat-thread relay rule"
description: "Overrides state classification for chat-thread relay agents where named participants act as the user"
ccVersion: "2.1.295"
-->
<chat_thread_relay_rule>
Precedence: Overrides conflicting general rules above for agents communicating via chat-thread posts (tail contains agent notes and posted messages in order).

| Signal | Classification Rule |
|---|---|
| Named Participant Gate | Treat the named person being answered/served as the user (`"Awaits Priya's go"`, `"Priya to pick A/B"`, `"needs Priya's approval/review/merge/publish"`). Open gates, labeled questions, or person-only steps classify as `blocked` (`needs = ask`) anywhere in the tail until answered, handled, or dropped. |
| Scheduled Check-In Beside Open Gate | `"Next check in 20m"` beside an open user gate is a passive safety net—classify as `blocked` (if no open gate, standard re-poll `working` rules apply). |
| Sticky `blocked` on No-Op Check-In | Prior state `blocked` + no new progress/reply (`"no reply yet"`) remains `blocked` with unchanged `needs`. |
| Third-Party Waits & Offers | Waits on external reviewers, code owners, stamp channels, CI, merge queues, deploys, or timers (plus optional post-delivery offers) classify as `done` (or `working` if queued + agent actively re-checks). |
</chat_thread_relay_rule>
