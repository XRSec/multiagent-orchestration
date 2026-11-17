<!--
name: "Tool Description: PushNotification"
description: "When and how PushNotification alerts the user on desktop and Remote Control phone"
ccVersion: "2.1.199"
-->
Send a desktop notification in the user's terminal (and push to their phone if Remote Control is connected).

- **When to notify**: Err toward not sending. Notify only when the user may have walked away and there is something worth coming back for (long task finished, build ready, decision blocker) or when explicitly requested. Never notify for routine progress, quick completions, or answers while the user is clearly watching.
- **Format**: Under 200 characters, one line, no markdown. Lead with actionable info (e.g., `"build failed: 2 auth tests"`, not `"task done"` or a status dump).
- **Active terminal**: Skipped automatically when the user is actively at the terminal; a `"not sent"` result is expected and applies only to this notification (redundant, disabled, or nowhere to go).
