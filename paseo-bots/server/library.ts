import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, readlink, rename, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { LibrarySkillSchema, type LibrarySkill } from "../shared/bot";
import { parseSkillFrontmatter, parseSkillSource, sanitizeSkillName } from "../shared/skills";
import { botDataPath, botsHomePath, pluginDataPath } from "./bot-home";
import { assertInsideManagedDataDir, isInsideManagedDataDir } from "./claude-agents";
import { atomicWrite, ensureRealDirectory, missingFile, readRegularText, safeFileParts } from "./files";

export { assertInsideManagedDataDir, isInsideManagedDataDir };

// The shared skill library: one folder per skill under plugin-data/library/skills.
// Bots that use the managed folder get a link to each of their skills in
// <bot>/skills, so the agent reads them inside its own working folder.

const MAX_SKILLS = 30;
const MAX_FILES_PER_SKILL = 40;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_LISTED_FILES = 100;

export type ImportedSkill = Pick<LibrarySkill, "id" | "description" | "source">;

export function resolveSkillsDir(customDir?: string): string {
  if (customDir) return customDir;
  if (process.env.PASEO_BOTS_SKILLS_DIR) return process.env.PASEO_BOTS_SKILLS_DIR;
  if (process.env.PASEO_BOTS_DATA_DIR) return join(process.env.PASEO_BOTS_DATA_DIR, "library", "skills");
  if (process.env.PASEO_HOME) return join(pluginDataPath(), "library", "skills");

  const repoCandidate = resolve(__dirname, "../../paseo-bots-plugin-data/library/skills");
  if (existsSync(repoCandidate)) return repoCandidate;

  const cwdParentCandidate = resolve(process.cwd(), "..", "paseo-bots-plugin-data", "library", "skills");
  if (existsSync(cwdParentCandidate)) return cwdParentCandidate;

  const cwdCandidate = resolve(process.cwd(), "paseo-bots-plugin-data", "library", "skills");
  if (existsSync(cwdCandidate)) return cwdCandidate;

  return join(pluginDataPath(), "library", "skills");
}

export function librarySkillsPath(customDir?: string): string {
  return resolveSkillsDir(customDir);
}

export function librarySkillPath(id: string, customDir?: string): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(id) || id === "." || id === "..") throw new Error("A skill name must be 1–128 letters, numbers, dots, dashes or underscores, and cannot be '.' or '..'.");
  return join(librarySkillsPath(customDir), id);
}

/**
 * Reads skill metadata asynchronously from metadata.json and/or SKILL.md frontmatter.
 */
export async function readSkillMetadata(id: string, customDir?: string): Promise<LibrarySkill | null> {
  const dir = librarySkillPath(id, customDir);
  let metaJson: Partial<LibrarySkill> | null = null;
  const metaPath = join(dir, "metadata.json");
  try {
    const raw = await readFile(metaPath, "utf8");
    metaJson = JSON.parse(raw);
  } catch {}

  let skillMdText: string | null = null;
  const skillMdPath = join(dir, "SKILL.md");
  try {
    skillMdText = await readFile(skillMdPath, "utf8");
  } catch {}

  if (!metaJson && skillMdText === null) {
    return null;
  }

  const frontmatter = skillMdText ? parseSkillFrontmatter(skillMdText) : null;
  let birthtimeStr: string | null = null;
  let mtimeStr: string | null = null;
  try {
    const st = await stat(skillMdPath).catch(() => stat(metaPath));
    birthtimeStr = st.birthtime.toISOString();
    mtimeStr = st.mtime.toISOString();
  } catch {}

  const now = new Date().toISOString();
  const effectiveId = metaJson?.id || frontmatter?.name || id;
  const effectiveDescription = metaJson?.description ?? frontmatter?.description ?? "";
  const effectiveSource = metaJson?.source ?? "";
  const effectiveEnabled = metaJson?.enabled ?? true;
  const effectiveReviewedSha =
    metaJson?.reviewedSha !== undefined
      ? metaJson.reviewedSha
      : (skillMdText ? sha256(skillMdText) : null);
  const effectiveCreatedAt = metaJson?.createdAt ?? birthtimeStr ?? now;
  const effectiveUpdatedAt = metaJson?.updatedAt ?? mtimeStr ?? now;

  const result: LibrarySkill = {
    id: effectiveId,
    description: effectiveDescription,
    source: effectiveSource,
    enabled: effectiveEnabled,
    reviewedSha: effectiveReviewedSha,
    createdAt: effectiveCreatedAt,
    updatedAt: effectiveUpdatedAt,
  };
  return LibrarySkillSchema.parse(result);
}

