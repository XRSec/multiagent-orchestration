import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { loadPluginBundle } from "../plugins/loader.js";
import type { NormalizedPluginBundle, WorkspaceProfile } from "../types.js";

export interface SidecarPaths {
  home: string;
  workspacesFile: string;
  skillsDir: string;
  pluginsCacheDir: string;
  pluginsDataDir: string;
  mcpsDir: string;
  backupsDir: string;
  hookSock: string;
}

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  rootPath: string;
  skillMdPath: string;
  sha256: string;
  source: "skill" | "plugin";
  pluginId?: string;
}

export interface McpServerManifest {
  id: string;
  scope: "shared" | "workspace" | "session";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  idle_timeout_sec?: number;
}

export const SIDECAR_DIR_NAME = ".sidecar";
export const SIDECAR_PLUGIN_ID = "paseo-sidecar";

export function getSidecarHome(customHome?: string): string {
  const candidate = customHome?.trim() || process.env.SIDECAR_HOME?.trim() || join(homedir(), SIDECAR_DIR_NAME);
  return resolve(candidate);
}

export function getSidecarPaths(customHome?: string): SidecarPaths {
  const home = getSidecarHome(customHome);
  return {
    home,
    workspacesFile: join(home, "workspaces.yaml"),
    skillsDir: join(home, "skills"),
    pluginsCacheDir: join(home, "plugins", "cache"),
    pluginsDataDir: join(home, "plugins", "data"),
    mcpsDir: join(home, "mcps"),
    backupsDir: join(home, "backups"),
    hookSock: join(home, "hook.sock"),
  };
}

export function ensureSidecarHome(customHome?: string): SidecarPaths {
  const paths = getSidecarPaths(customHome);
  for (const dir of [
    paths.home,
    paths.skillsDir,
    paths.pluginsCacheDir,
    paths.pluginsDataDir,
    paths.mcpsDir,
    paths.backupsDir,
  ]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
  return paths;
}

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const yamlBlock = match[1];
  const name = yamlBlock.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  const description = yamlBlock.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
  return { name, description };
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export class UnifiedRegistry {
  public readonly paths: SidecarPaths;

  constructor(customHome?: string) {
    this.paths = ensureSidecarHome(customHome);
  }

  listStandaloneSkills(): SkillEntry[] {
    if (!existsSync(this.paths.skillsDir)) return [];
    const results: SkillEntry[] = [];
    for (const entry of readdirSync(this.paths.skillsDir)) {
      const skillDir = join(this.paths.skillsDir, entry);
      if (!statSync(skillDir).isDirectory()) continue;
      const skillMdPath = join(skillDir, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;
      const content = readFileSync(skillMdPath, "utf8");
      const fm = parseFrontmatter(content);
      results.push({
        id: entry,
        name: fm.name ?? entry,
        description: fm.description ?? "",
        rootPath: skillDir,
        skillMdPath,
        sha256: sha256File(skillMdPath),
        source: "skill",
      });
    }
    return results;
  }

  async listPlugins(): Promise<NormalizedPluginBundle[]> {
    if (!existsSync(this.paths.pluginsCacheDir)) return [];
    const bundles: NormalizedPluginBundle[] = [];
    for (const pluginId of readdirSync(this.paths.pluginsCacheDir)) {
      const pluginBase = join(this.paths.pluginsCacheDir, pluginId);
      if (!statSync(pluginBase).isDirectory()) continue;
      const versions = readdirSync(pluginBase).filter((v) =>
        statSync(join(pluginBase, v)).isDirectory(),
      );
      if (versions.length === 0) continue;
      const latestVersion = versions.sort().at(-1)!;
      const pluginRoot = join(pluginBase, latestVersion);
      const pluginData = join(this.paths.pluginsDataDir, pluginId);
      if (!existsSync(pluginData)) mkdirSync(pluginData, { recursive: true });
      const bundle = await loadPluginBundle(pluginRoot);
      if (bundle) bundles.push(bundle);
    }
    return bundles;
  }

  listMcpServers(): McpServerManifest[] {
    if (!existsSync(this.paths.mcpsDir)) return [];
    const servers: McpServerManifest[] = [];
    for (const file of readdirSync(this.paths.mcpsDir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(readFileSync(join(this.paths.mcpsDir, file), "utf8")) as Partial<McpServerManifest>;
        const id = raw.id ?? file.replace(/\.json$/, "");
        servers.push({
          id,
          scope: raw.scope ?? "shared",
          command: raw.command,
          args: raw.args,
          env: raw.env,
          url: raw.url,
          idle_timeout_sec: raw.idle_timeout_sec,
        });
      } catch {
        // Ignore malformed MCP manifest files
      }
    }
    return servers;
  }

  async resolveWorkspaceAssets(profile?: WorkspaceProfile): Promise<{
    skills: SkillEntry[];
    plugins: NormalizedPluginBundle[];
    mcps: McpServerManifest[];
  }> {
    const allSkills = this.listStandaloneSkills();
    const allPlugins = await this.listPlugins();
    const allMcps = this.listMcpServers();

    if (!profile) {
      return { skills: allSkills, plugins: allPlugins, mcps: allMcps };
    }

    const allowedPlugins = new Set(profile.plugins);
    const metaSkills = Array.isArray(profile.metadata?.skills) ? (profile.metadata.skills as string[]) : [];
    const metaMcps = Array.isArray(profile.metadata?.mcp_servers) ? (profile.metadata.mcp_servers as string[]) : [];
    const allowedSkills = new Set(metaSkills);
    const allowedMcps = new Set(metaMcps);

    return {
      skills: allSkills.filter((s) => allowedSkills.size === 0 || allowedSkills.has(s.id)),
      plugins: allPlugins.filter((p) => allowedPlugins.size === 0 || allowedPlugins.has(p.plugin_id)),
      mcps: allMcps.filter((m) => allowedMcps.size === 0 || allowedMcps.has(m.id)),
    };
  }
}
