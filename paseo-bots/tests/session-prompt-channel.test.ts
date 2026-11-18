import { describe, it, expect } from "vitest";
import {
  buildAgentConfig,
  EMPTY_LIBRARY,
  resolveAgyAgent,
  type Bot,
} from "../shared/bot";

function makeBot(patch: Partial<Bot> = {}): Bot {
  return {
    id: "bot-test-agy",
    name: "Test AGY Bot",
    title: "Tester",
    description: "Testing dynamic prompt channel",
    avatar: { seed: "test", palette: null, shape: "circle", imageUrl: null },
    hostId: null,
    provider: "agy",
    model: "gemini-4-hydrogen",
    modeId: null,
    thinkingOptionId: null,
    fallbackModels: [],
    providerConfigs: [],
    soul: "Standing instructions for test.",
    mcpServerIds: [],
    alwaysAllow: [],
    apps: [],
    skillIds: [],
    mounts: [],
    playbooks: [],
    routines: [],
    appRules: {},
    voice: { name: null, readReplies: false },
    contactBots: "off",
    pinned: false,
    archived: false,
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
    cwd: null,
    ...patch,
  } as Bot;
}

describe("session prompt channel & workspace roots in buildAgentConfig", () => {
  it("defaults useStaticAgyAgent to false, populating systemPrompt and omitting providerOptions.agent for agy and agy-acp", () => {
    for (const provider of ["agy", "agy-acp"] as const) {
      const bot = makeBot({ provider });
      expect(resolveAgyAgent(bot)).toBe(bot.id);

      const config = buildAgentConfig(
        bot,
        EMPTY_LIBRARY,
        "gemini-4-hydrogen",
        "Dynamic six-block system prompt",
      );

      expect(config.systemPrompt).toBe("Dynamic six-block system prompt");
      expect(config.systemPromptMode).toBe("append");
      expect(config.providerOptions?.agent).toBeUndefined();
    }
  });

  it("omits systemPrompt and attaches providerOptions.agent when useStaticAgyAgent is explicitly true", () => {
    const bot = makeBot({ id: "bot-legacy", provider: "agy" });

    const config = buildAgentConfig(
      bot,
      EMPTY_LIBRARY,
      "gemini-4-hydrogen",
      "Dynamic prompt ignored in static mode",
      {},
      null,
      undefined,
      null,
      undefined,
      null,
      "append",
      { useStaticAgyAgent: true },
    );

    expect("systemPrompt" in config).toBe(false);
    expect(config.providerOptions?.agent).toBe("bot-legacy");
  });

  it("attaches non-empty additionalDirectories to providerOptions and filters empty strings", () => {
    const bot = makeBot({ provider: "agy" });

    const config = buildAgentConfig(
      bot,
      EMPTY_LIBRARY,
      "gemini-4-hydrogen",
      "System prompt with target dirs",
      {},
      null,
      undefined,
      null,
      undefined,
      null,
      "append",
      {
        additionalDirectories: ["/workspace/repo-a", "  ", "/workspace/repo-b", ""],
      },
    );

    expect(config.systemPrompt).toBe("System prompt with target dirs");
    expect(config.providerOptions?.agent).toBeUndefined();
    expect(config.providerOptions?.additionalDirectories).toEqual([
      "/workspace/repo-a",
      "/workspace/repo-b",
    ]);
  });

  it("omits additionalDirectories from providerOptions when empty", () => {
    const bot = makeBot({ provider: "agy" });

    const config = buildAgentConfig(
      bot,
      EMPTY_LIBRARY,
      "gemini-4-hydrogen",
      "System prompt without target dirs",
      {},
      null,
      undefined,
      null,
      undefined,
      null,
      "append",
      { additionalDirectories: [] },
    );

    expect(config.providerOptions?.additionalDirectories).toBeUndefined();
    expect(config.providerOptions?.agent).toBeUndefined();
  });

  it("attaches promptFilePath when provided", () => {
    const bot = makeBot({ provider: "agy" });

    const config = buildAgentConfig(
      bot,
      EMPTY_LIBRARY,
      "gemini-4-hydrogen",
      "Prompt content",
      {},
      null,
      undefined,
      null,
      undefined,
      null,
      "append",
      { promptFilePath: "/runs/run-123.prompt.md" },
    );

    expect(config.providerOptions?.promptFilePath).toBe("/runs/run-123.prompt.md");
    expect(config.providerOptions?.agent).toBeUndefined();
  });

  it("attaches both additionalDirectories and promptFilePath alongside provider-specific options for Claude", () => {
    const claudeBot = makeBot({
      provider: "claude",
      model: "claude-opus-5-5",
      baseTools: ["Read", "Edit"],
    });

    const config = buildAgentConfig(
      claudeBot,
      EMPTY_LIBRARY,
      "claude-opus-5-5",
      "Claude system prompt",
      {},
      null,
      undefined,
      null,
      undefined,
      null,
      "replace",
      {
        additionalDirectories: ["/repo/frontend"],
        promptFilePath: "/runs/claude.prompt.md",
      },
    );

    expect(config.systemPrompt).toBe("Claude system prompt");
    expect(config.systemPromptMode).toBe("replace");
    expect(config.providerOptions?.agent).toBeUndefined();
    expect(config.providerOptions?.allowedTools).toEqual(["Read", "Edit"]);
    expect(config.providerOptions?.additionalDirectories).toEqual(["/repo/frontend"]);
    expect(config.providerOptions?.promptFilePath).toBe("/runs/claude.prompt.md");
  });

  it("preserves positional compatibility when omitting options", () => {
    const bot = makeBot({ provider: "agy", systemPromptMode: "replace" });

    const config = buildAgentConfig(
      bot,
      EMPTY_LIBRARY,
      "gemini-4-hydrogen",
      "Positional test",
      {},
      null,
      undefined,
      null,
      undefined,
      null,
      "replace",
    );

    expect(config.systemPrompt).toBe("Positional test");
    expect(config.systemPromptMode).toBe("replace");
    expect(config.providerOptions?.agent).toBeUndefined();
  });

  it("does not emit stray providerOptions.tools for agy when baseTools is present and useStaticAgyAgent is false", () => {
    for (const provider of ["agy", "agy-acp"] as const) {
      const bot = makeBot({
        provider,
        baseTools: ["invoke_subagent", "send_message"],
      });

      const config = buildAgentConfig(
        bot,
        EMPTY_LIBRARY,
        "gemini-4-hydrogen",
        "Dynamic prompt with base tools",
      );

      expect(config.systemPrompt).toBe("Dynamic prompt with base tools");
      expect(config.providerOptions?.tools).toBeUndefined();
      expect(config.providerOptions).toBeUndefined();
    }
  });

  it("does not include tools in providerOptions when additionalDirectories or promptFilePath are set for agy with baseTools", () => {
    const bot = makeBot({
      provider: "agy",
      baseTools: ["invoke_subagent", "send_message"],
    });

    const config = buildAgentConfig(
      bot,
      EMPTY_LIBRARY,
      "gemini-4-hydrogen",
      "Dynamic prompt",
      {},
      null,
      undefined,
      null,
      undefined,
      null,
      "append",
      {
        additionalDirectories: ["/workspace/target-repo"],
        promptFilePath: "/runs/run-1.prompt.md",
      },
    );

    expect(config.providerOptions?.tools).toBeUndefined();
    expect(config.providerOptions?.agent).toBeUndefined();
    expect(config.providerOptions?.additionalDirectories).toEqual([
      "/workspace/target-repo",
    ]);
    expect(config.providerOptions?.promptFilePath).toBe("/runs/run-1.prompt.md");
  });
});
