/**
 * Purpose: Tests for same-provider fallback model support (schema, changes, and runtime retry).
 * Context: paseo-bots multi-agent system fallback model implementation.
 * Usage: npm test tests/fallback-models.test.ts
 * Prerequisites: Vitest test environment with paseo-bots dependencies.
 */

import { describe, expect, it, vi } from "vitest";
import {
  BotDefaultsSchema,
  BotSchema,
  DEFAULT_BOT_DEFAULTS,
  EMPTY_LIBRARY,
  type Bot,
  type BotSettingsValues,
} from "../shared/bot";
import { applyChanges, describeChange, type ApplyContext, type Change } from "../shared/changes";
import { isFallbackEligibleError, resolveCandidateModels, startBotChat } from "../shared/chat";
import { runWithModelFallback, type FallbackEvent } from "../server/chats";
import { makeBot, NOW } from "./helpers";

const mockProviders = [
  {
    id: "anthropic",
    label: "Anthropic",
    models: [
      { id: "claude-3-7-sonnet", label: "Claude 3.7 Sonnet", isDefault: true, thinking: ["low", "high"] },
      { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", isDefault: false, thinking: ["low"] },
      { id: "claude-3-5-haiku", label: "Claude 3.5 Haiku", isDefault: false, thinking: [] },
    ],
    modes: [{ id: "default", label: "Default" }],
    defaultModeId: "default",
  },
  {
    id: "openai",
    label: "OpenAI",
    models: [
      { id: "gpt-4o", label: "GPT-4o", isDefault: true, thinking: [] },
      { id: "gpt-4o-mini", label: "GPT-4o mini", isDefault: false, thinking: [] },
    ],
    modes: [{ id: "default", label: "Default" }],
    defaultModeId: "default",
  },
];

const testContext: ApplyContext = {
  now: NOW,
  provider: "anthropic",
  providers: mockProviders,
};

function baseSetup(): BotSettingsValues {
  const botA = makeBot({
    id: "bot-a",
    name: "Bot A",
    provider: "anthropic",
    model: "claude-3-7-sonnet",
    fallbackModels: [{ model: "claude-3-5-sonnet", thinkingOptionId: "low" }],
  });
  return {
    bots: [botA],
    history: [],
    library: EMPTY_LIBRARY,
    defaults: {
      provider: "anthropic",
      model: "claude-3-7-sonnet",
      modeId: "default",
      thinkingOptionId: null,
      fallbackModels: [{ model: "claude-3-5-sonnet", thinkingOptionId: null }],
      contactBots: "ask",
    },
  };
}

describe("FallbackModel Schema & Backward Compatibility", () => {
  it("parses older version: 3 bot without fallbackModels cleanly to default []", () => {
    const rawOldBot = {
      id: "bot-old",
      name: "Old Bot",
      avatar: { seed: "old", palette: null, shape: "circle", imageUrl: null },
      provider: "anthropic",
      createdAt: NOW,
      updatedAt: NOW,
    };
    const parsed = BotSchema.parse(rawOldBot);
    expect(parsed.fallbackModels).toEqual([]);
  });

  it("parses BotDefaults without fallbackModels cleanly to default []", () => {
    const rawDefaults = {
      provider: "anthropic",
      model: "claude-3-7-sonnet",
    };
    const parsed = BotDefaultsSchema.parse(rawDefaults);
    expect(parsed.fallbackModels).toEqual([]);
  });

  it("preserves configured fallbackModels", () => {
    const rawBot = {
      id: "bot-fb",
      name: "FB Bot",
      avatar: { seed: "fb", palette: null, shape: "circle", imageUrl: null },
      provider: "anthropic",
      fallbackModels: [
        { model: "claude-3-5-sonnet", thinkingOptionId: "low" },
        { model: "claude-3-5-haiku" },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    };
    const parsed = BotSchema.parse(rawBot);
    expect(parsed.fallbackModels).toEqual([
      { model: "claude-3-5-sonnet", thinkingOptionId: "low" },
      { model: "claude-3-5-haiku", thinkingOptionId: null },
    ]);
  });
});

describe("applyChanges with Fallback Models", () => {
  it("creates bot with valid fallback_models", () => {
    const changes: Change[] = [
      {
        type: "create_bot",
        name: "Helper",
        provider: "anthropic",
        model: "claude-3-7-sonnet",
        fallback_models: [{ model: "claude-3-5-sonnet", thinking: "low" }],
      },
    ];
    const updated = applyChanges(baseSetup(), changes, testContext);
    const created = updated.bots.find((b) => b.name === "Helper");
    expect(created?.fallbackModels).toEqual([{ model: "claude-3-5-sonnet", thinkingOptionId: "low" }]);
  });

  it("updates bot fallback_models", () => {
    const changes: Change[] = [
      {
        type: "update_bot",
        bot: "bot-a",
        fallback_models: [{ model: "claude-3-5-haiku" }],
      },
    ];
    const updated = applyChanges(baseSetup(), changes, testContext);
    const botA = updated.bots.find((b) => b.id === "bot-a");
    expect(botA?.fallbackModels).toEqual([{ model: "claude-3-5-haiku", thinkingOptionId: null }]);
  });

  it("rejects fallback model not belonging to the provider", () => {
    const changes: Change[] = [
      {
        type: "update_bot",
        bot: "bot-a",
        fallback_models: [{ model: "gpt-4o" }],
      },
    ];
    expect(() => applyChanges(baseSetup(), changes, testContext)).toThrow(
      'anthropic has no fallback model "gpt-4o"',
    );
  });

  it("rejects fallback model with invalid thinking option", () => {
    const changes: Change[] = [
      {
        type: "update_bot",
        bot: "bot-a",
        fallback_models: [{ model: "claude-3-5-haiku", thinking: "ultra" }],
      },
    ];
    expect(() => applyChanges(baseSetup(), changes, testContext)).toThrow(
      'Fallback model "claude-3-5-haiku" has no thinking option "ultra"',
    );
  });

  it("clears incompatible fallbackModels when provider is switched without fallback_models", () => {
    const changes: Change[] = [
      {
        type: "update_bot",
        bot: "bot-a",
        provider: "openai",
      },
    ];
    const updated = applyChanges(baseSetup(), changes, testContext);
    const botA = updated.bots.find((b) => b.id === "bot-a");
    expect(botA?.provider).toBe("openai");
    expect(botA?.fallbackModels).toEqual([]);
  });

  it("clears incompatible defaults fallbackModels when provider changes on set_defaults", () => {
    const changes: Change[] = [
      {
        type: "set_defaults",
        provider: "openai",
      },
    ];
    const updated = applyChanges(baseSetup(), changes, testContext);
    expect(updated.defaults?.provider).toBe("openai");
    expect(updated.defaults?.fallbackModels).toEqual([]);
  });

  it("describes fallback_models in describeChange", () => {
    const change: Change = {
      type: "update_bot",
      bot: "bot-a",
      fallback_models: [{ model: "claude-3-5-haiku" }],
    };
    expect(describeChange(change)).toContain("fallback models claude-3-5-haiku");
  });
});

describe("Runtime Fallback Logic", () => {
  it("identifies eligible error types correctly", () => {
    expect(isFallbackEligibleError(new Error("Rate limit exceeded: 429 too many requests"))).toBe(true);
    expect(isFallbackEligibleError(new Error("quota exceeded: insufficient_quota"))).toBe(true);
    expect(isFallbackEligibleError(new Error("Model claude-3-7-sonnet is overloaded (503)"))).toBe(true);
    expect(isFallbackEligibleError(new Error("model_not_found: model does not exist"))).toBe(true);
    expect(isFallbackEligibleError(new Error("unauthorized invalid_api_key"))).toBe(false);
    expect(isFallbackEligibleError(new Error("File not found on disk"))).toBe(false);
  });

  it("resolves candidate models with primary first and deduplicates", () => {
    const bot: Bot = makeBot({
      provider: "anthropic",
      model: "claude-3-7-sonnet",
      thinkingOptionId: "high",
      fallbackModels: [
        { model: "claude-3-7-sonnet", thinkingOptionId: "high" }, // duplicate of primary
        { model: "claude-3-5-sonnet", thinkingOptionId: "low" },
        { model: "claude-3-5-sonnet", thinkingOptionId: "low" }, // duplicate of prior fallback
        { model: "claude-3-5-haiku", thinkingOptionId: null },
      ],
    });
    const candidates = resolveCandidateModels(bot, "claude-3-7-sonnet");
    expect(candidates).toEqual([
      { model: "claude-3-7-sonnet", thinkingOptionId: "high" },
      { model: "claude-3-5-sonnet", thinkingOptionId: "low" },
      { model: "claude-3-5-haiku", thinkingOptionId: null },
    ]);
  });

  it("runs with model fallback when primary fails with eligible error", async () => {
    const bot: Bot = makeBot({
      provider: "anthropic",
      model: "claude-3-7-sonnet",
      fallbackModels: [{ model: "claude-3-5-sonnet", thinkingOptionId: null }],
    });

    const fallbackEvents: FallbackEvent[] = [];
    const calls: string[] = [];

    const result = await runWithModelFallback(
      bot,
      "claude-3-7-sonnet",
      async (candidate) => {
        calls.push(candidate.model);
        if (candidate.model === "claude-3-7-sonnet") {
          throw new Error("429 Too Many Requests: Rate limit exceeded");
        }
        return `success with ${candidate.model}`;
      },
      (ev) => fallbackEvents.push(ev),
    );

    expect(result).toBe("success with claude-3-5-sonnet");
    expect(calls).toEqual(["claude-3-7-sonnet", "claude-3-5-sonnet"]);
    expect(fallbackEvents.length).toBe(1);
    expect(fallbackEvents[0]?.fromModel).toBe("claude-3-7-sonnet");
    expect(fallbackEvents[0]?.toModel).toBe("claude-3-5-sonnet");
  });

  it("does not fallback on non-eligible errors", async () => {
    const bot: Bot = makeBot({
      provider: "anthropic",
      model: "claude-3-7-sonnet",
      fallbackModels: [{ model: "claude-3-5-sonnet", thinkingOptionId: null }],
    });

    const calls: string[] = [];
    await expect(
      runWithModelFallback(bot, "claude-3-7-sonnet", async (candidate) => {
        calls.push(candidate.model);
        throw new Error("Directory /custom/folder not found");
      }),
    ).rejects.toThrow("Directory /custom/folder not found");

    expect(calls).toEqual(["claude-3-7-sonnet"]);
  });

  it("startBotChat retries fallback candidates on agents.create error", async () => {
    const bot: Bot = makeBot({
      provider: "anthropic",
      model: "claude-3-7-sonnet",
      fallbackModels: [{ model: "claude-3-5-sonnet", thinkingOptionId: null }],
    });

    const attemptedConfigs: any[] = [];
    const mockApi: any = {
      workspaces: {
        list: vi.fn().mockResolvedValue({ entries: [] }),
        create: vi.fn().mockResolvedValue({
          id: "ws-1",
        }),
      },
      agents: {
        create: vi.fn().mockImplementation(async ({ config }) => {
          attemptedConfigs.push(config);
          if (config.provider.includes("claude-3-7-sonnet")) {
            throw new Error("503 Service Unavailable: overloaded");
          }
          return { id: "agent-fallback-success" };
        }),
      },
      providers: {
        snapshot: vi.fn().mockResolvedValue({
          entries: [{ provider: "anthropic", models: [{ id: "claude-3-7-sonnet", isDefault: true }] }],
        }),
      },
    };

    const agentId = await startBotChat(mockApi, {
      bot,
      library: EMPTY_LIBRARY,
      placement: { path: "/workspace", projectRoot: null },
      prompt: "Hello",
      systemPrompt: "You are a bot.",
    });

    expect(agentId).toBe("agent-fallback-success");
    expect(attemptedConfigs.length).toBe(2);
    expect(attemptedConfigs[0].provider).toBe("anthropic/claude-3-7-sonnet");
    expect(attemptedConfigs[1].provider).toBe("anthropic/claude-3-5-sonnet");
  });

  describe("values.defaults.model and values.defaults.modeId Inheritance", () => {
    it("startBotChat checks defaults.model before falling back to resolveDefaultModel", async () => {
      const bot = makeBot({
        id: "bot-default-test",
        name: "DefaultBot",
        provider: "anthropic",
        model: null,
        modeId: null,
      });

      let snapshotCalled = false;
      let createdConfig: any = null;

      const mockApi: any = {
        workspaces: {
          list: vi.fn().mockResolvedValue({ entries: [] }),
          create: vi.fn().mockResolvedValue({ id: "ws-1" }),
        },
        agents: {
          create: vi.fn().mockImplementation(async ({ config }) => {
            createdConfig = config;
            return { id: "agent-default-model-ok" };
          }),
        },
        providers: {
          snapshot: vi.fn().mockImplementation(async () => {
            snapshotCalled = true;
            return {
              entries: [{ provider: "anthropic", models: [{ id: "claude-fallback-from-snapshot", isDefault: true }] }],
            };
          }),
        },
      };

      const agentId = await startBotChat(mockApi, {
        bot,
        library: EMPTY_LIBRARY,
        placement: { path: "/workspace", projectRoot: null },
        prompt: "Hello",
        systemPrompt: "You are a bot.",
        defaults: {
          model: "claude-inherited-default-model",
          modeId: "plan",
        },
      });

      expect(agentId).toBe("agent-default-model-ok");
      // Since defaults.model was provided, resolveDefaultModel (providers.snapshot) should NOT have been called!
      expect(snapshotCalled).toBe(false);
      expect(createdConfig.provider).toBe("anthropic/claude-inherited-default-model");
      expect(createdConfig.modeId).toBe("plan");
    });

    it("startChat checks values.defaults.model and inherits values.defaults.modeId cleanly", async () => {
      const { startChat } = await import("../server/chats");

      const bot = makeBot({
        id: "bot-chat-defaults",
        name: "ChatDefaultBot",
        provider: "anthropic",
        model: null,
        modeId: null,
      });

      let capturedConfig: any = null;
      let snapshotCalled = false;

      const mockPaseo: any = {
        projects: {
          list: vi.fn().mockResolvedValue({ projects: [] }),
        },
        workspaces: {
          list: vi.fn().mockResolvedValue({ entries: [] }),
          open: vi.fn().mockResolvedValue({
            current: () => ({ projectId: "p-1" }),
            refresh: vi.fn().mockResolvedValue({ projectId: "p-1" }),
            archive: vi.fn().mockResolvedValue(undefined),
          }),
          create: vi.fn().mockResolvedValue({ id: "ws-chat" }),
          ref: () => ({
            setTitle: vi.fn().mockResolvedValue(undefined),
          }),
        },
        agents: {
          create: vi.fn().mockImplementation(async ({ config }) => {
            capturedConfig = config;
            return { id: "agent-startchat-ok" };
          }),
        },
        providers: {
          snapshot: vi.fn().mockImplementation(async () => {
            snapshotCalled = true;
            return {
              entries: [{ provider: "anthropic", models: [{ id: "from-snapshot", isDefault: true }] }],
            };
          }),
        },
      };

      const mockHost: any = {
        requirePaseo: () => mockPaseo,
        chatOf: async () => null,
        values: async () => ({
          defaults: {
            provider: "anthropic",
            model: "claude-from-values-defaults",
            modeId: "architect",
          },
          groups: [],
        }),
        library: async () => EMPTY_LIBRARY,
      };

      const mockRelay: any = {
        mountTools: async () => [],
        mountApps: async () => null,
      };

      const agentId = await startChat(mockHost, mockRelay, bot, {
        prompt: "Run startChat test",
        title: "Test Chat",
        labels: {},
      });

      expect(agentId).toBe("agent-startchat-ok");
      expect(snapshotCalled).toBe(false);
      expect(capturedConfig.provider).toBe("anthropic/claude-from-values-defaults");
      expect(capturedConfig.modeId).toBe("architect");
    });
  });
});
