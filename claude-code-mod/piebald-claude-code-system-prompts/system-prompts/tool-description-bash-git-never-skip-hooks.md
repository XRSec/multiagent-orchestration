<!--
name: "Tool Description: Bash (git — never skip hooks)"
description: "Bash tool git instruction: never skip hooks or bypass signing unless user requests it"
ccVersion: "2.1.53"
-->
NEVER skip hooks (`--no-verify`) or bypass signing (`--no-gpg-sign`, `-c commit.gpgsign=false`) unless the user explicitly asks. If a hook fails, diagnose and fix the underlying issue.
