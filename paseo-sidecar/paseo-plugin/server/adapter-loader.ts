/**
 * Purpose: Runtime loader for core Sidecar registry, discovery, convergence, and workspace modules from compiled dist artifacts.
 * Context: Keeps all static imports inside paseo-plugin/server/ to satisfy Paseo's plugin-server-runtime-boundary check.
 * Usage: const core = await loadCoreModules();
 * Prerequisites: Built paseo-sidecar (dist/registry/*, dist/config/*) or PASEO_SIDECAR_ROOT.
 */
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type RuntimeType =
  | "claude-code"
  | "claude-desktop"
  | "claude-desktop-3p"
  | "codex"
  | "openhands"
  | "cursor"
  | "gemini-cli";

export const ALL_HOST_RUNTIMES: readonly RuntimeType[] = [
  "claude-code",
  "claude-desktop",
  "claude-desktop-3p",
  "codex",
  "openhands",
  "cursor",
  "gemini-cli",
];

export interface CoreSidecarPaths {
  home: string;
  workspacesFile: string;
  skillsDir: string;
  pluginsCacheDir: string;
  pluginsDataDir: string;
  mcpsDir: string;
  backupsDir: string;
  hookSock: string;
}

export interface CoreSkillEntry {
  id: string;
  name: string;
  description: string;
  rootPath: string;
}

export interface CorePluginBundle {
  plugin_id: string;
  name?: string;
  version?: string;
  source_runtime?: RuntimeType | "native";
  source_platform?: RuntimeType | "native";
  enabled?: boolean;
  skills?: unknown[];
  mcp_servers?: Record<string, unknown> | unknown[];
  hooks?: unknown[];
}

export interface CoreMcpServerManifest {
  id: string;
  scope?: string;
  command?: string;
  args?: string[];
  url?: string;
}

export interface CoreUnifiedRegistry {
  readonly paths: CoreSidecarPaths;
  listStandaloneSkills(): CoreSkillEntry[];
  listPlugins(): Promise<CorePluginBundle[]>;
  listMcpServers(): CoreMcpServerManifest[];
}

export interface CoreWorkspaceProfile {
  id: string;
  name: string;
  canonical_cwd: string;
  runtimes?: RuntimeType[];
  plugins: string[];
  enabled: boolean;
  priority?: number;
}

export interface SidecarCoreModules {
  UnifiedRegistry: new (customHome?: string) => CoreUnifiedRegistry;
  getSidecarHome: (customHome?: string) => string;
  getSidecarPaths: (customHome?: string) => CoreSidecarPaths;
  discoverPlatformAssets: (
    registry: CoreUnifiedRegistry,
    customHomeDir?: string,
  ) => {
    skills: unknown[];
    plugins: unknown[];
    mcps: unknown[];
  };
  convergeHostAssets: (
    registry: CoreUnifiedRegistry,
    platform: RuntimeType,
    port?: number,
    customHomeDir?: string,
  ) => { platform: RuntimeType; movedSkills: number; movedMcps: number };
  loadWorkspacesConfig: (configPath?: string) => CoreWorkspaceProfile[];
}

const ADAPTER_REL_PATH = path.join("dist", "paseo", "adapter.js");
const REPO_ADAPTER_REL_PATH = path.join("paseo-sidecar", "dist", "paseo", "adapter.js");

let cachedCorePromise: Promise<SidecarCoreModules> | null = null;

