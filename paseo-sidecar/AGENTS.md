# SidecarMCP Agent Operational Guide

## 1. Architecture Invariants
- **Single Plugin Convergence**: Hosts (`claude-code`, `claude-desktop`, `claude-desktop-3p`, `gemini-cli` / `agy`, `codex`, `cursor`, `openhands`) MUST only hold the single `sidecar-mcp` plugin (carrying `.mcp.json` and `hooks/hooks.json`). NEVER write redundant `mcpServers.sidecar` entries into host root configs when the plugin provides it.
- **Byte-0 Prompt Cache Safety**: Keep the 5 root meta-tools frozen (`sidecar_discover`, `sidecar_load_skill`, `sidecar_describe_tool`, `sidecar_call_tool`, `sidecar_exec_batch`). Never emit `notifications/tools/list_changed` on workspace switches.
- **Discover = Unconverged Assets**: `discoverPlatformAssets` MUST surface any external skill/plugin/MCP still present on a host (even if `~/.sidecar-mcp/` already holds a copy) so users can deduplicate and clean hosts.
- **Builtin Exclusion**: Never import or delete host built-in skills (`BUILTIN_HOST_SKILLS` + `manifest.json` entries where `creatorType === "anthropic"` or `skillId` starts with `bundled:`).
- **Symlink & Process Safety**:
  - Always guard directory scans with `isDirSafe` (`existsSync` + `statSync`) and clean dangling symlinks via `lstatSync`.
  - Always use `cpSync(..., { recursive: true, dereference: true, force: true })` when moving symlinked skills/plugins.
  - Note: Claude Desktop / 3P overwrites `claude_desktop_config.json` on exit if modified while running; instruct users to quit (`Cmd+Q`) before converging.

## 2. Project Layout
- `src/cli/index.ts` - CLI (`serve`, `mcp-stdio`, `status`, `list`, `init`)
- `src/daemon/index.ts` - HTTP (`44880`) + UDS (`~/.sidecar-mcp/hook.sock`) daemon
- `src/hooks/` - Superset matcher, Tier 00/10/50/90 orchestrator, output reducer
- `src/mcp/server.ts` - 5-meta-tool Streamable HTTP & stdio MCP server
- `src/registry/` - `store.ts`, `discover.ts`, `bundle.ts`, `trash.ts`, `hosts-config.ts`, `installer.ts`, `trust.ts`
- `src/web/` - Open Claude UI (CDS) admin studio (`admin.ts`, `workspaces-api.ts`)

## 3. Verification
Run `npm run build && npx vitest run` after any change.
