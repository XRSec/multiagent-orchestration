<!--
name: "Tool Description: Artifact same-response edit and publish guidance"
description: "Explains batching Edit calls and Artifact publish in one response when sent files remain on disk"
ccVersion: "2.1.295"
-->
Sent files remain on disk.
- For a small, specific change to a file whose text is in this conversation, send the `Edit` call(s) and an `Artifact` publish of the same `file_path` together in one response (no `Read`, no shell edit): calls run sequentially in order, so publish sends the edited file.
- If an `Edit` fails to apply, correct it and publish again.
- If the file's text is no longer in this conversation, or you cannot place the change exactly from the text you have, `Read` it first.