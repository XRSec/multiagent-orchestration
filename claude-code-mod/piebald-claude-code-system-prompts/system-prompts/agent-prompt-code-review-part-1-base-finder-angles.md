<!--
name: "Agent Prompt: /code-review part 1 base finder angles"
description: "Line-by-line diff scan protocol inspecting hunks and enclosing functions for concrete runtime defects"
ccVersion: "2.1.160"
-->
### Angle A — line-by-line diff scan

Inspect every diff hunk line-by-line, then read the enclosing function for each hunk (unchanged lines in a touched function remain in scope). Evaluate each line against adversarial input, state, timing, and platform conditions for: inverted conditions, off-by-one errors, null/undefined dereferences, missing `await`, falsy-zero bugs, copy-paste wrong variables, swallowed catch errors, and unescaped regex metacharacters.
