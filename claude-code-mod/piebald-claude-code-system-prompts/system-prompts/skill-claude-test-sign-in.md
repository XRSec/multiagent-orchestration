<!--
name: "Skill: Claude Test sign-in"
description: "Pre-run browser authentication skill saving a persistent test-member session for account-dependent specs"
ccVersion: "2.1.275"
-->
---
name: sign-in
description: Signs the site's dedicated test member in and saves the session, so specs that need an account start signed in.
claude-test:
  run: scripts/sign-in.mjs
  check: scripts/check.mjs
  timeout_s: 60
---

<test_signin_skill_protocol>
Signs in the dedicated test member via `scripts/sign-in.mjs` and validates session persistence via `scripts/check.mjs` (customize marked blocks in `scripts/` to match the login form).

- **Landing Route**: `/account` `<!-- EDIT: where a signed-in member lands -->`
- **Account Immutability**: Specs MUST NOT modify the test account's email/password or delete the account (all specs share the saved session).
- **Session Expiry Recovery**: If a spec encounters the login form, re-run sign-in (`ct-auth.mjs sign-in`) before the next run; if re-auth fails, report account-dependent specs as blocked with `"sign-in unavailable"`.
</test_signin_skill_protocol>
