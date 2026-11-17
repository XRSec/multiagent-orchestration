<!--
name: "Skill: Claude API authentication status check"
description: "Mandates full un-truncated ant auth status verification for an active Credentials row when ANTHROPIC_API_KEY is unset"
ccVersion: "2.1.319"
-->
<api_auth_status_check>
When `ANTHROPIC_API_KEY` is unset, run `ant auth status` and read its **entire** output (never pipe through `head`, `tail`, or `grep`) before calling the API or mentioning authentication/keys.

- **Signed-In Criterion**: The `Credentials` block contains an `(active) *` row (header profile/path lines appear even when signed out).
- **Gating Rule**: Do NOT mention signing in or API keys unless `ant auth status` shows no `(active) *` row or an API call fails with an auth error. If `(active) *` is present:
</api_auth_status_check>
