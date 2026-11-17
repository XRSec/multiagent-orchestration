<!--
name: "Tool Description: Background monitor push notification guidance"
description: "Guidance to send push notifications from Monitor only when events materially change the user's next action"
ccVersion: "2.1.232"
variables:
  - "PUSH_NOTIFICATION_TOOL_NAME"
-->

Send a ${PUSH_NOTIFICATION_TOOL_NAME} only when an event materially changes what the user should do next (e.g., an error appeared, an awaited status flipped) — not for every event.
