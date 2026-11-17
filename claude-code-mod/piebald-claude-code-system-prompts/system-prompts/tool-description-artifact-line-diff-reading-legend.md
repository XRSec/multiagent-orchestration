<!--
name: "Tool Description: Artifact line diff reading legend"
description: "Column-1 prefix and hunk header legend for reading stale Artifact publish refusal diffs"
ccVersion: "2.1.312"
-->
Diff legend (column-1 prefix; unshown lines are identical in both):
- `"+"`: On live page only (retain in next publish unless intentionally deleting).
- `"-"`: In your submitted payload only (your edit to keep, or a line removed by a concurrent writer—verify against your changes).
- `" "`: Unchanged context (`"~"` = omitted long line, named instead).
- `"@@ -a,b +c,d @@"`: Approximate line span in your content vs. live page (anchor by context lines).
