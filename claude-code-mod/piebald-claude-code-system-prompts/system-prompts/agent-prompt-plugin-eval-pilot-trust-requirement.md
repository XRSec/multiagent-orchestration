<!--
name: "Agent Prompt: Plugin eval pilot trust requirement"
description: "Gates --trust-plugin pilot execution on explicit user consent while still authoring case files"
ccVersion: "2.1.269"
-->
<plugin_eval_trust_gate>
TRUST: This plugin directory is untrusted for `claude plugin eval` pilot runs. Before running the first pilot, inform the user that piloting loads the plugin (skills, hooks, MCP servers) and executes its eval suite locally as them, and request explicit trust confirmation.

- **Explicit Yes**: Append `--trust-plugin` to pilot commands.
- **No / Unanswered**: Write the case files only, omit `--trust-plugin` and pilot runs, and state the skip in your summary. NEVER infer or self-authorize `--trust-plugin`.
</plugin_eval_trust_gate>
