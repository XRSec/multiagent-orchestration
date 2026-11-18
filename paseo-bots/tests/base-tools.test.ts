import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AGY_BASE_TOOLS,
  CLAUDE_BASE_TOOLS,
  CODEX_BASE_TOOLS,
  providerBaseTools,
  isAgyProvider,
} from "../shared/bot-tools";
import {
  applyProviderConfig,
  botProviderConfigs,
  buildAgentConfig,
  EMPTY_LIBRARY,
  resolveBotBaseTools,
  BotSchema,
  BotProviderConfigSchema,
  type Bot,
} from "../shared/bot";
import { applyChanges, botDetails, setupOverview } from "../shared/changes";
import { syncBotToAgyAgent } from "../server/agy-agents";

function makeBot(overrides: Partial<Bot> = {}): Bot {
  return BotSchema.parse({
    id: "bot-test",
    name: "TestBot",
    provider: "agy",
    avatar: { seed: "seed" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("Base Tools Catalog and Permissions", () => {
  it("provides correct base tool catalogs per provider", () => {
    expect(providerBaseTools("agy")).toEqual(AGY_BASE_TOOLS);
    expect(providerBaseTools("agy-acp")).toEqual(AGY_BASE_TOOLS);
    expect(providerBaseTools("claude")).toEqual(CLAUDE_BASE_TOOLS);
    expect(providerBaseTools("claude-code")).toEqual(CLAUDE_BASE_TOOLS);
    expect(providerBaseTools("codex")).toEqual(CODEX_BASE_TOOLS);
    expect(providerBaseTools("unknown")).toEqual([]);
    expect(isAgyProvider("agy")).toBe(true);
    expect(isAgyProvider("agy-acp")).toBe(true);
    expect(isAgyProvider("claude")).toBe(false);
  });

  it("handles baseTools in BotSchema and BotProviderConfigSchema", () => {
    const config = BotProviderConfigSchema.parse({
      provider: "agy",
      baseTools: ["invoke_subagent", "send_message"],
    });
    expect(config.baseTools).toEqual(["invoke_subagent", "send_message"]);

    const defaultConfig = BotProviderConfigSchema.parse({ provider: "agy" });
    expect(defaultConfig.baseTools).toBeUndefined();

    const botWithTools = makeBot({
      baseTools: ["read_file", "write_file"],
      providerConfigs: [config],
    });
    expect(botWithTools.baseTools).toEqual(["read_file", "write_file"]);
    expect(botWithTools.providerConfigs[0]?.baseTools).toEqual(["invoke_subagent", "send_message"]);
  });

  it("propagates and resolves baseTools correctly across provider configs", () => {
    const bot = makeBot({
      provider: "agy",
      baseTools: ["invoke_subagent", "send_message"],
      providerConfigs: [
        {
          provider: "agy",
          model: null,
          modeId: null,
          thinkingOptionId: null,
          fallbackModels: [],
          baseTools: ["invoke_subagent", "send_message"],
        },
        {
          provider: "claude",
          model: "sonnet",
          modeId: null,
          thinkingOptionId: null,
          fallbackModels: [],
          baseTools: ["Read", "Grep"],
        },
      ],
    });

    const configs = botProviderConfigs(bot);
    expect(configs[0]?.baseTools).toEqual(["invoke_subagent", "send_message"]);
    expect(configs[1]?.baseTools).toEqual(["Read", "Grep"]);

    expect(resolveBotBaseTools(bot)).toEqual(["invoke_subagent", "send_message"]);
    expect(resolveBotBaseTools(bot, "claude")).toEqual(["Read", "Grep"]);

    const switched = applyProviderConfig(bot, configs[1]!);
    expect(switched.provider).toBe("claude");
    expect(switched.baseTools).toEqual(["Read", "Grep"]);
  });

  it("isolates baseTools across agy <-> claude switching and prevents cross-provider pollution", () => {
    const agyTools = ["invoke_subagent", "send_message"];
    const claudeTools = ["Task", "TodoWrite", "Skill"];

    // Simulate stale top-level baseTools from agy when provider is claude
    const pollutedClaudeBot = makeBot({
      provider: "claude",
      baseTools: agyTools,
      providerConfigs: [
        {
          provider: "agy",
          model: "gemini-4-hydrogen",
          modeId: null,
          thinkingOptionId: null,
          fallbackModels: [],
          baseTools: agyTools,
        },
        {
          provider: "claude",
          model: "claude-fable-5",
          modeId: null,
          thinkingOptionId: null,
          fallbackModels: [],
          baseTools: claudeTools,
        },
      ],
    });

    expect(resolveBotBaseTools(pollutedClaudeBot)).toEqual(claudeTools);
    expect(resolveBotBaseTools(pollutedClaudeBot, "agy")).toEqual(agyTools);

    const claudeAgentConfig = buildAgentConfig(pollutedClaudeBot, EMPTY_LIBRARY, "claude-fable-5", "sys");
    expect(claudeAgentConfig.providerOptions).toEqual({
      allowedTools: claudeTools,
    });

    // Fallback to top-level bot.baseTools when target === bot.provider and matching providerConfig has no baseTools
    const fallbackAgyBot = makeBot({
      provider: "agy",
      baseTools: agyTools,
      providerConfigs: [
        {
          provider: "agy",
          model: "gemini-4-hydrogen",
          modeId: null,
          thinkingOptionId: null,
          fallbackModels: [],
        },
        {
          provider: "claude",
          model: "claude-fable-5",
          modeId: null,
          thinkingOptionId: null,
          fallbackModels: [],
          baseTools: claudeTools,
        },
      ],
    });

    expect(resolveBotBaseTools(fallbackAgyBot)).toEqual(agyTools);
    expect(resolveBotBaseTools(fallbackAgyBot, "claude")).toEqual(claudeTools);

    // Switching agy -> claude -> agy via applyProviderConfig keeps baseTools isolated in buildAgentConfig
    const configs = botProviderConfigs(fallbackAgyBot);
    const toClaude = applyProviderConfig(fallbackAgyBot, configs[1]!);
    expect(buildAgentConfig(toClaude, EMPTY_LIBRARY, "claude-fable-5", "sys").providerOptions).toEqual({
      allowedTools: claudeTools,
    });

    const backToAgy = applyProviderConfig(toClaude, configs[0]!);
    const agyAgentConfig = buildAgentConfig(backToAgy, EMPTY_LIBRARY, "gemini-4-hydrogen", "sys");
    expect(agyAgentConfig.providerOptions).toEqual({ tools: agyTools });
  });

  it("enforces baseTools in buildAgentConfig for claude and codex", () => {
    const defaultClaudeBot = makeBot({ provider: "claude" });
    const defaultClaudeConfig = buildAgentConfig(defaultClaudeBot, EMPTY_LIBRARY, "sonnet", "sys");
    expect("providerOptions" in defaultClaudeConfig).toBe(false);

    const restrictedClaudeBot = makeBot({
      provider: "claude",
      baseTools: ["Read", "Grep", "Bash"],
    });
    const restrictedClaudeConfig = buildAgentConfig(restrictedClaudeBot, EMPTY_LIBRARY, "sonnet", "sys");
    expect(restrictedClaudeConfig.providerOptions).toEqual({
      allowedTools: ["Read", "Grep", "Bash"],
    });

    const codexBot = makeBot({
      provider: "codex",
      baseTools: ["read_file", "exec"],
    });
    const codexConfig = buildAgentConfig(codexBot, EMPTY_LIBRARY, "o3", "sys");
    expect(codexConfig.providerOptions).toEqual({
      tools: ["read_file", "exec"],
    });
  });

  it("syncs explicit baseTools to Antigravity agent frontmatter and overwrites existing tools", async () => {
    const dir = join(tmpdir(), `test-agy-tools-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    const agentsDir = join(dir, "agents");
    const botDataDir = join(dir, "bot-data");
    await mkdir(agentsDir, { recursive: true });

    // Existing file with 12 tools
    const agentPath = join(agentsDir, "bot-test.md");
    await writeFile(
      agentPath,
      [
        "---",
        "name: bot-test",
        'description: "Old description"',
        "subagent: true",
        "tools:",
        "  - read_file",
        "  - edit_file",
        "  - write_file",
        "  - run_command",
        "---",
        "",
        "# Old Body",
      ].join("\n"),
      "utf8",
    );

    const customTools = [
      "invoke_subagent",
      "define_subagent",
      "manage_subagents",
      "send_message",
      "manage_task",
      "schedule",
      "ask_question",
    ];

    const bot = makeBot({
      id: "bot-test",
      name: "moAdmin",
      baseTools: customTools,
    });

    const result = await syncBotToAgyAgent(bot, { agentsDir, botDataDir });
    expect(result.synced).toBe(true);
    expect(result.changed).toBe(true);

    const updatedMd = await readFile(agentPath, "utf8");
    for (const tool of customTools) {
      expect(updatedMd).toContain(`  - ${tool}`);
    }
    expect(updatedMd).not.toContain("  - read_file");
    expect(updatedMd).not.toContain("  - edit_file");
    expect(updatedMd).not.toContain("  - write_file");
    expect(updatedMd).not.toContain("  - run_command");
  });

  it("updates base_tools via propose_changes and formats in setup overview and bot details", () => {
    const bot = makeBot({ id: "bot-admin", name: "Admin" });
    const initialSettings = {
      bots: [bot],
      history: [],
      library: EMPTY_LIBRARY,
    };

    const newTools = ["invoke_subagent", "send_message"];
    const next = applyChanges(
      initialSettings,
      [
        {
          type: "update_bot",
          bot: "bot-admin",
          base_tools: newTools,
        },
      ],
      { now: "2026-01-01T00:00:00.000Z", provider: "" },
    );

    const updatedBot = next.bots.find((b: Bot) => b.id === "bot-admin")!;
    expect(updatedBot.baseTools).toEqual(newTools);

    const overview = setupOverview(next, null, null);
    expect(overview).toContain("base tools invoke_subagent, send_message");

    const details = botDetails(next, "bot-admin");
    expect(details).toContain("Base tools:\ninvoke_subagent, send_message");
  });
});
