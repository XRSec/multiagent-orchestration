import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RuntimeType } from "../types.js";
import { SIDECAR_PLUGIN_ID, type UnifiedRegistry } from "./store.js";

function detectDesktopSkillsDir(appSupportBase: string, fallback: string): string {
  const pluginBase = join(appSupportBase, "local-agent-mode-sessions", "skills-plugin");
  if (existsSync(pluginBase)) {
    for (const org of readdirSync(pluginBase)) {
      const orgDir = join(pluginBase, org);
      if (!statSync(orgDir).isDirectory()) continue;
      for (const user of readdirSync(orgDir)) {
        const skillsDir = join(orgDir, user, "skills");
        if (existsSync(skillsDir) && statSync(skillsDir).isDirectory()) {
          return skillsDir;
        }
      }
    }
  }
  return fallback;
}

export interface HostPlatformConfig {
  platform: RuntimeType;
  label: string;
  pluginTargetPath: string;
  mcpConfigPath: string;
  skillsDir: string;
}

export function getDefaultHostConfigs(customHomeDir?: string): HostPlatformConfig[] {
  const home = customHomeDir ?? homedir();
  return [
    {
      platform: "claude-code",
      label: "Claude Code",
      pluginTargetPath: join(home, ".claude", "plugins", SIDECAR_PLUGIN_ID, ".claude-plugin", "plugin.json"),
      mcpConfigPath: join(home, ".claude.json"),
      skillsDir: join(home, ".claude", "skills"),
    },
    {
      platform: "claude-desktop",
      label: "Claude Desktop",
      pluginTargetPath: join(home, "Library", "Application Support", "Claude", "Claude Extensions", SIDECAR_PLUGIN_ID, "plugin.json"),
      mcpConfigPath: join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      skillsDir: detectDesktopSkillsDir(
        join(home, "Library", "Application Support", "Claude"),
        join(home, "Library", "Application Support", "Claude", "skills"),
      ),
    },
    {
      platform: "claude-desktop-3p",
      label: "Claude Desktop 3P",
      pluginTargetPath: join(home, "Library", "Application Support", "Claude-3p", "Claude Extensions", SIDECAR_PLUGIN_ID, "plugin.json"),
      mcpConfigPath: join(home, "Library", "Application Support", "Claude-3p", "claude_desktop_config.json"),
      skillsDir: detectDesktopSkillsDir(
        join(home, "Library", "Application Support", "Claude-3p"),
        join(home, "Library", "Application Support", "Claude-3p", "skills"),
      ),
    },
    {
      platform: "codex",
      label: "OpenAI Codex",
      pluginTargetPath: join(home, ".codex", "plugins", SIDECAR_PLUGIN_ID, ".codex-plugin", "plugin.json"),
      mcpConfigPath: join(home, ".codex", "config.toml"),
      skillsDir: join(home, ".codex", "skills"),
    },
    {
      platform: "cursor",
      label: "Cursor",
      pluginTargetPath: join(home, ".cursor", "plugins", SIDECAR_PLUGIN_ID, "plugin.json"),
      mcpConfigPath: join(home, ".cursor", "mcp.json"),
      skillsDir: join(home, ".cursor", "skills"),
    },
    {
      platform: "gemini-cli",
      label: "Gemini CLI / agy",
      pluginTargetPath: join(home, ".gemini", "config", "plugins", SIDECAR_PLUGIN_ID, "plugin.json"),
      mcpConfigPath: existsSync(join(home, ".gemini", "config", "mcp_config.json"))
        ? join(home, ".gemini", "config", "mcp_config.json")
        : join(home, ".gemini", "settings.json"),
      skillsDir: existsSync(join(home, ".gemini", "config", "skills"))
        ? join(home, ".gemini", "config", "skills")
        : join(home, ".gemini", "antigravity-cli", "skills"),
    },
    {
      platform: "openhands",
      label: "OpenHands",
      pluginTargetPath: join(home, ".openhands", "plugins", SIDECAR_PLUGIN_ID, ".plugin", "plugin.json"),
      mcpConfigPath: join(home, ".openhands", "settings.json"),
      skillsDir: join(home, ".openhands", "skills"),
    },
  ];
}

export function loadHostConfigs(registry: UnifiedRegistry, customHomeDir?: string): HostPlatformConfig[] {
  const defaults = getDefaultHostConfigs(customHomeDir);
  const hostsFile = join(registry.paths.home, "hosts.json");
  if (!existsSync(hostsFile)) return defaults;

  try {
    const overrides = JSON.parse(readFileSync(hostsFile, "utf8")) as Record<string, Partial<HostPlatformConfig>>;
    return defaults.map((d) => ({ ...d, ...(overrides[d.platform] ?? {}) }));
  } catch {
    return defaults;
  }
}

export function saveHostConfig(
  registry: UnifiedRegistry,
  platform: RuntimeType,
  patch: Partial<Pick<HostPlatformConfig, "pluginTargetPath" | "mcpConfigPath" | "skillsDir">>,
): HostPlatformConfig[] {
  const hostsFile = join(registry.paths.home, "hosts.json");
  let overrides: Record<string, Partial<HostPlatformConfig>> = {};
  if (existsSync(hostsFile)) {
    try {
      overrides = JSON.parse(readFileSync(hostsFile, "utf8")) as Record<string, Partial<HostPlatformConfig>>;
    } catch {
      overrides = {};
    }
  }
  overrides[platform] = { ...(overrides[platform] ?? {}), ...patch };
  writeFileSync(hostsFile, JSON.stringify(overrides, null, 2));
  return loadHostConfigs(registry);
}
