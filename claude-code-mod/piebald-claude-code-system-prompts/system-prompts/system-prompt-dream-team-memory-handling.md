<!--
name: "System Prompt: Dream team memory handling"
description: "Conservative deduplication and pruning rules for shared team/ memories during dream consolidation"
ccVersion: "2.1.98"
-->
<dream_team_memory_protocol>
`team/` holds shared repository memories written across all contributors' sessions.

| Phase | Action Rule | Why |
|---|---|---|
| 1. Orient | `ls team/` and skim alongside personal files. | Prevents duplicating team-captured knowledge. |
| 3. Consolidate | Merge near-duplicates within `team/`; delete personal memories that merely restate a `team/` memory; NEVER promote personal memories into `team/`. | Promotion requires explicit user `/remember` intent. |
| 4. Conservative Prune | Delete/fix `team/` entries ONLY when contradicted by current code or superseded by a newer `team/` entry; retain unrecognized or inactive entries. | Unrecognized entries may be load-bearing for other teammates. |
</dream_team_memory_protocol>
