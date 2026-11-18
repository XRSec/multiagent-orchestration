import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildAgentConfig, EMPTY_LIBRARY, engineBaseTools } from "../shared/bot";
import { AGY_BASE_TOOLS, INVOKE_SUBAGENT_TOOL } from "../shared/bot-tools";
import { chatEngine, chatLabels, ENGINE_LABEL, parseEngine, startBotChat, type ChatApi } from "../shared/chat";
import { newUuid } from "../shared/uuid";
import { fakeHost, makeBot } from "./helpers";

/** The tools one chat sees over MCP, read from the engine label the chat was started with. */
async function listedTools(engine: "native" | "paseo-bot" | null): Promise<string[]> {
  const { Relay } = await import("../server/relay");
  const { BOT_TOOLS } = await import("../server/tools");
  const host = fakeHost([makeBot({ id: "bot-a", name: "Scout" }), makeBot({ id: "bot-b", name: "Inbox" })]);
  const labels: Record<string, string> = engine ? { [ENGINE_LABEL]: engine } : {};
  vi.spyOn(host, "chatOf").mockResolvedValue({ botId: "bot-a", title: "t", routineId: null, labels });
  const relay = new Relay(host, BOT_TOOLS);
  try {
    const agentId = newUuid();
    const mount = (await relay.mountTools("bot-a", agentId)) as { url: string; headers: Record<string, string> };
    const response = await fetch(mount.url, {
      method: "POST",
      headers: { authorization: mount.headers.Authorization!, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const answer = (await response.json()) as { result: { tools: { name: string }[] } };
    return answer.result.tools.map((tool) => tool.name);
  } finally {
    relay.stop();
  }
}

/** A chat started with an engine, as the fake runtime received it. */
async function startedChat(engine: "native" | "paseo-bot") {
  const handle = {
    current: () => ({ projectId: "project", projectRootPath: "/bots", workspaceDirectory: "/bots/inbox" }),
    refresh: async () => ({ projectId: "project", projectRootPath: "/bots", workspaceDirectory: "/bots/inbox" }),
    setTitle: vi.fn(),
    archive: vi.fn(),
    agents: { create: vi.fn(async (_input: Record<string, unknown>) => ({ id: "chat" })) },
  };
  const api = {
    projects: { list: async () => ({ projects: [{ projectId: "project", projectRootPath: "/bots" }] }) },
    workspaces: { list: vi.fn(async () => ({ entries: [] })), ref: vi.fn(() => handle), open: vi.fn(async () => handle), create: vi.fn(async () => handle) },
    providers: { snapshot: async () => ({ entries: [] }) },
  } satisfies ChatApi;
  await startBotChat(api, {
    bot: makeBot({ id: "bot-a", provider: "agy", model: "model" }),
    library: EMPTY_LIBRARY,
    placement: { path: "/bots/inbox", projectRoot: "/bots" },
    prompt: "Hello",
    systemPrompt: "Help",
    engine,
  });
  return handle.agents.create.mock.calls[0]![0] as { labels: Record<string, string>; config: ReturnType<typeof buildAgentConfig> };
}

describe("subagent engine", () => {
  let home: string;
  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "paseo-bots-engine-"));
    process.env.PASEO_HOME = home;
  });
  afterAll(async () => {
    delete process.env.PASEO_HOME;
    await rm(home, { recursive: true, force: true });
  });

  it("hides ask_bot from a native chat and keeps it for a paseo-bot chat", async () => {
    const native = await listedTools("native");
    expect(native).not.toContain("ask_bot");
    expect(native).toContain("list_bots");
    expect(native).toContain("check_chat");

    const paseoBot = await listedTools("paseo-bot");
    expect(paseoBot).toContain("ask_bot");
  });

  it("drops invoke_subagent from the agent config of a paseo-bot chat and keeps both sets without an engine", () => {
    const agyBot = makeBot({ id: "bot-a", provider: "agy" });
    const paseoConfig = buildAgentConfig(
      agyBot,
      EMPTY_LIBRARY,
      "m",
      "sys",
      {},
      null,
      undefined,
      "paseo-bot",
      undefined,
      null,
      "append",
      { useStaticAgyAgent: true },
    );
    const paseoTools = (paseoConfig.providerOptions as { tools?: string[] }).tools ?? [];
    expect(paseoTools).not.toContain(INVOKE_SUBAGENT_TOOL);
    expect(paseoTools).toEqual(AGY_BASE_TOOLS.filter((tool) => tool !== INVOKE_SUBAGENT_TOOL));

    // Dynamic prompt mode (!includeAgyAgent) omits providerOptions.tools
    const dynamicPaseoConfig = buildAgentConfig(agyBot, EMPTY_LIBRARY, "m", "sys", {}, null, undefined, "paseo-bot");
    expect(dynamicPaseoConfig.providerOptions).toBeUndefined();

    const nativeConfig = buildAgentConfig(agyBot, EMPTY_LIBRARY, "m", "sys", {}, null, undefined, "native");
    expect(nativeConfig.providerOptions).toBeUndefined();
    expect(nativeConfig.systemPrompt).toBe("sys");
    expect(engineBaseTools(agyBot, "native")).toBeUndefined();
    expect(engineBaseTools(makeBot({ provider: "agy", baseTools: [...AGY_BASE_TOOLS] }), "native")).toContain(INVOKE_SUBAGENT_TOOL);

    // A provider with exact tool grants keeps its own list; the drop only touches the native dispatch entry.
    const claudeBot = makeBot({ provider: "claude", baseTools: ["Read", "Grep"] });
    expect(buildAgentConfig(claudeBot, EMPTY_LIBRARY, "m", "sys", {}, null, undefined, "paseo-bot").providerOptions).toEqual({ allowedTools: ["Read", "Grep"] });
    expect(buildAgentConfig(claudeBot, EMPTY_LIBRARY, "m", "sys").providerOptions).toEqual({ allowedTools: ["Read", "Grep"] });
  });

  it("keeps today's tool face unchanged for a chat without an engine", async () => {
    const { BOT_TOOLS, toolsForEngine } = await import("../server/tools");
    const today = ["list_bots", "ask_bot", "check_chat", "search_chats", "open_task", "list_tasks", "run_workflow", "get_setup", "propose_skill", "propose_routine", "list_routines", "run_routine", "cancel_routine_run", "propose_changes", "show_card"];
    expect(BOT_TOOLS.map((tool) => tool.name)).toEqual(today);
    expect(toolsForEngine(BOT_TOOLS, null).map((tool) => tool.name)).toEqual(today);
    expect(await listedTools(null)).toEqual(today);

    // The quiet grants a chat gets today are unchanged too.
    const tools = { type: "http" as const, url: "http://127.0.0.1:1/bots/b/a", headers: {} };
    const bot = makeBot({ alwaysAllow: ["bots/ask_bot"] });
    expect(buildAgentConfig(bot, EMPTY_LIBRARY, "m", "", { tools }).toolPolicy?.preapproved.map((grant) => grant.tool)).toEqual([
      "list_bots", "check_chat", "search_chats", "open_task", "list_tasks", "run_workflow", "get_setup", "propose_skill", "propose_routine", "propose_changes", "connect_app", "show_card", "list_routines", "ask_bot",
    ]);
    expect(buildAgentConfig(bot, EMPTY_LIBRARY, "m", "", { tools }, null, undefined, "native").toolPolicy?.preapproved.map((grant) => grant.tool)).not.toContain("ask_bot");
  });

  it("writes the engine into the chat labels, where chatOf reads it back", async () => {
    const created = await startedChat("native");
    expect(created.labels[ENGINE_LABEL]).toBeUndefined();
    expect(created.config.providerOptions).toBeUndefined();
    expect(created.config.systemPrompt).toBe("Help");

    // startChat merges the engine into the labels it passes on; chatOf reads them back.
    const labels = chatLabels(created.labels, "native");
    expect(labels[ENGINE_LABEL]).toBe("native");
    expect(chatEngine(labels)).toBe("native");

    const host = fakeHost([makeBot({ id: "bot-a" })]);
    host.attach({ agents: { ref: () => ({ refresh: async () => ({ agent: { labels } }) }) } } as never);
    const chat = await host.chatOf("agent-1");
    expect(chat?.labels[ENGINE_LABEL]).toBe("native");
    expect(chatEngine(chat?.labels)).toBe("native");

    // A chat started without an engine keeps the labels it had: nothing is written.
    expect(chatLabels({ [ENGINE_LABEL]: "native" }, null)).toEqual({ [ENGINE_LABEL]: "native" });
  });

  it("refuses an unknown engine instead of guessing, and ignores one it cannot read", async () => {
    expect(parseEngine("native")).toBe("native");
    expect(parseEngine("paseo-bot")).toBe("paseo-bot");
    expect(parseEngine(undefined)).toBeNull();
    expect(() => parseEngine("both")).toThrow(/Unknown subagent engine "both"/);
    // A label written by a newer app is ignored, so the chat keeps the old two-set face.
    expect(chatEngine({ [ENGINE_LABEL]: "both" })).toBeNull();
  });
});
