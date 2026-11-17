<!--
name: "Tool Description: Code review command"
description: "Describes the code review command, its effort levels, PR comment mode, fix mode, and --max-findings limit, with optional ultra cloud review and post-flag notes"
ccVersion: "2.1.311"
variables:
  - "EFFORT_LEVELS"
  - "ULTRA_CLOUD_REVIEW_CLAUSE"
  - "ULTRA_POST_FLAG_NOTE"
-->
Review the current diff, or a PR number/branch/path target, for correctness bugs (plus reuse/simplification/efficiency cleanups where the recipe covers them).
- Effort level (first arg, before target): `${EFFORT_LEVELS.join("|")}` (few high-confidence findings → many, some uncertain${ULTRA_CLOUD_REVIEW_CLAUSE}); defaults to the last used level.
- Flags: `--comment` posts findings as inline PR comments; `--fix` applies findings to the working tree after review; `--max-findings <n>` caps findings at `n` (or `--max-findings all`; persists until `--max-findings default`).${ULTRA_POST_FLAG_NOTE}
