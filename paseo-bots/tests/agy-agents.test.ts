import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listOrphanedAgyAgents, resolveOrphanedAgyAgent, syncAllBotsToAgy, syncBotToAgyAgent } from "../server/agy-agents";
import { buildAgentConfig, EMPTY_LIBRARY, resolveAgyAgent } from "../shared/bot";
import { makeBot } from "./helpers";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("agy-agents", () => {
  it("preserves existing YAML frontmatter verbatim, writes full body referencing botDataPath/MEMORY.md directly (no symlinks), and is idempotent", async () => {
    const root = await makeTempDir("agy-agents-sync-");
    const agentsDir = join(root, "agents");
    const botDataDir = join(root, "bot-data");
    await mkdir(agentsDir, { recursive: true });

    const existingFrontmatter = [
      "---",
      "name: bot-agy-1",
      'description: "Original description"',
      "subagent: true",
      "mainAgent: true",
      "model: flash",
      "commandExecutionPolicy: auto",
      "tools:",
      "  - read_file",
      "  - edit_file",
      "---",
    ].join("\n");
    await writeFile(join(agentsDir, "bot-agy-1.md"), `${existingFrontmatter}\n\n# Old Prompt\n`, "utf8");

    const bot = makeBot({
      id: "bot-agy-1",
      name: "MoCode",
      title: "Code Architect",
      description: "Fullstack software engineer",
      soul: "Always write tests.",
      provider: "agy",
    });

    const memoryPath = join(botDataDir, "MEMORY.md");
    const fullBody = [
      "You are MoCode, a personal bot running inside Paseo.",
      "Role: Code Architect",
      "",
      `Your long-term memory lives in ${memoryPath}.`,
    ].join("\n");

    const first = await syncBotToAgyAgent(bot, { agentsDir, botDataDir, body: fullBody });
    expect(first).toEqual({ synced: true, agyAgent: "bot-agy-1", changed: true });

    const expectedFrontmatter = [
      "---",
      "name: bot-agy-1",
      'description: "Fullstack software engineer"',
      "subagent: true",
      "mainAgent: true",
      "model: flash",
      "commandExecutionPolicy: auto",
      "managedBy: paseo-bots",
      "tools:",
      "  - read_file",
      "  - edit_file",
      "---",
    ].join("\n");

    const content = await readFile(join(agentsDir, "bot-agy-1.md"), "utf8");
    expect(content).toBe(`${expectedFrontmatter}\n\n${fullBody}\n`);
    expect(content).toContain(memoryPath);
    expect(existsSync(join(agentsDir, "bot-agy-1"))).toBe(false);

    const second = await syncBotToAgyAgent(bot, { agentsDir, botDataDir, body: fullBody });
    expect(second).toEqual({ synced: true, agyAgent: "bot-agy-1", changed: false });
  });

  it("creates minimal frontmatter for new agents and falls back to botDataDir/MEMORY.md when body is omitted", async () => {
    const root = await makeTempDir("agy-agents-new-");
    const agentsDir = join(root, "agents");
    const botDataDir = join(root, "bot-data");

    const bot = makeBot({
      id: "bot-agy-2",
      name: "NewBot",
      title: "Helper",
      provider: "agy-acp",
    });

    const synced = await syncBotToAgyAgent(bot, { agentsDir, botDataDir });
    expect(synced).toEqual({ synced: true, agyAgent: "bot-agy-2", changed: true });

    const md = await readFile(join(agentsDir, "bot-agy-2.md"), "utf8");
    expect(md).toContain("name: bot-agy-2");
    expect(md).toContain("You are NewBot.");
    expect(md).toContain("inheritMcp: true");
    expect(md).toContain("commandExecutionPolicy: auto");
    expect(md).toContain("managedBy: paseo-bots");
    expect(md).toContain("  - invoke_subagent");
    expect(md).toContain("  - write_file");
    expect(md).toContain("  - run_command");
    expect(md).toContain(join(botDataDir, "MEMORY.md"));
    expect(md).toContain(join(botDataDir, "memory"));
    expect(existsSync(join(agentsDir, "bot-agy-2"))).toBe(false);
  });

  it("quotes special YAML names, preserves existing tools frontmatter, and skips non-agy providers", async () => {
    const root = await makeTempDir("agy-agents-id-");
    const agentsDir = join(root, "agents");
    const botDataDir = join(root, "bot-data");
    await mkdir(agentsDir, { recursive: true });

    await writeFile(
      join(agentsDir, "bot-agy-3.md"),
      "---\ntools:\n  - read_file\n  - bash\n---\n\n# Legacy\n",
      "utf8",
    );

    const bot = makeBot({
      id: "bot-agy-3",
      name: "Mo: Code #1",
      title: "Senior Engineer",
      description: "",
      provider: "agy",
    });

    const synced = await syncBotToAgyAgent(bot, { agentsDir, botDataDir });
    expect(synced).toEqual({ synced: true, agyAgent: "bot-agy-3", changed: true });

    const md = await readFile(join(agentsDir, "bot-agy-3.md"), "utf8");
    expect(md).toContain("name: bot-agy-3");
    expect(md).toContain("You are Mo: Code #1.");
    expect(md).toContain('description: "Senior Engineer"');
    expect(md).toContain("tools:\n  - read_file\n  - bash");

    const claudeBot = makeBot({ id: "bot-claude-1", provider: "claude" });
    const skipped = await syncBotToAgyAgent(claudeBot, { agentsDir, botDataDir });
    expect(skipped).toEqual({ synced: false, agyAgent: null, changed: false });
    expect(existsSync(join(agentsDir, "bot-claude-1.md"))).toBe(false);
  });

  it("resolves agyAgent to bot.id and sets providerOptions.agent while omitting systemPrompt for agy and agy-acp", () => {
    for (const provider of ["agy", "agy-acp"] as const) {
      const bot = makeBot({ provider });
      expect(resolveAgyAgent(bot)).toBe(bot.id);
      const config = buildAgentConfig(bot, EMPTY_LIBRARY, "flash", "sys");
      expect(config.providerOptions).toBeUndefined();
      expect(config.systemPrompt).toBe("sys");

      const staticConfig = buildAgentConfig(
        bot,
        EMPTY_LIBRARY,
        "flash",
        "sys",
        {},
        null,
        undefined,
        null,
        undefined,
        null,
        "append",
        { useStaticAgyAgent: true },
      );
      expect(staticConfig.providerOptions).toEqual({ agent: bot.id });
      expect("systemPrompt" in staticConfig).toBe(false);
    }

    const claudeBot = makeBot({ provider: "claude" });
    expect(resolveAgyAgent(claudeBot)).toBe("");
    const claudeConfig = buildAgentConfig(claudeBot, EMPTY_LIBRARY, "sonnet", "sys");
    expect("providerOptions" in claudeConfig).toBe(false);
    expect(claudeConfig.systemPrompt).toBe("sys");
  });

  it("syncAllBotsToAgy syncs multiple agy bots with custom bodies and skips non-agy bots", async () => {
    const root = await makeTempDir("agy-agents-sync-all-");
    const agentsDir = join(root, "agents");
    const botDataDir = join(root, "bot-data");

    const agyOne = makeBot({ id: "bot-one", name: "One", provider: "agy" });
    const agyTwo = makeBot({ id: "bot-two", name: "Two", provider: "agy-acp" });
    const claude = makeBot({ id: "bot-claude", name: "Claude", provider: "claude" });

    const results = await syncAllBotsToAgy([agyOne, claude, agyTwo], {
      agentsDir,
      botDataDir,
      resolveBody: (bot) => `Custom body for ${bot.id}`,
    });

    expect(results).toEqual([
      { synced: true, agyAgent: "bot-one", changed: true },
      { synced: true, agyAgent: "bot-two", changed: true },
    ]);
    expect(await readFile(join(agentsDir, "bot-one.md"), "utf8")).toContain("Custom body for bot-one");
    expect(await readFile(join(agentsDir, "bot-two.md"), "utf8")).toContain("Custom body for bot-two");
    expect(existsSync(join(agentsDir, "bot-claude.md"))).toBe(false);
  });

  it("listOrphanedAgyAgents detects only managedBy: paseo-bots files missing from active agy bots", async () => {
    const root = await makeTempDir("agy-agents-orphans-");
    const agentsDir = join(root, "agents");
    await mkdir(agentsDir, { recursive: true });

    const activeBot = makeBot({ id: "bot-active", provider: "agy" });
    const claudeBot = makeBot({ id: "bot-switched", provider: "claude" });

    await writeFile(
      join(agentsDir, "bot-active.md"),
      '---\nname: bot-active\ndescription: "Active"\nmanagedBy: paseo-bots\n---\n\nBody\n',
      "utf8",
    );
    await writeFile(
      join(agentsDir, "bot-switched.md"),
      '---\nname: bot-switched\ndescription: "Switched to Claude"\nmanagedBy: paseo-bots\n---\n\nBody\n',
      "utf8",
    );
    await writeFile(
      join(agentsDir, "bot-deleted.md"),
      '---\nname: bot-deleted\ndescription: "Deleted bot"\nmanagedBy: paseo-bots\n---\n\nBody\n',
      "utf8",
    );
    await writeFile(
      join(agentsDir, "manual-user-agent.md"),
      '---\nname: manual-user-agent\ndescription: "Hand-authored"\n---\n\nBody\n',
      "utf8",
    );
    await writeFile(
      join(agentsDir, "already.md.disabled"),
      '---\nname: already\ndescription: "Disabled"\nmanagedBy: paseo-bots\n---\n\nBody\n',
      "utf8",
    );

    const orphans = await listOrphanedAgyAgents([activeBot, claudeBot], agentsDir);
    expect(orphans).toEqual([
      {
        id: "bot-deleted",
        name: "bot-deleted",
        fileName: "bot-deleted.md",
        description: "Deleted bot",
      },
      {
        id: "bot-switched",
        name: "bot-switched",
        fileName: "bot-switched.md",
        description: "Switched to Claude",
      },
    ]);
  });

  it("resolveOrphanedAgyAgent supports disable, delete, and rejects path traversal or non-managed files", async () => {
    const root = await makeTempDir("agy-agents-resolve-");
    const agentsDir = join(root, "agents");
    await mkdir(agentsDir, { recursive: true });

    await writeFile(
      join(agentsDir, "orphan-disable.md"),
      '---\nname: orphan-disable\ndescription: "To disable"\nmanagedBy: paseo-bots\n---\n\nBody\n',
      "utf8",
    );
    await writeFile(
      join(agentsDir, "orphan-delete.md"),
      '---\nname: orphan-delete\ndescription: "To delete"\nmanagedBy: paseo-bots\n---\n\nBody\n',
      "utf8",
    );
    await writeFile(
      join(agentsDir, "unmanaged.md"),
      '---\nname: unmanaged\ndescription: "User file"\n---\n\nBody\n',
      "utf8",
    );

    const disabled = await resolveOrphanedAgyAgent("orphan-disable.md", "disable", [], agentsDir);
    expect(disabled).toEqual({
      ok: true,
      fileName: "orphan-disable.md",
      action: "disable",
      targetFileName: "orphan-disable.md.disabled",
    });
    expect(existsSync(join(agentsDir, "orphan-disable.md"))).toBe(false);
    expect(existsSync(join(agentsDir, "orphan-disable.md.disabled"))).toBe(true);

    const deleted = await resolveOrphanedAgyAgent("orphan-delete.md", "delete", [], agentsDir);
    expect(deleted).toEqual({
      ok: true,
      fileName: "orphan-delete.md",
      action: "delete",
    });
    expect(existsSync(join(agentsDir, "orphan-delete.md"))).toBe(false);

    await expect(resolveOrphanedAgyAgent("../escape.md", "delete", [], agentsDir)).rejects.toThrow("Invalid agent markdown filename");
    await expect(resolveOrphanedAgyAgent("sub/escape.md", "disable", [], agentsDir)).rejects.toThrow("Invalid agent markdown filename");
    await expect(resolveOrphanedAgyAgent("unmanaged.md", "delete", [], agentsDir)).rejects.toThrow("Orphaned paseo-bots agent file not found");
  });
});