/**
 * Reads skill metadata synchronously from metadata.json and/or SKILL.md frontmatter.
 */
export function readSkillMetadataSync(id: string, customDir?: string): LibrarySkill | null {
  const dir = librarySkillPath(id, customDir);
  let metaJson: Partial<LibrarySkill> | null = null;
  const metaPath = join(dir, "metadata.json");
  try {
    const raw = readFileSync(metaPath, "utf8");
    metaJson = JSON.parse(raw);
  } catch {}

  let skillMdText: string | null = null;
  const skillMdPath = join(dir, "SKILL.md");
  try {
    skillMdText = readFileSync(skillMdPath, "utf8");
  } catch {}

  if (!metaJson && skillMdText === null) {
    return null;
  }

  const frontmatter = skillMdText ? parseSkillFrontmatter(skillMdText) : null;
  let birthtimeStr: string | null = null;
  let mtimeStr: string | null = null;
  try {
    let st: any;
    try {
      st = statSync(skillMdPath);
    } catch {
      st = statSync(metaPath);
    }
    birthtimeStr = st.birthtime.toISOString();
    mtimeStr = st.mtime.toISOString();
  } catch {}

  const now = new Date().toISOString();
  const effectiveId = metaJson?.id || frontmatter?.name || id;
  const effectiveDescription = metaJson?.description ?? frontmatter?.description ?? "";
  const effectiveSource = metaJson?.source ?? "";
  const effectiveEnabled = metaJson?.enabled ?? true;
  const effectiveReviewedSha =
    metaJson?.reviewedSha !== undefined
      ? metaJson.reviewedSha
      : (skillMdText ? sha256(skillMdText) : null);
  const effectiveCreatedAt = metaJson?.createdAt ?? birthtimeStr ?? now;
  const effectiveUpdatedAt = metaJson?.updatedAt ?? mtimeStr ?? now;

  const result: LibrarySkill = {
    id: effectiveId,
    description: effectiveDescription,
    source: effectiveSource,
    enabled: effectiveEnabled,
    reviewedSha: effectiveReviewedSha,
    createdAt: effectiveCreatedAt,
    updatedAt: effectiveUpdatedAt,
  };
  return LibrarySkillSchema.parse(result);
}

/**
 * Writes skill metadata JSON asynchronously.
 */
export async function writeSkillMetadata(skill: LibrarySkill, customDir?: string): Promise<string> {
  const dir = librarySkillPath(skill.id, customDir);
  await mkdir(dir, { recursive: true });
  const metaPath = join(dir, "metadata.json");
  const content = JSON.stringify(skill, null, 2) + "\n";
  await writeFile(metaPath, content, "utf8");
  return metaPath;
}

/**
 * Writes skill metadata JSON synchronously.
 */
export function writeSkillMetadataSync(skill: LibrarySkill, customDir?: string): string {
  const dir = librarySkillPath(skill.id, customDir);
  mkdirSync(dir, { recursive: true });
  const metaPath = join(dir, "metadata.json");
  const content = JSON.stringify(skill, null, 2) + "\n";
  writeFileSync(metaPath, content, "utf8");
  return metaPath;
}

/**
 * Deletes skill metadata JSON asynchronously.
 */
