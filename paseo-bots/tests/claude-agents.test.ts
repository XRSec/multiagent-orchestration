import { describe, expect, it, afterEach } from "vitest";
import { lstat, mkdtemp, readFile, readlink, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import {
  assertNotGlobalUserConfig,
  defaultClaudeAgentsDir,
  defaultClaudeMcpPath,
  defaultClaudeSkillsDir,
  renderClaudeMcpConfig,
  resolveClaudeSystemPromptFlag,
  sessionClaudeMcpPath,
  syncAllBotsToClaude,
  syncBotToClaudeAgent,
  syncClaudeMcpConfig,
  syncClaudeSkills,
} from "../server/claude-agents";
import { systemPrompt } from "../server/prompt";
import {
  buildAgentConfig,
  EMPTY_LIBRARY,
  mcpServersRecord,
  type BotMcpServer,
  type Library,
  type McpServerConfig,
} from "../shared/bot";
import { makeBot, NOW } from "./helpers";

const tempDirs: string[] = [];
const previousPaseoHome = process.env.PASEO_HOME;

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  process.env.PASEO_BOTS_DATA_DIR = dir;
  process.env.PASEO_HOME = dir;
  return dir;
}

afterEach(async () => {
  delete process.env.PASEO_BOTS_DATA_DIR;
  if (previousPaseoHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = previousPaseoHome;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Claude Agent Per-Session MCP & Skill Injection", () => {
  it("enforces Zero Global Pollution by rejecting global user configurations", () => {
    const home = homedir();
    expect(() => assertNotGlobalUserConfig(join(home, ".claude.json"))).toThrow(
      /Attempted to write bot-specific configuration to global user config/,
    );
    expect(() => assertNotGlobalUserConfig(join(home, ".claude", "settings.json"))).toThrow(
      /Attempted to write bot-specific configuration to global user config/,
    );
    expect(() => assertNotGlobalUserConfig(join(home, ".gemini", "config", "skills"))).toThrow(
      /Attempted to write bot-specific configuration to global user config/,
    );
    expect(() => assertNotGlobalUserConfig(join(home, ".gemini", "settings.json"))).toThrow(
      /Attempted to write bot-specific configuration to global user config/,
    );

    // Non-global project paths must be accepted
    expect(() => assertNotGlobalUserConfig("/tmp/project/.claude/agents")).not.toThrow();
    expect(() => assertNotGlobalUserConfig("/tmp/project/.mcp.json")).not.toThrow();
  });

  it("syncs bot to .claude/agents/<id>.md with frontmatter skills and mcpServers", async () => {
    const root = await makeTempDir("claude-bot-session-");
    const agentsDir = join(root, ".claude", "agents");
    const botDataDir = join(root, "bot-data");
    const skillsDir = join(root, ".claude", "skills");

    const mcpServers: Record<string, McpServerConfig> = {
      fetcher: { type: "stdio", command: "uvx", args: ["mcp-fetch"], env: { KEY: "123" } },
      remote_service: { type: "http", url: "https://api.example.com/mcp", headers: { Authorization: "Bearer token" } },
    };
    const skills = ["code-review", "unit-test-runner"];

    const bot = makeBot({
      id: "bot-claude-worker",
      name: "WorkerBot",
      title: "Task Worker",
      description: "Handles complex coding jobs",
      soul: "Be thorough and precise.",
      provider: "claude",
      modeId: "auto",
      baseTools: ["file_read", "file_edit", "shell"],
    });

    const res = await syncBotToClaudeAgent(bot, {
      agentsDir,
      projectDir: root,
      botDataDir,
      skills,
      mcpServers,
      syncMcpConfig: true,
      syncSkills: false, // test frontmatter first
    });

    expect(res.synced).toBe(true);
    expect(res.changed).toBe(true);
    expect(res.claudeAgent).toBe("bot-claude-worker");

    const agentContent = await readFile(join(agentsDir, "bot-claude-worker.md"), "utf8");
    expect(agentContent).toContain("name: bot-claude-worker");
    expect(agentContent).toContain('description: "Handles complex coding jobs"');
    expect(agentContent).toContain("managedBy: paseo-bots");
    expect(agentContent).toContain("permissionMode: auto");
    expect(agentContent).toContain("tools:\n  - Read\n  - Edit\n  - Bash");
    expect(agentContent).toContain("skills:\n  - code-review\n  - unit-test-runner");
    expect(agentContent).toContain('mcpServers:\n  fetcher:\n    command: uvx\n    args:\n      - mcp-fetch\n    env:\n      KEY: 123\n  remote_service:\n    type: http\n    url: "https://api.example.com/mcp"\n    headers:\n      Authorization: "Bearer token"');

    // Idempotent sync
    const res2 = await syncBotToClaudeAgent(bot, {
      agentsDir,
      projectDir: root,
      botDataDir,
      skills,
      mcpServers,
      syncMcpConfig: true,
      syncSkills: false,
    });
    expect(res2.changed).toBe(false);
  });

  it("syncs project-scoped .mcp.json and session mcp.json without touching global configs", async () => {
    const root = await makeTempDir("claude-mcp-test-");
    const mcpPath = defaultClaudeMcpPath(root);
    const botDataDir = join(root, "bot-home");

    const initialMcp: Record<string, McpServerConfig> = {
      tools: { type: "stdio", command: "node", args: ["tools.js"], env: {} },
    };

    // First write
    const res1 = await syncClaudeMcpConfig(mcpPath, initialMcp);
    expect(res1.changed).toBe(true);

    const content1 = JSON.parse(await readFile(mcpPath, "utf8"));
    expect(content1.mcpServers.tools).toEqual({
      command: "node",
      args: ["tools.js"],
      env: {},
    });

    // Merge with an existing user server: user servers must be preserved
    await writeFile(
      mcpPath,
      JSON.stringify(
        {
          mcpServers: {
            user_custom: { command: "custom-cli", args: ["serve"] },
            tools: { command: "old-node", args: [] },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const nextMcp: Record<string, McpServerConfig> = {
      tools: { type: "stdio", command: "node", args: ["tools-updated.js"], env: { DEBUG: "1" } },
      new_remote: { type: "sse", url: "https://sse.example.com", headers: {} },
    };

    const res2 = await syncClaudeMcpConfig(mcpPath, nextMcp);
    expect(res2.changed).toBe(true);

    const content2 = JSON.parse(await readFile(mcpPath, "utf8"));
    // User server kept
    expect(content2.mcpServers.user_custom).toEqual({ command: "custom-cli", args: ["serve"] });
    // Bot tools updated
    expect(content2.mcpServers.tools).toEqual({
      command: "node",
      args: ["tools-updated.js"],
      env: { DEBUG: "1" },
    });
    // New remote added
    expect(content2.mcpServers.new_remote).toEqual({
      type: "sse",
      url: "https://sse.example.com",
      headers: {},
    });
  });

  it("links skills into .claude/skills and cleans up stale links", async () => {
    const root = await makeTempDir("claude-skills-test-");
    const skillsDir = defaultClaudeSkillsDir(root);
    const libDir = join(root, "library-skills");
    await mkdir(join(libDir, "skill-a"), { recursive: true });
    await mkdir(join(libDir, "skill-b"), { recursive: true });
    await mkdir(join(libDir, "skill-c"), { recursive: true });
    await writeFile(join(libDir, "skill-a", "SKILL.md"), "# Skill A", "utf8");
    await writeFile(join(libDir, "skill-b", "SKILL.md"), "# Skill B", "utf8");
    await writeFile(join(libDir, "skill-c", "SKILL.md"), "# Skill C", "utf8");

    const resolvePath = (id: string) => join(libDir, id);

    // Initial link of skill-a and skill-b
    const res1 = await syncClaudeSkills(skillsDir, ["skill-a", "skill-b"], resolvePath);
    expect(res1.linked).toEqual(["skill-a", "skill-b"]);
    expect(res1.removed).toEqual([]);

    const statA = await lstat(join(skillsDir, "skill-a"));
    expect(statA.isSymbolicLink()).toBe(true);
    expect(await readlink(join(skillsDir, "skill-a"))).toBe(join(libDir, "skill-a"));

    // Second sync: remove skill-a, keep skill-b, add skill-c
    const res2 = await syncClaudeSkills(skillsDir, ["skill-b", "skill-c"], resolvePath);
    expect(res2.linked).toEqual(["skill-b", "skill-c"]);
    expect(res2.removed).toEqual(["skill-a"]);

    // skill-a should no longer exist in skillsDir
    await expect(lstat(join(skillsDir, "skill-a"))).rejects.toThrow();
    // skill-c should exist
    expect((await lstat(join(skillsDir, "skill-c"))).isSymbolicLink()).toBe(true);
  });

  it("syncAllBotsToClaude syncs multiple bots and skips non-claude bots", async () => {
    const root = await makeTempDir("claude-sync-all-");
    const agentsDir = join(root, ".claude", "agents");

    const claudeBot1 = makeBot({
      id: "bot-c1",
      name: "Claude1",
      provider: "claude",
      description: "First Claude Bot",
    });
    const claudeBot2 = makeBot({
      id: "bot-c2",
      name: "Claude2",
      provider: "claude",
      description: "Second Claude Bot",
    });
    const agyBot = makeBot({
      id: "bot-agy",
      name: "AgyBot",
      provider: "gemini",
      description: "Gemini Bot",
    });

    const results = await syncAllBotsToClaude([claudeBot1, agyBot, claudeBot2], {
      agentsDir,
      projectDir: root,
      botDataDir: join(root, "bot-data"),
      resolveSkills: (bot) => (bot.id === "bot-c1" ? ["skill-alpha"] : ["skill-beta"]),
      resolveMcpServers: (bot) => ({
        [bot.id]: { type: "stdio", command: "echo", args: [bot.name], env: {} },
      }),
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.claudeAgent)).toEqual(["bot-c1", "bot-c2"]);

    const c1Content = await readFile(join(agentsDir, "bot-c1.md"), "utf8");
    expect(c1Content).toContain("skills:\n  - skill-alpha");
    expect(c1Content).toContain("mcpServers:\n  bot-c1:");

    const c2Content = await readFile(join(agentsDir, "bot-c2.md"), "utf8");
    expect(c2Content).toContain("skills:\n  - skill-beta");
    expect(c2Content).toContain("mcpServers:\n  bot-c2:");
  });

  it("buildAgentConfig includes skills, mcpServers, and mcpConfigPath", () => {
    const serverA = {
      id: "test-server",
      name: "test-server",
      enabled: true,
      config: { type: "stdio" as const, command: "test", args: [], env: {} },
    };
    const library: Library = {
      skills: [
        { id: "skill-one", description: "First skill", source: "local", enabled: true, createdAt: NOW, updatedAt: NOW },
        { id: "skill-two", description: "Second skill", source: "local", enabled: true, createdAt: NOW, updatedAt: NOW },
      ],
      mcpServers: [serverA as any],
    };
    const bot = makeBot({
      id: "bot-builder",
      provider: "claude",
      mcpServerIds: ["test-server"],
      skillIds: ["skill-one", "skill-two"],
    });

    // Automatically resolves skills from bot + library when omitted
    const configAuto = buildAgentConfig(
      bot,
      library,
      "claude-sonnet-4-5",
      "System Prompt",
      {},
      null,
      undefined,
      null,
      undefined,
      "/path/to/.mcp.json",
    );

    expect(configAuto.skills).toEqual(["skill-one", "skill-two"]);
    expect(configAuto.mcpServers?.["test-server"]).toBeDefined();
    expect(configAuto.mcpConfigPath).toBe("/path/to/.mcp.json");

    // Explicit skills override
    const configExplicit = buildAgentConfig(
      bot,
      library,
      "claude-sonnet-4-5",
      "System Prompt",
      {},
      null,
      undefined,
      null,
      ["custom-skill"],
    );
    expect(configExplicit.skills).toEqual(["custom-skill"]);
  });

  it("systemPrompt freshly injects skills and mcpServers into Claude agent files", async () => {
    const root = await makeTempDir("claude-prompt-test-");
    const agentsDir = join(root, ".claude", "agents");

    const server = {
      id: "weather",
      name: "weather",
      enabled: true,
      config: { type: "stdio" as const, command: "weather-cli", args: [], env: {} },
    };
    const library: Library = {
      skills: [{ id: "forecast", description: "Check weather", source: "local", enabled: true, createdAt: NOW, updatedAt: NOW }],
      mcpServers: [server as any],
    };
    const bot = makeBot({
      id: "bot-weather",
      name: "WeatherBot",
      provider: "claude",
      mcpServerIds: ["weather"],
      skillIds: ["forecast"],
    });

    const pluginServers = {
      tools: { type: "http" as const, url: "http://localhost:3000/tools", headers: {} },
    };

    const res = await systemPrompt(
      {
        bot,
        local: true,
        claudeAgentsDir: agentsDir,
        claudeProjectDir: root,
        claudeBotDataDir: join(root, "bot-data"),
        plugin: pluginServers,
      },
      library,
      null,
    );

    expect(res.systemPrompt).toContain("WeatherBot");
    expect(res.mcpConfigPath).toBe(join(root, ".mcp.json"));
    expect(res.skillsDir).toBe(join(root, ".claude", "skills"));

    const agentFile = join(agentsDir, "bot-weather.md");
    const agentContent = await readFile(agentFile, "utf8");
    expect(agentContent).toContain("name: bot-weather");
    expect(agentContent).toContain("skills:\n  - forecast");
    expect(agentContent).toContain("weather:");
    expect(agentContent).toContain("bots:"); // TOOLS_MCP_NAME ("bots")
  });

  it("honors systemPromptMode 'replace' vs 'append' in claude agent and CLI flag mapping", async () => {
    const root = await makeTempDir("claude-sysprompt-mode-");
    const agentsDir = join(root, "agents");

    const appendBot = makeBot({
      id: "bot-append",
      name: "AppendBot",
      provider: "claude",
      soul: "Follow strict rules.",
      systemPromptMode: "append",
    });

    const replaceBot = makeBot({
      id: "bot-replace",
      name: "ReplaceBot",
      provider: "claude",
      soul: "Exact custom prompt only.",
      systemPromptMode: "replace",
    });

    await syncBotToClaudeAgent(appendBot, { agentsDir, projectDir: root });
    await syncBotToClaudeAgent(replaceBot, { agentsDir, projectDir: root });

    const appendContent = await readFile(join(agentsDir, "bot-append.md"), "utf8");
    const replaceContent = await readFile(join(agentsDir, "bot-replace.md"), "utf8");

    expect(appendContent).toContain("You are AppendBot.");
    expect(appendContent).toContain("## Standing Instructions");
    expect(appendContent).toContain("Follow strict rules.");

    expect(replaceContent).toContain("Exact custom prompt only.");
    expect(replaceContent).not.toContain("You are ReplaceBot.");
    expect(replaceContent).not.toContain("## Standing Instructions");

    // CLI flag resolution test
    expect(resolveClaudeSystemPromptFlag("append", true)).toBe("--append-system-prompt-file");
    expect(resolveClaudeSystemPromptFlag("append", false)).toBe("--append-system-prompt");
    expect(resolveClaudeSystemPromptFlag("replace", true)).toBe("--system-prompt-file");
    expect(resolveClaudeSystemPromptFlag("replace", false)).toBe("--system-prompt");
  });
});
