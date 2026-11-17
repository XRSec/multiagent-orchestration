# SidecarMCP

Unified **Single-Plugin (Hook + MCP)** control plane for managing Skills, Plugins, Hooks, and MCP Servers across Agent Runtimes (`claude-code`, `claude-desktop`, `claude-desktop-3p`, `codex`, `cursor`, `gemini-cli` / `agy`, `openhands`).

## Core Principles

1. **Byte-0 Cache-Safe Meta-Tools**: Exposes only 5 fixed meta-tools (`sidecar_discover`, `sidecar_load_skill`, `sidecar_describe_tool`, `sidecar_call_tool`, `sidecar_exec_batch`) so prompt caches never invalidate on directory switches.
2. **Single Plugin Per Host**: Hosts only install one `sidecar-mcp` plugin (carrying `.mcp.json` + `hooks/hooks.json`), with zero scattered skills or duplicate MCP entries.
3. **Unified `~/.sidecar-mcp/` Registry**:
   - `skills/` - Standalone deduplicated skills
   - `plugins/cache/<platform>--<id>/<version>/` & `plugins/data/<id>/` - Platform-scoped plugins
   - `mcps/<id>.json` - External MCP server manifests
   - `backups/<platform>/` - Deduplicated import backups with `.backup-meta.json` (`global` / `project` origin)
   - `trash/` - Platform-deleted assets with restore & purge support
   - `workspaces.yaml` - 3D routing `(runtime, session_id, canonical_cwd)`
   - `hosts.json` - Configurable per-host paths

## CLI & Web Studio

```bash
pnpm install
pnpm build
pnpm dev          # Hot-reload daemon + Web Studio on http://127.0.0.1:44880
./bin/sidecar serve
./bin/sidecar mcp-stdio --runtime claude-desktop-3p
```

Web Studio URLs (Open Claude UI CDS):
- `/admin/library` - Unified `~/.sidecar-mcp/` assets (with move-to-trash)
- `/admin/discover` - Cross-platform discovery, normalized bundles, and move+backup import
- `/admin/workspaces` - Directory × Runtime matrix (auto-completes trusted dirs)
- `/admin/hosts` - Configurable host paths, plugin installation, and convergence
- `/admin/trash` - Trash separating `imported` backups and `deleted` assets with `sidecar` / `original` restore
