import { describe, expect, it, afterEach } from "vitest";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import {
  assertInsideManagedDataDir,
  assertNotGlobalUserConfig,
  isInsideManagedDataDir,
  syncBotToClaudeAgent,
  writeSessionRunArtifacts,
} from "../server/claude-agents";
import { syncSeatSkills } from "../server/library";
import { makeBot } from "./helpers";
import type { McpServerConfig } from "../shared/bot";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Seat Isolation & Managed-Directory Guard (WP-2)", () => {
  describe("assertInsideManagedDataDir", () => {
    it("accepts paths inside managed root and rejects paths outside", async () => {
      const managedRoot = await makeTempDir("seat-managed-root-");
      const insidePath = join(managedRoot, "shared", "Teams", "team1", "agents", "bot1");
      const insideFile = join(insidePath, ".claude", "skills", "my-skill");

      expect(() => assertInsideManagedDataDir(managedRoot, managedRoot)).not.toThrow();
      expect(() => assertInsideManagedDataDir(insidePath, managedRoot)).not.toThrow();
      expect(() => assertInsideManagedDataDir(insideFile, managedRoot)).not.toThrow();
      expect(isInsideManagedDataDir(insidePath, managedRoot)).toBe(true);

      // External repository path must be rejected
      const externalRepo = await makeTempDir("external-user-repo-");
      expect(() => assertInsideManagedDataDir(externalRepo, managedRoot)).toThrow(
        /Attempted to access path outside managed data directory/,
      );
      expect(() => assertInsideManagedDataDir(join(externalRepo, ".mcp.json"), managedRoot)).toThrow(
        /Attempted to access path outside managed data directory/,
      );
      expect(isInsideManagedDataDir(externalRepo, managedRoot)).toBe(false);
    });

    it("complements assertNotGlobalUserConfig by rejecting global user configurations", async () => {
      const managedRoot = await makeTempDir("seat-managed-root-");
      const home = homedir();

      expect(() => assertInsideManagedDataDir(join(home, ".claude.json"), managedRoot)).toThrow(
        /Attempted to write bot-specific configuration to global user config/,
      );
      expect(() => assertInsideManagedDataDir(join(home, ".claude", "settings.json"), managedRoot)).toThrow(
        /Attempted to write bot-specific configuration to global user config/,
      );
      expect(() => assertInsideManagedDataDir(join(home, ".gemini", "config", "skills"), managedRoot)).toThrow(
        /Attempted to write bot-specific configuration to global user config/,
      );
      expect(() => assertInsideManagedDataDir(join(home, ".gemini", "settings.json"), managedRoot)).toThrow(
        /Attempted to write bot-specific configuration to global user config/,
      );
    });
  });

  describe("syncSeatSkills", () => {
    it("isolates concurrent two-bot skill symlinks and prunes stale links only within respective seat dirs", async () => {
      const managedRoot = await makeTempDir("seat-skills-test-");
      const libDir = join(managedRoot, "library", "skills");
      await mkdir(join(libDir, "skill-alpha"), { recursive: true });
      await mkdir(join(libDir, "skill-beta"), { recursive: true });
      await mkdir(join(libDir, "skill-gamma"), { recursive: true });
      await writeFile(join(libDir, "skill-alpha", "SKILL.md"), "# Skill Alpha", "utf8");
      await writeFile(join(libDir, "skill-beta", "SKILL.md"), "# Skill Beta", "utf8");
      await writeFile(join(libDir, "skill-gamma", "SKILL.md"), "# Skill Gamma", "utf8");

      const resolveTarget = (id: string) => join(libDir, id);

      const seatA = join(managedRoot, "shared", "Teams", "team1", "agents", "bot-a");
      const seatB = join(managedRoot, "shared", "Teams", "team1", "agents", "bot-b");

      // Bot A uses alpha & beta; Bot B uses beta & gamma.
      // Run concurrently to verify collision-free isolation.
      const [mapA, mapB] = await Promise.all([
        syncSeatSkills(seatA, ["skill-alpha", "skill-beta"], {
          allowedRootOverride: managedRoot,
          resolveTargetPath: resolveTarget,
        }),
        syncSeatSkills(seatB, ["skill-beta", "skill-gamma"], {
          allowedRootOverride: managedRoot,
          resolveTargetPath: resolveTarget,
        }),
      ]);

      // Check returned maps point to seatDir/.agents/skills/<id>/SKILL.md
      expect(mapA.get("skill-alpha")).toBe(join(seatA, ".agents", "skills", "skill-alpha", "SKILL.md"));
      expect(mapA.get("skill-beta")).toBe(join(seatA, ".agents", "skills", "skill-beta", "SKILL.md"));
      expect(mapB.get("skill-beta")).toBe(join(seatB, ".agents", "skills", "skill-beta", "SKILL.md"));
      expect(mapB.get("skill-gamma")).toBe(join(seatB, ".agents", "skills", "skill-gamma", "SKILL.md"));

      // Verify physical symlinks in seat A for both .agents and .claude
      expect((await lstat(join(seatA, ".agents", "skills", "skill-alpha"))).isSymbolicLink()).toBe(true);
      expect((await lstat(join(seatA, ".agents", "skills", "skill-beta"))).isSymbolicLink()).toBe(true);
      expect((await lstat(join(seatA, ".claude", "skills", "skill-alpha"))).isSymbolicLink()).toBe(true);
      expect((await lstat(join(seatA, ".claude", "skills", "skill-beta"))).isSymbolicLink()).toBe(true);
      await expect(lstat(join(seatA, ".agents", "skills", "skill-gamma"))).rejects.toThrow();

      // Verify physical symlinks in seat B for both .agents and .claude
      expect((await lstat(join(seatB, ".agents", "skills", "skill-beta"))).isSymbolicLink()).toBe(true);
      expect((await lstat(join(seatB, ".agents", "skills", "skill-gamma"))).isSymbolicLink()).toBe(true);
      expect((await lstat(join(seatB, ".claude", "skills", "skill-beta"))).isSymbolicLink()).toBe(true);
      expect((await lstat(join(seatB, ".claude", "skills", "skill-gamma"))).isSymbolicLink()).toBe(true);
      await expect(lstat(join(seatB, ".agents", "skills", "skill-alpha"))).rejects.toThrow();

      // Ensure symlinks point to library copies
      expect(await readlink(join(seatA, ".agents", "skills", "skill-alpha"))).toBe(join(libDir, "skill-alpha"));
      expect(await readlink(join(seatB, ".claude", "skills", "skill-gamma"))).toBe(join(libDir, "skill-gamma"));

      // Add a regular file inside seat A to confirm non-symlinks and external files are untouched
      const regularFile = join(seatA, ".agents", "skills", "README.txt");
      await writeFile(regularFile, "Keep this file", "utf8");

      // Update Bot A skills: remove skill-beta, keep skill-alpha
      const updatedMapA = await syncSeatSkills(seatA, ["skill-alpha"], {
        allowedRootOverride: managedRoot,
        resolveTargetPath: resolveTarget,
      });

      expect(updatedMapA.has("skill-alpha")).toBe(true);
      expect(updatedMapA.has("skill-beta")).toBe(false);

      // In seat A: skill-beta must be pruned in both directories
      await expect(lstat(join(seatA, ".agents", "skills", "skill-beta"))).rejects.toThrow();
      await expect(lstat(join(seatA, ".claude", "skills", "skill-beta"))).rejects.toThrow();
      // Non-symlink regular file preserved
      expect(await readFile(regularFile, "utf8")).toBe("Keep this file");

      // In seat B: skill-beta MUST STILL BE INTACT (not affected by seat A pruning!)
      expect((await lstat(join(seatB, ".agents", "skills", "skill-beta"))).isSymbolicLink()).toBe(true);
      expect((await lstat(join(seatB, ".claude", "skills", "skill-beta"))).isSymbolicLink()).toBe(true);
    });

    it("rejects seatDir outside managed data directory", async () => {
      const managedRoot = await makeTempDir("seat-managed-");
      const externalSeat = await makeTempDir("external-seat-");

      await expect(
        syncSeatSkills(externalSeat, ["skill-one"], { allowedRootOverride: managedRoot }),
      ).rejects.toThrow(/Attempted to access path outside managed data directory/);
    });
  });

  describe("writeSessionRunArtifacts", () => {
    it("writes prompt snapshot and mcp config into runsDir guarded by managed data dir", async () => {
      const managedRoot = await makeTempDir("session-runs-test-");
      const runsDir = join(managedRoot, "shared", "Teams", "team1", "sessions", "sess-123", "runs");

      const mcpServers: Record<string, McpServerConfig> = {
        fetcher: { type: "stdio", command: "uvx", args: ["mcp-fetch"], env: { API_KEY: "secret" } },
      };

      const result = await writeSessionRunArtifacts({
        runsDir,
        agentId: "bot-worker",
        systemPrompt: "# Custom Worker Instructions\nOperate with precision.",
        mcpServers,
        allowedRootOverride: managedRoot,
      });

      expect(result.promptPath).toBe(join(runsDir, "bot-worker.prompt.md"));
      expect(result.mcpPath).toBe(join(runsDir, "bot-worker.mcp.json"));

      const promptContent = await readFile(result.promptPath, "utf8");
      expect(promptContent).toBe("# Custom Worker Instructions\nOperate with precision.");

      const mcpContent = JSON.parse(await readFile(result.mcpPath, "utf8"));
      expect(mcpContent.mcpServers.fetcher).toEqual({
        command: "uvx",
        args: ["mcp-fetch"],
        env: { API_KEY: "secret" },
      });
    });

    it("rejects runsDir outside managed data directory", async () => {
      const managedRoot = await makeTempDir("session-runs-valid-");
      const externalRunsDir = await makeTempDir("session-runs-external-");

      await expect(
        writeSessionRunArtifacts({
          runsDir: externalRunsDir,
          agentId: "bot-worker",
          systemPrompt: "test",
          allowedRootOverride: managedRoot,
        }),
      ).rejects.toThrow(/Attempted to access path outside managed data directory/);
    });
  });

  describe("syncBotToClaudeAgent external repository guard", () => {
    it("never writes .mcp.json or .claude/skills into external repository", async () => {
      const managedRoot = await makeTempDir("managed-data-root-");
      const externalRepo = await makeTempDir("user-project-repo-");
      const botDataDir = join(managedRoot, "shared", "Bots", "bot-cleaner");

      const bot = makeBot({
        id: "bot-cleaner",
        name: "CleanerBot",
        provider: "claude",
      });

      const mcpServers: Record<string, McpServerConfig> = {
        analyzer: { type: "stdio", command: "node", args: ["analyze.js"], env: {} },
      };
      const skills = ["audit-rule", "lint-check"];

      const res = await syncBotToClaudeAgent(bot, {
        projectDir: externalRepo,
        botDataDir,
        mcpServers,
        skills,
        syncMcpConfig: true,
        syncSkills: true,
        allowedRootOverride: managedRoot,
      });

      expect(res.synced).toBe(true);

      // Verify external repo is NOT polluted with .mcp.json or .claude/skills
      await expect(lstat(join(externalRepo, ".mcp.json"))).rejects.toThrow();
      await expect(lstat(join(externalRepo, ".claude", "skills"))).rejects.toThrow();
      await expect(lstat(join(externalRepo, ".claude", "agents"))).rejects.toThrow();

      // Session MCP config should be safely written to botDataDir
      const sessionMcpPath = join(botDataDir, "mcp.json");
      expect(res.mcpConfigPath).toBe(sessionMcpPath);
      const sessionMcp = JSON.parse(await readFile(sessionMcpPath, "utf8"));
      expect(sessionMcp.mcpServers.analyzer).toBeDefined();

      // skillsDir should NOT point to external repo
      expect(res.skillsDir).toBeUndefined();
    });
  });
});
