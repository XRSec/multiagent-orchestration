<!--
name: "Tool Description: Report code-review findings"
description: "Report verified code-review findings as a typed list for host UI rendering"
ccVersion: "2.1.196"
-->
Report verified code-review findings as a typed list for host UI rendering.
- Use ONLY when active code-review instructions specify this tool; otherwise follow their output format.
- Call once with verified findings ranked most-severe first (`[]` if none survived); do not duplicate findings as text.
- When re-reporting after fixes (only if apply instructions ask), set `outcome` on each finding to what actually happened.