export async function deleteSkillMetadata(id: string, customDir?: string): Promise<boolean> {
  const dir = librarySkillPath(id, customDir);
  const metaPath = join(dir, "metadata.json");
  try {
    await rm(metaPath, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes skill metadata JSON synchronously.
 */
export function deleteSkillMetadataSync(id: string, customDir?: string): boolean {
  const dir = librarySkillPath(id, customDir);
  const metaPath = join(dir, "metadata.json");
  try {
    rmSync(metaPath, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists all decoupled library skills asynchronously by inspecting skill folders.
 */
export async function listAllLibrarySkills(customDir?: string): Promise<LibrarySkill[]> {
  const root = librarySkillsPath(customDir);
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const skills: LibrarySkill[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const meta = await readSkillMetadata(entry.name, customDir);
      if (meta) skills.push(meta);
    }
    return skills.sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

/**
 * Lists all decoupled library skills synchronously by inspecting skill folders.
 */
export function listAllLibrarySkillsSync(customDir?: string): LibrarySkill[] {
  const root = librarySkillsPath(customDir);
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    const skills: LibrarySkill[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const meta = readSkillMetadataSync(entry.name, customDir);
      if (meta) skills.push(meta);
    }
    return skills.sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

async function fetchText(url: string, limit = MAX_FILE_BYTES): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  timeout.unref();
  try {
  const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "paseo-bots", Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  if (!response.body) throw new Error(`${url} returned an empty response.`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) throw new Error(`The download exceeds ${Math.round(limit / 1024)} KB: ${url}`);
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel().catch(() => {});
  }
  } finally { clearTimeout(timeout); }
}

async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url, 8 * 1024 * 1024)) as T;
}

const writes = new Map<string, Promise<unknown>>();
function changeSkill<T>(id: string, change: () => Promise<T>): Promise<T> {
  const key = librarySkillPath(id);
  const next = (writes.get(key) ?? Promise.resolve()).then(change);
  const settled = next.catch(() => {}).finally(() => { if (writes.get(key) === settled) writes.delete(key); });
  writes.set(key, settled);
  return next;
}

async function saveSkill(files: Map<string, string>, source: string, fallbackName: string): Promise<ImportedSkill> {
  if (!files.has("SKILL.md")) throw new Error("The skill is missing SKILL.md.");
  const meta = parseSkillFrontmatter(files.get("SKILL.md")!);
  const id = sanitizeSkillName(meta.name ?? fallbackName);
  const dir = librarySkillPath(id);
  const now = new Date().toISOString();
  const skillMd = files.get("SKILL.md")!;
  const metadata: LibrarySkill = {
    id,
    description: meta.description ?? "",
    source,
    enabled: true,
    reviewedSha: sha256(skillMd),
    createdAt: now,
    updatedAt: now,
  };
  await changeSkill(id, async () => {
    await mkdir(librarySkillsPath(), { recursive: true });
    const staged = join(librarySkillsPath(), `.import-${randomUUID()}`);
    const backup = join(librarySkillsPath(), `.backup-${randomUUID()}`);
    let backedUp = false;
    try {
      for (const [path, text] of files) {
        const target = join(staged, ...safeFileParts(path));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, text, { encoding: "utf8", mode: 0o600 });
      }
      await writeFile(join(staged, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
      try { await rename(dir, backup); backedUp = true; } catch (error) { if (!missingFile(error)) throw error; }
      try { await rename(staged, dir); } catch (error) {
        if (backedUp) { await rename(backup, dir); backedUp = false; }
        throw error;
      }
      if (backedUp) { await rm(backup, { recursive: true, force: true }); backedUp = false; }
    } finally {
      await rm(staged, { recursive: true, force: true });
      // Leave a backup intact if an exceptional rollback failed.
    }
  });
  return { id, description: meta.description ?? "", source };
}

interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

/** Fetches skills from "owner/repo", "owner/repo/path", a GitHub URL or a SKILL.md link into the library. */
export async function importSkills({ source: input }: { source: string }): Promise<{ skills: ImportedSkill[] }> {
  const source = parseSkillSource(input);
  if (source.kind === "raw") {
    const text = await fetchText(source.url);
    const fallback = posix.basename(posix.dirname(new URL(source.url).pathname)) || "skill";
    return { skills: [await saveSkill(new Map([["SKILL.md", text]]), source.url, fallback)] };
  }

  const { owner, repo } = source;
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const ref = source.ref ?? (await fetchJson<{ default_branch: string }>(api)).default_branch;
  const tree = await fetchJson<{ tree: TreeEntry[]; truncated: boolean }>(`${api}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  if (tree.truncated) throw new Error("This repository is too large to import safely. Use a direct SKILL.md link.");
  const prefix = source.path ? `${source.path}/` : "";
  const skillDirs = tree.tree
    .filter((entry) => entry.type === "blob" && posix.basename(entry.path) === "SKILL.md" && (entry.path === `${prefix}SKILL.md` || entry.path.startsWith(prefix)))
    .map((entry) => posix.dirname(entry.path));
  if (skillDirs.length > MAX_SKILLS) throw new Error(`This source contains more than ${MAX_SKILLS} skills. Select a smaller subfolder.`);
  if (skillDirs.length === 0) throw new Error(`No SKILL.md found in ${owner}/${repo}${source.path ? `/${source.path}` : ""}.`);

  const downloaded: { files: Map<string, string>; origin: string; name: string }[] = [];
  for (const dir of skillDirs) {
    const base = dir === "." ? "" : `${dir}/`;
    const blobs = tree.tree
      .filter((entry) => entry.type === "blob" && entry.path.startsWith(base))
      // Nested skills are imported on their own.
      .filter((entry) => !skillDirs.some((other) => other !== dir && other.startsWith(base) && entry.path.startsWith(`${other}/`)));
    if (blobs.length > MAX_FILES_PER_SKILL) throw new Error(`The skill ${dir} contains more than ${MAX_FILES_PER_SKILL} files. Use a direct SKILL.md link.`);
    const files = new Map<string, string>();
    for (const blob of blobs) {
      if ((blob.size ?? 0) > MAX_FILE_BYTES) throw new Error(`A skill file exceeds 512 KB: ${blob.path}`);
      const path = blob.path.slice(base.length);
      safeFileParts(path);
      files.set(path, await fetchText(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${blob.path.split("/").map(encodeURIComponent).join("/")}`));
    }
    const origin = `github.com/${owner}/${repo}${dir === "." ? "" : `/${dir}`}`;
    downloaded.push({ files, origin, name: dir === "." ? repo : posix.basename(dir) });
  }
  const skills: ImportedSkill[] = [];
  for (const { files, origin, name } of downloaded) skills.push(await saveSkill(files, origin, name));
  return { skills };
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= MAX_LISTED_FILES) return;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name !== "metadata.json") files.push(relative(root, path).split(sep).join("/"));
    }
  };
  await walk(root);
  return files.sort((a, b) => (a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b)));
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** SHA-256 of a library skill's SKILL.md, or null when it's missing. */
export async function skillSha(id: string): Promise<string | null> {
  const text = await readRegularText(join(librarySkillPath(id), "SKILL.md"), MAX_FILE_BYTES);
  return text === null ? null : sha256(text);
}

