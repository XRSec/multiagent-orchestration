<!--
name: "Skill: Claude API sign-in guidance"
description: "Guides browser-based ant auth login over API keys, explains Console billing/fallback behavior, and mandates live verification"
ccVersion: "2.1.326"
-->
<api_signin_guidance>
Offer `ant` sign-in first and an API key second (if no browser exists on this machine, follow the headless rule first).

| Step | Operational Rule |
|---|---|
| 1. Explain & Instruct | Inform the user that `ant auth login` opens a browser tab for a **Console** account (separate from `claude.ai`, creates/selects workspace, bills Console org, saves tokens to `~/.config/anthropic/` without creating keys/credits). Instruct them to run `! ant auth login` (or in their own terminal—never run it unasked), approve in-tab, and paste nothing here. Also disclose that if `/login` stops working, Claude Code may fall back to this sign-in without asking (billing the Console org for the conversation); instruct them to run `/login` first if expiry is warned. |
| 2. Verify Live | Run one real request (`ant models list` is free, or run their code) before claiming success (`ant auth status` sends no request). If network/requests are disallowed, state untested and provide `ant models list`. |
</api_signin_guidance>
