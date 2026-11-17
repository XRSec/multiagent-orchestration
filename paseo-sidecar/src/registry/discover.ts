/**
 * Purpose: Platform asset discovery for skills, plugins, and MCP servers across AI hosts.
 * Context: Scans host runtimes (Claude, Gemini CLI/AGY, Codex, OpenHands) for unconverged assets.
 * Usage: const assets = discoverPlatformAssets(registry, customHomeDir);
 * Prerequisites: Node fs, crypto, path, os.
 */
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { RuntimeType } from "../types.js";
import { loadHostConfigs } from "./hosts-config.js";
import { UnifiedRegistry } from "./store.js";

export interface DiscoveredSkill {
  id: string;
  platform: RuntimeType | "agents";
  sourcePath: string;
  sha256: string;
  alreadyImported: boolean;
}

export interface DiscoveredPlugin {
  id: string;
  platform: RuntimeType;
  sourcePath: string;
  version: string;
  alreadyImported: boolean;
}

export interface DiscoveredMcp {
  id: string;
  platform: RuntimeType;
  sourceConfigFile?: string;
  config: Record<string, unknown>;
  alreadyImported: boolean;
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export const BUILTIN_HOST_SKILLS = new Set([
  "consolidate-memory",
  "docx",
  "explain-usage",
  "frontend-design",
  "pdf",
  "pdf-reading",
  "pptx",
  "setup-claude",
  "setup-cowork",
  "xlsx",
]);

function readManifestBuiltinNames(skillsDir: string): Set<string> {
  const builtins = new Set<string>();
  const manifestPath = join(skillsDir, "..", "manifest.json");
  if (!existsSync(manifestPath)) return builtins;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      skills?: Array<{ name?: string; skillId?: string; creatorType?: string; source?: string }>;
    };
    for (const item of parsed.skills ?? []) {
      if (
        item.name &&
        (item.creatorType === "anthropic" ||
          item.source === "anthropic" ||
          item.skillId?.startsWith("bundled:"))
      ) {
        builtins.add(item.name);
      }
    }
  } catch {
    // ignore malformed manifest
  }
  return builtins;
}