export async function readSkill({ id }: { id: string }) {
  const dir = librarySkillPath(id);
  const text = await readRegularText(join(dir, "SKILL.md"), MAX_FILE_BYTES);
  return { text: text ?? "", sha: text === null ? null : sha256(text), missing: text === null, path: join(dir, "SKILL.md"), files: await listFiles(dir) };
}

/** Writes SKILL.md, creating the skill folder if needed. Returns its frontmatter description and hash. */
export async function writeSkill({ id, text }: { id: string; text: string }) {
  const dir = librarySkillPath(id);
  if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) throw new Error("A skill file must be at most 512 KB.");
  const sha = sha256(text);
  const frontmatter = parseSkillFrontmatter(text);
  await changeSkill(id, async () => {
    await ensureRealDirectory(dir);
    await atomicWrite(join(dir, "SKILL.md"), text);
    const existing = await readSkillMetadata(id);
    const now = new Date().toISOString();
    const updated: LibrarySkill = {
      id,
      description: frontmatter.description ?? existing?.description ?? "",
      source: existing?.source ?? "",
      enabled: existing?.enabled ?? true,
      reviewedSha: sha,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await writeSkillMetadata(updated);
  });
  return { description: frontmatter.description ?? "", sha };
}

export async function deleteSkill({ id }: { id: string }) {
  await changeSkill(id, () => rm(librarySkillPath(id), { recursive: true, force: true }));
  return { ok: true };
}

/**
 * Before the library, skills lived in each bot's skills folder. Moves them into
 * the library (the first copy of a name wins; later ones stay where they are).
 */
export async function migrateBotSkills(): Promise<void> {
  const bots = await readdir(botsHomePath(), { withFileTypes: true }).catch(() => []);
  for (const bot of bots) {
    if (!bot.isDirectory()) continue;
    const skillsDir = join(botsHomePath(), bot.name, "skills");
    const skills = await readdir(skillsDir, { withFileTypes: true }).catch(() => []);
    for (const skill of skills) {
      if (!skill.isDirectory()) continue;
      const target = librarySkillPath(skill.name);
      if (await lstat(target).catch(() => null)) continue;
      await mkdir(librarySkillsPath(), { recursive: true });
      await rename(join(skillsDir, skill.name), target);
    }
  }
}

/**
 * Points <bot>/skills/<id> at each library skill the bot uses and removes links
 * to skills it no longer uses. Returns the SKILL.md path to give the agent for
 * each skill: the link, or the library copy when a link can't be made.
 */
