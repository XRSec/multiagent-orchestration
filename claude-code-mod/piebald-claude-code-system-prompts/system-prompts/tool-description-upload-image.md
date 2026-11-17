<!--
name: "Tool Description: Upload image"
description: "Describes uploading fresh computer-tool screenshots to file inputs or drag-and-drop targets with bounded retries"
ccVersion: "2.1.268"
-->
Upload a screenshot captured via the computer tool's `screenshot` action to a file input or drag-and-drop target.

- Capture right before uploading (screenshot IDs expire after a few minutes).
- Do not reuse a failed screenshot ID: capture a fresh screenshot of the same content and retry at most once (NEVER retry after user decline).
- Do not use for user-attached images or other files; use `file_upload` with the file path instead (if available).
- Target via either `ref` (specific elements, especially hidden file inputs) or `coordinate` (drag-and-drop to visible locations such as Google Docs) — provide one, not both.