function isDirSafe(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function findDesktopSessionSkillDirs(baseDir: string): string[] {
  const dirs: string[] = [];
  const pluginBase = join(baseDir, "local-agent-mode-sessions", "skills-plugin");
  if (!existsSync(pluginBase)) return dirs;
  for (const org of readdirSync(pluginBase)) {
    const orgDir = join(pluginBase, org);
    if (!isDirSafe(orgDir)) continue;
    for (const user of readdirSync(orgDir)) {
      const skillsDir = join(orgDir, user, "skills");
      if (isDirSafe(skillsDir)) {
        dirs.push(skillsDir);
      }
    }
  }
  return dirs;
}

export function isSelfSidecarId(id: string): boolean {
  const norm = id.trim().toLowerCase();
  return (
    norm === "sidecar" ||
    norm === "paseo-sidecar" ||
    norm === "paseo-sidecar_sidecar" ||
    norm === "paseo-sidecar-sidecar" ||
    norm === "paseo-sidecar:sidecar" ||
    norm.startsWith("paseo-sidecar_") ||
    norm === "sidecar-mcp" ||
    norm === "sidecar-mcp_sidecar" ||
    norm === "sidecar-mcp-sidecar" ||
    norm === "sidecar-mcp:sidecar" ||
    norm.startsWith("sidecar-mcp_")
  );
}

export function discoverPlatformAssets(registry: UnifiedRegistry, customHomeDir?: string): {
  skills: DiscoveredSkill[];
  plugins: DiscoveredPlugin[];
  mcps: DiscoveredMcp[];
} {
  const home = customHomeDir ?? homedir();
  const existingSkills = new Map(registry.listStandaloneSkills().map((s) => [s.id, s.sha256]));
  const existingMcps = new Set(registry.listMcpServers().map((m) => m.id));

  const hostCfgs = loadHostConfigs(registry, customHomeDir);
  const rawSkillRoots: Array<{ platform: RuntimeType | "agents"; dir: string }> = [
    ...hostCfgs.map((c) => ({ platform: c.platform, dir: c.skillsDir })),
    ...findDesktopSessionSkillDirs(join(home, "Library", "Application Support", "Claude")).map((dir) => ({
      platform: "claude-desktop" as RuntimeType,
      dir,
    })),
    ...findDesktopSessionSkillDirs(join(home, "Library", "Application Support", "Claude-3p")).map((dir) => ({
      platform: "claude-desktop-3p" as RuntimeType,
      dir,
    })),
    { platform: "gemini-cli", dir: join(home, ".gemini", "skills") },
    { platform: "gemini-cli", dir: join(home, ".gemini", "config", "skills") },
    { platform: "agents", dir: join(home, ".agents", "skills") },
  ];

  const seenSkillDirs = new Set<string>();
  const skillRoots = rawSkillRoots.filter((r) => {
    const abs = resolve(r.dir);
    if (seenSkillDirs.has(abs)) return false;
    seenSkillDirs.add(abs);
    return true;
  });

  const skills: DiscoveredSkill[] = [];
  for (const { platform, dir } of skillRoots) {
    if (!existsSync(dir)) continue;
    const manifestBuiltins = readManifestBuiltinNames(dir);
    for (const entry of readdirSync(dir)) {
      if (BUILTIN_HOST_SKILLS.has(entry) || manifestBuiltins.has(entry)) continue;
      const skillDir = join(dir, entry);
      const skillMd = join(skillDir, "SKILL.md");
      if (!isDirSafe(skillDir) || !existsSync(skillMd)) continue;
      const hash = sha256File(skillMd);
      skills.push({
        id: entry,
        platform,
        sourcePath: skillDir,
        sha256: hash,
        alreadyImported: existingSkills.get(entry) === hash,
      });
    }
  }

  const plugins: DiscoveredPlugin[] = [];
  const seenPlugins = new Set<string>();
  const addPlugin = (id: string, platform: RuntimeType, sourcePath: string, version = "1.0.0") => {
    const key = `${platform}:${id}`;
    if (seenPlugins.has(key) || isSelfSidecarId(id)) return;
    seenPlugins.add(key);
    const targetCache = join(registry.paths.pluginsCacheDir, `${platform}--${id}`);
    plugins.push({
      id,
      platform,
      sourcePath,
      version,
      alreadyImported: existsSync(targetCache),
    });
  };

  // 1. Claude Code: parse ~/.claude/plugins/installed_plugins.json
  const claudeInstalledFile = join(home, ".claude", "plugins", "installed_plugins.json");
  if (existsSync(claudeInstalledFile)) {
    try {
      const parsed = JSON.parse(readFileSync(claudeInstalledFile, "utf8")) as {
        plugins?: Record<string, Array<{ installPath?: string; version?: string }>>;
      };
      if (parsed.plugins) {
        for (const [key, entries] of Object.entries(parsed.plugins)) {
          const first = entries?.[0];
          if (first?.installPath && existsSync(first.installPath)) {
            const pluginId = key.split("@")[0];
            addPlugin(pluginId, "claude-code", first.installPath, first.version ?? "1.0.0");
          }
        }
      }
    } catch {
      // ignore malformed installed_plugins.json
    }
  }

  // 1b. Claude Code: scan ~/.claude/plugins/cache marketplace subdirectories
  const claudeCacheDir = join(home, ".claude", "plugins", "cache");
  if (existsSync(claudeCacheDir)) {
    try {
      for (const marketplace of readdirSync(claudeCacheDir)) {
        const mDir = join(claudeCacheDir, marketplace);
        if (!isDirSafe(mDir)) continue;
        for (const pName of readdirSync(mDir)) {
          const pDir = join(mDir, pName);
          if (!isDirSafe(pDir)) continue;
          const versions = readdirSync(pDir).filter((v) => isDirSafe(join(pDir, v)));
          if (versions.length === 0) continue;
          const latest = versions.sort().at(-1)!;
          const latestPath = join(pDir, latest);
          addPlugin(pName, "claude-code", latestPath, latest);
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Scan plugin directories across platforms (including ~/.gemini/config/plugins for agy)
  const skipDirs = new Set(["cache", "data", "marketplaces", "store", ".install-manifests", "paseo-sidecar", "sidecar-mcp"]);
  const pluginRoots: Array<{ platform: RuntimeType; dir: string }> = [
    { platform: "claude-code", dir: join(home, ".claude", "plugins") },
    { platform: "claude-desktop", dir: join(home, "Library", "Application Support", "Claude", "Claude Extensions") },
    { platform: "claude-desktop-3p", dir: join(home, "Library", "Application Support", "Claude-3p", "Claude Extensions") },
    { platform: "gemini-cli", dir: join(home, ".gemini", "config", "plugins") },
    { platform: "gemini-cli", dir: join(home, ".gemini", "antigravity-cli", "plugins") },
    { platform: "gemini-cli", dir: join(home, ".gemini", "antigravity", "plugins") },
    { platform: "codex", dir: join(home, ".codex", "plugins") },
    { platform: "openhands", dir: join(home, ".openhands", "plugins") },
  ];

  for (const { platform, dir } of pluginRoots) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (skipDirs.has(entry)) continue;
      const pDir = join(dir, entry);
      if (!isDirSafe(pDir)) continue;
      addPlugin(entry, platform, pDir, "1.0.0");
    }
  }

  // 3. Detect RTK hook/plugin in ~/.claude/settings.json if not already listed
  const claudeSettingsFile = join(home, ".claude", "settings.json");
  if (existsSync(claudeSettingsFile)) {
    try {
      const rawSettings = readFileSync(claudeSettingsFile, "utf8");
      if (rawSettings.includes("rtk") && !seenPlugins.has("claude-code:rtk")) {
        const rtkConfigDir = join(home, ".config", "rtk");
        if (existsSync(rtkConfigDir)) {
          addPlugin("rtk", "claude-code", rtkConfigDir, "1.0.0");
        }
      }
    } catch {
      // ignore
    }
  }

  const mcps: DiscoveredMcp[] = [];
  const seenMcps = new Set<string>();
  const mcpConfigs: Array<{ platform: RuntimeType; file: string }> = hostCfgs
    .filter((c) => c.mcpConfigPath.endsWith(".json"))
    .map((c) => ({ platform: c.platform, file: c.mcpConfigPath }));

  for (const { platform, file } of mcpConfigs) {
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { mcpServers?: Record<string, Record<string, unknown>> };
      if (!parsed.mcpServers) continue;
      for (const [id, cfg] of Object.entries(parsed.mcpServers)) {
        if (isSelfSidecarId(id)) continue;
        seenMcps.add(`${platform}:${id}`);
        mcps.push({
          id,
          platform,
          sourceConfigFile: file,
          config: cfg,
          alreadyImported: false,
        });
      }
    } catch {
      // ignore malformed json
    }
  }

  // 4. Discover agy directory-based MCPs (~/.gemini/antigravity-cli/mcp/* and ~/.gemini/antigravity/mcp/*)
  const agyMcpDirs = [
    join(home, ".gemini", "antigravity-cli", "mcp"),
    join(home, ".gemini", "antigravity", "mcp"),
  ];
  for (const agyMcpDir of agyMcpDirs) {
    if (!existsSync(agyMcpDir)) continue;
    for (const entry of readdirSync(agyMcpDir)) {
      if (isSelfSidecarId(entry)) continue;
      const entryPath = join(agyMcpDir, entry);
      if (!isDirSafe(entryPath) || seenMcps.has(`gemini-cli:${entry}`)) continue;
      seenMcps.add(`gemini-cli:${entry}`);
      mcps.push({
        id: entry,
        platform: "gemini-cli",
        config: { sourceDir: entryPath, type: "agy-mcp-dir" },
        alreadyImported: existingMcps.has(entry),
      });
    }
  }

  return { skills, plugins, mcps };
}

function makeBackupPath(registry: UnifiedRegistry, platform: string, kind: "skills" | "plugins" | "mcps", id: string): string {
  const base = join(registry.paths.backupsDir, platform, kind, id);
  if (!existsSync(base)) return base;
  return `${base}--${Date.now()}`;
}

export interface AssetImportResult {
  status: "imported" | "deduplicated";
  targetPath: string;
  backupPath: string;
  skipped?: boolean;
  symlinkCreated?: boolean;
}

function isSymlinkPointingTo(linkPath: string, targetPath: string): boolean {
  try {
    if (!lstatSync(linkPath).isSymbolicLink()) return false;
    if (!existsSync(linkPath) || !existsSync(targetPath)) return false;
    return realpathSync(linkPath) === realpathSync(targetPath);
  } catch {
    return false;
  }
}

function moveDirAtomicWithFallback(sourcePath: string, targetPath: string, isSourceSymlink: boolean): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  if (!isSourceSymlink) {
    try {
      renameSync(sourcePath, targetPath);
      return;
    } catch {
      // Cross-filesystem or busy target: fall back to staged copy + atomic rename
    }
  }
  const staging = `${targetPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    cpSync(sourcePath, staging, { recursive: true, dereference: true, force: true });
    renameSync(staging, targetPath);
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    throw err;
  }
  if (isSourceSymlink) {
    unlinkSync(sourcePath);
  } else {
    rmSync(sourcePath, { recursive: true, force: true });
  }
}

function convergeDirToSidecarWithSymlink(
  sourcePath: string,
  targetPath: string,
  backupPath: string,
  writeBackupMeta?: () => void,
): AssetImportResult {
  let isSymlink = false;
  try {
    isSymlink = lstatSync(sourcePath).isSymbolicLink();
  } catch {
    return { status: "deduplicated", targetPath, backupPath, skipped: true };
  }

  // Dangling symlink: clean up and skip
  if (!existsSync(sourcePath)) {
    try {
      unlinkSync(sourcePath);
    } catch {
      // ignore dangling symlink cleanup errors
    }
    return { status: "deduplicated", targetPath, backupPath, skipped: true };
  }

  // Already a valid symlink pointing to the managed sidecar target: skip
  if (isSymlink && isSymlinkPointingTo(sourcePath, targetPath)) {
    return { status: "deduplicated", targetPath, backupPath, skipped: true };
  }

  // Always preserve a dereferenced backup before moving/deduplicating
  cpSync(sourcePath, backupPath, { recursive: true, dereference: true, force: true });
  writeBackupMeta?.();

  const existed = existsSync(targetPath);
  if (existed) {
    if (isSymlink) {
      unlinkSync(sourcePath);
    } else {
      rmSync(sourcePath, { recursive: true, force: true });
    }
  } else {
    moveDirAtomicWithFallback(sourcePath, targetPath, isSymlink);
  }

  mkdirSync(dirname(sourcePath), { recursive: true });
  symlinkSync(targetPath, sourcePath, "dir");
  return {
    status: existed ? "deduplicated" : "imported",
    targetPath,
    backupPath,
    symlinkCreated: true,
  };
}

export function importSkillDeduplicated(
  sourcePath: string,
  id: string,
  registry: UnifiedRegistry,
  platform = "unknown",
): AssetImportResult {
  const targetPath = join(registry.paths.skillsDir, id);
  const backupPath = makeBackupPath(registry, platform, "skills", id);
  const home = homedir();
  const isGlobal =
    sourcePath.startsWith(join(home, ".")) ||
    sourcePath.startsWith(join(home, "Library", "Application Support"));

  return convergeDirToSidecarWithSymlink(sourcePath, targetPath, backupPath, () => {
    writeFileSync(
      join(backupPath, ".backup-meta.json"),
      JSON.stringify(
        {
          id,
          platform,
          scope: isGlobal ? "global" : "project",
          originalPath: sourcePath,
          backedUpAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });
}

export function importPluginWithPlatform(
  sourcePath: string,
  id: string,
  platform: RuntimeType,
  version: string,
  registry: UnifiedRegistry,
): AssetImportResult {
  const targetPath = join(registry.paths.pluginsCacheDir, `${platform}--${id}`, version);
  const backupPath = makeBackupPath(registry, platform, "plugins", id);
  return convergeDirToSidecarWithSymlink(sourcePath, targetPath, backupPath);
}

export function importMcpManifest(
  id: string,
  config: Record<string, unknown>,
  registry: UnifiedRegistry,
  sourceConfigFile?: string,
  platform = "unknown",
): { status: "imported" | "deduplicated"; targetPath: string; backupPath?: string } {
  const targetPath = join(registry.paths.mcpsDir, `${id}.json`);
  const existed = existsSync(targetPath);

  let effectiveConfig = config;
  let backupPath: string | undefined;

  // Back up and remove directory-based agy MCPs (~/.gemini/antigravity*/mcp/<id>) so host stays converged
  if (config.type === "agy-mcp-dir" && typeof config.sourceDir === "string" && config.sourceDir.length > 0) {
    const sourceDir = config.sourceDir;
    if (existsSync(sourceDir)) {
      backupPath = makeBackupPath(registry, platform, "mcps", id);
      cpSync(sourceDir, backupPath, { recursive: true, dereference: true, force: true });
      rmSync(sourceDir, { recursive: true, force: true });
      effectiveConfig = { ...config, sourceDir: backupPath };
    } else {
      try {
        rmSync(sourceDir, { recursive: true, force: true });
      } catch {
        // ignore dangling symlink cleanup errors
      }
    }
  }

  if (!existed) {
    writeFileSync(targetPath, JSON.stringify({ id, scope: "shared", ...effectiveConfig }, null, 2));
  }

  // Remove migrated MCP entry from host config file (after backing up) so host stays converged
  if (sourceConfigFile && existsSync(sourceConfigFile)) {
    try {
      const raw = readFileSync(sourceConfigFile, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const servers = parsed.mcpServers as Record<string, unknown> | undefined;
      if (servers && id in servers) {
        const backupDir = join(registry.paths.backupsDir, platform, "configs");
        mkdirSync(backupDir, { recursive: true });
        writeFileSync(join(backupDir, `mcp-config-${Date.now()}.json`), raw);
        delete servers[id];
        writeFileSync(sourceConfigFile, JSON.stringify(parsed, null, 2));
      }
    } catch {
      // ignore malformed host config
    }
  }

  return {
    status: existed ? "deduplicated" : "imported",
    targetPath,
    ...(backupPath ? { backupPath } : {}),
  };
}
