import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeType } from "../types.js";
import { BUILTIN_HOST_SKILLS, importMcpManifest, importSkillDeduplicated, isSelfSidecarId } from "./discover.js";
import { loadHostConfigs } from "./hosts-config.js";
import type { UnifiedRegistry } from "./store.js";

export interface HostPluginStatus {
  platform: RuntimeType;
  label: string;
  installed: boolean;
  targetPath: string;
  mcpConfigPath: string;
  skillsDir: string;
}

export function getHostPluginStatuses(registry: UnifiedRegistry, customHomeDir?: string): HostPluginStatus[] {
  return loadHostConfigs(registry, customHomeDir).map((cfg) => ({
    platform: cfg.platform,
    label: cfg.label,
    installed: existsSync(cfg.pluginTargetPath),
    targetPath: cfg.pluginTargetPath,
    mcpConfigPath: cfg.mcpConfigPath,
    skillsDir: cfg.skillsDir,
  }));
}

function resolveRuntimeEntry(...segments: string[]): string {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const siblingEntry = resolve(baseDir, "..", ...segments);
  if (existsSync(siblingEntry)) return siblingEntry;
  const distEntry = resolve(baseDir, "..", "..", "dist", ...segments);
  if (existsSync(distEntry)) return distEntry;
  return siblingEntry;
}

function buildMcpServerEntry(platform: RuntimeType, cwd?: string): Record<string, unknown> {
  const cliEntry = resolveRuntimeEntry("cli", "index.js");
  const args = [cliEntry, "mcp-stdio", "--runtime", platform];
  if (cwd) {
    args.push("--dir", cwd);
  }
  return {
    command: process.execPath,
    args,
  };
}

function writePluginPackage(
  rootDir: string,
  targetPath: string,
  platform: RuntimeType,
  cwd?: string,
): void {
  const pluginDir = dirname(targetPath);
  mkdirSync(pluginDir, { recursive: true });
  const shimEntry = resolveRuntimeEntry("shim", "index.js");
  const hookCommand = `"${process.execPath}" "${shimEntry}"`;
  const eventCommand = (ev: string) => `${hookCommand} --event ${ev} --runtime ${platform}`;
  const mcpServerEntry = buildMcpServerEntry(platform, cwd);

  if (platform === "gemini-cli") {
    const manifest = {
      name: "paseo-sidecar",
      displayName: "PaseoSidecar",
      version: "0.1.0",
      description: `Unified Single-Hook + Single-MCP plugin for ${platform}`,
    };
    writeFileSync(targetPath, JSON.stringify(manifest, null, 2));

    writeFileSync(
      join(rootDir, "mcp_config.json"),
      JSON.stringify({ mcpServers: { sidecar: mcpServerEntry } }, null, 2),
    );

    const flatHandler = (ev: string) => [{ type: "command", command: eventCommand(ev), timeout: 30 }];
    const groupedHandler = (ev: string) => [{ matcher: "*", hooks: flatHandler(ev) }];
    const agyHooks = {
      "paseo-sidecar": {
        SessionStart: flatHandler("SessionStart"),
        PreInvocation: flatHandler("PreInvocation"),
        PostInvocation: flatHandler("PostInvocation"),
        PreToolUse: groupedHandler("PreToolUse"),
        PostToolUse: groupedHandler("PostToolUse"),
        Stop: flatHandler("Stop"),
      },
    };
    writeFileSync(join(rootDir, "hooks.json"), JSON.stringify(agyHooks, null, 2));
    return;
  }

  const manifest = {
    id: "paseo-sidecar",
    name: "PaseoSidecar",
    version: "0.1.0",
    description: `Unified Single-Hook + Single-MCP plugin for ${platform}`,
    mcpServers: {
      sidecar: mcpServerEntry,
    },
  };
  writeFileSync(targetPath, JSON.stringify(manifest, null, 2));

  const hooksDir = join(rootDir, "hooks");
  mkdirSync(hooksDir, { recursive: true });
  const events = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "CwdChanged", "Stop"];
  const hooks: Record<string, unknown> = {};
  for (const ev of events) {
    hooks[ev] = [{ matcher: "*", hooks: [{ type: "command", command: eventCommand(ev), timeout: 30 }] }];
  }
  writeFileSync(join(hooksDir, "hooks.json"), JSON.stringify({ hooks }, null, 2));

  // Write .mcp.json inside the plugin root so the plugin carries the single sidecar stdio MCP
  writeFileSync(
    join(rootDir, ".mcp.json"),
    JSON.stringify({ mcpServers: { sidecar: mcpServerEntry } }, null, 2),
  );
}

