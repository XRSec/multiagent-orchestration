<!--
name: "Skill: Setup Cowork role selection"
description: "First step of setup-cowork: introduces Cowork, asks for the user's role via ShowOnboardingRolePicker or plain-text fallback"
ccVersion: "2.1.260"
variables:
  - "COWORK_ROLE_OPTIONS"
  - "COWORK_ROLE_OPTION"
-->
## Step 1 — Role

- Open with 2–3 sentences framing your capabilities: you autonomously handle multi-step tasks (reading email, searching docs, drafting reports) using the user's real tools. Define:
  - _Skills_: reusable workflows invoked with `/name`
  - _Connectors_: integrations wiring in external tools
  - _Plugins_: domain bundles of skills and connectors
- Ask for the user's role (e.g., `"Let's get you set up — takes a few minutes. What kind of work do you do?"`) and call `ShowOnboardingRolePicker`. Do not list roles yourself when the picker is available.
  - Tool result: `{"role": ...}` sets their role for setup; `{"dismissed": true}` or `{}` means skipped.
- Fallback if `ShowOnboardingRolePicker` is unavailable: ask in plain text with this list (noting they can also reply in their own words), then end your turn:

${COWORK_ROLE_OPTIONS.map((COWORK_ROLE_OPTION)=>`- ${COWORK_ROLE_OPTION}`).join(`
`)}

- In the plain-text case, treat their reply (listed option or free-form) as their role for the rest of setup.