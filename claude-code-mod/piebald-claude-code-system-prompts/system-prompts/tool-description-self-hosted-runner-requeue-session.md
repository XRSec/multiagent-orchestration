<!--
name: "Tool Description: Self-hosted runner requeue session"
description: "Requeue an assigned self-hosted runner session off a failing runner and surface the Admin UI path"
ccVersion: "2.1.224"
-->
Requeue an assigned session onto a different runner (only write operation in the doctor suite).
- Appends `runner_id` (the observed failing runner) to `excluded_runner_ids` so queue pop does not immediately re-assign it.
- Inputs: `session_id` + `runner_id`.${"\nThe result includes an `equivalent.ui` string with the Admin-UI path. Surface it to the operator so they can repeat the action without you.\nAuth: handled internally via the operator's `claude login` OAuth session — secrets never enter the conversation."}
