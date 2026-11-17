<!--
name: "Tool Description: Bash (sandbox — tmpdir)"
description: "Use TMPDIR ($TMPDIR or $env:TMPDIR) for temporary files in sandbox mode."
ccVersion: "2.1.307"
variables:
  - "TMPDIR_ENV_VAR_REFERENCE"
-->
Use `${TMPDIR_ENV_VAR_REFERENCE}` for temporary files (`TMPDIR` automatically points to the sandbox-writable directory in sandbox mode); NEVER use `/tmp` directly—use `${TMPDIR_ENV_VAR_REFERENCE}` instead.
