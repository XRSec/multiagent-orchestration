<!--
name: "Skill: Mod plugin packaging on request"
description: "Requires packaging a mod as a scanned plugin file through the main session only when the user asks to keep, export, share, or obtain its files"
ccVersion: "2.1.319"
-->
<mod_plugin_packaging_on_request>
- **Do not initiate**: Leave keeping and sharing unmentioned until the user raises them.
- **Trigger**: When the user asks to package, keep, download, export, or share the mod, or requests its files, follow `Packaging a mod in a chat` in `reference.md`.
- **Format**: Hand over a plugin file in chat (shown as a card to save; a plain zip gets no card).
- **Security gate**: Scan files for keys first; if the scan cannot run, hand NOTHING over.
- **Ownership**: Only the main session hands the mod over; subagents or teammates MUST hand it back to the main session.
</mod_plugin_packaging_on_request>
