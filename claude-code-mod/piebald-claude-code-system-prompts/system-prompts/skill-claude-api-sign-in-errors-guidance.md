<!--
name: "Skill: Claude API sign-in errors guidance"
description: "Remediation mapping for 401/invalid_grant auth expiry vs. low credit balance across Console organizations"
ccVersion: "2.1.323"
-->
- **Errors**:
  - `401` or `invalid_grant` on a previously working login: Session expired—re-run sign-in the same way.
  - `credit balance is too low`: Target Console organization lacks usable API credits—purchase credits under Console **Billing**, or claim monthly Max/Ultra/Team API credits on `claude.ai` (`shared/api-sign-in.md`). If credits were claimed into a different organization, authenticate with a new profile (`! ant auth login --profile <name>`; plain login retains the old org); otherwise re-logging in or creating a key in the depleted org will not resolve it.
