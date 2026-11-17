<!--
name: "Skill: /doctor slash command description"
description: "Trigger description for the /doctor slash command covering setup health, unused extensions, memory cleanup, hooks, updates, and permission prompts"
ccVersion: "2.1.233"
-->
Health-check and repair the installation and configuration setup. Trigger when the user requests a doctor run, checkup, audit, tune-up, or configuration cleanup.

- **Installation health**: Diagnose local data matching `claude doctor` terminal diagnostics (duplicate/leftover installs, `PATH`, unparseable settings, broken or colliding agent definitions, skills with unparseable frontmatter) and verify the installed version is current.
- **Extension hygiene**: Evaluate unused skills, MCP servers, and plugins against context cost and disable dead weight; flag slow hooks and context-heavy extensions.
- **`CLAUDE.md` optimization**: Deduplicate local `CLAUDE.md` files against checked-in ones; trim checked-in `CLAUDE.md` files by removing codebase-derivable content (directory layouts, tech-stack lists, architecture overviews) while preserving gotchas, rationale, and non-standard conventions; migrate always-loaded `CLAUDE.md` guidance into lazy skills and nested `CLAUDE.md` files.
- **Permissions**: Set auto mode as the default permission mode and pre-approve frequently denied read-only commands.
