<!--
name: "Tool Description: Invoke skill"
description: "Invokes listed skills by exact or scoped name with optional args, avoiding duplicate invocation"
ccVersion: "2.1.323"
variables:
  - "SKILL_LISTING_SOURCE_PHRASE"
  - "SKILL_TAG_NAME"
-->
Invoke a packaged skill (task instructions, deploy steps, review checklist, or repo workflow) listed in ${SKILL_LISTING_SOURCE_PHRASE}.

- **When to call**: call first when a listed skill covers the task or the user requests it (`/<name>` or "slash command"). Instructions load into the turn to follow instead of your default approach; some skills run in a subagent and return the finished result (background skills return only the agent's name and deliver results later via task notification — do not wait or re-invoke).
- **Parameters**:
  - `skill`: exact name from the listing, no leading slash. Plugin skills use `plugin:skill`; directory-scoped skills use a path prefix (`apps/web:deploy`). When both scoped and unscoped variants exist, pick the one whose directory contains your target files (most specific wins; unscoped otherwise).
  - `args`: optional arguments to pass through.
- **Constraints**: only listed or user-typed skill names are valid (built-in CLI commands like `/help`, `/clear` are not skills). If `<${SKILL_TAG_NAME}>` is already present this turn, the skill is loaded — follow it directly instead of calling again.