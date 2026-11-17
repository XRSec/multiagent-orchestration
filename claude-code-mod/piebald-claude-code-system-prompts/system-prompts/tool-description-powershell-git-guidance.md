<!--
name: "Tool Description: PowerShell (git guidance)"
description: "PowerShell git guidance: prefer new commits, avoid unnecessary destructive ops, and never bypass hooks or signing without user request"
ccVersion: "2.1.271"
-->
For git commands:
- Prefer creating a new commit rather than amending an existing commit.
- Before running destructive operations (`git reset --hard`, `git push --force`, `git checkout --`), consider safer alternatives; use destructive operations only when truly the best approach.
- NEVER skip hooks (`--no-verify`) or bypass signing (`--no-gpg-sign`, `-c commit.gpgsign=false`) unless explicitly requested by the user. If a hook fails, investigate and fix the underlying issue.
