<!--
name: "Tool Description: Bash (sandbox — local port binding EPERM, override available)"
description: "Handle EPERM local port-binding failures when unsandboxed retries are available."
ccVersion: "2.1.281"
-->
If binding or listening on a local port fails with "Operation not permitted" (`EPERM`), local port binding is disabled in this sandbox. Handle it as a sandbox-caused failure as above, and inform the user that `sandbox.network.allowLocalBinding: true` in settings (takes effect without restart) allows it without leaving the sandbox.