function getCurrentFilename(): string | undefined {
  if (typeof __filename === "string" && __filename.length > 0) {
    return __filename;
  }
  const metaUrl = typeof import.meta !== "undefined" ? import.meta.url : undefined;
  if (typeof metaUrl === "string" && metaUrl.length > 0) {
    try {
      return fileURLToPath(metaUrl);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function getCurrentDir(): string | undefined {
  if (typeof __dirname === "string" && __dirname.length > 0) {
    return __dirname;
  }
  const filename = getCurrentFilename();
  return filename ? path.dirname(filename) : undefined;
}

function readPaseoPluginSourceDirs(): string[] {
  const dirs: string[] = [];
  const paseoHome = process.env.PASEO_HOME?.trim() || path.join(os.homedir(), ".paseo");
  const configPath = path.join(paseoHome, "config.json");
  try {
    if (!fs.existsSync(configPath)) return dirs;
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      plugins?: Record<string, { path?: unknown; source?: unknown }>;
    };
    const entry = raw?.plugins?.["paseo-sidecar"];
    if (!entry || typeof entry !== "object") return dirs;
    for (const candidate of [entry.path, entry.source]) {
      if (
        typeof candidate === "string" &&
        candidate.trim().length > 0 &&
        (path.isAbsolute(candidate.trim()) || candidate.includes(path.sep))
      ) {
        dirs.push(path.resolve(candidate.trim()));
      }
    }
  } catch {
    // Ignore malformed or unreadable Paseo config files.
  }
  return dirs;
}

function collectCandidatePaths(): string[] {
  const candidates: string[] = [];
  const envRoots = [
    process.env.PASEO_SIDECAR_ROOT,
    process.env.SIDECAR_PACKAGE_ROOT,
    process.env.SIDECAR_HOME,
  ];
  for (const root of envRoots) {
    const trimmed = root?.trim();
    if (trimmed) {
      candidates.push(path.resolve(trimmed, ADAPTER_REL_PATH));
    }
  }

  const homeDir = os.homedir();
  const startDirs = [
    getCurrentDir(),
    process.cwd(),
    ...readPaseoPluginSourceDirs(),
    path.join(homeDir, "IDEA.localized", "multiagent-orchestration"),
    path.join(homeDir, "Projects", "multiagent-orchestration"),
    path.join(homeDir, "workspace", "multiagent-orchestration"),
    path.join(homeDir, "multiagent-orchestration"),
    homeDir,
  ].filter((dir): dir is string => typeof dir === "string" && dir.length > 0);

  for (const base of startDirs) {
    let current = path.resolve(base);
    for (let depth = 0; depth < 5; depth += 1) {
      candidates.push(path.join(current, ADAPTER_REL_PATH));
      candidates.push(path.join(current, REPO_ADAPTER_REL_PATH));
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return [...new Set(candidates)];
}

function resolveViaRequire(specifier: string): string | undefined {
  try {
    if (typeof require === "function" && typeof require.resolve === "function") {
      return require.resolve(specifier);
    }
  } catch {
    // Fall through to createRequire.
  }
  try {
    const base = getCurrentFilename() ?? path.join(process.cwd(), "package.json");
    const req = createRequire(base);
    return req.resolve(specifier);
  } catch {
    return undefined;
  }
}

function resolveAdapterPath(): string {
  for (const candidate of collectCandidatePaths()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const resolved = resolveViaRequire("paseo-sidecar/paseo-adapter");
  if (resolved && fs.existsSync(resolved)) {
    return resolved;
  }

  throw new Error(
    `Unable to locate paseo-sidecar "${ADAPTER_REL_PATH}". Build paseo-sidecar ("npm run build") or set PASEO_SIDECAR_ROOT.`,
  );
}

function importViaUrl<T>(filePath: string): Promise<T> {
  const moduleUrl = pathToFileURL(filePath).href;
  // Indirect dynamic import keeps esbuild from statically bundling outside the plugin boundary.
  const importRuntime = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<T>;
  return importRuntime(moduleUrl);
}

/** Lazily load and cache core Sidecar registry, discovery, convergence, and workspace modules. */
export async function loadCoreModules(): Promise<SidecarCoreModules> {
  if (!cachedCorePromise) {
    cachedCorePromise = (async () => {
      const adapterPath = resolveAdapterPath();
      const distRoot = path.resolve(path.dirname(adapterPath), "..");
      const [storeMod, discoverMod, installerMod, workspacesMod] = await Promise.all([
        importViaUrl<{
          UnifiedRegistry: SidecarCoreModules["UnifiedRegistry"];
          getSidecarHome: SidecarCoreModules["getSidecarHome"];
          getSidecarPaths: SidecarCoreModules["getSidecarPaths"];
        }>(path.join(distRoot, "registry", "store.js")),
        importViaUrl<{
          discoverPlatformAssets: SidecarCoreModules["discoverPlatformAssets"];
        }>(path.join(distRoot, "registry", "discover.js")),
        importViaUrl<{
          convergeHostAssets: SidecarCoreModules["convergeHostAssets"];
        }>(path.join(distRoot, "registry", "installer.js")),
        importViaUrl<{
          loadWorkspacesConfig: SidecarCoreModules["loadWorkspacesConfig"];
        }>(path.join(distRoot, "config", "workspaces.js")),
      ]);

      return {
        UnifiedRegistry: storeMod.UnifiedRegistry,
        getSidecarHome: storeMod.getSidecarHome,
        getSidecarPaths: storeMod.getSidecarPaths,
        discoverPlatformAssets: discoverMod.discoverPlatformAssets,
        convergeHostAssets: installerMod.convergeHostAssets,
        loadWorkspacesConfig: workspacesMod.loadWorkspacesConfig,
      };
    })().catch((err) => {
      cachedCorePromise = null;
      throw err;
    });
  }
  return cachedCorePromise;
}
