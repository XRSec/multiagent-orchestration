import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  CLAUDE_BASE_TOOLS,
  isClaudeProvider,
  resolveModeIdForProvider,
  resolveToolsForProvider,
  type Bot,
  type BotProviderConfig,
} from "../shared/bot";
import { botDataPath } from "./bot-home";
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
}

export interface ClaudeAgentSyncAllOptions {
  agentsDir?: string;
  projectDir?: string;
  botDataDir?: string;
  resolveBody?: (bot: Bot) => Promise<string | undefined> | string | undefined;
  soulsDir?: string;
}

export interface ClaudeAgentSyncResult {
  synced: boolean;
  claudeAgent: string | null;
  path: string | null;
  changed: boolean;
}

/** Resolves the project-scoped `.claude/agents` directory without touching host `~/.claude`. */
export function defaultClaudeAgentsDir(projectDir?: string): string {
  return join(projectDir ?? process.cwd(), ".claude", "agents");
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

function buildMinimalFrontmatter(
  claudeAgent: string,
  bot: Pick<Bot, "name" | "title" | "description">,
  tools: readonly string[] = DEFAULT_CLAUDE_AGENT_TOOLS,
  permissionMode?: string,
): string {
  const description = bot.description.trim() || bot.title.trim() || bot.name.trim() || claudeAgent;
  return [
    "---",
    `name: ${formatYamlScalar(claudeAgent)}`,
    `description: ${yamlQuoted(description)}`,
    ...(permissionMode ? [`permissionMode: ${formatYamlScalar(permissionMode)}`] : []),
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
  claudeAgent: string,
  bot: Pick<Bot, "name" | "title" | "description">,
  explicitTools?: readonly string[],
  permissionMode?: string,
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

  return ["---", ...updated, "---"].join("\n");
}

function renderClaudeAgentBody(
  bot: Pick<Bot, "id" | "name" | "title" | "description" | "soul">,
  claudeAgent: string,
  memoryFile: string,
): string {
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
  return `${lines.join("\n")}\n`;
}

function normalizeBody(body: string): string {
  const trimmed = body.replace(/^\r?\n+/, "").replace(/\n+$/, "");
  return trimmed ? `${trimmed}\n` : "";
}

function renderClaudeAgentFile(
  bot: Pick<Bot, "id" | "name" | "title" | "description" | "soul">,
  claudeAgent: string,
  botDataDir: string,
  existingContent: string | null,
  customBody?: string,
  baseTools?: readonly string[],
  permissionMode?: string,
): string {
  const parsed = existingContent ? splitFrontmatter(existingContent) : { frontmatter: null, body: "" };
  const frontmatter = parsed.frontmatter
    ? updateFrontmatter(parsed.frontmatter, claudeAgent, bot, baseTools, permissionMode)
    : buildMinimalFrontmatter(claudeAgent, bot, baseTools ?? DEFAULT_CLAUDE_AGENT_TOOLS, permissionMode);
  const existingBody = parsed.body.trim() ? normalizeBody(parsed.body) : null;
  const body =
    customBody !== undefined
      ? normalizeBody(customBody)
      : existingBody ?? renderClaudeAgentBody(bot, claudeAgent, join(botDataDir, "MEMORY.md"));
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

/** Idempotently syncs Bot identity, tools, permissionMode, and prompt to `.claude/agents/<bot.id>.md`. */
export async function syncBotToClaudeAgent(
  bot: Pick<Bot, "id" | "name" | "title" | "description" | "soul"> & {
    provider?: string;
    modeId?: string | null;
    baseTools?: string[];
    providerConfigs?: BotProviderConfig[];
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
  const soul = await readBotSoul(bot.id, bot.soul, options.soulsDir);
  const effectiveBot = { ...bot, soul };
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

  const agentFile = join(agentsDir, `${claudeAgent}.md`);
  const existing = await readOptionalFile(agentFile);
  const rendered = renderClaudeAgentFile(
    effectiveBot,
    claudeAgent,
    botDataDir,
    existing,
    options.body,
    resolvedBaseTools,
    permissionMode,
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
    const syncOptions: ClaudeAgentOptions = {
      ...(options.agentsDir !== undefined ? { agentsDir: options.agentsDir } : {}),
      ...(options.projectDir !== undefined ? { projectDir: options.projectDir } : {}),
      ...(options.botDataDir !== undefined ? { botDataDir: options.botDataDir } : {}),
      ...(body !== undefined ? { body } : {}),
    };
    results.push(await syncBotToClaudeAgent(bot, syncOptions));
  }
  return results;
}
