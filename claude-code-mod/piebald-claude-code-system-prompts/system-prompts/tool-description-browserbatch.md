<!--
name: "Tool Description: BrowserBatch"
description: "Tool description for BrowserBatch, which executes multiple browser tool calls sequentially in one round trip"
ccVersion: "2.1.120"
-->
Execute multiple browser tool calls sequentially in one round trip.
- Item format: `{name, input}` (`input` matches the standalone tool schema).
- Execution: Runs sequentially (never parallel) and stops on the first error. Use whenever 2+ steps ahead are predictable (e.g., navigate, click, type, Return, screenshot).
- Permissions: Checked per item; navigating to an unpermitted domain fails the next item and halts the batch.
- Output & coordinates: Screenshots/images return interleaved with outputs. Coordinates in a batch MUST reference the screenshot taken before that batch call.
- Constraint: `browser_batch` cannot be nested.
