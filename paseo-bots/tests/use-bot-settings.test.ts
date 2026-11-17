import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { botSettings, type BotSettingsValues } from "../shared/bot";
import { makeBot } from "./helpers";

vi.mock("@getpaseo/plugin/client", () => ({
  useSettings: vi.fn(),
  useTranslation: undefined,
  defineTranslations: undefined,
}));

vi.mock("@getpaseo/plugin/client/react-native", () => ({
  useToast: vi.fn(() => ({ error: vi.fn() })),
}));

import { createBotSettingsCommitter, type BotSettingsState } from "../client/useBotSettings";

function makeValues(overrides: Partial<BotSettingsValues> = {}): BotSettingsValues {
  return botSettings.schema.parse({
    bots: [],
    history: [],
    groups: [],
    ...overrides,
  });
}

describe("createBotSettingsCommitter", () => {
  it("preserves saveError across reload() when retries fail", async () => {
    const errors: string[] = [];
    const savedRevisions: string[] = [];
    let state: BotSettingsState;

    const save = vi.fn(async (_values: BotSettingsValues, revision: string) => {
      savedRevisions.push(revision);
      state = { ...state, saveError: `conflict at ${revision}` };
      return false;
    });

    const reload = vi.fn(async () => {
      // Simulate useSettings.reload() clearing saveError before fetching.
      state = { ...state, saveError: null };
    });

    state = {
      status: "ready",
      values: makeValues(),
      revision: "rev-1",
      saving: false,
      saveError: null,
      save,
      reset: async () => true,
      reload,
    };

    const commit = createBotSettingsCommitter({
      getLatest: () => state,
      onError: (msg) => errors.push(msg),
      fallbackErrorMessage: () => "common.couldNotSaveBots",
      reloadWaitTimeoutMs: 30,
      reloadPollIntervalMs: 5,
    });

    const ok = await commit((v) => v);
    expect(ok).toBe(false);
    // Should not retry with identical revision "rev-1" once reload keeps the same revision.
    expect(savedRevisions).toEqual(["rev-1"]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(errors).toEqual(["conflict at rev-1"]);
  });

  it("captures saveError populated on the next tick before reload() clears it", async () => {
    const errors: string[] = [];
    let state: BotSettingsState;

    const save = vi.fn(async () => {
      setTimeout(() => {
        state = { ...state, saveError: "invalid: schema mismatch" };
      }, 0);
      return false;
    });

    const reload = vi.fn(async () => {
      state = { ...state, saveError: null };
    });

    state = {
      status: "ready",
      values: makeValues(),
      revision: "rev-1",
      saving: false,
      saveError: null,
      save,
      reset: async () => true,
      reload,
    };

    const commit = createBotSettingsCommitter({
      getLatest: () => state,
      onError: (msg) => errors.push(msg),
      fallbackErrorMessage: () => "common.couldNotSaveBots",
      reloadWaitTimeoutMs: 30,
      reloadPollIntervalMs: 5,
    });

    const ok = await commit((v) => v);
    expect(ok).toBe(false);
    expect(errors).toEqual(["invalid: schema mismatch"]);
  });

  it("waits for refreshed revision in latest.current after reload() before retrying", async () => {
    const errors: string[] = [];
    const savedRevisions: string[] = [];
    let state: BotSettingsState;

    const save = vi.fn(async (_values: BotSettingsValues, revision: string) => {
      savedRevisions.push(revision);
      if (revision === "rev-1") {
        state = { ...state, saveError: "conflict" };
        return false;
      }
      state = {
        status: "ready",
        values: makeValues(),
        revision: "rev-3",
        saving: false,
        saveError: null,
        save,
        reset: async () => true,
        reload,
      };
      return true;
    });

    const reload = vi.fn(async () => {
      // Clear saveError immediately, then deliver the refreshed revision >50ms later
      // to verify we don't blindly sleep 50ms and retry with stale "rev-1".
      state = {
        status: "loading",
        saving: false,
        saveError: null,
        save,
        reset: async () => true,
        reload,
      };
      setTimeout(() => {
        state = {
          status: "ready",
          values: makeValues(),
          revision: "rev-2",
          saving: false,
          saveError: null,
          save,
          reset: async () => true,
          reload,
        };
      }, 70);
    });

    state = {
      status: "ready",
      values: makeValues(),
      revision: "rev-1",
      saving: false,
      saveError: null,
      save,
      reset: async () => true,
      reload,
    };

    const commit = createBotSettingsCommitter({
      getLatest: () => state,
      onError: (msg) => errors.push(msg),
      fallbackErrorMessage: () => "common.couldNotSaveBots",
      reloadWaitTimeoutMs: 250,
      reloadPollIntervalMs: 10,
    });

    const ok = await commit((v) => v);
    expect(ok).toBe(true);
    expect(savedRevisions).toEqual(["rev-1", "rev-2"]);
    expect(errors).toEqual([]);
  });

  it("stops after maxAttempts when every reload yields a new conflicting revision", async () => {
    const errors: string[] = [];
    const savedRevisions: string[] = [];
    let rev = 1;
    let state: BotSettingsState;

    const save = vi.fn(async (_values: BotSettingsValues, revision: string) => {
      savedRevisions.push(revision);
      state = { ...state, saveError: `rpc conflict ${revision}` };
      return false;
    });

    const reload = vi.fn(async () => {
      rev += 1;
      state = {
        status: "ready",
        values: makeValues(),
        revision: `rev-${rev}`,
        saving: false,
        saveError: null,
        save,
        reset: async () => true,
        reload,
      };
    });

    state = {
      status: "ready",
      values: makeValues(),
      revision: "rev-1",
      saving: false,
      saveError: null,
      save,
      reset: async () => true,
      reload,
    };

    const commit = createBotSettingsCommitter({
      getLatest: () => state,
      onError: (msg) => errors.push(msg),
      fallbackErrorMessage: () => "common.couldNotSaveBots",
      maxAttempts: 3,
      reloadWaitTimeoutMs: 50,
      reloadPollIntervalMs: 5,
    });

    const ok = await commit((v) => v);
    expect(ok).toBe(false);
    expect(savedRevisions).toEqual(["rev-1", "rev-2", "rev-3"]);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(errors).toEqual(["rpc conflict rev-3"]);
  });

  it("strips undefined properties (e.g. baseTools: undefined) so saved payload passes z.json()", async () => {
    const errors: string[] = [];
    let savedPayload: BotSettingsValues | null = null;
    const bot = makeBot({ id: "bot-1", name: "Alpha" });

    const save = vi.fn(async (values: BotSettingsValues) => {
      savedPayload = values;
      return true;
    });

    const state: BotSettingsState = {
      status: "ready",
      values: makeValues({ bots: [bot] }),
      revision: "rev-1",
      saving: false,
      saveError: null,
      save,
      reset: async () => true,
      reload: async () => {},
    };

    const commit = createBotSettingsCommitter({
      getLatest: () => state,
      onError: (msg) => errors.push(msg),
    });

    const ok = await commit((v) => ({
      ...v,
      bots: v.bots.map((b) => ({
        ...b,
        baseTools: undefined,
        providerConfigs: [
          {
            provider: "agy",
            model: "gemini-4-hydrogen",
            modeId: "default",
            thinkingOptionId: null,
            fallbackModels: [],
            baseTools: undefined,
          },
        ],
      })),
    }));

    expect(ok).toBe(true);
    expect(errors).toEqual([]);
    expect(savedPayload).not.toBeNull();
    expect(z.json().safeParse(savedPayload).success).toBe(true);
    const savedBot = savedPayload!.bots[0]!;
    expect(Object.prototype.hasOwnProperty.call(savedBot, "baseTools")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(savedBot.providerConfigs[0]!, "baseTools")).toBe(false);
  });
});
