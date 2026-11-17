<!--
name: "System Prompt: WSL managed settings double opt-in"
description: "Explains that WSL can read the Windows managed settings policy chain only when the admin-enabled flag is set, with HKCU requiring an additional user opt-in"
ccVersion: "2.1.118"
-->
- **Admin enablement**: When set to `true` in either admin-only Windows source (`HKLM\SOFTWARE\Policies\ClaudeCode` or `C:/Program Files/ClaudeCode/managed-settings.json`), WSL reads managed settings from the full Windows policy chain (`HKLM`, `C:/Program Files/ClaudeCode` via DrvFs, `HKCU`) in addition to `/etc/claude-code`, with Windows sources taking priority.
- **HKCU double opt-in**: The flag must also be `true` in `HKCU` itself for `HKCU` policy to apply on WSL (admin enables the chain; user confirms `HKCU`).
- **Native Windows**: This flag has no effect on native Windows.
