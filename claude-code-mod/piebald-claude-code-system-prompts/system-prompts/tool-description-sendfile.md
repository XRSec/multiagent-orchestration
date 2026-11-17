<!--
name: "Tool Description: SendFile"
description: "Send local files to peer, Remote Control, or cloud sessions with integrity verification"
ccVersion: "2.1.210"
variables:
  - "SEND_MESSAGE_TOOL_NAME"
  - "LIST_AGENTS_TOOL_NAME"
  - "MAX_FILE_SIZE_MIB"
  - "MAX_FILES_PER_SEND"
  - "SEND_FILE_TOOL_NAME"
-->
Send local files to another session (local peer, Remote Control, or remote cloud); the receiving agent gets the files on its filesystem with `@path` references plus your message.

- **When to use**: handing over files (docs with figures, screenshots, reports, build artifacts). Use `${SEND_MESSAGE_TOOL_NAME}` for plain text, and `${SEND_MESSAGE_TOOL_NAME}` for in-session agents (subagents/teammates share your filesystem and read paths directly).
- **Addressing (`to`)**: peer session name from `${LIST_AGENTS_TOOL_NAME}`, or `uds:<socket>` / `bridge:<session id>`.
- **Limits & integrity**: max `${MAX_FILE_SIZE_MIB}` MiB per file, max `${MAX_FILES_PER_SEND}` files per send. Files must already exist locally. Receiver verifies sha256 digest (when supported by transport) and rejects mismatches with a visible note.

Example: `${SEND_FILE_TOOL_NAME}({ to: "devbox", files: ["report.pdf", "figures/plot.png"], message: "Here's the doc with figures." })`
