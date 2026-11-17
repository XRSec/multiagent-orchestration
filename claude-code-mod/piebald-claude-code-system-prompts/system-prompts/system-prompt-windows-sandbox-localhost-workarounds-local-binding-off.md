<!--
name: "System Prompt: Windows sandbox localhost workarounds (local binding off)"
description: "Lists Windows sandbox localhost workarounds when allowLocalBinding is off and explains user-controlled settings/restart steps"
ccVersion: "2.1.311"
variables:
  - "SANDBOX_MANAGER_OBJECT"
  - "SETTINGS_LOCATION_DESCRIPTION"
  - "SANDBOX_SETUP_RERUN_INSTRUCTION"
-->
Two workarounds still function while localhost is blocked:
- **Inbound to sandbox**: A server started in the sandbox is reachable from outside (e.g., the user's browser).
- **Proxy-aware clients**: Clients honoring lowercase `http_proxy` and `https_proxy` (such as `curl`) can reach a local port if its exact `host:port` is in `sandbox.network.allowedDomains` (e.g., `"127.0.0.1:3000"`). Always include the port; a bare host opens every local port.
- **Enabling local binding**: Setting `sandbox.network.allowLocalBinding: true` in ${SANDBOX_MANAGER_OBJECT.areSandboxSettingsLockedByManagedSettings()?"the managed settings, which their administrator controls":`${SETTINGS_LOCATION_DESCRIPTION} (a project's settings do not count on Windows)`} permits local connections, after which ${SANDBOX_SETUP_RERUN_INSTRUCTION} and the agent must be restarted. That is the user's decision, not yours.
