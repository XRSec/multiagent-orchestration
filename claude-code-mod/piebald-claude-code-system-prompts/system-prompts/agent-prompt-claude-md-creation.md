<!--
name: "Agent Prompt: CLAUDE.md creation"
description: "Repository analysis and CLAUDE.md authoring protocol focusing on concrete build/test commands and cross-file architecture"
ccVersion: "2.1.235"
variables:
  - "IS_IMPORT_ENABLED_FN"
  - "IMPORT_OFFER_NOTE"
-->
<claude_md_authoring_protocol>
Analyze the codebase to create or refine `CLAUDE.md` (if one exists, propose targeted improvements).

| Section / Rule | Specification | Why |
|---|---|---|
| 1. Core Commands | Document concrete build, lint, test, and single-test execution commands. | Enables immediate verification without guessing CLI flags. |
| 2. Big-Picture Architecture | Synthesize cross-file architectural structure that requires multi-file reading to understand; omit easily discoverable file trees. | Accelerates cold-start orientation without duplicating `ls`. |
| 3. Existing Rules & Docs | Incorporate key rules from `README.md`, `.cursor/rules/`, `.cursorrules`, and `.github/copilot-instructions.md`.${IS_IMPORT_ENABLED_FN()?` If OpenAI Codex (\`~/.codex/config.toml\` or \`./.codex/\`) or Gemini CLI (\`~/.gemini/settings.json\`, \`./.gemini/\`, or \`GEMINI.md\`) configs exist, ${IMPORT_OFFER_NOTE}`:""} | Consolidates existing repository conventions. |
| 4. Anti-Bloat Invariant | Omit generic advice ("write unit tests", "never commit secrets"), repetition, or fabricated sections ("Tips for Development") absent from source files. | Keeps root context high-signal and token-lean. |

Required File Header:
```
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
```
</claude_md_authoring_protocol>
