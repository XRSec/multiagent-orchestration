import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveToolsForProvider,
  resolveModeIdForProvider,
} from "../shared/bot-tools";
import {
  buildAgentConfig,
  EMPTY_LIBRARY,
  resolveBotBaseTools,
} from "../shared/bot";
import { syncBotToClaudeAgent } from "../server/claude-agents";
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

describe("Canonical capability & permission mode mapping", () => {
  it("maps canonical capabilities to agy, claude, and codex native tools", () => {
    const canonical = ["file_read", "file_edit", "file_write", "file_search", "shell", "web_search", "subagent_call", "task_manage"];

    expect(resolveToolsForProvider(canonical, "agy")).toEqual([
      "read_file",
      "edit_file",
      "write_file",
      "run_command",
      "search_web",
      "invoke_subagent",
      "manage_task",
    ]);

    expect(resolveToolsForProvider(canonical, "claude-code")).toEqual([
      "Read",
      "Edit",
      "Write",
      "Glob",
      "Grep",
      "Bash",
      "WebSearch",
      "Task",
      "TodoWrite",
    ]);

    expect(resolveToolsForProvider(canonical, "codex")).toEqual([
      "read_file",
      "edit_file",
      "write_file",
      "exec",
      "web_search",
    ]);
  });

  it("preserves native tools, bots MCP tools, maps cross-provider tools, and deduplicates", () => {
    expect(
      resolveToolsForProvider(["Read", "file_read", "mcp__bots__ask_bot", "Glob", "view_image"], "agy"),
    ).toEqual(["read_file", "mcp__bots__ask_bot"]);

    expect(
      resolveToolsForProvider(["read_file", "run_command", "bots_ask_bot", "schedule"], "claude"),
    ).toEqual(["Read", "Bash", "bots_ask_bot"]);
  });

  it("maps canonical and cross-provider permission modes while preserving native modes", () => {
    expect(resolveModeIdForProvider("full_access", "agy")).toBe("full-access");
    expect(resolveModeIdForProvider("full_access", "claude")).toBe("bypassPermissions");
    expect(resolveModeIdForProvider("full_access", "codex")).toBe("full-access");

    expect(resolveModeIdForProvider("full-access", "claude")).toBe("bypassPermissions");
    expect(resolveModeIdForProvider("bypassPermissions", "agy")).toBe("full-access");
    expect(resolveModeIdForProvider("acceptEdits", "claude")).toBe("acceptEdits");
    expect(resolveModeIdForProvider(null, "claude")).toBeUndefined();
  });

  it("wires resolveToolsForProvider and resolveModeIdForProvider into resolveBotBaseTools and buildAgentConfig", () => {
    const bot = makeBot({
      provider: "claude",
      modeId: "full_access",
      baseTools: ["file_read", "shell", "view_image"],
    });

    expect(resolveBotBaseTools(bot)).toEqual(["Read", "Bash"]);
    const config = buildAgentConfig(bot, EMPTY_LIBRARY, "claude-sonnet", "sys");
    expect(config.modeId).toBe("bypassPermissions");
    expect(config.providerOptions).toEqual({
      allowedTools: ["Read", "Bash"],
    });
  });
});

describe("syncBotToClaudeAgent", () => {
  it("writes .claude/agents/<bot.id>.md with mapped tools and permissionMode, and preserves custom frontmatter/body", async () => {
    const root = await makeTempDir("claude-agents-");
    const agentsDir = join(root, ".claude", "agents");
    const botDataDir = join(root, "bot-data");

    const bot = makeBot({
      id: "bot-claude-1",
      name: "ClaudeDev",
      title: "Senior Engineer",
      description: "Builds things cleanly",
      soul: "Always run typecheck.",
      provider: "claude",
      modeId: "full_access",
      baseTools: ["file_read", "file_edit", "shell", "view_image"],
    });

    const res1 = await syncBotToClaudeAgent(bot, { agentsDir, botDataDir });
    expect(res1.synced).toBe(true);
    expect(res1.changed).toBe(true);
    expect(res1.claudeAgent).toBe("bot-claude-1");

    const filePath = join(agentsDir, "bot-claude-1.md");
    const content1 = await readFile(filePath, "utf8");
    expect(content1).toContain("name: bot-claude-1");
    expect(content1).toContain('description: "Builds things cleanly"');
    expect(content1).toContain("permissionMode: bypassPermissions");
    expect(content1).toContain("managedBy: paseo-bots");
    expect(content1).toContain("tools:\n  - Read\n  - Edit\n  - Bash");
    expect(content1).not.toContain("view_image");

    // Idempotent second run
    const res2 = await syncBotToClaudeAgent(bot, { agentsDir, botDataDir });
    expect(res2.changed).toBe(false);

    // Preserves custom frontmatter & custom body when body is not overridden
    await mkdir(agentsDir, { recursive: true });
    await writeFile(
      filePath,
      [
        "---",
        "name: bot-claude-1",
        'description: "Old"',
        "model: sonnet",
        "permissionMode: default",
        "tools:",
        "  - Read",
        "---",
        "",
        "# Custom Body",
        "Keep me intact.",
        "",
      ].join("\n"),
      "utf8",
    );

    const res3 = await syncBotToClaudeAgent(bot, { agentsDir, botDataDir });
    expect(res3.changed).toBe(true);
    const content3 = await readFile(filePath, "utf8");
    expect(content3).toContain("model: sonnet");
    expect(content3).toContain("permissionMode: bypassPermissions");
    expect(content3).toContain("tools:\n  - Read\n  - Edit\n  - Bash");
    expect(content3).toContain("# Custom Body\nKeep me intact.");
  });
});
