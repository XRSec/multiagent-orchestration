import { describe, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { syncBotToAgyAgent } from "../server/agy-agents";

describe("Sync bot-moadmin configuration", () => {
  it("updates bot-moadmin in bots.json and syncs ~/.gemini/config/agents/bot-moadmin.md", async () => {
    const jsonPath = resolve(__dirname, "../../paseo-bots-plugin-settings/bots.json");
    const data = JSON.parse(await readFile(jsonPath, "utf8"));
    const moadmin = data.values.bots.find((b: any) => b.id === "bot-moadmin");
    expect(moadmin).toBeDefined();

    const targetTools = [
      "invoke_subagent",
      "define_subagent",
      "manage_subagents",
      "send_message",
      "manage_task",
      "schedule",
      "ask_question",
    ];

    moadmin.baseTools = targetTools;
    if (moadmin.providerConfigs) {
      for (const cfg of moadmin.providerConfigs) {
        if (cfg.provider === "agy") {
          cfg.baseTools = targetTools;
        }
      }
    }
    moadmin.updatedAt = new Date().toISOString();

    await writeFile(jsonPath, JSON.stringify(data, null, 2), "utf8");

    const syncResult = await syncBotToAgyAgent(moadmin);
    expect(syncResult.synced).toBe(true);

    const mdPath = join(homedir(), ".gemini", "config", "agents", "bot-moadmin.md");
    const mdContent = await readFile(mdPath, "utf8");
    for (const tool of targetTools) {
      expect(mdContent).toContain(`  - ${tool}`);
    }
    expect(mdContent).not.toContain("  - read_file");
    expect(mdContent).not.toContain("  - edit_file");
    expect(mdContent).not.toContain("  - write_file");
    expect(mdContent).not.toContain("  - run_command");
    expect(mdContent).not.toContain("  - search_web");
  });
});
