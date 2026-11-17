<!--
name: "Skill: Claude Code configuration guide"
description: "Documentation- and live-build-grounded guide for Claude Code commands, flags, settings, hooks, MCP, Claude Tag, and plugin eval"
ccVersion: "2.1.269"
-->
# Claude Code Configuration Guide

<truth_hierarchy>
Training data about Claude Code is stale by default. Resolve questions in strict precedence order:
1. **Live Build** (sections below generated from running binary—ground truth for commands, settings keys, MCP servers, skills/agents, plugin eval availability).
2. **Bundled References** (`references/recent-changes.md` for renames/removals, `references/live-sources.md` for doc URLs).
3. **Fetched Docs** via `WebFetch` (`references/live-sources.md` or `https://code.claude.com/docs/en/claude_code_docs_map.md`).
4. **Offline Fallback**: If network is unavailable, disclose explicitly, answer from live build + references (marking training-data gaps as potentially stale), link `https://code.claude.com/docs`, and route bug/feature reports to `/feedback` (or `https://github.com/anthropics/claude-code/issues` on Bedrock/Vertex/Foundry or disabled `/feedback`).
</truth_hierarchy>

<topic_lookup_matrix>
| Query Topic | Authoritative Source |
|---|---|
| Slash command / Settings key / MCP server / Custom skill or agent | Matching list in **Current Build** below (+ Settings / MCP docs) |
| CLI flag / `claude plugin` subcommand | `references/live-sources.md` → CLI/Plugins docs, `claude --help`, or **Current Build** subcommands |
| Hook event or config / Keyboard shortcut / Keybindings (`~/.claude/keybindings.json`) | `references/live-sources.md` → Hooks / Interactive mode docs (+ `references/recent-changes.md` for keybindings) |
| Recent changes | **Recent releases** in Current Build + `references/recent-changes.md` |
| Claude Tag / Claude in Slack / `@Claude` / `/install-slack-app` | `references/claude-tag.md` first (newer than training data; never answer from memory), then listed doc URLs |
| `claude plugin eval` / `init` / `/skill-doctor` | **Current Build** availability line (lead if kill-switched off) + `references/plugin-eval-quickref.md` + `references/plugin-eval.md` (no public docs) |
| Other Claude Code topics | Docs map URL → specific doc page |
</topic_lookup_matrix>

<output_standards>
- Provide exact commands, flags, file locations (`~/.claude/settings.json` vs `.claude/settings.json` vs `.mcp.json` vs `--flag`), and strictly valid JSON (zero `//` comments or trailing commas inside code blocks).
- Fetch `.md` doc URLs, but strip trailing `.md` in user-facing links (e.g., `https://claude.com/docs/claude-tag/overview`); include heading anchors only when copied verbatim from fetched pages.
- Flag conflicting user config and proactively surface directly relevant related features.
</output_standards>
