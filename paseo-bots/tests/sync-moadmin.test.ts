import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { syncBotToAgyAgent } from "../server/agy-agents";

describe("Sync bot-moadmin configuration", () => {
  it("verifies bot-moadmin baseTools and syncs into isolated agy agents directory", async () => {
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

    const tempAgentsDir = await mkdtemp(join(tmpdir(), "paseo-test-moadmin-agents-"));
    const tempBotDataDir = await mkdtemp(join(tmpdir(), "paseo-test-moadmin-data-"));
    try {
      const syncResult = await syncBotToAgyAgent(moadmin, {
        agentsDir: tempAgentsDir,
        botDataDir: tempBotDataDir,
      });
      expect(syncResult.synced).toBe(true);

      const mdPath = join(tempAgentsDir, "bot-moadmin.md");
      const mdContent = await readFile(mdPath, "utf8");
      for (const tool of targetTools) {
        expect(mdContent).toContain(`  - ${tool}`);
      }
      expect(mdContent).not.toContain("  - read_file");
      expect(mdContent).not.toContain("  - edit_file");
      expect(mdContent).not.toContain("  - write_file");
      expect(mdContent).not.toContain("  - run_command");
      expect(mdContent).not.toContain("  - search_web");
    } finally {
      await rm(tempAgentsDir, { recursive: true, force: true });
      await rm(tempBotDataDir, { recursive: true, force: true });
    }
  });
});
