<!--
name: "Tool Description: Skill proposal rendering"
description: "Renders recurring-procedure skill proposals for user review without writing files; requires separate names for plugin or built-in skill customizations"
ccVersion: "2.1.324"
-->
Render skill proposals for recurring multi-step procedures in the conversation.

- **Render-only**: Displays a review card for the user to save; writes no files and creates no skill directly.
- **When to call**: Call once with all proposals (max 3) when the user asks to turn a workflow into a skill, or when a recurring multi-step procedure would clearly save future work. Skip one-off tasks and already-proposed skills.
- **Updating user skills**: Send only your changes as `edits` (the card renders the full updated `SKILL.md`). Updates are restricted to the user's own skills, including user-uploaded `claude.ai` plugin skills (the tool reports if a target is not theirs).
- **Customizing plugin/built-in skills**: These cannot be updated from the card. Propose a new skill under a distinct name (not the original name, even without its plugin prefix) with a description specifying when to use it instead of the original.
