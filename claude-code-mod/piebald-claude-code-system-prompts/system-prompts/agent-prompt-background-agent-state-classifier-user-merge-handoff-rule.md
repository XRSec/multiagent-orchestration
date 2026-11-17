<!--
name: "Agent Prompt: Background agent state classifier user merge handoff rule"
description: "Classifies finished PR/branch handoffs awaiting the user's own merge or review as done unless open questions or follow-ups remain"
ccVersion: "2.1.314"
-->
<user_merge_handoff_rule>
| Tail Pattern | Classification |
|---|---|
| Finished PR/branch/release handed over for user's own merge/review (`"ready for you to merge"`, `"waiting on you to merge"`, `"needs your review"`, `"over to you"`) with zero follow-up agent work or open questions (including subsequent no-change reports) | `done` (`output.result` = handoff summary, no `needs`). |
| Tail asks a question, requests go-ahead/choice/value/access, requires a pre-completion user step (`"run the backfill"`, `"grant push access"`, `"review plan before I build"`), or states agent follow-up work after user acts | Standard `blocked` rules apply. |
</user_merge_handoff_rule>
