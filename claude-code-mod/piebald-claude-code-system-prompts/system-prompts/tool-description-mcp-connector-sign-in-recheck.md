<!--
name: "Tool Description: MCP connector sign-in recheck"
description: "Stub tool that retries an installed MCP connector whose sign-in stopped working and defines response behavior"
ccVersion: "2.1.309"
variables:
  - "MCP_CONNECTOR_DISPLAY_NAME"
-->
The "${MCP_CONNECTOR_DISPLAY_NAME}" connector is installed, but its sign-in stopped working and its tools are unavailable. Call this tool only when the user's request needs this connector (even if unnamed) to retry the connection.

- **Success**: Connector tools become available.
- **Needs sign-in** (call fails; user may see a sign-in prompt): Tell the user in one short sentence that ${MCP_CONNECTOR_DISPLAY_NAME} needs them to sign in again, continue with work that does not need it, and do not call this tool again until the user sends another message.
- **Other failure**: Tell the user ${MCP_CONNECTOR_DISPLAY_NAME} is unavailable right now.
- **NEVER** ask the user for authorization codes, tokens, or URLs.
