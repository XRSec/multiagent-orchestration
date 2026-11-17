import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverPlatformAssets, importMcpManifest, importPluginWithPlatform, importSkillDeduplicated } from "../src/registry/discover.js";
import { installSidecarPluginToHost } from "../src/registry/installer.js";
import { UnifiedRegistry } from "../src/registry/store.js";
import { deleteLibraryAssetToTrash } from "../src/registry/trash.js";
import type { WorkspaceProfile } from "../src/types.js";

describe("UnifiedRegistry (~/.sidecar directory layout)", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("initializes unified directory structure and indexes skills, plugins, and mcps", async () => {
    const root = mkdtempSync(join(tmpdir(), "sidecar-home-"));
    tempDirs.push(root);

    const registry = new UnifiedRegistry(root);
    expect(existsSync(registry.paths.skillsDir)).toBe(true);
    expect(existsSync(registry.paths.pluginsCacheDir)).toBe(true);
    expect(existsSync(registry.paths.pluginsDataDir)).toBe(true);
    expect(existsSync(registry.paths.mcpsDir)).toBe(true);

    // 1. Add a standalone skill
    const skillDir = join(registry.paths.skillsDir, "go-review");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: go-review\ndescription: Go code review checklist\n---\n# Go Review\nCheck errors.",
    );

    // 2. Add a plugin in plugins/cache/stripe-official/1.2.0
    const pluginDir = join(registry.paths.pluginsCacheDir, "stripe-official", "1.2.0");
    mkdirSync(join(pluginDir, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(pluginDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "stripe-official", version: "1.2.0" }),
    );

    // 3. Add an MCP server manifest in mcps/
    writeFileSync(
      join(registry.paths.mcpsDir, "serena.json"),
      JSON.stringify({ id: "serena", scope: "workspace", command: "uvx", args: ["serena-mcp"] }),
    );

    const skills = registry.listStandaloneSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe("go-review");
    expect(skills[0].sha256).toMatch(/^[a-f0-9]{64}$/);

    const plugins = await registry.listPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0].plugin_id).toBe("stripe-official");
    expect(existsSync(join(registry.paths.pluginsDataDir, "stripe-official"))).toBe(true);

    const mcps = registry.listMcpServers();
    expect(mcps).toHaveLength(1);
    expect(mcps[0].scope).toBe("workspace");

    // 4. Filter by WorkspaceProfile
    const profile: WorkspaceProfile = {
      id: "go-backend",
      name: "go-backend",
      canonical_cwd: "/work/go",
      runtimes: ["claude-code"],
      plugins: [],
      enabled: true,
      metadata: {
        skills: ["go-review"],
        mcp_servers: ["serena"],
      },
    };
    const resolved = await registry.resolveWorkspaceAssets(profile);
    expect(resolved.skills.map((s) => s.id)).toEqual(["go-review"]);
    expect(resolved.mcps.map((m) => m.id)).toEqual(["serena"]);
  });

  it("installs gemini-cli / agy plugin into ~/.gemini/config/plugins with agy-native layout and stdio mcp", () => {
    const fakeHome = mkdtempSync(join(tmpdir(), "sidecar-agy-home-"));
    const sidecarHome = join(fakeHome, ".sidecar");
    tempDirs.push(fakeHome);

    const registry = new UnifiedRegistry(sidecarHome);
    const result = installSidecarPluginToHost(registry, "gemini-cli", { cwd: "/work/project-a" }, fakeHome);

    const pluginRoot = join(fakeHome, ".gemini", "config", "plugins", "paseo-sidecar");
    expect(result.targetPath).toBe(join(pluginRoot, "plugin.json"));
    expect(result.transport).toBe("stdio");
    expect(existsSync(join(pluginRoot, "plugin.json"))).toBe(true);
    expect(existsSync(join(pluginRoot, "mcp_config.json"))).toBe(true);
    expect(existsSync(join(pluginRoot, "hooks.json"))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(pluginRoot, "plugin.json"), "utf8")) as Record<string, unknown>;
    expect(manifest.name).toBe("paseo-sidecar");
    expect(manifest.version).toBe("0.1.0");

    const mcpCfg = JSON.parse(readFileSync(join(pluginRoot, "mcp_config.json"), "utf8")) as {
      mcpServers: { sidecar: { command: string; args: string[] } };
    };
    expect(mcpCfg.mcpServers.sidecar.command).toBe(process.execPath);
    expect(mcpCfg.mcpServers.sidecar.args).toEqual(
      expect.arrayContaining(["mcp-stdio", "--runtime", "gemini-cli", "--dir", "/work/project-a"]),
    );

    const hooksCfg = JSON.parse(readFileSync(join(pluginRoot, "hooks.json"), "utf8")) as {
      "paseo-sidecar": {
        SessionStart: unknown[];
        PreToolUse: Array<{ matcher: string; hooks: unknown[] }>;
      };
    };
    expect(Array.isArray(hooksCfg["paseo-sidecar"].SessionStart)).toBe(true);
    expect(hooksCfg["paseo-sidecar"].PreToolUse[0]?.matcher).toBe("*");
  });

  it("ignores self-generated agy MCP entries like paseo-sidecar_sidecar and sidecar-mcp_sidecar in discovery", () => {
    const fakeHome = mkdtempSync(join(tmpdir(), "sidecar-disc-home-"));
    const sidecarHome = join(fakeHome, ".sidecar");
    tempDirs.push(fakeHome);

    const agyMcpDir = join(fakeHome, ".gemini", "antigravity-cli", "mcp");
    mkdirSync(join(agyMcpDir, "paseo-sidecar_sidecar"), { recursive: true });
    mkdirSync(join(agyMcpDir, "sidecar-mcp_sidecar"), { recursive: true });
    mkdirSync(join(agyMcpDir, "custom-mcp"), { recursive: true });

    const registry = new UnifiedRegistry(sidecarHome);
    const discovered = discoverPlatformAssets(registry, fakeHome);
    const mcpIds = discovered.mcps.map((m) => m.id);
    expect(mcpIds).not.toContain("paseo-sidecar_sidecar");
    expect(mcpIds).not.toContain("sidecar-mcp_sidecar");
    expect(mcpIds).toContain("custom-mcp");
  });

  it("discovers symlinked skills in ~/.gemini/config/skills even when already imported", () => {
    const fakeHome = mkdtempSync(join(tmpdir(), "sidecar-gemini-skill-"));
    const sidecarHome = join(fakeHome, ".sidecar");
    tempDirs.push(fakeHome);

    const skillContent = "---\nname: gemini-research-exporter\ndescription: Export research\n---\n# Exporter\n";
    const externalSource = join(fakeHome, ".config", "magpie", "library", "skills", "gemini-research-exporter");
    mkdirSync(externalSource, { recursive: true });
    writeFileSync(join(externalSource, "SKILL.md"), skillContent);

    const geminiSkillsDir = join(fakeHome, ".gemini", "config", "skills");
    mkdirSync(geminiSkillsDir, { recursive: true });
    symlinkSync(externalSource, join(geminiSkillsDir, "gemini-research-exporter"));

    const registry = new UnifiedRegistry(sidecarHome);
    const importedSkillDir = join(registry.paths.skillsDir, "gemini-research-exporter");
    mkdirSync(importedSkillDir, { recursive: true });
    writeFileSync(join(importedSkillDir, "SKILL.md"), skillContent);

    const discovered = discoverPlatformAssets(registry, fakeHome);
    const match = discovered.skills.find(
      (s) => s.id === "gemini-research-exporter" && s.platform === "gemini-cli",
    );
    expect(match).toBeDefined();
    expect(match?.sourcePath).toBe(join(geminiSkillsDir, "gemini-research-exporter"));
    expect(match?.alreadyImported).toBe(true);
  });

  it("backs up and removes agy-mcp-dir on import so moving to trash does not resurface it on discover", () => {
    const fakeHome = mkdtempSync(join(tmpdir(), "sidecar-agy-mcp-home-"));
    const sidecarHome = join(fakeHome, ".sidecar");
    tempDirs.push(fakeHome);

    const agyMcpEntry = join(
      fakeHome,
      ".gemini",
      "antigravity",
      "mcp",
      "google-cloud-audit-manager-europe-west1",
    );
    mkdirSync(agyMcpEntry, { recursive: true });
    writeFileSync(
      join(agyMcpEntry, "enroll_resource.json"),
      JSON.stringify({ name: "enroll_resource", description: "Enroll resource" }),
    );

    const registry = new UnifiedRegistry(sidecarHome);
    const before = discoverPlatformAssets(registry, fakeHome);
    const mcp = before.mcps.find((m) => m.id === "google-cloud-audit-manager-europe-west1");
    expect(mcp).toBeDefined();
    expect(mcp?.alreadyImported).toBe(false);
    expect(mcp?.config).toEqual({ sourceDir: agyMcpEntry, type: "agy-mcp-dir" });

    const imported = importMcpManifest(
      mcp!.id,
      mcp!.config,
      registry,
      mcp!.sourceConfigFile,
      mcp!.platform,
    );
    expect(imported.status).toBe("imported");
    expect(imported.backupPath).toBeDefined();
    expect(existsSync(join(imported.backupPath!, "enroll_resource.json"))).toBe(true);
    expect(existsSync(agyMcpEntry)).toBe(false);

    const savedManifest = JSON.parse(readFileSync(imported.targetPath, "utf8")) as {
      sourceDir?: string;
      type?: string;
    };
    expect(savedManifest.type).toBe("agy-mcp-dir");
    expect(savedManifest.sourceDir).toBe(imported.backupPath);

    const afterImport = discoverPlatformAssets(registry, fakeHome);
    expect(afterImport.mcps.some((m) => m.id === "google-cloud-audit-manager-europe-west1")).toBe(false);

    deleteLibraryAssetToTrash(registry, "mcp", "google-cloud-audit-manager-europe-west1");

    const afterTrash = discoverPlatformAssets(registry, fakeHome);
    expect(afterTrash.mcps.some((m) => m.id === "google-cloud-audit-manager-europe-west1")).toBe(false);
  });

  it("convergeDirToSidecarWithSymlink moves real skill/plugin into ~/.sidecar, leaves symlink, handles idempotent re-run and dangling symlinks", () => {
    const fakeHome = mkdtempSync(join(tmpdir(), "sidecar-converge-home-"));
    const sidecarHome = join(fakeHome, ".sidecar");
    tempDirs.push(fakeHome);

    const registry = new UnifiedRegistry(sidecarHome);

    // 1. Real skill directory moved into ~/.sidecar/skills and replaced with a symlink
    const hostSkillsDir = join(fakeHome, ".gemini", "config", "skills");
    const hostSkillPath = join(hostSkillsDir, "code-audit");
    mkdirSync(hostSkillPath, { recursive: true });
    writeFileSync(join(hostSkillPath, "SKILL.md"), "---\nname: code-audit\n---\n# Code Audit\n");

    const firstImport = importSkillDeduplicated(hostSkillPath, "code-audit", registry, "gemini-cli");
    expect(firstImport.status).toBe("imported");
    expect(firstImport.symlinkCreated).toBe(true);
    expect(firstImport.skipped).toBeUndefined();
    expect(existsSync(join(firstImport.targetPath, "SKILL.md"))).toBe(true);
    expect(existsSync(join(firstImport.backupPath, ".backup-meta.json"))).toBe(true);
    expect(lstatSync(hostSkillPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(hostSkillPath)).toBe(firstImport.targetPath);

    // 2. Re-running on the managed symlink is idempotent and skipped
    const repeatImport = importSkillDeduplicated(hostSkillPath, "code-audit", registry, "gemini-cli");
    expect(repeatImport.status).toBe("deduplicated");
    expect(repeatImport.skipped).toBe(true);
    expect(lstatSync(hostSkillPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(hostSkillPath)).toBe(firstImport.targetPath);

    // 3. Dangling symlink at sourcePath is cleaned up and skipped
    const danglingSkillPath = join(hostSkillsDir, "dangling-skill");
    symlinkSync(join(fakeHome, "non-existent-target"), danglingSkillPath);
    expect(lstatSync(danglingSkillPath).isSymbolicLink()).toBe(true);

    const danglingResult = importSkillDeduplicated(danglingSkillPath, "dangling-skill", registry, "gemini-cli");
    expect(danglingResult.status).toBe("deduplicated");
    expect(danglingResult.skipped).toBe(true);
    expect(() => lstatSync(danglingSkillPath)).toThrow();
    expect(existsSync(join(registry.paths.skillsDir, "dangling-skill"))).toBe(false);

    // 4. Real plugin directory moved into ~/.sidecar/plugins/cache and replaced with a symlink
    const hostPluginPath = join(fakeHome, ".claude", "plugins", "cache", "demo-plugin", "1.0.0");
    mkdirSync(join(hostPluginPath, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(hostPluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "demo-plugin", version: "1.0.0" }),
    );

    const pluginImport = importPluginWithPlatform(hostPluginPath, "demo-plugin", "claude-code", "1.0.0", registry);
    expect(pluginImport.status).toBe("imported");
    expect(pluginImport.symlinkCreated).toBe(true);
    expect(existsSync(join(pluginImport.targetPath, ".claude-plugin", "plugin.json"))).toBe(true);
    expect(lstatSync(hostPluginPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(hostPluginPath)).toBe(pluginImport.targetPath);

    const pluginRepeat = importPluginWithPlatform(hostPluginPath, "demo-plugin", "claude-code", "1.0.0", registry);
    expect(pluginRepeat.status).toBe("deduplicated");
    expect(pluginRepeat.skipped).toBe(true);
  });
});
