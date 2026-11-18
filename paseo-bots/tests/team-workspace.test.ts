import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  BotGroupSchema,
  botSettings,
  EMPTY_LIBRARY,
  promptSections,
  TeamFileTeamSchema,
  type BotGroup,
} from "../shared/bot";
import { resolveBotPlacement } from "../shared/chat";
import { applyChanges } from "../shared/changes";
import { promptContext } from "../server/prompt";
import { makeBot } from "./helpers";

const NOW = "2026-11-16T00:00:00.000Z";

function makeGroup(overrides: Partial<BotGroup> = {}): BotGroup {
  return BotGroupSchema.parse({
    id: "team-1",
    name: "Core Team",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

describe("Team-scoped workspace (cwd & mounts)", () => {
  it("parses cwd and mounts defaults on BotGroupSchema and TeamFileTeamSchema", () => {
    const group = BotGroupSchema.parse({ id: "t1", name: "T1", createdAt: NOW, updatedAt: NOW });
    expect(group.cwd).toBeNull();
    expect(group.mounts).toEqual([]);

    const teamFile = TeamFileTeamSchema.parse({ name: "T1" });
    expect(teamFile.cwd).toBeNull();
    expect(teamFile.mounts).toEqual([]);
  });

  it("resolves session placement in order: group.cwd -> bot.cwd -> ensureBotHome", () => {
    const home = { path: "/shared/Bots/bot-1", root: "/shared/Bots" };
    const botWithCwd = makeBot({ id: "bot-1", cwd: "/bot/cwd" });
    const botWithoutCwd = makeBot({ id: "bot-1", cwd: null });

    const groupWithCwd = makeGroup({ cwd: "/team/cwd" });
    const groupWithoutCwd = makeGroup({ cwd: null });

    expect(resolveBotPlacement(botWithCwd, groupWithCwd, home)).toEqual({
      path: "/shared/Bots/bot-1",
      projectRoot: "/shared/Bots",
      projectTitle: "Core Team",
      targetProjectDirs: ["/team/cwd"],
    });
    expect(resolveBotPlacement(botWithCwd, null, home)).toEqual({
      path: "/shared/Bots/bot-1",
      projectRoot: "/shared/Bots",
      projectTitle: null,
      targetProjectDirs: ["/bot/cwd"],
    });
    expect(resolveBotPlacement(botWithCwd, groupWithoutCwd, home)).toEqual({
      path: "/shared/Bots/bot-1",
      projectRoot: "/shared/Bots",
      projectTitle: "Core Team",
      targetProjectDirs: [],
    });
    expect(resolveBotPlacement(botWithoutCwd, groupWithoutCwd, home)).toEqual({
      path: "/shared/Bots/bot-1",
      projectRoot: "/shared/Bots",
      projectTitle: "Core Team",
      targetProjectDirs: [],
    });
  });

  it("isolates workspace mounts and workdir to active group in promptContext & promptSections while keeping memory bot-scoped", async () => {
    const bot = makeBot({
      id: "bot-iso",
      cwd: "/bot/own-cwd",
      mounts: ["/bot/leaked-mount"],
    });
    const group = makeGroup({
      id: "team-active",
      name: "Active Team",
      leadId: "bot-iso",
      memberIds: ["bot-iso"],
      cwd: "/team/repo",
      mounts: ["/team/extra-mount"],
    });

    const ctx = await promptContext(bot, false, EMPTY_LIBRARY, true, {
      team: { group, groups: [group], bots: [bot] },
    });

    expect(ctx.workdir).toBe("/team/repo");
    expect(ctx.mounts).toEqual(["/team/extra-mount"]);

    const sections = promptSections(bot, { ...ctx, memoryPath: "/shared/Bots/bot-iso/MEMORY.md" });
    const workspace = sections.find((s) => s.title === "Workspace")?.text ?? "";
    const memory = sections.find((s) => s.title === "Memory")?.text ?? "";

    expect(workspace).toContain("Working directory: /team/repo");
    expect(workspace).toContain("- /team/extra-mount");
    expect(workspace).not.toContain("/bot/leaked-mount");
    expect(workspace).not.toContain("/bot/own-cwd");
    expect(memory).toContain("/shared/Bots/bot-iso/MEMORY.md");
  });

  it("supports cwd and mounts on create_team and update_team in applyChanges", () => {
    const bot = makeBot({ id: "bot-a", name: "Alpha" });
    const baseValues = { bots: [bot], history: [], groups: [] };

    const created = applyChanges(
      baseValues,
      [
        {
          type: "create_team",
          name: "Alpha Team",
          lead: "Alpha",
          cwd: "/projects/alpha",
          mounts: ["/projects/shared"],
        },
      ],
      { now: NOW, provider: "agy" },
    );

    expect(created.groups).toHaveLength(1);
    expect(created.groups?.[0]?.cwd).toBe("/projects/alpha");
    expect(created.groups?.[0]?.mounts).toEqual(["/projects/shared"]);

    const updated = applyChanges(
      created,
      [
        {
          type: "update_team",
          team: "Alpha Team",
          cwd: "/projects/alpha-v2",
          add_mounts: ["/projects/docs"],
          remove_mounts: ["/projects/shared"],
        },
      ],
      { now: NOW, provider: "agy" },
    );

    expect(updated.groups?.[0]?.cwd).toBe("/projects/alpha-v2");
    expect(updated.groups?.[0]?.mounts).toEqual(["/projects/docs"]);
  });

  it("validates migrated paseo-bots-plugin-settings/bots.json against botSettings.schema", () => {
    const botsJsonPath = join(process.cwd(), "..", "paseo-bots-plugin-settings", "bots.json");
    const raw = JSON.parse(readFileSync(botsJsonPath, "utf8")) as { version: number; values: unknown };
    expect(raw.version).toBe(4);
    const parsed = botSettings.schema.parse(raw.values);
    expect(parsed.bots.length).toBeGreaterThanOrEqual(11);
    for (const bot of parsed.bots) {
      expect(bot.cwd).toBeNull();
      expect(bot.mounts).toEqual([]);
    }
    const mainTeam = parsed.groups?.find((g) => g.id === "team-mwgv59i8dfdv");
    expect(mainTeam).toBeDefined();
    const expectedRoot = resolve(__dirname, "../..");
    expect(
      mainTeam?.cwd === null ||
        mainTeam?.cwd === expectedRoot ||
        mainTeam?.cwd === "." ||
        mainTeam?.cwd === "${REPO_ROOT}",
    ).toBe(true);
    expect(mainTeam?.mounts).toEqual([]);
    for (const other of (parsed.groups ?? []).filter((g) => g.id !== "team-mwgv59i8dfdv")) {
      expect(other.cwd).toBeNull();
      expect(other.mounts).toEqual([]);
    }
  });
});
