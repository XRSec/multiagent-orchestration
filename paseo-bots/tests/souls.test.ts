/**
 * Purpose: Test suite for decoupled bot soul markdown storage, prompt loading, and change persistence.
 * Context: Paseo bots plugin tests verifying soul decoupling from bots.json.
 * Usage: bun test tests/souls.test.ts
 * Prerequisites: Vitest / Bun test runner.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  botSoulPath,
  deleteBotSoul,
  deleteBotSoulSync,
  readBotSoul,
  readBotSoulSync,
  resolveSoulsDir,
  writeBotSoul,
  writeBotSoulSync,
} from "../server/souls";
import { systemPrompt } from "../server/prompt";
import { syncBotToAgyAgent } from "../server/agy-agents";
import { applyChanges, ChangesSchema, type ApplyContext } from "../shared/changes";
import { EMPTY_LIBRARY, type Bot } from "../shared/bot";

function sampleBot(overrides: Partial<Bot> = {}): Bot {
  return {
    id: "bot-test-pilot",
    name: "TestPilot",
    title: "Flight Tester",
    description: "Automated flight test bot",
    avatar: { seed: "pilot", palette: null, shape: "circle", imageUrl: null },
    soul: "",
    provider: "agy",
    model: "gemini-2.5-flash",
    modeId: null,
    thinkingOptionId: null,
    fallbackModels: [],
    providerConfigs: [],
    cwd: null,
    mounts: [],
    hostId: null,
    contactBots: "off",
    routines: [],
    playbooks: [],
    skillIds: [],
    mcpServerIds: [],
    alwaysAllow: [],
    apps: [],
    appRules: {},
    voice: { name: null, readReplies: false },
    pinned: false,
    archived: false,
    createdAt: "2026-11-16T00:00:00.000Z",
    updatedAt: "2026-11-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("Bot Souls Storage and Decoupling", () => {
  it("resolves default souls directory and rejects invalid bot IDs with path traversal", () => {
    const dir = resolveSoulsDir();
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);

    const soulPath = botSoulPath("bot-moadmin");
    expect(soulPath).toBe(join(dir, "bot-moadmin.md"));

    expect(() => botSoulPath("../evil")).toThrow(/invalid bot id/i);
    expect(() => botSoulPath("nested/bot")).toThrow(/invalid bot id/i);
    expect(() => botSoulPath(" ")).toThrow(/invalid bot id/i);
  });

  it("reads existing repository souls and falls back gracefully when missing", async () => {
    const moadminSoul = await readBotSoul("bot-moadmin");
    expect(moadminSoul).toContain("moAdmin");
    expect(moadminSoul).toContain("Prime Invariants");

    const syncMoadminSoul = readBotSoulSync("bot-moadmin");
    expect(syncMoadminSoul).toBe(moadminSoul);

    const missingAsync = await readBotSoul("bot-non-existent", "fallback instructions");
    expect(missingAsync).toBe("fallback instructions");

    const missingSync = readBotSoulSync("bot-non-existent", "sync fallback");
    expect(missingSync).toBe("sync fallback");
  });

  it("writes, reads, and deletes souls in custom test directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "paseo-souls-test-"));
    const previousPaseoHome = process.env.PASEO_HOME;
    try {
      const botId = "bot-custom-agent";
      const instructionText = "# Custom Agent\n\nExecute autonomous release cycles.";

      await writeBotSoul(botId, instructionText, tempDir);
      const loaded = await readBotSoul(botId, undefined, tempDir);
      expect(loaded).toBe(`${instructionText}\n`);

      const syncLoaded = readBotSoulSync(botId, undefined, tempDir);
      expect(syncLoaded).toBe(`${instructionText}\n`);

      const deletedAsync = await deleteBotSoul(botId, tempDir);
      expect(deletedAsync).toBe(true);

      const afterDelete = await readBotSoul(botId, "none", tempDir);
      expect(afterDelete).toBe("none");

      writeBotSoulSync(botId, instructionText, tempDir);
      expect(readBotSoulSync(botId, undefined, tempDir)).toBe(`${instructionText}\n`);

      const deletedSync = deleteBotSoulSync(botId, tempDir);
      expect(deletedSync).toBe(true);
      expect(readBotSoulSync(botId, "empty", tempDir)).toBe("empty");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("loads soul from souls/<bot-id>.md in systemPrompt even when bot.soul is empty", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "paseo-prompt-souls-"));
    const previousPaseoHome = process.env.PASEO_HOME;
    process.env.PASEO_HOME = tempDir;
    try {
      const bot = sampleBot({ id: "bot-prompt-tester", soul: "" });
      const promptInstructions = "## Rules\n\nAlways enforce zero TTY blocking.";
      await writeBotSoul(bot.id, promptInstructions, tempDir);

      const result = await systemPrompt(
        { bot, local: true, syncAgy: false, syncClaude: false, soulsDir: tempDir },
        EMPTY_LIBRARY,
        null,
        null,
      );

      expect(result.systemPrompt).toContain("BEGIN STANDING INSTRUCTIONS");
      expect(result.systemPrompt).toContain("Always enforce zero TTY blocking.");
      expect(result.systemPrompt).toContain("END STANDING INSTRUCTIONS");

      const standingSection = result.sections.find((s) => s.title === "Standing instructions");
      expect(standingSection).toBeDefined();
      expect(standingSection?.text).toContain("Always enforce zero TTY blocking.");
    } finally {
      if (previousPaseoHome === undefined) delete process.env.PASEO_HOME;
      else process.env.PASEO_HOME = previousPaseoHome;
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("syncBotToAgyAgent renders soul from souls/<bot-id>.md when body is omitted", async () => {
    const tempSoulsDir = await mkdtemp(join(tmpdir(), "paseo-agy-souls-"));
    const tempAgentsDir = await mkdtemp(join(tmpdir(), "paseo-agy-agents-"));
    const tempBotDataDir = await mkdtemp(join(tmpdir(), "paseo-agy-botdata-"));
    try {
      const bot = sampleBot({ id: "bot-agy-tester", soul: "" });
      const agentInstructions = "Perform automated linting and static analysis.";
      await writeBotSoul(bot.id, agentInstructions, tempSoulsDir);

      const syncResult = await syncBotToAgyAgent(bot, {
        agentsDir: tempAgentsDir,
        botDataDir: tempBotDataDir,
        soulsDir: tempSoulsDir,
      });

      expect(syncResult.synced).toBe(true);

      const agentFile = join(tempAgentsDir, `${bot.id}.md`);
      const fileContent = await readFile(agentFile, "utf8");
      expect(fileContent).toContain("## Standing Instructions");
      expect(fileContent).toContain(agentInstructions);
    } finally {
      await rm(tempSoulsDir, { recursive: true, force: true });
      await rm(tempAgentsDir, { recursive: true, force: true });
      await rm(tempBotDataDir, { recursive: true, force: true });
    }
  });

  it("applyChanges decouples soul writes and strips soul from settings when requested", async () => {
    const tempSoulsDir = await mkdtemp(join(tmpdir(), "paseo-changes-souls-"));
    try {
      const existingBot = sampleBot({ id: "bot-scout", name: "Scout", soul: "" });
      const baseValues = { bots: [existingBot], history: [] };

      const savedMap = new Map<string, string>();
      const context: ApplyContext = {
        now: "2026-11-16T00:00:00.000Z",
        provider: "agy",
        saveSoul: (botId, soul) => {
          savedMap.set(botId, soul);
          writeBotSoulSync(botId, soul, tempSoulsDir);
        },
        stripSoulInSettings: true,
      };

      const changes = ChangesSchema.parse([
        {
          type: "update_bot",
          bot: "Scout",
          instructions: "New scout directives: scout tech dependencies.",
        },
        {
          type: "create_bot",
          name: "Deployer",
          role: "assistant",
          instructions: "Automated git tagging and deploy orchestration.",
        },
      ]);

      const result = applyChanges(baseValues, changes, context);

      const scout = result.bots.find((b) => b.name === "Scout");
      expect(scout).toBeDefined();
      expect(scout?.soul).toBe("");

      const deployer = result.bots.find((b) => b.name === "Deployer");
      expect(deployer).toBeDefined();
      expect(deployer?.soul).toBe("");

      expect(savedMap.get("bot-scout")).toBe("New scout directives: scout tech dependencies.");
      expect(savedMap.get(deployer!.id)).toBe("Automated git tagging and deploy orchestration.");

      expect(readBotSoulSync("bot-scout", undefined, tempSoulsDir)).toContain("New scout directives");
      expect(readBotSoulSync(deployer!.id, undefined, tempSoulsDir)).toContain("Automated git tagging");
    } finally {
      await rm(tempSoulsDir, { recursive: true, force: true });
    }
  });

  it("validates all 15 repository bots have decoupled souls and slim bots.json", async () => {
    const botsJsonPath = resolve(__dirname, "../../paseo-bots-plugin-settings/bots.json");
    const jsonContent = await readFile(botsJsonPath, "utf8");
    const rawData = JSON.parse(jsonContent) as { version: number; values: { bots: Bot[] } };

    expect(rawData.version).toBe(4);
    expect(rawData.values.bots.length).toBe(15);

    const soulsDir = resolveSoulsDir();
    for (const bot of rawData.values.bots) {
      expect(bot.soul).toBe("");
      const soulPath = join(soulsDir, `${bot.id}.md`);
      const soulText = await readFile(soulPath, "utf8");
      expect(soulText.trim().length).toBeGreaterThan(0);
      expect(soulText).not.toContain("# System Prompt");
      expect(soulText).not.toContain("<System Prompt>");
    }

    const botsSize = Buffer.byteLength(JSON.stringify(rawData.values.bots), "utf8");
    expect(botsSize).toBeLessThan(25_000);
    const fileSize = Buffer.byteLength(jsonContent, "utf8");
    const compactSize = Buffer.byteLength(JSON.stringify(rawData), "utf8");
    expect(compactSize).toBeLessThan(150_000);
    expect(fileSize).toBeLessThan(200_000);
  });
});
