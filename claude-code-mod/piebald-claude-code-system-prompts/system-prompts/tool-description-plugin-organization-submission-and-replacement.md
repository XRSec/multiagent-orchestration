<!--
name: "Tool Description: Plugin organization submission and replacement"
description: "Plugin upload and org review after consent, requiring renewed consent for replacement and user action before retrying outdated uploads"
ccVersion: "2.1.305"
-->
On user confirmation (`yes`), the plugin uploads to the user's shelf on `claude.ai` and submits to the organization (reviewed by an administrator, or published immediately if the org publishes without review). Scanning depends on the organization; report only what the result states about a scan.

- **Name already in uploads**: Ask the user whether to replace it; call again with `replace: true` only on `yes`.
- **Upload is not current version**: Inform the user and do not call again (retrying fails the same way; the user must make the new version current on `claude.ai` and publish from there).
- **Publishable only from `claude.ai`**: Inform the user and do not call again.
- **Earlier submission pending review**: Inform the user; call again only if the user asks after withdrawing it on `claude.ai`.