function registerAndEnablePlugin(
  installedFile: string,
  settingsFile: string,
  installPath: string,
): void {
  const pluginsBaseDir = dirname(installedFile);
  mkdirSync(pluginsBaseDir, { recursive: true });
  const now = new Date().toISOString();

  // Register "local" marketplace so Claude Code / CCD does not fail with "Marketplace local not found"
  const marketplaceDir = join(pluginsBaseDir, "marketplaces", "local");
  const marketplaceMetaDir = join(marketplaceDir, ".claude-plugin");
  mkdirSync(marketplaceMetaDir, { recursive: true });
  rmSync(join(marketplaceDir, "sidecar-mcp"), { recursive: true, force: true });
  const marketplacePluginDir = join(marketplaceDir, "paseo-sidecar");
  rmSync(marketplacePluginDir, { recursive: true, force: true });
  cpSync(installPath, marketplacePluginDir, { recursive: true });
  writeFileSync(
    join(marketplaceMetaDir, "marketplace.json"),
    JSON.stringify(
      {
        name: "local",
        owner: { name: "PaseoSidecar" },
        plugins: [
          {
            name: "paseo-sidecar",
            source: "./paseo-sidecar",
            description: "Unified Single-Hook + Single-MCP plugin",
            version: "0.1.0",
          },
        ],
      },
      null,
      2,
    ),
  );

  const knownMarketplacesFile = join(pluginsBaseDir, "known_marketplaces.json");
  let knownMarketplaces: Record<string, unknown> = {};
  if (existsSync(knownMarketplacesFile)) {
    try {
      knownMarketplaces = JSON.parse(readFileSync(knownMarketplacesFile, "utf8")) as Record<string, unknown>;
    } catch {
      knownMarketplaces = {};
    }
  }
  knownMarketplaces["local"] = {
    source: { source: "directory", path: marketplaceDir },
    installLocation: marketplaceDir,
    lastUpdated: now,
  };
  writeFileSync(knownMarketplacesFile, JSON.stringify(knownMarketplaces, null, 2));

  let installedData: { version: number; plugins: Record<string, unknown[]> } = { version: 2, plugins: {} };
  if (existsSync(installedFile)) {
    try {
      installedData = JSON.parse(readFileSync(installedFile, "utf8")) as {
        version: number;
        plugins: Record<string, unknown[]>;
      };
      installedData.plugins ??= {};
    } catch {
      installedData = { version: 2, plugins: {} };
    }
  }
  delete installedData.plugins["sidecar-mcp@local"];
  installedData.plugins["paseo-sidecar@local"] = [
    {
      scope: "user",
      installPath,
      version: "0.1.0",
      installedAt: now,
      lastUpdated: now,
    },
  ];
  writeFileSync(installedFile, JSON.stringify(installedData, null, 2));

  mkdirSync(dirname(settingsFile), { recursive: true });
  let settingsData: Record<string, unknown> = {};
  if (existsSync(settingsFile)) {
    try {
      settingsData = JSON.parse(readFileSync(settingsFile, "utf8")) as Record<string, unknown>;
    } catch {
      settingsData = {};
    }
  }
  const enabledPlugins = (settingsData.enabledPlugins as Record<string, boolean>) ?? {};
  delete enabledPlugins["sidecar-mcp@local"];
  enabledPlugins["paseo-sidecar@local"] = true;
  settingsData.enabledPlugins = enabledPlugins;
  writeFileSync(settingsFile, JSON.stringify(settingsData, null, 2));
}

export function installSidecarPluginToHost(
  registry: UnifiedRegistry,
  platform: RuntimeType,
  portOrOptions: number | { cwd?: string } = 44880,
  customHomeDir?: string,
): { platform: RuntimeType; targetPath: string; transport: "stdio" } {
  const cfg = loadHostConfigs(registry, customHomeDir).find((c) => c.platform === platform);
  if (!cfg) {
    throw new Error(`Unknown host platform: ${platform}`);
  }

  const cwd = typeof portOrOptions === "object" ? portOrOptions.cwd : undefined;
  const targetPath = cfg.pluginTargetPath;
  const pluginDir = dirname(targetPath);
  const rootDir = pluginDir.endsWith("-plugin") || pluginDir.endsWith(".plugin") ? dirname(pluginDir) : pluginDir;

  writePluginPackage(rootDir, targetPath, platform, cwd);

  // Claude Code requires registration in installed_plugins.json + enabledPlugins in settings.json
  if (platform === "claude-code") {
    const home = dirname(dirname(dirname(rootDir)));
    registerAndEnablePlugin(
      join(home, ".claude", "plugins", "installed_plugins.json"),
      join(home, ".claude", "settings.json"),
      rootDir,
    );
  }

  // Claude Desktop / 3P Code tab (CCD) reads cowork_plugins/installed_plugins.json + cowork_settings.json
  if (platform === "claude-desktop" || platform === "claude-desktop-3p") {
    const appSupportBase = dirname(cfg.mcpConfigPath);
    const sessionsBase = join(appSupportBase, "local-agent-mode-sessions");
    if (existsSync(sessionsBase)) {
      for (const org of readdirSync(sessionsBase)) {
        if (org === "skills-plugin" || org.startsWith(".")) continue;
        const orgDir = join(sessionsBase, org);
        if (!statSync(orgDir).isDirectory()) continue;
        for (const account of readdirSync(orgDir)) {
          const accountDir = join(orgDir, account);
          if (!statSync(accountDir).isDirectory()) continue;
          const coworkPluginsDir = join(accountDir, "cowork_plugins");
          const coworkSettingsFile = join(accountDir, "cowork_settings.json");
          if (existsSync(coworkPluginsDir) || existsSync(coworkSettingsFile)) {
            rmSync(join(coworkPluginsDir, "sidecar-mcp"), { recursive: true, force: true });
            const coworkPluginRoot = join(coworkPluginsDir, "paseo-sidecar");
            const coworkManifestPath = join(coworkPluginRoot, ".claude-plugin", "plugin.json");
            writePluginPackage(coworkPluginRoot, coworkManifestPath, platform, cwd);
            registerAndEnablePlugin(
              join(coworkPluginsDir, "installed_plugins.json"),
              coworkSettingsFile,
              coworkPluginRoot,
            );
          }
        }
      }
    }
  }

  return { platform, targetPath, transport: "stdio" };
}

