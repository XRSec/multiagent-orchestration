/**
 * Purpose: Test suite for decoupled library.mcpServers and library.skills storage, disk hydration, and settings stripping.
 * Context: Paseo bots plugin tests verifying library decoupling from bots.json.
 * Usage: pnpm vitest run tests/library-decoupling.test.ts
 * Prerequisites: Vitest test runner.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  deleteMcpServer,
  deleteMcpServerSync,
  listAllMcpServers,
  listAllMcpServersSync,
  mcpServerPath,
  readMcpServer,
  readMcpServerSync,
  resolveMcpServersDir,
  writeMcpServer,
  writeMcpServerSync,
} from "../server/mcp-servers";
import {
  deleteSkillMetadata,
  deleteSkillMetadataSync,
  listAllLibrarySkills,
  listAllLibrarySkillsSync,
  readSkillMetadata,
  readSkillMetadataSync,
  resolveSkillsDir,
  writeSkillMetadata,
  writeSkillMetadataSync,
} from "../server/library";
import {
  EMPTY_LIBRARY,
  stripLibraryInSettings,
  type Bot,
  type BotSettingsValues,
  type LibraryMcpServer,
  type LibrarySkill,
} from "../shared/bot";
import { applyChanges, type ApplyContext } from "../shared/changes";
import { BotsHost } from "../server/host";

function sampleMcpServer(overrides: Partial<LibraryMcpServer> = {}): LibraryMcpServer {
  const now = "2026-11-18T00:00:00.000Z";
  return {
    id: "mcp-sample-test",
    name: "SampleServer",
    description: "Sample decoupled MCP server",
    enabled: true,
    config: {
      type: "stdio",
      command: "sample-cli",
      args: ["--serve"],
      env: {},
    },
    tools: [
      { name: "sample_tool", description: "Does sample operations" },
    ],
    checkedAt: now,
    checkError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sampleSkill(overrides: Partial<LibrarySkill> = {}): LibrarySkill {
  const now = "2026-11-18T00:00:00.000Z";
  return {
    id: "sample-skill",
    description: "Sample decoupled skill",
    source: "",
    enabled: true,
    reviewedSha: "abc123sha",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("MCP Servers Decoupled Storage", () => {
  it("resolves default mcp-servers directory and rejects invalid IDs with path traversal", () => {
    const dir = resolveMcpServersDir();
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);

    const path = mcpServerPath("mcp-mwjoz4yx3679");
    expect(path).toBe(join(dir, "mcp-mwjoz4yx3679.json"));

    expect(() => mcpServerPath("../evil")).toThrow(/invalid mcp server id/i);
    expect(() => mcpServerPath("nested/id")).toThrow(/invalid mcp server id/i);
    expect(() => mcpServerPath(" ")).toThrow(/invalid mcp server id/i);
  });

  it("reads existing repository decoupled MCP servers", async () => {
    const rea = await readMcpServer("mcp-mwjoz4yx3679");
    expect(rea).not.toBeNull();
    expect(rea?.name).toBe("REA");
    expect(rea?.tools?.length).toBeGreaterThan(0);

    const syncRea = readMcpServerSync("mcp-mwjoz4yx3679");
    expect(syncRea).toEqual(rea);

    const prism = await readMcpServer("mcp-mwjzbk2nd0jy");
    expect(prism).not.toBeNull();
    expect(prism?.name).toBe("Prism");

    const missingAsync = await readMcpServer("mcp-non-existent", sampleMcpServer({ id: "fallback" }));
    expect(missingAsync?.id).toBe("fallback");

    const missingSync = readMcpServerSync("mcp-non-existent", sampleMcpServer({ id: "sync-fallback" }));
    expect(missingSync?.id).toBe("sync-fallback");
  });

  it("performs full CRUD and listing in an isolated test directory", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "paseo-mcp-test-"));
    try {
      const server1 = sampleMcpServer({ id: "mcp-alpha", name: "AlphaServer" });
      const server2 = sampleMcpServer({ id: "mcp-beta", name: "BetaServer" });

      // Async write & read
      await writeMcpServer(server1, tempDir);
      const read1 = await readMcpServer("mcp-alpha", null, tempDir);
      expect(read1).toEqual(server1);

      // Sync write & read
      writeMcpServerSync(server2, tempDir);
      const read2 = readMcpServerSync("mcp-beta", null, tempDir);
      expect(read2).toEqual(server2);

      // List all async & sync
      const listAsync = await listAllMcpServers(tempDir);
      expect(listAsync.map((s) => s.id)).toEqual(["mcp-alpha", "mcp-beta"]);

      const listSync = listAllMcpServersSync(tempDir);
      expect(listSync.map((s) => s.id)).toEqual(["mcp-alpha", "mcp-beta"]);

      // Delete async & sync
      const deleted1 = await deleteMcpServer("mcp-alpha", tempDir);
      expect(deleted1).toBe(true);
      expect(await readMcpServer("mcp-alpha", null, tempDir)).toBeNull();

      const deleted2 = deleteMcpServerSync("mcp-beta", tempDir);
      expect(deleted2).toBe(true);
      expect(readMcpServerSync("mcp-beta", null, tempDir)).toBeNull();

      expect(await listAllMcpServers(tempDir)).toEqual([]);
    } finally {
      const { rmSync } = await import("node:fs");
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("Skills Metadata Decoupled Storage", () => {
  it("reads existing repository skill metadata and reconstructs library skills from disk", async () => {
    const twitterMeta = await readSkillMetadata("read-twitter");
    expect(twitterMeta).not.toBeNull();
    expect(twitterMeta?.id).toBe("read-twitter");
    expect(twitterMeta?.description).toContain("tweets");
    expect(twitterMeta?.enabled).toBe(true);

    const syncTwitterMeta = readSkillMetadataSync("read-twitter");
    expect(syncTwitterMeta).toEqual(twitterMeta);

    const prismMeta = await readSkillMetadata("prism");
    expect(prismMeta).not.toBeNull();
    expect(prismMeta?.id).toBe("prism");

    const allSkills = await listAllLibrarySkills();
    const ids = allSkills.map((s) => s.id);
    expect(ids).toContain("read-twitter");
    expect(ids).toContain("prism");

    const syncSkills = listAllLibrarySkillsSync();
    expect(syncSkills).toEqual(allSkills);
  });

  it("performs metadata CRUD and falls back to SKILL.md frontmatter when metadata.json is absent", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "paseo-skills-test-"));
    try {
      const skill1Dir = join(tempDir, "skill-one");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(skill1Dir, { recursive: true });

      // Create only SKILL.md without metadata.json
      await writeFile(
        join(skill1Dir, "SKILL.md"),
        "---\nname: skill-one\ndescription: Frontmatter parsed description\n---\n# Skill One\nInstructions here."
      );

      const meta1 = await readSkillMetadata("skill-one", tempDir);
      expect(meta1).not.toBeNull();
      expect(meta1?.id).toBe("skill-one");
      expect(meta1?.description).toBe("Frontmatter parsed description");
      expect(meta1?.enabled).toBe(true);
      expect(typeof meta1?.reviewedSha).toBe("string");

      // Now explicitly write metadata.json
      const customMeta: LibrarySkill = {
        id: "skill-one",
        description: "Overridden description",
        source: "github.com/custom/skill",
        enabled: false,
        reviewedSha: "custom-sha-999",
        createdAt: "2026-11-18T01:00:00.000Z",
        updatedAt: "2026-11-18T01:00:00.000Z",
      };
      await writeSkillMetadata(customMeta, tempDir);

      const readBack = await readSkillMetadata("skill-one", tempDir);
      expect(readBack).toEqual(customMeta);

      const syncReadBack = readSkillMetadataSync("skill-one", tempDir);
      expect(syncReadBack).toEqual(customMeta);

      const listed = await listAllLibrarySkills(tempDir);
      expect(listed).toEqual([customMeta]);

      // Delete metadata
      await deleteSkillMetadata("skill-one", tempDir);
      // After deleting metadata.json, it gracefully falls back to SKILL.md frontmatter!
      const fallbackAfterDelete = await readSkillMetadata("skill-one", tempDir);
      expect(fallbackAfterDelete?.description).toBe("Frontmatter parsed description");
    } finally {
      const { rmSync } = await import("node:fs");
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("stripLibraryInSettings and applyChanges Decoupling", () => {
  it("stripLibraryInSettings removes library from settings object", () => {
    const values: BotSettingsValues = {
      bots: [],
      history: [],
      library: {
        skills: [sampleSkill()],
        mcpServers: [sampleMcpServer()],
      },
    };

    const stripped = stripLibraryInSettings(values);
    expect(stripped.library).toBeUndefined();
    expect(stripped.bots).toEqual([]);
    expect(stripped.history).toEqual([]);
  });

  it("applyChanges with stripLibraryInSettings delegates storage to callbacks and strips library blob", () => {
    const savedServers: LibraryMcpServer[] = [];
    const deletedServerIds: string[] = [];
    const savedSkills: LibrarySkill[] = [];

    const baseValues: BotSettingsValues = {
      bots: [
        {
          id: "bot-agent",
          name: "Agent",
          title: "",
          description: "",
          avatar: { seed: "a", palette: null, shape: "circle", imageUrl: null },
          hostId: null,
          provider: "agy",
          model: null,
          modeId: null,
          thinkingOptionId: null,
          fallbackModels: [],
          providerConfigs: [],
          soul: "",
          mcpServerIds: [],
          alwaysAllow: [],
          skillIds: [],
          apps: [],
          appRules: {},
          voice: { name: null, readReplies: false },
          contactBots: "off",
          routines: [],
          playbooks: [],
          cwd: null,
          mounts: [],
          pinned: false,
          archived: false,
          createdAt: "2026-11-18T00:00:00.000Z",
          updatedAt: "2026-11-18T00:00:00.000Z",
        },
      ],
      history: [],
      library: {
        skills: [sampleSkill({ id: "existing-skill", enabled: false, reviewedSha: "valid-sha" })],
        mcpServers: [sampleMcpServer({ id: "existing-mcp", name: "existing_mcp" })],
      },
    };

    const context: ApplyContext = {
      now: "2026-11-18T01:00:00.000Z",
      provider: "agy",
      stripLibraryInSettings: true,
      saveMcpServer: (server) => savedServers.push(server),
      deleteMcpServer: (id) => deletedServerIds.push(id),
      saveSkill: (skill) => savedSkills.push(skill),
    };

    const result = applyChanges(
      baseValues,
      [
        {
          type: "add_mcp_server",
          name: "new_server",
          command: "echo",
          args: ["hello"],
        },
        {
          type: "set_skill",
          skill: "existing-skill",
          enabled: true,
        },
        {
          type: "remove_mcp_server",
          server: "existing-mcp",
        },
      ],
      context
    );

    // Verify settings object has NO inline library blob
    expect(result.library).toBeUndefined();

    // Verify external storage callbacks were invoked
    expect(savedServers).toHaveLength(1);
    expect(savedServers[0]?.name).toBe("new_server");

    expect(savedSkills).toHaveLength(1);
    expect(savedSkills[0]?.id).toBe("existing-skill");
    expect(savedSkills[0]?.enabled).toBe(true);

    expect(deletedServerIds).toEqual(["existing-mcp"]);
  });
});

describe("Production bots.json Decoupling Verification", () => {
  it("asserts paseo-bots-plugin-settings/bots.json has no inline library.mcpServers or library.skills", () => {
    const repoCandidate = resolve(__dirname, "../../paseo-bots-plugin-settings/bots.json");
    expect(existsSync(repoCandidate)).toBe(true);

    const raw = readFileSync(repoCandidate, "utf8");
    const parsed = JSON.parse(raw);

    // Assert that inline library is stripped (either omitted or has no mcpServers/skills)
    expect(parsed.values.library?.mcpServers).toBeUndefined();
    expect(parsed.values.library?.skills).toBeUndefined();

    // Assert that essential bots, groups, history, ui, defaults are intact
    expect(Array.isArray(parsed.values.bots)).toBe(true);
    expect(parsed.values.bots.length).toBeGreaterThanOrEqual(14);
    expect(parsed.values.bots.some((b: Bot) => b.id === "bot-moadmin")).toBe(true);
    expect(parsed.values.bots.some((b: Bot) => b.id === "bot-mocode")).toBe(true);

    expect(Array.isArray(parsed.values.history)).toBe(true);
    expect(typeof parsed.values.ui).toBe("object");
    expect(typeof parsed.values.defaults).toBe("object");

    // Assert external files exist
    const reaPath = mcpServerPath("mcp-mwjoz4yx3679");
    expect(existsSync(reaPath)).toBe(true);

    const prismPath = mcpServerPath("mcp-mwjzbk2nd0jy");
    expect(existsSync(prismPath)).toBe(true);

    const twitterSkillDir = resolveSkillsDir();
    expect(existsSync(join(twitterSkillDir, "read-twitter", "metadata.json"))).toBe(true);
  });

  it("hydrates library seamlessly in BotsHost without inline library in settings", async () => {
    // Fake settings with NO library
    const values: BotSettingsValues = {
      bots: [],
      history: [],
    };
    const settings = { read: async () => ({ status: "ready" as const, values, revision: "1" }) };
    const host = new BotsHost(settings as never);

    const lib = await host.library();
    expect(Array.isArray(lib.mcpServers)).toBe(true);
    expect(Array.isArray(lib.skills)).toBe(true);

    // Both REA and Prism should be present via disk hydration
    expect(lib.mcpServers.some((s) => s.name === "REA")).toBe(true);
    expect(lib.mcpServers.some((s) => s.name === "Prism")).toBe(true);

    // read-twitter and prism skills should be present via disk hydration
    expect(lib.skills.some((s) => s.id === "read-twitter")).toBe(true);
    expect(lib.skills.some((s) => s.id === "prism")).toBe(true);

    // host.values() returns hydrated library
    const hostValues = await host.values();
    expect(hostValues?.library?.mcpServers.some((s) => s.name === "REA")).toBe(true);
  });
});
