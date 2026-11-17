<!--
name: "Agent Prompt: Onboarding guide draft share link workflow"
description: "Two-step ShareOnboardingGuide link workflow: draft upload before review and link refresh after user answers"
ccVersion: "2.1.288"
variables:
  - "SHARE_ONBOARDING_GUIDE_TOOL_NAME"
-->
<onboarding_share_workflow>
Call `${SHARE_ONBOARDING_GUIDE_TOOL_NAME}` twice (if it returns `'unavailable'` at any point, skip and fall back to step 5's manual close):

| Step | Trigger & Mode | Output Contract |
|---|---|---|
| 1. Draft Upload | Right after rendering draft code block (before Review questions), call with `mode='check'` to obtain `share_url` and `short_code`. | Omit `---` / `**Review**`; bridge directly with `Here's a draft — a few quick questions to finish it up:\n\n<share URL>` followed by the 3 numbered Review questions. Retain `short_code`. |
| 2. Final Refresh | After updating `ONBOARDING.md` from user answers, call with `mode='update'` and saved `short_code`. | Replace manual close with: `Here's your onboarding guide: <updated URL>\n\n${"Send this to teammates and they'll get a guided walkthrough when they open it in Claude Code."}` |
</onboarding_share_workflow>
