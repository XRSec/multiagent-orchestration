/**
 * Purpose: Server RPC handlers for Sidecar control-plane status inspection and host asset discovery/convergence.
 * Context: Executes inside Paseo's server plugin subprocess using core modules loaded via ./adapter-loader.js.
 * Usage: Called from index.server.ts inside server.handle(sidecarStatusRpc / sidecarDiscoverRpc, ...).
 * Prerequisites: ./adapter-loader.js and ../shared/contracts.js.
 */
import type {
  ConvergedPlatformResult,
  SidecarDiscoverOutput,
  SidecarStatusOutput,
} from "../shared/contracts.js";
import { ALL_HOST_RUNTIMES, loadCoreModules } from "./adapter-loader.js";

const DEFAULT_ADMIN_PORT = 44880;
const PROBE_TIMEOUT_MS = 600;

function resolveAdminPort(): number {
  const parsed = Number(process.env.SIDECAR_HTTP_PORT ?? String(DEFAULT_ADMIN_PORT));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ADMIN_PORT;
}

async function probeAdminReachable(adminUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${adminUrl}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Collect ~/.sidecar path, managed skills/plugins/MCPs, workspace rules, and admin server status. */
export async function getSidecarStatus(): Promise<SidecarStatusOutput> {
  const core = await loadCoreModules();
  const registry = new core.UnifiedRegistry();
  const port = resolveAdminPort();
  const adminUrl = `http://127.0.0.1:${port}`;

  const [plugins, adminReachable] = await Promise.all([
    registry.listPlugins(),
    probeAdminReachable(adminUrl),
  ]);

  const skills = registry.listStandaloneSkills().map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? "",
    rootPath: s.rootPath,
  }));

  const pluginSummaries = plugins.map((p) => ({
    pluginId: p.plugin_id,
    version: p.version ?? "1.0.0",
    sourcePlatform: p.source_runtime ?? p.source_platform ?? "native",
    enabled: p.enabled !== false,
    skillsCount: Array.isArray(p.skills) ? p.skills.length : 0,
    mcpsCount: Array.isArray(p.mcp_servers)
      ? p.mcp_servers.length
      : p.mcp_servers && typeof p.mcp_servers === "object"
        ? Object.keys(p.mcp_servers).length
        : 0,
    hooksCount: Array.isArray(p.hooks) ? p.hooks.length : 0,
  }));

  const mcps = registry.listMcpServers().map((m) => ({
    id: m.id,
    scope: m.scope ?? "shared",
    transport: (m.url ? "http" : "stdio") as "http" | "stdio",
    commandOrUrl: m.url ?? [m.command, ...(m.args ?? [])].filter(Boolean).join(" "),
  }));

  let workspaces: SidecarStatusOutput["workspaces"] = [];
  try {
    workspaces = core.loadWorkspacesConfig(registry.paths.workspacesFile).map((ws) => ({
      id: ws.id,
      name: ws.name,
      canonicalCwd: ws.canonical_cwd,
      enabled: ws.enabled,
      runtimes: ws.runtimes ?? [],
      plugins: ws.plugins ?? [],
      priority: ws.priority ?? null,
    }));
  } catch {
    workspaces = [];
  }

  return {
    sidecarHome: registry.paths.home,
    workspacesFile: registry.paths.workspacesFile,
    adminUrl,
    adminReachable,
    skills,
    plugins: pluginSummaries,
    mcps,
    workspaces,
  };
}

/** Discover host platform assets and converge them into ~/.sidecar with origin symlinks. */
export async function runSidecarDiscoverAndConverge(): Promise<SidecarDiscoverOutput> {
  const core = await loadCoreModules();
  const registry = new core.UnifiedRegistry();
  const port = resolveAdminPort();

  const found = core.discoverPlatformAssets(registry);
  const converged: ConvergedPlatformResult[] = [];
  let totalMovedSkills = 0;
  let totalMovedMcps = 0;

  for (const platform of ALL_HOST_RUNTIMES) {
    try {
      const res = core.convergeHostAssets(registry, platform, port);
      totalMovedSkills += res.movedSkills;
      totalMovedMcps += res.movedMcps;
      converged.push({
        platform: res.platform,
        movedSkills: res.movedSkills,
        movedMcps: res.movedMcps,
      });
    } catch (err) {
      converged.push({
        platform,
        movedSkills: 0,
        movedMcps: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    discovered: {
      skills: found.skills.length,
      plugins: found.plugins.length,
      mcps: found.mcps.length,
    },
    converged,
    totalMovedSkills,
    totalMovedMcps,
  };
}
