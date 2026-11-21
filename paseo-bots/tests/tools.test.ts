import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAgentConfig, EMPTY_LIBRARY } from "../shared/bot";
import { botToolName, supportsToolGrants } from "../shared/bot-tools";
import { proposalIdOf } from "../shared/proposals";
import { expandLearn, rememberPrompt, sanitizeSkillName, withPluginCommands } from "../shared/skills";
import {
  buildLineDiff,
  buildToolCallDisplayModel,
  buildToolCallPresentation,
  deriveTaskActivities,
  extractTaskEntriesFromToolCall,
  parseUnifiedDiff,
  toolIcon,
  toolLabel,
} from "../shared/tools";
import { newUuid } from "../shared/uuid";
import { fakeHost, makeBot } from "./helpers";

describe("tool names and grants", () => {
  it("recognises the plugin's tools whatever the provider calls them", () => {
    expect(botToolName("mcp__bots__ask_bot")).toBe("ask_bot");
    expect(botToolName("bots.propose_skill")).toBe("propose_skill");
    expect(botToolName("bots_list_bots")).toBe("list_bots");
    expect(botToolName("mcp__other__ask_bot")).toBeNull();
    expect(botToolName("bots.unknown")).toBeNull();
  });

  it("only sends grants to providers that take exact grants", () => {
    expect(supportsToolGrants("claude")).toBe(true);
    expect(supportsToolGrants("opencode")).toBe(true);
    expect(supportsToolGrants("gemini")).toBe(false);
    const tools = { type: "http" as const, url: "http://127.0.0.1:1/bots/b/a", headers: {} };
    const claude = buildAgentConfig(makeBot({ alwaysAllow: ["bots/ask_bot"] }), EMPTY_LIBRARY, "m", "", { tools });
    expect(claude.mcpServers).toEqual({ bots: tools });
    expect(claude.toolPolicy?.preapproved.map((grant) => grant.tool)).toEqual(["list_bots", "list_teams", "check_chat", "search_chats", "open_task", "list_tasks", "run_workflow", "resume_workflow", "get_setup", "propose_skill", "propose_routine", "propose_changes", "connect_app", "show_card", "list_routines", "ask_bot"]);
    // Paseo refuses a chat whose provider can't take grants, so none are sent.
    expect(buildAgentConfig(makeBot({ provider: "gemini", alwaysAllow: ["bots/ask_bot"] }), EMPTY_LIBRARY, "m", "", { tools })).not.toHaveProperty("toolPolicy");
  });

  it("expands /learn2 and lists it before provider commands", () => {
    expect(expandLearn("/learn2")).toContain("propose_skill");
    expect(expandLearn("  /learn2 the invoice part ")).toContain("Focus on: the invoice part.");
    expect(expandLearn("/learn")).toBeNull();
    expect(expandLearn("/learn2er")).toBeNull();
    expect(expandLearn("please /learn2")).toBeNull();
    const learn2 = { name: "learn2", description: "ours", argumentHint: "" };
    const provider = [{ name: "learn2", description: "theirs", argumentHint: "" }, { name: "compact", description: "", argumentHint: "" }];
    expect(withPluginCommands([learn2], provider).map((command) => command.description)).toEqual(["ours", ""]);
  });

  it("formats /remember prompts with or without explicit note", () => {
    expect(rememberPrompt("always reply in Chinese")).toContain("always reply in Chinese");
    expect(rememberPrompt("")).toContain("MEMORY.md");
  });

  it("finds the proposal behind a finished propose_skill call", () => {
    const output = [{ type: "text", text: "Proposal p-0123456789: the user sees..." }];
    expect(proposalIdOf({ name: "mcp__bots__propose_skill", status: "completed", detail: { type: "unknown", input: {}, output } })).toBe("p-0123456789");
    expect(proposalIdOf({ name: "bots.propose_skill", status: "completed", detail: { type: "unknown", input: {}, output: "Proposal p-abcdefabcd: x" } })).toBe("p-abcdefabcd");
    expect(proposalIdOf({ name: "mcp__bots__propose_skill", status: "running", detail: { type: "unknown", input: {}, output: null } })).toBeNull();
    expect(proposalIdOf({ name: "mcp__bots__list_bots", status: "completed", detail: { type: "unknown", input: {}, output } })).toBeNull();
  });

  it("keeps skill folder names inside the library", () => {
    expect(sanitizeSkillName("..")).toBe("skill");
    expect(sanitizeSkillName(".hidden.")).toBe("hidden");
    expect(sanitizeSkillName("v1.2 notes")).toBe("v1.2-notes");
  });

  it("makes v4 UUIDs for agent ids", () => {
    expect(newUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("the bots MCP server", () => {
  let home: string;
  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "paseo-bots-tools-"));
    process.env.PASEO_HOME = home;
  });
  afterAll(async () => {
    delete process.env.PASEO_HOME;
    await rm(home, { recursive: true, force: true });
  });

  it("serves the MCP handshake, lists its tools and runs them for one chat", async () => {
    const { Relay } = await import("../server/relay");
    const { BOT_TOOLS } = await import("../server/tools");
    const host = fakeHost([makeBot({ id: "bot-a", name: "Scout", title: "Researcher" }), makeBot({ id: "bot-b", name: "Inbox", description: "Email triage" }), makeBot({ id: "bot-c", archived: true })]);
    const relay = new Relay(host, BOT_TOOLS);
    try {
      const agentId = newUuid();
      const mount = (await relay.mountTools("bot-a", agentId)) as { url: string; headers: Record<string, string> };
      expect(mount.url).toContain(`/bots/bot-a/${agentId}`);
      const post = (body: unknown, token = mount.headers.Authorization!, url = mount.url) =>
        fetch(url, { method: "POST", headers: { authorization: token, "content-type": "application/json" }, body: JSON.stringify(body) });

      const init = (await (await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json()) as { result: { serverInfo: { name: string } } };
      expect(init.result.serverInfo.name).toBe("paseo-bots");
      expect((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);

      const list = (await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json()) as { result: { tools: { name: string; inputSchema: { type: string } }[] } };
      expect(list.result.tools.map((tool) => tool.name)).toContain("list_bots");
      expect(list.result.tools[0]!.inputSchema.type).toBe("object");

      const call = (await (await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_bots", arguments: {} } })).json()) as { result: { content: { text: string }[] } };
      expect(call.result.content[0]!.text).toBe("- Inbox (id: bot-b): Email triage");

      // A token for another chat, or another bot's URL, is refused.
      expect((await post({ jsonrpc: "2.0", id: 4, method: "tools/list" }, "Bearer nope")).status).toBe(401);
      expect((await post({ jsonrpc: "2.0", id: 5, method: "tools/list" }, mount.headers.Authorization!, mount.url.replace(agentId, newUuid()))).status).toBe(401);
      const unknown = (await (await post({ jsonrpc: "2.0", id: 6, method: "nope" })).json()) as { error: { code: number } };
      expect(unknown.error.code).toBe(-32601);
    } finally {
      relay.stop();
    }
  });

  it("proposes a skill that the user saves or dismisses once", async () => {
    const { proposeSkill } = await import("../server/tools/skills");
    const { acceptProposal, dismissProposal, getProposal, prepareProposal } = await import("../server/proposals");
    const { librarySkillPath } = await import("../server/library");
    const host = fakeHost([makeBot({ id: "bot-a" })]);
    const caller = { bot: makeBot({ id: "bot-a" }), agentId: newUuid(), host, relay: null as never };
    const reply = await proposeSkill.run({ name: "Weekly Report!", description: "Use for the\nweekly report", instructions: "1. Collect PRs." }, caller);
    const id = proposalIdOf({ name: "bots.propose_skill", status: "completed", detail: { output: reply } })!;
    expect(id).toMatch(/^p-[a-z0-9]{10}$/);

    const proposal = await getProposal(id);
    expect(proposal).toMatchObject({ botId: "bot-a", agentId: caller.agentId, kind: "skill", status: "pending", data: { name: "weekly-report", description: "Use for the weekly report" } });
    expect(proposal!.kind === "skill" && proposal!.data.text).toBe("---\nname: weekly-report\ndescription: Use for the weekly report\n---\n\n1. Collect PRs.\n");

    const prepared = await prepareProposal(id);
    expect(prepared.skill).toMatchObject({ id: "weekly-report", description: "Use for the weekly report" });
    (await host.values())!.proposalDecisions = [{ id, status: "accepted" }];
    const accepted = await acceptProposal(id, host);
    expect(accepted.proposal.status).toBe("accepted");
    expect(await readFile(join(librarySkillPath("weekly-report"), "SKILL.md"), "utf8")).toBe(proposal!.kind === "skill" ? proposal!.data.text : "");
    expect((await acceptProposal(id, host)).proposal.status).toBe("accepted");
    await expect(dismissProposal(id, host)).rejects.toThrow("already saved");

    const other = proposalIdOf({ name: "bots.propose_skill", status: "completed", detail: { output: await proposeSkill.run({ name: "x", description: "y", instructions: "z" }, caller) } })!;
    (await host.values())!.proposalDecisions!.push({ id: other, status: "dismissed" });
    expect((await dismissProposal(other, host)).status).toBe("dismissed");
    await expect(acceptProposal(other, host)).rejects.toThrow("dismissed");
    await expect(acceptProposal("p-0000000000", host)).rejects.toThrow("no longer available");
  });
});

describe("tool display model", () => {
  it("matches Paseo's labels and summaries", () => {
    expect(buildToolCallDisplayModel({ name: "Bash", status: "completed", error: null, detail: { type: "shell", command: "npm test" } })).toEqual({ displayName: "Shell", summary: "npm test" });
    expect(buildToolCallDisplayModel({ name: "Read", status: "completed", error: null, detail: { type: "read", filePath: "/repo/src/a.ts" }, cwd: "/repo" })).toEqual({ displayName: "Read", summary: "src/a.ts" });
    expect(buildToolCallDisplayModel({ name: "Grep", status: "completed", error: null, detail: { type: "search", query: "foo" } })).toEqual({ displayName: "Search", summary: "foo" });
    expect(buildToolCallDisplayModel({ name: "Task", status: "running", error: null, detail: { type: "sub_agent", subAgentType: "Explore", description: "Find it", log: "" } })).toEqual({ displayName: "Explore", summary: "Find it" });
    expect(buildToolCallDisplayModel({ name: "mcp__paseo__list_workspaces", status: "completed", error: null, detail: { type: "unknown", input: null, output: null } }).displayName).toBe("List workspaces");
    expect(buildToolCallDisplayModel({ name: "mcp__bots__search_chats", status: "completed", error: null, detail: { type: "unknown", input: null, output: null } }).displayName).toBe("Search chats");
    expect(buildToolCallDisplayModel({ name: "mcp__other__search_chats", status: "completed", error: null, detail: { type: "unknown", input: null, output: null } }).displayName).toBe("mcp__other__search_chats");
    expect(buildToolCallDisplayModel({ name: "thinking", status: "completed", error: null, detail: { type: "unknown", input: "x", output: null } }).displayName).toBe("Thinking");
    expect(buildToolCallDisplayModel({ name: "Bash", status: "failed", error: { content: "exit 1" }, detail: { type: "shell", command: "false" } }).errorText).toBe("exit 1");
  });

  it("keeps the old label and icon helpers", () => {
    expect(toolLabel("mcp__paseo__list_workspaces")).toBe("List workspaces");
    expect(toolLabel("ToolSearch")).toBe("Toolsearch");
    expect(toolLabel("mcp__gmail__search_threads")).toBe("mcp__gmail__search_threads");
    expect(toolIcon("Bash", { type: "shell" })).toBe("SquareTerminal");
    expect(toolIcon("anything", { type: "plain_text", icon: "square_terminal" })).toBe("SquareTerminal");
    expect(toolIcon("Task")).toBe("Bot");
    expect(toolIcon("thinking", { type: "unknown" })).toBe("Brain");
  });

  it("knows when details can open and when they're loading", () => {
    const running = buildToolCallPresentation({ name: "Read", status: "running", error: null, detail: { type: "unknown", input: null, output: null } });
    expect(running).toMatchObject({ isLoadingDetails: true, canOpenDetails: true });
    const empty = buildToolCallPresentation({ name: "X", status: "completed", error: null, detail: { type: "unknown", input: {}, output: null } });
    expect(empty.canOpenDetails).toBe(false);
    const plan = buildToolCallPresentation({ name: "plan", status: "completed", error: null, detail: { type: "plan", text: "do" }, metadata: { approved: true } });
    expect(plan).toMatchObject({ isPlan: true, planOutcome: "approved" });
  });
});

describe("task lists", () => {
  it("parses TodoWrite and update_plan", () => {
    expect(extractTaskEntriesFromToolCall("TodoWrite", { todos: [{ content: "a", status: "completed", activeForm: "Doing a" }] })).toEqual([{ text: "Doing a", completed: true }]);
    expect(extractTaskEntriesFromToolCall("update_plan", { plan: [{ step: " b ", status: "weird" }] })).toEqual([{ text: "b", completed: false }]);
    expect(extractTaskEntriesFromToolCall("TodoWrite", { todos: [{ content: "a" }] })).toBeNull();
    expect(extractTaskEntriesFromToolCall("Read", {})).toBeNull();
  });

  it("derives added tasks", () => {
    expect(deriveTaskActivities([{ text: "a", completed: false }], [{ text: "a", completed: false }, { text: "b", completed: false }])).toEqual([{ type: "added", task: "b" }]);
  });
});

describe("diffs", () => {
  it("builds line diffs with word segments", () => {
    const diff = buildLineDiff("a\nold line\nc", "a\nnew line\nc");
    expect(diff.map((line) => line.type)).toEqual(["context", "remove", "add", "context"]);
    expect(diff[1]!.segments).toEqual([
      { text: "old", changed: true },
      { text: " line", changed: false },
    ]);
  });

  it("parses unified diffs", () => {
    expect(parseUnifiedDiff("--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b").map((line) => line.type)).toEqual(["header", "remove", "add"]);
  });
});
