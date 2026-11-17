# Task Manifest: Adapt Claude / AGY `nowledge-mem` Plugin in `sidecar-mcp`

## Goal
Ensure `sidecar-mcp` fully supports importing, loading, hooking, and proxying MCP tools for both Claude Code and AGY (`gemini-cli` / Antigravity) distributions of the `nowledge-mem` plugin, while strictly upholding `AGENTS.md` invariants (Single Plugin Convergence, Byte-0 Prompt Cache Safety, Symlink & Process Safety).

## Acceptance Criteria
- **AC-1 (`.mcp.json` Loader Support)**: `loadPluginBundle` in `src/plugins/loader.ts` parses `.mcp.json` (in addition to `mcp_config.json`), supporting standard Claude Code `mcpServers` schema (HTTP/URL and stdio configs) without breaking existing `mcp_config.json` loading.
- **AC-2 (Downstream MCP Tool Executor)**: Implement a downstream MCP client/executor (`SidecarToolExecutor`) supporting HTTP (StreamableHTTP/SSE, e.g. `http://127.0.0.1:14242/mcp/`) and stdio MCP servers, and wire it into `sidecar serve` (`src/cli/index.ts` / `src/daemon/index.ts`) so `sidecar_discover`, `sidecar_describe_tool`, and `sidecar_call_tool` work end-to-end for `nowledge-mem` (and fail gracefully with clear errors if the local `nowledge-mem` daemon is offline).
- **AC-3 (Claude & AGY Hook / Env / Discovery Compatibility)**: Verify and fix any gaps in `src/hooks/orchestrator.ts`, `src/daemon/index.ts`, and `src/registry/discover.ts` for `nowledge-mem` (e.g., `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` / plugin root variable substitution in hooks/MCP configs, AGY `PreInvocation`/`PostInvocation`/`Stop` & Claude `SessionStart`/`UserPromptSubmit`/`Stop` routing, and discovery/import from Claude & AGY plugin paths).
- **AC-4 (Tests & Build Verification)**: Add/update unit tests in `test/` covering `.mcp.json` loading, downstream `SidecarToolExecutor` (mocked HTTP/stdio), and `nowledge-mem` Claude/AGY hook/MCP integration. `npm run build && npx vitest run` passes with zero regressions.

## Stages
1. [x] `modeep` reconnaissance (Completed)
2. [x] `mocode` implementation & unit tests (Completed)
3. [x] `moci` build & full test suite verification (Completed)
