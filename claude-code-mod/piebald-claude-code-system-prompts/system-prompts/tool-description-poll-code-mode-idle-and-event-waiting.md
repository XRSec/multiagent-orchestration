<!--
name: "Tool Description: Poll Code Mode idle and event waiting"
description: "Code Mode Poll waiting, immediate event delivery, user-message arrival, cache-aware wait limits, and empty delivery meaning"
ccVersion: "2.1.318"
variables:
  - "NO_PENDING_EVENTS_MESSAGE"
  - "NO_PENDING_EVENTS_GUIDANCE"
-->
Calling this tool with nothing else to do signals you are idle.

- **Pending events**: Returned immediately as this call's result.
- **No pending events**: Waits until a script ends, another event arrives, or the user sends a message.
- **User message arrival**: Usually returns (with literal `"${NO_PENDING_EVENTS_MESSAGE}"` if no event came with it), followed by the message in the same turn as user text; nothing ends your turn automatically.
- **Cache/queue limits**: Wait also ends shortly before prompt cache expiry with a line naming what is still running; if something is queued for end of turn, it ends by then with `"${NO_PENDING_EVENTS_MESSAGE}"`. ${NO_PENDING_EVENTS_GUIDANCE}
