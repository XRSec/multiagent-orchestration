<!--
name: "Tool Description: Cowork onboarding role picker"
description: "Describes the Cowork onboarding role-picker tool that returns a selected or typed role and should only be used while setting up Cowork for the user's job function"
ccVersion: "2.1.172"
-->
Render a clickable role-picker chip row during Cowork onboarding (call with no args; role list is hardcoded in the frontend).
- Usage: Call ONLY when explicitly helping the user set up Cowork for their role/job function; NEVER call in normal conversation.
- Blocking & results: Blocks until user responds.
  - Chip click or typed answer → `{"role": "Legal"}` or `{"role": "paralegal"}` (free-form roles may not match chip list — search marketplace with the returned string).
  - X button → `{"dismissed": true}`.
  - `{}` (empty object) → user approved without picking a role; treat as dismissal.
