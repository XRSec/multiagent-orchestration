import { lstat, mkdir, readFile, readdir, readlink, symlink, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  CLAUDE_BASE_TOOLS,
  isClaudeProvider,
  resolveClaudeSystemPromptFlag,
  resolveModeIdForProvider,
  resolveToolsForProvider,
  type Bot,
  type BotProviderConfig,
  type McpServerConfig,
} from "../shared/bot";

export { resolveClaudeSystemPromptFlag };
import { botDataPath } from "./bot-home";
import { librarySkillPath } from "./library";
import { readBotSoul } from "./souls";

const SAFE_AGENT_NAME = /^[A-Za-z0-9._-]+$/;
const MANAGED_BY_VALUE = "paseo-bots";

export const DEFAULT_CLAUDE_AGENT_TOOLS = CLAUDE_BASE_TOOLS;

export interface ClaudeAgentOptions {
  agentsDir?: string;
  projectDir?: string;
  botDataDir?: string;
  body?: string;
  baseTools?: string[];
  modeId?: string | null;
  soulsDir?: string;
  skills?: readonly string[];
  mcpServers?: Record<string, McpServerConfig>;
  syncMcpConfig?: boolean;
  syncSkills?: boolean;
  systemPromptMode?: "append" | "replace";
}

export interface ClaudeAgentSyncAllOptions {
  agentsDir?: string;
  projectDir?: string;
  botDataDir?: string;
  resolveBody?: (bot: Bot) => Promise<string | undefined> | string | undefined;
  resolveSkills?: (bot: Bot) => Promise<string[] | undefined> | string[] | undefined;
  resolveMcpServers?: (bot: Bot) => Promise<Record<string, McpServerConfig> | undefined> | Record<string, McpServerConfig> | undefined;
  soulsDir?: string;
  syncMcpConfig?: boolean;
  syncSkills?: boolean;
}

export interface ClaudeAgentSyncResult {
  synced: boolean;
  claudeAgent: string | null;
  path: string | null;
  changed: boolean;
  mcpConfigPath?: string | null;
  skillsDir?: string | null;
}

/** Throws if a path resolves inside the user's global config directories, enforcing Zero Global Pollution. */
export function assertNotGlobalUserConfig(targetPath: string): void {
  const home = homedir();
  const normalized = targetPath.replace(/\\/g, "/");
  const normalizedHome = home.replace(/\\/g, "/");
  if (
    normalized === `${normalizedHome}/.claude.json` ||
    normalized.startsWith(`${normalizedHome}/.claude/settings.json`) ||
    normalized.startsWith(`${normalizedHome}/.gemini/config/skills`) ||
    normalized.startsWith(`${normalizedHome}/.gemini/settings.json`)
  ) {
    throw new Error(`Attempted to write bot-specific configuration to global user config: ${targetPath}`);
  }
}

/** Resolves the project-scoped `.claude/agents` directory without touching host `~/.claude`. */
export function defaultClaudeAgentsDir(projectDir?: string): string {
  const dir = join(projectDir ?? process.cwd(), ".claude", "agents");
  assertNotGlobalUserConfig(dir);
  return dir;
}

/** Resolves the project-scoped `.mcp.json` path for Claude Code CLI sessions. */
export function defaultClaudeMcpPath(projectDir?: string): string {
  const file = join(projectDir ?? process.cwd(), ".mcp.json");
  assertNotGlobalUserConfig(file);
  return file;
}

/** Resolves the project-scoped `.claude/skills` directory for Claude Code. */
export function defaultClaudeSkillsDir(projectDir?: string): string {
  const dir = join(projectDir ?? process.cwd(), ".claude", "skills");
  assertNotGlobalUserConfig(dir);
  return dir;
}

/** Resolves the session-scoped `mcp.json` file inside the bot's data directory (for `--mcp-config`). */
export function sessionClaudeMcpPath(botDataDir: string): string {
  const file = join(botDataDir, "mcp.json");
  assertNotGlobalUserConfig(file);
  return file;
}

