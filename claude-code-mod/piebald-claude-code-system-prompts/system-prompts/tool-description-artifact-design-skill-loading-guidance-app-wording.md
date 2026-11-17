<!--
name: "Tool Description: Artifact design skill loading guidance (app wording)"
description: "Mandates loading the Artifact design skill before authoring and placing unpublished files in the scratchpad directory"
ccVersion: "2.1.312"
variables:
  - "ARTIFACT_DESIGN_SKILL_NAME"
-->
**Mandatory Pre-Write Skill Load**: Load `${ARTIFACT_DESIGN_SKILL_NAME}` BEFORE authoring any artifact file (including skill-directed `.md` files; never write Markdown to bypass the HTML page contract). Follow its format, title, library, storage, size, layout, theme, icon, and effort rules, write the file via `Write`/`Edit` (using the system-prompt scratchpad directory when no path is specified by the user), and publish via `Artifact`.
