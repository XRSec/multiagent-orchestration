import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_LIBRARY, type Library } from "../shared/bot";
import { botDataPath, pluginDataPath, portablePathEnv, resolveCurrentDir, resolveRepoRootPath } from "../server/bot-home";
import { CommandAllowlist } from "../server/commands";
import { deleteSkill, importSkills, librarySkillPath, readSkill, resolveSkillsDir, writeSkill } from "../server/library";
import { MemoryJournal } from "../server/journal";
import { resolveMcpServersDir, mcpServerPath } from "../server/mcp-servers";
import { acceptProposal, createProposal, dismissProposal } from "../server/proposals";
import { exportBot, importBot, importTeam } from "../server/share";
import { resolveSoulsDir, botSoulPath } from "../server/souls";
import { saveUpload } from "../server/uploads";
import { fakeHost, makeBot, NOW } from "./helpers";

let home: string;
const previousHome = process.env.PASEO_HOME;
beforeEach(async () => {
  const temporary = process.env.HS_TEMP || join(homedir(), "Temp");
  await mkdir(temporary, { recursive: true });
  home = await mkdtemp(join(temporary, "paseo-bots-storage-"));
  process.env.PASEO_HOME = home;
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (previousHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = previousHome;
  await rm(home, { recursive: true, force: true });
});

const payload = (files: Record<string, string>, skills: { id: string }[] = []) => ({ format: "paseo-bots", version: 2, bot: makeBot(), skills, mcpServers: [], files });
const withSkill = (id: string): Library => ({ ...EMPTY_LIBRARY, skills: [{ id, description: "", source: "", enabled: true, createdAt: NOW, updatedAt: NOW }] });

describe("export and import boundaries", () => {
  it("excludes external file links, directory links and cycles from an export", async () => {
    await writeSkill({ id: "links", text: "safe skill" });
    const external = join(home, "outside");
    await mkdir(external);
    await writeFile(join(external, "secret.txt"), "private host contents");
    await symlink(join(external, "secret.txt"), join(librarySkillPath("links"), "secret.txt"));
    await symlink(external, join(librarySkillPath("links"), "external"));
    await symlink(librarySkillPath("links"), join(librarySkillPath("links"), "cycle"));
    const { json } = await exportBot({ bot: makeBot({ skillIds: ["links"] }), includeMemory: false }, withSkill("links"));
    expect(JSON.parse(json).files).toEqual({ "skills/links/SKILL.md": "safe skill" });
    expect(json).not.toContain("private host contents");
  });

  it("only walks memory when memory is requested, leaving unrelated upload trees alone", async () => {
    const root = botDataPath("bot-1");
    await mkdir(join(root, "uploads", ...Array(30).fill("nested")), { recursive: true });
    await mkdir(join(root, "memory"), { recursive: true });
    await writeFile(join(root, "MEMORY.md"), "main");
    await writeFile(join(root, "memory", "topic.md"), "topic");
    const { json } = await exportBot({ bot: makeBot(), includeMemory: true }, EMPTY_LIBRARY);
    expect(JSON.parse(json).files).toEqual({ "MEMORY.md": "main", "memory/topic.md": "topic" });
  });

  it("fails clearly rather than silently truncating too many, large or deep skill files", async () => {
    await writeSkill({ id: "large", text: "safe" });
    const root = librarySkillPath("large");
    const run = () => exportBot({ bot: makeBot({ skillIds: ["large"] }), includeMemory: false }, withSkill("large"));
    await writeFile(join(root, "large.txt"), "x".repeat(512 * 1024 + 1));
    await expect(run()).rejects.toThrow("512 KB");
    await rm(join(root, "large.txt"));
    const nested = join(root, ...Array(17).fill("nested"));
    await mkdir(nested, { recursive: true });
    await expect(run()).rejects.toThrow("levels deep");
    await rm(join(root, "nested"), { recursive: true });
    await Promise.all(Array.from({ length: 400 }, (_, index) => writeFile(join(root, `${index}.txt`), "x")));
    await expect(run()).rejects.toThrow("400 files");
  });

  it("validates every path before writing, including backslashes and dot segments", async () => {
    for (const path of ["memory/../../outside.md", "memory/..\\outside.md", "/MEMORY.md", "memory//topic.md"]) {
      const json = JSON.stringify(payload({ "MEMORY.md": "must not write", [path]: "bad" }));
      await expect(importBot({ botId: "safe", json })).rejects.toThrow("Invalid file path");
      await expect(readFile(join(botDataPath("safe"), "MEMORY.md"))).rejects.toThrow();
    }
  });

  it("refuses imported writes through existing directory symlinks", async () => {
    const external = join(home, "external");
    await mkdir(external);
    await mkdir(botDataPath("safe"), { recursive: true });
    await symlink(external, join(botDataPath("safe"), "memory"));
    await expect(importBot({ botId: "safe", json: JSON.stringify(payload({ "memory/topic.md": "bad" })) })).rejects.toThrow("not a link");
    expect(await readdir(external)).toEqual([]);
  });

  it("validates all team entries before importing the first bot", async () => {
    const json = JSON.stringify({ format: "paseo-bots-team", version: 1, bots: [payload({ "MEMORY.md": "first" }), payload({ "memory/../bad": "bad" })] });
    await expect(importTeam({ json })).rejects.toThrow("Invalid file path");
    await expect(readdir(join(home, "Bots"))).rejects.toThrow();
  });
});

describe("durable user data", () => {
  it("rejects parent-directory skill and bot IDs", async () => {
    for (const id of [".", "..", "../sibling", "folder/file", "folder\\file"]) {
      await expect(deleteSkill({ id })).rejects.toThrow("skill name");
      await expect(writeSkill({ id, text: "bad" })).rejects.toThrow("skill name");
    }
    expect(() => botDataPath("..")).toThrow("Invalid bot ID");
  });

  it("keeps an existing skill intact when a refresh cannot download a bounded file", async () => {
    await writeSkill({ id: "keep", text: "original" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x".repeat(512 * 1024 + 1)));
    await expect(importSkills({ source: "https://example.test/keep/SKILL.md" })).rejects.toThrow("512 KB");
    expect((await readSkill({ id: "keep" })).text).toBe("original");
  });

  it("preserves corrupted command and proposal stores instead of erasing them", async () => {
    await mkdir(pluginDataPath(), { recursive: true });
    const commands = join(pluginDataPath(), "commands.json");
    const proposals = join(pluginDataPath(), "proposals.json");
    await writeFile(commands, "{ damaged");
    await writeFile(proposals, "{ damaged");
    await expect(new CommandAllowlist().add("bot-1", "npm test", "/work")).rejects.toThrow("kept intact");
    await expect(createProposal({ botId: "bot-1", agentId: "chat", kind: "skill", data: { name: "new", description: "", text: "new" } })).rejects.toThrow("kept intact");
    expect(await readFile(commands, "utf8")).toBe("{ damaged");
    expect(await readFile(proposals, "utf8")).toBe("{ damaged");
  });

  it("serializes dismiss and accept so a dismissed proposal cannot write a skill", async () => {
    const proposal = await createProposal({ botId: "bot-1", agentId: "chat", kind: "skill", data: { name: "race", description: "", text: "new" } });
    const host = fakeHost([makeBot()]);
    (await host.values())!.proposalDecisions = [{ id: proposal.id, status: "dismissed" }];
    const results = await Promise.allSettled([dismissProposal(proposal.id, host), acceptProposal(proposal.id, host)]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect((await readSkill({ id: "race" })).missing).toBe(true);
  });

  it("uses distinct uploads even for simultaneous identical filenames and rejects malformed data", async () => {
    const uploads = await Promise.all(Array.from({ length: 8 }, (_, index) => saveUpload({ botId: "bot-1", fileName: "../../same.txt", dataBase64: Buffer.from(`content ${index}`).toString("base64") })));
    expect(new Set(uploads.map((upload) => upload.path)).size).toBe(8);
    expect(await Promise.all(uploads.map((upload) => readFile(upload.path, "utf8")))).toEqual(Array.from({ length: 8 }, (_, index) => `content ${index}`));
    await expect(saveUpload({ botId: "bot-1", fileName: "bad", dataBase64: "###invalid###" })).rejects.toThrow("valid base64");
  });

  it("accepts large valid attachments without regex stack overflow", async () => {
    const upload = await saveUpload({ botId: "bot-1", fileName: "large.bin", dataBase64: "A".repeat(8_000_000) });
    expect(upload.size).toBe(6_000_000);
    for (const dataBase64 of ["A===", "AAAA=", "AA=A", "A=AA", "AAA"]) await expect(saveUpload({ botId: "bot-1", fileName: "bad", dataBase64 })).rejects.toThrow("valid base64");
  });

  it("rejects traversing memory names and symlink destinations", async () => {
    const journal = new MemoryJournal();
    await expect(journal.write("bot-1", "../outside.md", "bad")).rejects.toThrow("Invalid memory file name");
    const external = join(home, "private.md");
    await writeFile(external, "original");
    await mkdir(botDataPath("bot-1"), { recursive: true });
    await symlink(external, join(botDataPath("bot-1"), "MEMORY.md"));
    await expect(journal.write("bot-1", "MEMORY.md", "bad")).rejects.toThrow();
    expect(await readFile(external, "utf8")).toBe("original");
  });
});

describe("ESM host compatibility & __dirname safety", () => {
  it("resolves repo, souls, mcp-servers, library, and bot-home paths without __dirname defined", () => {
    const originalGlobalDir = (globalThis as unknown as { __dirname?: unknown }).__dirname;
    try {
      delete (globalThis as unknown as { __dirname?: unknown }).__dirname;

      // 1. resolveRepoRootPath
      const repoRoot = resolveRepoRootPath();
      expect(repoRoot).toBeDefined();
      expect(typeof repoRoot).toBe("string");
      expect(existsSync(join(repoRoot, "paseo-bots"))).toBe(true);

      // 2. bot-home helpers
      const env = portablePathEnv();
      expect(env.repoRootPath).toBe(repoRoot);
      expect(typeof pluginDataPath()).toBe("string");

      // 3. souls helpers
      const soulsDir = resolveSoulsDir();
      expect(typeof soulsDir).toBe("string");
      expect(soulsDir.length).toBeGreaterThan(0);
      expect(botSoulPath("bot-test", soulsDir)).toContain("bot-test.md");

      // 4. mcp-servers helpers
      const mcpDir = resolveMcpServersDir();
      expect(typeof mcpDir).toBe("string");
      expect(mcpDir.length).toBeGreaterThan(0);
      expect(mcpServerPath("server-test", mcpDir)).toContain("server-test.json");

      // 5. library helpers
      const skillsDir = resolveSkillsDir();
      expect(typeof skillsDir).toBe("string");
      expect(skillsDir.length).toBeGreaterThan(0);
      expect(librarySkillPath("skill-test", skillsDir)).toContain("skill-test");

      // 6. resolveCurrentDir helper without __dirname
      const currentDirWithoutMeta = resolveCurrentDir(undefined);
      expect(typeof currentDirWithoutMeta).toBe("string");
      expect(currentDirWithoutMeta.length).toBeGreaterThan(0);
      expect(existsSync(currentDirWithoutMeta)).toBe(true);
    } finally {
      if (originalGlobalDir !== undefined) {
        (globalThis as unknown as { __dirname?: unknown }).__dirname = originalGlobalDir;
      }
    }
  });

  it("resolves current directory safely with undefined, empty, or valid metaUrl without throwing", () => {
    const dirUndef = resolveCurrentDir(undefined);
    expect(typeof dirUndef).toBe("string");
    expect(dirUndef.length).toBeGreaterThan(0);
    expect(existsSync(dirUndef)).toBe(true);

    const dirEmpty = resolveCurrentDir("");
    expect(typeof dirEmpty).toBe("string");
    expect(dirEmpty.length).toBeGreaterThan(0);
    expect(existsSync(dirEmpty)).toBe(true);

    const dirValid = resolveCurrentDir(import.meta.url);
    expect(typeof dirValid).toBe("string");
    expect(dirValid.length).toBeGreaterThan(0);
    expect(existsSync(dirValid)).toBe(true);
  });

  it("asserts no unguarded __dirname references exist in server/, shared/, or index.server.ts", () => {
    const repoRoot = resolveRepoRootPath();
    const paseoBotsDir = join(repoRoot, "paseo-bots");

    const targetDirs = [
      join(paseoBotsDir, "server"),
      join(paseoBotsDir, "shared"),
    ];
    const targetFiles = [
      join(paseoBotsDir, "index.server.ts"),
    ];

    function collectFiles(dir: string): string[] {
      if (!existsSync(dir)) return [];
      const entries = readdirSync(dir, { withFileTypes: true });
      const results: string[] = [];
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...collectFiles(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const allFiles = [...targetFiles.filter((f) => existsSync(f)), ...targetDirs.flatMap(collectFiles)];
    expect(allFiles.length).toBeGreaterThan(5);

    const violations: { file: string; line: number; content: string }[] = [];

    for (const filePath of allFiles) {
      const content = readFileSync(filePath, "utf8");
      const lines = content.split("\n");
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (line.includes("__dirname")) {
          if (!line.includes("typeof __dirname")) {
            violations.push({
              file: filePath.replace(paseoBotsDir + "/", ""),
              line: index + 1,
              content: line.trim(),
            });
          }
        }
        if (line.includes("__filename")) {
          if (!line.includes("typeof __filename")) {
            violations.push({
              file: filePath.replace(paseoBotsDir + "/", ""),
              line: index + 1,
              content: line.trim(),
            });
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