function assertValidAgentName(name: string): string {
  const trimmed = name.trim();
  if (!SAFE_AGENT_NAME.test(trimmed)) {
    throw new Error(`Invalid Claude agent name: "${name}"`);
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

function formatToolsYaml(tools: readonly string[]): string[] {
  if (tools.length === 0) return ["tools: []"];
  return ["tools:", ...tools.map((tool) => `  - ${tool}`)];
}

function formatSkillsYaml(skills: readonly string[]): string[] {
  if (skills.length === 0) return ["skills: []"];
  return ["skills:", ...skills.map((skill) => `  - ${formatYamlScalar(skill)}`)];
}

function formatMcpServersYaml(servers: Record<string, McpServerConfig>): string[] {
  const keys = Object.keys(servers);
  if (keys.length === 0) return ["mcpServers: {}"];
  const lines: string[] = ["mcpServers:"];
  for (const [name, cfg] of Object.entries(servers)) {
    lines.push(`  ${formatYamlScalar(name)}:`);
    if (cfg.type === "stdio") {
      lines.push(`    command: ${formatYamlScalar(cfg.command)}`);
      if (cfg.args && cfg.args.length > 0) {
        lines.push("    args:");
        for (const arg of cfg.args) {
          lines.push(`      - ${formatYamlScalar(arg)}`);
        }
      } else {
        lines.push("    args: []");
      }
      if (cfg.env && Object.keys(cfg.env).length > 0) {
        lines.push("    env:");
        for (const [k, v] of Object.entries(cfg.env)) {
          lines.push(`      ${formatYamlScalar(k)}: ${formatYamlScalar(v)}`);
        }
      }
    } else {
      lines.push(`    type: ${cfg.type}`);
      lines.push(`    url: ${formatYamlScalar(cfg.url)}`);
      if (cfg.headers && Object.keys(cfg.headers).length > 0) {
        lines.push("    headers:");
        for (const [k, v] of Object.entries(cfg.headers)) {
          lines.push(`      ${formatYamlScalar(k)}: ${formatYamlScalar(v)}`);
        }
      }
      if (cfg.oauth) {
        lines.push("    oauth: true");
      }
    }
  }
  return lines;
}

function buildMinimalFrontmatter(
  claudeAgent: string,
  bot: Pick<Bot, "name" | "title" | "description">,
  tools: readonly string[] = DEFAULT_CLAUDE_AGENT_TOOLS,
  permissionMode?: string,
  skills?: readonly string[],
  mcpServers?: Record<string, McpServerConfig>,
): string {
  const description = bot.description.trim() || bot.title.trim() || bot.name.trim() || claudeAgent;
  const lines: string[] = [
    "---",
    `name: ${formatYamlScalar(claudeAgent)}`,
    `description: ${yamlQuoted(description)}`,
    ...(permissionMode ? [`permissionMode: ${formatYamlScalar(permissionMode)}`] : []),
    `managedBy: ${MANAGED_BY_VALUE}`,
    ...formatToolsYaml(tools),
  ];
  if (skills !== undefined && skills.length > 0) {
    lines.push(...formatSkillsYaml(skills));
  }
  if (mcpServers !== undefined && Object.keys(mcpServers).length > 0) {
    lines.push(...formatMcpServersYaml(mcpServers));
  }
  lines.push("---");
  return lines.join("\n");
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
  claudeAgent: string,
  bot: Pick<Bot, "name" | "title" | "description">,
  explicitTools?: readonly string[],
  permissionMode?: string,
  explicitSkills?: readonly string[],
  explicitMcpServers?: Record<string, McpServerConfig>,
): string {
  const nameLine = `name: ${formatYamlScalar(claudeAgent)}`;
  const descriptionLine = `description: ${yamlQuoted(bot.description.trim() || bot.title.trim() || bot.name.trim() || claudeAgent)}`;
  const managedByLine = `managedBy: ${MANAGED_BY_VALUE}`;
  const permissionLine = permissionMode ? `permissionMode: ${formatYamlScalar(permissionMode)}` : null;
  const inner = existingFrontmatter.split(/\r?\n/).slice(1, -1);

  let hasName = false;
  let hasDescription = false;
  let hasManagedBy = false;
  let hasPermissionMode = false;
  const updated: string[] = [];
  let inTools = false;
  let toolsHandled = false;
  let inSkills = false;
  let skillsHandled = false;
  let inMcpServers = false;
  let mcpServersHandled = false;

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
    if (/^permissionMode:\s*/.test(line)) {
      hasPermissionMode = true;
      updated.push(permissionLine ?? line);
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
    if (/^skills:\s*/.test(line)) {
      if (explicitSkills !== undefined) {
        inSkills = true;
        if (!skillsHandled) {
          updated.push(...formatSkillsYaml(explicitSkills));
          skillsHandled = true;
        }
        continue;
      }
      updated.push(line);
      continue;
    }
    if (inSkills) {
      if (/^\s+-\s*/.test(line) || (/^\s*$/.test(line) && i + 1 < inner.length && /^\s+-/.test(inner[i + 1]!))) {
        continue;
      }
      inSkills = false;
    }
    if (/^mcpServers:\s*/.test(line)) {
      if (explicitMcpServers !== undefined) {
        inMcpServers = true;
        if (!mcpServersHandled) {
          updated.push(...formatMcpServersYaml(explicitMcpServers));
          mcpServersHandled = true;
        }
        continue;
      }
      updated.push(line);
      continue;
    }
    if (inMcpServers) {
      if (/^\s+/.test(line) || (/^\s*$/.test(line) && i + 1 < inner.length && /^\s+/.test(inner[i + 1]!))) {
        continue;
      }
      inMcpServers = false;
    }
    updated.push(line);
  }

  if (!hasDescription) {
    const nameIdx = updated.findIndex((line) => /^name:\s*/.test(line));
    if (nameIdx >= 0) updated.splice(nameIdx + 1, 0, descriptionLine);
    else updated.unshift(descriptionLine);
  }
  if (!hasName) updated.unshift(nameLine);
  if (permissionLine && !hasPermissionMode) insertBeforeTools(updated, permissionLine);
  if (!hasManagedBy) insertBeforeTools(updated, managedByLine);
  if (explicitTools !== undefined && !toolsHandled) updated.push(...formatToolsYaml(explicitTools));
  else if (explicitTools === undefined && !updated.some((line) => /^tools:\s*/.test(line))) {
    updated.push(...formatToolsYaml(DEFAULT_CLAUDE_AGENT_TOOLS));
  }
  if (explicitSkills !== undefined && !skillsHandled) {
    updated.push(...formatSkillsYaml(explicitSkills));
  }
  if (explicitMcpServers !== undefined && !mcpServersHandled) {
    updated.push(...formatMcpServersYaml(explicitMcpServers));
  }

  return ["---", ...updated, "---"].join("\n");
}

function renderClaudeAgentBody(
  bot: Pick<Bot, "id" | "name" | "title" | "description" | "soul"> & { systemPromptMode?: "append" | "replace" },
  claudeAgent: string,
  memoryFile: string,
  skills?: readonly string[],
): string {
  if (bot.systemPromptMode === "replace" && bot.soul.trim()) {
    return `${bot.soul.trim()}\n`;
  }
  const memoryDir = join(dirname(memoryFile), "memory");
  const lines: string[] = [
    `You are ${bot.name.trim() || claudeAgent}.`,
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
  if (skills && skills.length > 0) {
    lines.push(
      "",
      "## Preloaded Skills",
      "",
      ...skills.map((skill) => `- \`${skill}\``),
    );
  }
  return `${lines.join("\n")}\n`;
}

function normalizeBody(body: string): string {
  const trimmed = body.replace(/^\r?\n+/, "").replace(/\n+$/, "");
  return trimmed ? `${trimmed}\n` : "";
}

function renderClaudeAgentFile(
  bot: Pick<Bot, "id" | "name" | "title" | "description" | "soul"> & { systemPromptMode?: "append" | "replace" },
  claudeAgent: string,
  botDataDir: string,
  existingContent: string | null,
  customBody?: string,
  baseTools?: readonly string[],
  permissionMode?: string,
  skills?: readonly string[],
  mcpServers?: Record<string, McpServerConfig>,
): string {
  const parsed = existingContent ? splitFrontmatter(existingContent) : { frontmatter: null, body: "" };
  const frontmatter = parsed.frontmatter
    ? updateFrontmatter(parsed.frontmatter, claudeAgent, bot, baseTools, permissionMode, skills, mcpServers)
    : buildMinimalFrontmatter(claudeAgent, bot, baseTools ?? DEFAULT_CLAUDE_AGENT_TOOLS, permissionMode, skills, mcpServers);
  const existingBody = parsed.body.trim() ? normalizeBody(parsed.body) : null;
  const body =
    customBody !== undefined
      ? normalizeBody(customBody)
      : existingBody ?? renderClaudeAgentBody(bot, claudeAgent, join(botDataDir, "MEMORY.md"), skills);
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

/** Renders standard `.mcp.json` text from an `mcpServers` record. */
export function renderClaudeMcpConfig(mcpServers: Record<string, McpServerConfig>): string {
  const formatted: Record<string, Record<string, unknown>> = {};
  for (const [name, cfg] of Object.entries(mcpServers)) {
    if (cfg.type === "stdio") {
      formatted[name] = {
        command: cfg.command,
        args: cfg.args ?? [],
        env: cfg.env ?? {},
      };
    } else {
      formatted[name] = {
        type: cfg.type,
        url: cfg.url,
        headers: cfg.headers ?? {},
        ...(cfg.oauth ? { oauth: true } : {}),
      };
    }
  }
  return JSON.stringify({ mcpServers: formatted }, null, 2) + "\n";
}

/**
 * Idempotently writes or merges project-scoped `.mcp.json`.
 * Enforces Zero Global Pollution by rejecting global configuration paths.
 */
export async function syncClaudeMcpConfig(
  targetPath: string,
  mcpServers: Record<string, McpServerConfig>,
): Promise<{ path: string; changed: boolean }> {
  assertNotGlobalUserConfig(targetPath);
  await mkdir(dirname(targetPath), { recursive: true });
  const existingText = await readOptionalFile(targetPath);
  let mergedServers: Record<string, unknown> = {};

  if (existingText) {
    try {
      const parsed = JSON.parse(existingText) as { mcpServers?: Record<string, unknown> };
      if (parsed && typeof parsed === "object" && parsed.mcpServers && typeof parsed.mcpServers === "object") {
        mergedServers = { ...parsed.mcpServers };
      }
    } catch {
      // Corrupt or non-JSON file: replace fresh
    }
  }

  for (const [name, cfg] of Object.entries(mcpServers)) {
    if (cfg.type === "stdio") {
      mergedServers[name] = {
        command: cfg.command,
        args: cfg.args ?? [],
        env: cfg.env ?? {},
      };
    } else {
      mergedServers[name] = {
        type: cfg.type,
        url: cfg.url,
        headers: cfg.headers ?? {},
        ...(cfg.oauth ? { oauth: true } : {}),
      };
    }
  }

  const rendered = JSON.stringify({ mcpServers: mergedServers }, null, 2) + "\n";
  const changed = existingText === null || existingText !== rendered;
  if (changed) {
    await writeFile(targetPath, rendered, "utf8");
  }
  return { path: targetPath, changed };
}

/**
 * Links bot skills into project-scoped `.claude/skills/<skillId>` and cleans up stale links.
 * Enforces Zero Global Pollution by rejecting global configuration paths.
 */
export async function syncClaudeSkills(
  skillsDir: string,
  skillIds: readonly string[],
  resolveTargetPath?: (skillId: string) => string,
): Promise<{ linked: string[]; removed: string[] }> {
  assertNotGlobalUserConfig(skillsDir);
  await mkdir(skillsDir, { recursive: true }).catch(() => {});
  const existing = await readdir(skillsDir, { withFileTypes: true }).catch(() => []);
  const removed: string[] = [];
  for (const entry of existing) {
    if (entry.isSymbolicLink() && !skillIds.includes(entry.name)) {
      await unlink(join(skillsDir, entry.name)).catch(() => {});
      removed.push(entry.name);
    }
  }
  const linked: string[] = [];
  for (const id of skillIds) {
    const target = resolveTargetPath ? resolveTargetPath(id) : librarySkillPath(id);
    const link = join(skillsDir, id);
    const info = await lstat(link).catch(() => null);
    let isLinked = false;
    if (info?.isSymbolicLink()) {
      isLinked = (await readlink(link).catch(() => "")) === target;
      if (!isLinked) await unlink(link).catch(() => {});
    }
    if (!info || (info.isSymbolicLink() && !isLinked)) {
      isLinked = await symlink(target, link, "junction").then(
        () => true,
        () => false,
      );
    }
    if (isLinked) {
      linked.push(id);
    }
  }
  return { linked, removed };
}

/** Idempotently syncs Bot identity, tools, permissionMode, skills, and MCP config to `.claude/agents/<bot.id>.md`. */
export async function syncBotToClaudeAgent(
  bot: Pick<Bot, "id" | "name" | "title" | "description" | "soul"> & {
    provider?: string;
    modeId?: string | null;
    baseTools?: string[];
    providerConfigs?: BotProviderConfig[];
    systemPromptMode?: "append" | "replace";
  },
  options: ClaudeAgentOptions = {},
): Promise<ClaudeAgentSyncResult> {
  const provider = bot.provider ?? "claude";
  if (!isClaudeProvider(provider)) {
    return { synced: false, claudeAgent: null, path: null, changed: false };
  }
  const claudeAgent = assertValidAgentName(bot.id);
  const agentsDir = options.agentsDir ?? defaultClaudeAgentsDir(options.projectDir);
  const botDataDir = options.botDataDir ?? botDataPath(bot.id);
  const projectDir = options.projectDir ?? botDataDir;
  assertNotGlobalUserConfig(agentsDir);

  const soul = await readBotSoul(bot.id, bot.soul, options.soulsDir);
  const effectiveBot = {
    ...bot,
    soul,
    ...(options.systemPromptMode !== undefined ? { systemPromptMode: options.systemPromptMode } : {}),
  };
  await mkdir(agentsDir, { recursive: true });

  const claudeConfig = bot.providerConfigs?.find((cfg) => isClaudeProvider(cfg.provider));
  const rawBaseTools = options.baseTools !== undefined
    ? options.baseTools
    : bot.baseTools !== undefined
      ? bot.baseTools
      : claudeConfig?.baseTools;
  const resolvedBaseTools = rawBaseTools !== undefined ? resolveToolsForProvider(rawBaseTools, "claude") : undefined;

  const rawModeId = options.modeId !== undefined
    ? options.modeId
    : bot.modeId !== undefined
      ? bot.modeId
      : claudeConfig?.modeId;
  const permissionMode = resolveModeIdForProvider(rawModeId, "claude");

  let mcpConfigPath: string | null = null;
  if (options.mcpServers && Object.keys(options.mcpServers).length > 0 && options.syncMcpConfig !== false) {
    const projectMcpPath = defaultClaudeMcpPath(projectDir);
    await syncClaudeMcpConfig(projectMcpPath, options.mcpServers);
    const sessionMcpPath = sessionClaudeMcpPath(botDataDir);
    await syncClaudeMcpConfig(sessionMcpPath, options.mcpServers);
    mcpConfigPath = projectMcpPath;
  }

  let skillsDir: string | null = null;
  if (options.skills && options.skills.length > 0 && options.syncSkills !== false) {
    const targetSkillsDir = defaultClaudeSkillsDir(projectDir);
    await syncClaudeSkills(targetSkillsDir, options.skills);
    skillsDir = targetSkillsDir;
  }

  const agentFile = join(agentsDir, `${claudeAgent}.md`);
  assertNotGlobalUserConfig(agentFile);
  const existing = await readOptionalFile(agentFile);
  const rendered = renderClaudeAgentFile(
    effectiveBot,
    claudeAgent,
    botDataDir,
    existing,
    options.body,
    resolvedBaseTools,
    permissionMode,
    options.skills,
    options.mcpServers,
  );
  const changed = existing === null || existing !== rendered;
  if (changed) {
    await writeFile(agentFile, rendered, "utf8");
  }

  return {
    synced: true,
    claudeAgent,
    path: agentFile,
    changed,
    ...(mcpConfigPath ? { mcpConfigPath } : {}),
    ...(skillsDir ? { skillsDir } : {}),
  };
}

/** Syncs every Claude-backed bot in `bots` to `agentsDir`. */
export async function syncAllBotsToClaude(
  bots: readonly Bot[],
  options: ClaudeAgentSyncAllOptions = {},
): Promise<ClaudeAgentSyncResult[]> {
  const results: ClaudeAgentSyncResult[] = [];
  for (const bot of bots) {
    if (!isClaudeProvider(bot.provider)) continue;
    const body = options.resolveBody ? await options.resolveBody(bot) : undefined;
    const skills = options.resolveSkills ? await options.resolveSkills(bot) : undefined;
    const mcpServers = options.resolveMcpServers ? await options.resolveMcpServers(bot) : undefined;
    const syncOptions: ClaudeAgentOptions = {
      ...(options.agentsDir !== undefined ? { agentsDir: options.agentsDir } : {}),
      ...(options.projectDir !== undefined ? { projectDir: options.projectDir } : {}),
      ...(options.botDataDir !== undefined ? { botDataDir: options.botDataDir } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(skills !== undefined ? { skills } : {}),
      ...(mcpServers !== undefined ? { mcpServers } : {}),
      ...(options.syncMcpConfig !== undefined ? { syncMcpConfig: options.syncMcpConfig } : {}),
      ...(options.syncSkills !== undefined ? { syncSkills: options.syncSkills } : {}),
      ...(options.soulsDir !== undefined ? { soulsDir: options.soulsDir } : {}),
    };
    results.push(await syncBotToClaudeAgent(bot, syncOptions));
  }
  return results;
}
