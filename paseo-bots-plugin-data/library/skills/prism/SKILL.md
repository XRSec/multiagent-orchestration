---
name: prism
description: Controls local Prism Vault profiles, CDP sessions, and structured page extraction via Prism MCP. Manual-only; load ONLY upon explicit invocation via /skill:prism; strict zero-auto-load rule.
disable-model-invocation: true
---

# Prism Browser & Fingerprint Automation Skill

Micro-kernel operational router for local Prism Browser antidetect profiles and CDP automation via Prism MCP.

## 1. Hard Invariants & Redlines
- **Zero Auto-Load**: Load skill ONLY upon explicit `/skill:prism` invocation. Frontmatter sets `disable-model-invocation: true`.
- **Default Profile Zero-Contamination**: NEVER interact with default macOS browser profiles (Default Chrome, Safari). NEVER modify system proxy, network, or DNS settings.
- **Strict Single-Instance Lifecycle**: Enclose every `prism_start_profile` in guaranteed teardown closing via `prism_close_profile`. Inspect running status via `prism_get_profile_status` before start. Zero orphaned processes.
- **Token-Saving Calling Discipline**: NEVER dump raw HTML or unparsed DOM into model context. Always extract compact Markdown, tables, or text via `prism_get_markdown`, `prism_get_table`, `prism_get_text`, or `prism_read_page`.
- **Safe Deletion Protocol**: NEVER execute raw `rm` or `rm -rf`. Delete temporary debug artifacts via `/opt/xrsec/.env/rmfile <target>`.

## 2. Vault Topology
- **Vault Root**: `~/Library/Application Support/prism-browser/vault`
- **Profiles Registry**: `~/Library/Application Support/prism-browser/vault/profiles.json`
- **Kernel Directory**: `~/Library/Application Support/prism-browser/vault/kernels/`
- **MCP Binary**: `/Applications/Prism Browser.app/Contents/Resources/pro-agent/prism-pro-agent`

## 3. Protocol Shards
- [Tool Catalog](shards/catalog.md): 58 MCP automation tools categorized by functional domain.
- [Execution Lifecycle Protocol](shards/lifecycle.md): Strict single-instance execution guards and error recovery contracts.
