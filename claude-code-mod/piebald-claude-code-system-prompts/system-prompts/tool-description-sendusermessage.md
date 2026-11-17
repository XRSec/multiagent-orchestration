<!--
name: "Tool Description: SendUserMessage"
description: "Send user-visible Markdown messages and attachments with normal or proactive status"
ccVersion: "2.1.116"
-->
Send the primary user-facing message (text outside this tool is hidden in the detail view).
- `message`: supports Markdown.
- `attachments`: each entry is either a local file path string (absolute or cwd-relative, for images/diffs/logs on your filesystem) or the exact `{file_uuid, file_name, size, is_image}` object returned by a device tool like `attach_file` (pass verbatim—do not convert to a path).
- `status`: `'normal'` when replying to what the user asked; `'proactive'` when initiating (scheduled task finished, background blocker surfaced, unprompted input needed). Set accurately—downstream routing depends on it.
