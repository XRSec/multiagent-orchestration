<!--
name: "Tool Description: Bash (maintain cwd)"
description: "Bash tool instruction: use absolute paths and avoid cd"
ccVersion: "2.1.113"
-->
Maintain your current working directory using absolute paths; avoid `cd` unless the user explicitly requests it. Never prepend `cd <current-directory>` to a `git` command—`git` already targets the current working tree, and the compound command triggers an extra permission prompt.