export async function linkBotSkills(botId: string, ids: readonly string[]): Promise<Map<string, string>> {
  const dir = join(botDataPath(botId), "skills");
  const paths = new Map<string, string>();
  await mkdir(dir, { recursive: true }).catch(() => {});
  const existing = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of existing) {
    if (entry.isSymbolicLink() && !ids.includes(entry.name)) await unlink(join(dir, entry.name)).catch(() => {});
  }
  for (const id of ids) {
    const target = librarySkillPath(id);
    const link = join(dir, id);
    const info = await lstat(link).catch(() => null);
    let linked = false;
    if (info?.isSymbolicLink()) {
      linked = (await readlink(link).catch(() => "")) === target;
      if (!linked) await unlink(link).catch(() => {});
    }
    if (!info || (info.isSymbolicLink() && !linked)) {
      // "junction" lets Windows link folders without admin rights; other systems ignore it.
      linked = await symlink(target, link, "junction").then(
        () => true,
        () => false,
      );
    }
    paths.set(id, join(linked ? link : target, "SKILL.md"));
  }
  return paths;
}

export interface SyncSeatSkillsOptions {
  allowedRootOverride?: string;
  resolveTargetPath?: (skillId: string) => string;
}

/**
 * Creates/updates symlinks in BOTH `<seatDir>/.agents/skills/<id>` and `<seatDir>/.claude/skills/<id>`,
 * pruning stale symlinks ONLY within those two directories, and returning
 * `Map<skillId, "<seatDir>/.agents/skills/<id>/SKILL.md">`.
 */
export async function syncSeatSkills(
  seatDir: string,
  skillIds: readonly string[],
  options?: string | SyncSeatSkillsOptions,
): Promise<Map<string, string>> {
  const allowedRootOverride = typeof options === "string" ? options : options?.allowedRootOverride;
  const resolveTarget = typeof options === "object" && options?.resolveTargetPath ? options.resolveTargetPath : undefined;

  assertInsideManagedDataDir(seatDir, allowedRootOverride);

  const agentsSkillsDir = join(seatDir, ".agents", "skills");
  const claudeSkillsDir = join(seatDir, ".claude", "skills");

  assertInsideManagedDataDir(agentsSkillsDir, allowedRootOverride);
  assertInsideManagedDataDir(claudeSkillsDir, allowedRootOverride);

  await mkdir(agentsSkillsDir, { recursive: true });
  await mkdir(claudeSkillsDir, { recursive: true });

  // Prune stale symlinks ONLY within those two directories
  const existingAgents = await readdir(agentsSkillsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of existingAgents) {
    if (entry.isSymbolicLink() && !skillIds.includes(entry.name)) {
      await unlink(join(agentsSkillsDir, entry.name)).catch(() => {});
    }
  }

  const existingClaude = await readdir(claudeSkillsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of existingClaude) {
    if (entry.isSymbolicLink() && !skillIds.includes(entry.name)) {
      await unlink(join(claudeSkillsDir, entry.name)).catch(() => {});
    }
  }

  const paths = new Map<string, string>();

  for (const id of skillIds) {
    const target = resolveTarget ? resolveTarget(id) : librarySkillPath(id);

    // Symlink in <seatDir>/.agents/skills/<id>
    const agentsLink = join(agentsSkillsDir, id);
    const agentsInfo = await lstat(agentsLink).catch(() => null);
    let agentsLinked = false;
    if (agentsInfo?.isSymbolicLink()) {
      agentsLinked = (await readlink(agentsLink).catch(() => "")) === target;
      if (!agentsLinked) await unlink(agentsLink).catch(() => {});
    }
    if (!agentsInfo || (agentsInfo.isSymbolicLink() && !agentsLinked)) {
      agentsLinked = await symlink(target, agentsLink, "junction").then(
        () => true,
        () => false,
      );
    }

    // Symlink in <seatDir>/.claude/skills/<id>
    const claudeLink = join(claudeSkillsDir, id);
    const claudeInfo = await lstat(claudeLink).catch(() => null);
    let claudeLinked = false;
    if (claudeInfo?.isSymbolicLink()) {
      claudeLinked = (await readlink(claudeLink).catch(() => "")) === target;
      if (!claudeLinked) await unlink(claudeLink).catch(() => {});
    }
    if (!claudeInfo || (claudeInfo.isSymbolicLink() && !claudeLinked)) {
      claudeLinked = await symlink(target, claudeLink, "junction").then(
        () => true,
        () => false,
      );
    }

    // Return Map<skillId, "<seatDir>/.agents/skills/<id>/SKILL.md">
    paths.set(id, join(agentsLinked ? agentsLink : target, "SKILL.md"));
  }

  return paths;
}