export function convergeHostAssets(
  registry: UnifiedRegistry,
  platform: RuntimeType,
  port = 44880,
  customHomeDir?: string,
): { platform: RuntimeType; movedSkills: number; movedMcps: number } {
  const cfg = loadHostConfigs(registry, customHomeDir).find((c) => c.platform === platform);
  if (!cfg) {
    throw new Error(`Unknown host platform: ${platform}`);
  }

  let movedSkills = 0;
  const skillDirsToConverge = [cfg.skillsDir];
  if (platform === "claude-desktop" || platform === "claude-desktop-3p") {
    const appSupportBase = dirname(cfg.skillsDir);
    const pluginBase = join(appSupportBase, "local-agent-mode-sessions", "skills-plugin");
    if (existsSync(pluginBase)) {
      for (const org of readdirSync(pluginBase)) {
        const orgDir = join(pluginBase, org);
        if (!statSync(orgDir).isDirectory()) continue;
        for (const user of readdirSync(orgDir)) {
          const sDir = join(orgDir, user, "skills");
          if (existsSync(sDir) && statSync(sDir).isDirectory()) {
            skillDirsToConverge.push(sDir);
          }
        }
      }
    }
  }

  for (const dir of skillDirsToConverge) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const skillPath = join(dir, entry);
      if (entry.startsWith(".") || BUILTIN_HOST_SKILLS.has(entry)) continue;
      if (!existsSync(skillPath)) {
        try {
          if (lstatSync(skillPath).isSymbolicLink()) {
            rmSync(skillPath, { recursive: true, force: true });
          }
        } catch {
          // ignore
        }
        continue;
      }
      try {
        if (statSync(skillPath).isDirectory()) {
          const res = importSkillDeduplicated(skillPath, entry, registry, platform);
          if (!res.skipped) {
            movedSkills++;
          }
        }
      } catch {
        rmSync(skillPath, { recursive: true, force: true });
      }
    }

    // Prune non-builtin entries from Claude Desktop skills-plugin manifest.json cache
    const manifestPath = join(dir, "..", "manifest.json");
    if (existsSync(manifestPath)) {
      try {
        const rawManifest = readFileSync(manifestPath, "utf8");
        const parsed = JSON.parse(rawManifest) as {
          skills?: Array<{ name?: string; skillId?: string; creatorType?: string; source?: string }>;
          [key: string]: unknown;
        };
        if (Array.isArray(parsed.skills)) {
          const backupDir = join(registry.paths.backupsDir, platform, "configs");
          mkdirSync(backupDir, { recursive: true });
          writeFileSync(join(backupDir, `skills-manifest-${Date.now()}.json`), rawManifest);
          parsed.skills = parsed.skills.filter(
            (s) =>
              s.creatorType === "anthropic" ||
              s.source === "anthropic" ||
              s.skillId?.startsWith("bundled:") ||
              (s.name ? BUILTIN_HOST_SKILLS.has(s.name) : false),
          );
          writeFileSync(manifestPath, JSON.stringify(parsed, null, 2));
        }
      } catch {
        // ignore malformed manifest
      }
    }
  }

  let movedMcps = 0;
  if (cfg.mcpConfigPath.endsWith(".json") && existsSync(cfg.mcpConfigPath)) {
    try {
      const raw = readFileSync(cfg.mcpConfigPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const mcpServers = (parsed.mcpServers as Record<string, Record<string, unknown>>) ?? {};

      // Backup original config before mutating
      const backupDir = join(registry.paths.backupsDir, platform, "configs");
      mkdirSync(backupDir, { recursive: true });
      writeFileSync(join(backupDir, `mcp-config-${Date.now()}.json`), raw);

      for (const [id, serverCfg] of Object.entries(mcpServers)) {
        if (!isSelfSidecarId(id)) {
          importMcpManifest(id, serverCfg, registry, undefined, platform);
          movedMcps++;
        }
      }
      parsed.mcpServers = {};
      writeFileSync(cfg.mcpConfigPath, JSON.stringify(parsed, null, 2));
    } catch {
      // ignore malformed json
    }
  }

  // Ensure sidecar itself is installed
  installSidecarPluginToHost(registry, platform, port, customHomeDir);
  return { platform, movedSkills, movedMcps };
}
