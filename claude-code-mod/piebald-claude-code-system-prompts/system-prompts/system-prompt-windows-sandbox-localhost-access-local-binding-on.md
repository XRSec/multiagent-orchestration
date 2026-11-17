<!--
name: "System Prompt: Windows sandbox localhost access (local binding on)"
description: "States Windows sandbox localhost port access with allowLocalBinding enabled and external proxy rules"
ccVersion: "2.1.305"
variables:
  - "SANDBOX_FENCE_CHECK_PORT"
-->
On Windows with `allowLocalBinding` enabled, sandboxed commands can connect to localhost (`127.0.0.1` or `::1`) on any port except ${SANDBOX_FENCE_CHECK_PORT}. External hosts remain unreachable directly and must go through the sandbox proxy and `sandbox.network.allowedDomains`.
