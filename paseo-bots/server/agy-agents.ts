import { access, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { AGY_BASE_TOOLS, isAgyProvider, resolveToolsForProvider, type Bot, type BotProviderConfig } from "../shared/bot";
import { botDataPath } from "./bot-home";
import { readBotSoul } from "./souls";

const SAFE_AGENT_NAME = /^[A-Za-z0-9._-]+$/;
const MANAGED_BY_VALUE = "paseo-bots";

export interface AgyAgentOptions {
  agentsDir?: string;
  botDataDir?: string;
  body?: string;
  baseTools?: string[];
  soulsDir?: string;
}

export interface AgyAgentSyncAllOptions {
  agentsDir?: string;
  botDataDir?: string;
  resolveBody?: (bot: Bot) => Promise<string | undefined> | string | undefined;
  soulsDir?: string;
}

export interface AgyAgentSyncResult {
  synced: boolean;
  agyAgent: string | null;
  changed: boolean;
}

export interface OrphanedAgyAgent {
  id: string;
  name: string;
  fileName: string;
  description: string;
}

export type OrphanedAgyAction = "delete" | "disable";

export function defaultAgyAgentsDir(): string {
  return join(homedir(), ".gemini", "config", "agents");
}

function assertValidAgentName(name: string): string {
  const trimmed = name.trim();
  if (!SAFE_AGENT_NAME.test(trimmed)) {
    throw new Error(`Invalid Antigravity agent name: "${name}"`);
  }
  return trimmed;
}

function splitFrontmatter(text: string): { frontmatter: string | null; body: string } {
  const match = /^(---\r?\n[\s\S]*?\r?\n---)(?:\r?\n|$)/.exec(text);
  if (!match) return { frontmatter: null, body: text };
  return {
    frontmatter: match[1]!,
    body: text.slice(match[0].length),
  };
}

function yamlQuoted(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}

function formatYamlScalar(text: string): string {
  if (!text || /[\s:#"'\\{}\[\],&*?|>!%@`]/.test(text)) {
    return yamlQuoted(text);
  }
  return text;
}

export const DEFAULT_AGY_AGENT_TOOLS = AGY_BASE_TOOLS;

function formatToolsYaml(tools: readonly string[]): string[] {
  if (tools.length === 0) {
    return ["tools: []"];
  }
  return ["tools:", ...tools.map((tool) => `  - ${tool}`)];
}

function buildMinimalFrontmatter(
  agyAgent: string,
  bot: Pick<Bot, "name" | "title" | "description">,
  tools: readonly string[] = DEFAULT_AGY_AGENT_TOOLS,
): string {
  const description =
    bot.description.trim() || bot.title.trim() || bot.name.trim() || agyAgent;
  return [
    "---",
    `name: ${formatYamlScalar(agyAgent)}`,
    `description: ${yamlQuoted(description)}`,
    "subagent: true",
    "mainAgent: true",
    "inheritMcp: true",
    "commandExecutionPolicy: auto",
    `managedBy: ${MANAGED_BY_VALUE}`,
    ...formatToolsYaml(tools),
    "---",
  ].join("\n");
}

function insertBeforeTools(lines: string[], entry: string): void {
  const toolsIdx = lines.findIndex((line) => /^tools:\s*/.test(line));
  if (toolsIdx >= 0) {
    lines.splice(toolsIdx, 0, entry);
  } else {
    lines.push(entry);
  }
}

function updateFrontmatter(
  existingFrontmatter: string,
  agyAgent: string,
  bot: Pick<Bot, "name" | "title" | "description">,
  explicitTools?: readonly string[],
): string {
  const nameLine = `name: ${formatYamlScalar(agyAgent)}`;
  const descriptionLine = `description: ${yamlQuoted(bot.description.trim() || bot.title.trim() || bot.name.trim() || agyAgent)}`;
  const managedByLine = `managedBy: ${MANAGED_BY_VALUE}`;
  const inner = existingFrontmatter.split(/\r?\n/).slice(1, -1);

  let hasName = false;
  let hasDescription = false;
  let hasManagedBy = false;
  const updated: string[] = [];
  let inTools = false;
  let toolsHandled = false;

  for (let i = 0; i < inner.length; i++) {
    const line = inner[i]!;
    if (/^name:\s*/.test(line)) {
      hasName = true;
      updated.push(nameLine);
      continue;
    }
    if (/^description:\s*/.test(line)) {
      hasDescription = true;
      updated.push(descriptionLine);
      continue;
    }
    if (/^managedBy:\s*/.test(line)) {
      hasManagedBy = true;
      updated.push(managedByLine);
      continue;
    }
    if (/^tools:\s*/.test(line)) {
      if (explicitTools !== undefined) {
        inTools = true;
        if (!toolsHandled) {
          updated.push(...formatToolsYaml(explicitTools));
          toolsHandled = true;
        }
        continue;
      }
      updated.push(line);
      continue;
    }
    if (inTools) {
      if (/^\s+-\s*/.test(line) || (/^\s*$/.test(line) && i + 1 < inner.length && /^\s+-/.test(inner[i + 1]!))) {
        continue;
      }
      inTools = false;
    }
    updated.push(line);
  }

  if (!hasDescription) {
    const nameIdx = updated.findIndex((line) => /^name:\s*/.test(line));
    if (nameIdx >= 0) updated.splice(nameIdx + 1, 0, descriptionLine);
    else updated.unshift(descriptionLine);
  }
  if (!hasName) updated.unshift(nameLine);
  if (!hasManagedBy) insertBeforeTools(updated, managedByLine);
  if (explicitTools !== undefined && !toolsHandled) updated.push(...formatToolsYaml(explicitTools));
  else if (explicitTools === undefined && !updated.some((line) => /^tools:\s*/.test(line))) {
    updated.push(...formatToolsYaml(DEFAULT_AGY_AGENT_TOOLS));
  }

  return ["---", ...updated, "---"].join("\n");
}

function renderAgyAgentBody(
  bot: Pick<Bot, "id" | "name" | "title" | "description" | "soul">,
  agyAgent: string,
  memoryFile: string,
): string {
  const memoryDir = join(dirname(memoryFile), "memory");
  const lines: string[] = [
    "# System Prompt",
    "",
    `You are ${bot.name.trim() || agyAgent}.`,
  ];
  if (bot.title.trim()) lines.push(`Role: ${bot.title.trim()}`);
  if (bot.description.trim()) lines.push(`About: ${bot.description.trim()}`);
  if (bot.soul.trim()) {
    lines.push("", "## Standing Instructions", "", bot.soul.trim());
  }
  lines.push(
    "",
    "## Memory & Skills",
    "",
    `- Long-term memory file: \`${memoryFile}\``,
    `- Daily memory & topic logs: \`${memoryDir}/\``,
  );
  return `${lines.join("\n")}\n`;
}

function normalizeAgyBody(body: string): string {
  const trimmedEnd = body.replace(/\n+$/, "");
  return trimmedEnd ? `${trimmedEnd}\n` : "";
}

function renderAgyAgentFile(
  bot: Pick<Bot, "id" | "name" | "title" | "description" | "soul">,
  agyAgent: string,
  botDataDir: string,
  existingContent: string | null,
  customBody?: string,
  baseTools?: readonly string[],
): string {
  const existingFrontmatter = existingContent ? splitFrontmatter(existingContent).frontmatter : null;
  const frontmatter = existingFrontmatter
    ? updateFrontmatter(existingFrontmatter, agyAgent, bot, baseTools)
    : buildMinimalFrontmatter(agyAgent, bot, baseTools ?? DEFAULT_AGY_AGENT_TOOLS);
  const body =
    customBody !== undefined
      ? normalizeAgyBody(customBody)
      : renderAgyAgentBody(bot, agyAgent, join(botDataDir, "MEMORY.md"));
  return `${frontmatter}\n\n${body}`;
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Idempotently syncs Bot identity and prompt to `<bot.id>.md` (preserving frontmatter). */
export async function syncBotToAgyAgent(
  bot: Pick<Bot, "id" | "name" | "title" | "description" | "soul"> & {
    provider?: string;
    baseTools?: string[];
    providerConfigs?: BotProviderConfig[];
  },
  options: AgyAgentOptions = {},
): Promise<AgyAgentSyncResult> {
  if (!isAgyProvider(bot.provider ?? "agy")) {
    return { synced: false, agyAgent: null, changed: false };
  }
  const agyAgent = assertValidAgentName(bot.id);
  const agentsDir = options.agentsDir ?? defaultAgyAgentsDir();
  const botDataDir = options.botDataDir ?? botDataPath(bot.id);
  const soul = await readBotSoul(bot.id, bot.soul, options.soulsDir);
  const effectiveBot = { ...bot, soul };
  await mkdir(agentsDir, { recursive: true });

  const rawBaseTools = options.baseTools !== undefined
    ? options.baseTools
    : bot.baseTools !== undefined
      ? bot.baseTools
      : bot.providerConfigs?.find((cfg) => isAgyProvider(cfg.provider))?.baseTools;
  const resolvedBaseTools = rawBaseTools !== undefined ? resolveToolsForProvider(rawBaseTools, "agy") : undefined;

  const agentFile = join(agentsDir, `${agyAgent}.md`);
  const existing = await readOptionalFile(agentFile);
  const rendered = renderAgyAgentFile(effectiveBot, agyAgent, botDataDir, existing, options.body, resolvedBaseTools);
  const changed = existing === null || existing !== rendered;
  if (changed) {
    await writeFile(agentFile, rendered, "utf8");
  }

  return {
    synced: true,
    agyAgent,
    changed,
  };
}

function unquoteYamlScalar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function parseFrontmatterScalars(frontmatter: string): Record<string, string> {
  const result: Record<string, string> = {};
  const inner = frontmatter.split(/\r?\n/).slice(1, -1);
  for (const line of inner) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    result[match[1]!] = unquoteYamlScalar(match[2]!);
  }
  return result;
}

function activeAgyBotIds(bots: readonly Pick<Bot, "id" | "provider">[]): Set<string> {
  return new Set(bots.filter((bot) => isAgyProvider(bot.provider ?? "agy")).map((bot) => bot.id));
}

function assertSafeMdFileName(fileName: string): string {
  if (
    !fileName ||
    fileName !== basename(fileName) ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("..") ||
    !fileName.endsWith(".md")
  ) {
    throw new Error(`Invalid agent markdown filename: "${fileName}"`);
  }
  return fileName;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Syncs every agy-backed bot in `bots` to `agyAgentsDir`. */
export async function syncAllBotsToAgy(
  bots: readonly Bot[],
  options: AgyAgentSyncAllOptions = {},
): Promise<AgyAgentSyncResult[]> {
  const results: AgyAgentSyncResult[] = [];
  for (const bot of bots) {
    if (!isAgyProvider(bot.provider ?? "agy")) continue;
    const body = options.resolveBody ? await options.resolveBody(bot) : undefined;
    const syncOptions: AgyAgentOptions = {
      ...(options.agentsDir !== undefined ? { agentsDir: options.agentsDir } : {}),
      ...(options.botDataDir !== undefined ? { botDataDir: options.botDataDir } : {}),
      ...(body !== undefined ? { body } : {}),
    };
    results.push(await syncBotToAgyAgent(bot, syncOptions));
  }
  return results;
}

/** Lists `managedBy: paseo-bots` markdown files in `agyAgentsDir` not present in active agy bots. */
export async function listOrphanedAgyAgents(
  bots: readonly Pick<Bot, "id" | "provider">[],
  agyAgentsDir: string = defaultAgyAgentsDir(),
): Promise<OrphanedAgyAgent[]> {
  let entries;
  try {
    entries = await readdir(agyAgentsDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const activeIds = activeAgyBotIds(bots);
  const orphans: OrphanedAgyAgent[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const content = await readOptionalFile(join(agyAgentsDir, entry.name));
    if (!content) continue;
    const { frontmatter } = splitFrontmatter(content);
    if (!frontmatter) continue;
    const fields = parseFrontmatterScalars(frontmatter);
    if (fields.managedBy !== MANAGED_BY_VALUE) continue;
    const stem = entry.name.slice(0, -3);
    const id = fields.name?.trim() || stem;
    if (activeIds.has(id)) continue;
    orphans.push({ id, name: id, fileName: entry.name, description: fields.description ?? "" });
  }
  return orphans.sort((a, b) => a.fileName.localeCompare(b.fileName));
}

/** Deletes or disables (`<fileName>.disabled`) a verified orphaned `paseo-bots`-managed agent file. */
export async function resolveOrphanedAgyAgent(
  fileName: string,
  action: OrphanedAgyAction,
  bots: readonly Pick<Bot, "id" | "provider">[],
  agyAgentsDir: string = defaultAgyAgentsDir(),
): Promise<{ ok: true; fileName: string; action: OrphanedAgyAction; targetFileName?: string }> {
  const safeName = assertSafeMdFileName(fileName);
  const orphans = await listOrphanedAgyAgents(bots, agyAgentsDir);
  if (!orphans.some((orphan) => orphan.fileName === safeName)) {
    throw new Error(`Orphaned paseo-bots agent file not found: "${safeName}"`);
  }
  const sourcePath = join(agyAgentsDir, safeName);
  if (action === "delete") {
    await unlink(sourcePath);
    return { ok: true, fileName: safeName, action };
  }
  let targetFileName = `${safeName}.disabled`;
  if (await fileExists(join(agyAgentsDir, targetFileName))) {
    targetFileName = `${safeName}.${Date.now()}.disabled`;
  }
  await rename(sourcePath, join(agyAgentsDir, targetFileName));
  return { ok: true, fileName: safeName, action, targetFileName };
}
