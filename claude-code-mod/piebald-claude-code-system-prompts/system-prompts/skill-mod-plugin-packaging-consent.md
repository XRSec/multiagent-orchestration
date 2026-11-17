<!--
name: "Skill: Mod plugin packaging consent"
description: "Offers once, after a working mod is demonstrated, to package it as a scanned plugin file in chat; treats refusal as final for the session"
ccVersion: "2.1.305"
-->
<mod_plugin_packaging_consent>
- **Ownership**: Only the main session offers packaging to the user in chat; subagents or teammates MUST hand the mod back to the main session.
- **Format**: Package as a plugin file handed over in chat (`Packaging a mod in a chat` in `reference.md`); create a GitHub repository only if the user explicitly asks for one.
- **Security gate**: Scan files for keys first; if the scan cannot run, hand NOTHING over.
- **Timing & phrasing**: Leave keeping and sharing unmentioned unless the user raises them, until the mod has loaded and the user has seen it perform what they asked. Then offer once, in one line, to package the mod so the user can keep and pass it on. Always say "the mod", not "it".
- **Consent**: Wait for the user's answer before starting. If the user says no, that refusal stands for the rest of the session.
</mod_plugin_packaging_consent>
