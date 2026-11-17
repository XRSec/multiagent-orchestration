<!--
name: "Tool Description: Bash (sandbox — local port binding EPERM, no override)"
description: "Handle EPERM local port-binding failures when unsandboxed retries are unavailable."
ccVersion: "2.1.281"
variables:
  - "SANDBOX_EXCLUDE_COMMAND_SUFFIX"
-->
If binding or listening on a local port fails with "Operation not permitted" (`EPERM`), local port binding is disabled in this sandbox. Inform the user they can enable `sandbox.network.allowLocalBinding: true` in settings (takes effect without restart)${SANDBOX_EXCLUDE_COMMAND_SUFFIX}; changing sandbox settings is the user's decision.
