import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PaseoApi } from "./paseo";
import { recentWork } from "../shared/activity";
import { selectPlaybooks } from "../shared/playbooks";
import { paseoToolsState, type PaseoToolsConfig } from "../shared/paseo-tools";
import type { AppAccount, PromptApp } from "../shared/apps";
import { accounts, catalog, readState } from "./composio";
import {
  APPS_MCP_NAME,
  TOOLS_MCP_NAME,
  botMcpServers,
  botSkills,
  composeSystemPrompt,
  isAgyProvider,
  isClaudeProvider,
  mcpServersRecord,
  primaryGroupForBot,
  promptSections,
  type Bot,
  type BotGroup,
  type BotSettingsValues,
  type Library,
  type McpServerConfig,
  type PluginServers,
  type PromptContext,
} from "../shared/bot";
import { resolveSessionRole, teamsOf, teamsPrompt, type SessionRoleKind } from "../shared/groups";
import type { WorkflowDefinition } from "../shared/workflows";
import { syncBotToAgyAgent } from "./agy-agents";
import { syncBotToClaudeAgent, writeSessionRunArtifacts } from "./claude-agents";
import { botDataPath, expandServerPath } from "./bot-home";
import { linkBotSkills, skillSha, syncSeatSkills } from "./library";
import { injectedMemory, MAIN_MEMORY, memoryFolder, recentLogEntries } from "./memory";
import { readBotSoul } from "./souls";

export interface TargetProjectRulesResult {
  path: string;
  rulesFile?: string;
  rulesExcerpt?: string;
  truncated?: boolean;
}

export const MAX_PROJECT_RULES_BYTES = 16384;

/**
 * Loads project governance rules from <dir>/AGENTS.md (fallback <dir>/CLAUDE.md),
 * truncating at maxBytes (default 16,384 bytes).
 */
export async function loadTargetProjectRules(
  dirs: readonly string[],
  maxBytes: number = MAX_PROJECT_RULES_BYTES,
): Promise<TargetProjectRulesResult[]> {
  const results: TargetProjectRulesResult[] = [];
  const seen = new Set<string>();

  for (const rawDir of dirs) {
    const dir = rawDir.trim();
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);

    const agentsMd = join(dir, "AGENTS.md");
    const claudeMd = join(dir, "CLAUDE.md");

    let chosenFile: string | null = null;
    let rawContent: Buffer | null = null;

    try {
      rawContent = await readFile(agentsMd);
      chosenFile = agentsMd;
    } catch {
      try {
        rawContent = await readFile(claudeMd);
        chosenFile = claudeMd;
      } catch {
        // neither file exists or is readable
      }
    }

    if (!chosenFile || !rawContent) {
      results.push({ path: dir });
      continue;
    }

    if (rawContent.byteLength <= maxBytes) {
      results.push({
        path: dir,
        rulesFile: chosenFile,
        rulesExcerpt: rawContent.toString("utf8"),
        truncated: false,
      });
    } else {
      const truncatedBuf = rawContent.subarray(0, maxBytes);
      results.push({
        path: dir,
        rulesFile: chosenFile,
        rulesExcerpt: truncatedBuf.toString("utf8"),
        truncated: true,
      });
    }
  }

  return results;
}

/**
 * The connected apps a bot may use right now (allowed for it and signed in on
 * this host), with their accounts when it picks one of several, and its limits.
 */
async function botApps(bot: Bot): Promise<PromptApp[]> {
  if (bot.apps.length === 0 || !(await readState()).apiKey) return [];
  const connected = (await accounts().catch(() => ({ accounts: [] as AppAccount[] }))).accounts.filter((account) => account.status === "connected");
  const slugs = bot.apps.filter((slug) => connected.some((account) => account.slug === slug));
  if (slugs.length === 0) return [];
  const names = new Map((await catalog().catch(() => ({ apps: [] }))).apps.map((app) => [app.slug, app.name]));
  return slugs.map((slug) => {
    const rule = bot.appRules[slug];
    // A bot kept to one account doesn't pick; the relay fills it in.
    const mine = rule?.account ? [] : connected.filter((account) => account.slug === slug);
    return { name: names.get(slug) ?? slug, accounts: mine.length > 1 ? mine.map((account) => ({ account: account.alias ?? account.id, name: account.name })) : [], tools: rule?.tools ?? "all" };
  });
}

export interface ChatStart {
  /** The chat's first message, which picks the playbooks. */
  message?: string;
  /** The bot's team(s) and every bot, when it's on one or more. */
  team?: { group?: BotGroup; groups?: BotGroup[]; bots: Bot[]; globalWorkflows?: WorkflowDefinition[] };
  sessionRole?: SessionRoleKind;
  sessionRoleText?: string | null;
  sessionBoardPath?: string | null;
  teamRootPath?: string | null;
  targetProjectDirs?: readonly string[];
  targetProjects?: Array<{ path: string; rulesFile?: string; rulesExcerpt?: string; truncated?: boolean }>;
  teamMemory?: { path: string; content: string } | null;
  seatDir?: string;
  allowedRootOverride?: string;
}

/**
 * Memory and skills live on this host, so only bots running here get them:
 * an agent on another host couldn't read or update the files.
 */
export async function promptContext(bot: Bot, local: boolean, library: Library, paseoTools: boolean, start: ChatStart = {}): Promise<PromptContext> {
  // Playbooks and teams live in the settings, so they travel with the bot to any host.
  const playbooks = selectPlaybooks(start.message ?? "", bot.playbooks);
  const startGroups = start.team?.groups ?? (start.team?.group ? [start.team.group] : []);
  const activeGroup = start.team?.group ?? primaryGroupForBot(bot.id, startGroups);

  const resolvedRole = start.sessionRole ?? (start.team || start.sessionBoardPath || start.teamRootPath ? resolveSessionRole({ botId: bot.id, group: activeGroup }) : undefined);

  let teamMemory = start.teamMemory;
  if (teamMemory === undefined && start.teamRootPath) {
    const memoryPath = join(start.teamRootPath, "MEMORY.md");
    try {
      const raw = await readFile(memoryPath, "utf8");
      const buf = Buffer.from(raw, "utf8");
      const trimmed = buf.byteLength > 8192 ? buf.subarray(0, 8192).toString("utf8") : raw;
      teamMemory = { path: memoryPath, content: trimmed };
    } catch {
      teamMemory = { path: memoryPath, content: "" };
    }
  }

  const team = startGroups.length && start.team ? teamsPrompt(startGroups, bot, start.team.bots, start.team.globalWorkflows, resolvedRole, teamMemory) : null;
  const rawMounts = activeGroup ? activeGroup.mounts : bot.mounts;
  const effectiveMounts = (rawMounts ?? []).map((m) => expandServerPath(m) ?? m);
  const rawCwd = activeGroup?.cwd ?? bot.cwd;
  const effectiveCwd = expandServerPath(rawCwd);

  let targetProjects = start.targetProjects;
  if (!targetProjects && start.targetProjectDirs && start.targetProjectDirs.length > 0) {
    targetProjects = await loadTargetProjectRules(
      start.targetProjectDirs.map((d) => expandServerPath(d) ?? d),
    );
  }

  // Connected apps go through this host's relay, so bots on other hosts can't reach them.
  if (!local) {
    return {
      memory: "",
      memoryPath: null,
      recentWork: [],
      playbooks,
      team,
      skills: [],
      paseoTools,
      botTools: false,
      apps: [],
      workdir: effectiveCwd,
      mounts: effectiveMounts,
      sessionRole: resolvedRole,
      sessionRoleText: start.sessionRoleText,
      sessionBoardPath: start.sessionBoardPath,
      teamMemory,
      targetProjects,
    };
  }

  // Only skills whose SKILL.md is still what the user reviewed.
  const skills: typeof library.skills = [];
  for (const skill of botSkills(bot, library)) {
    if (skill.reviewedSha === undefined || (skill.reviewedSha !== null && (await skillSha(skill.id)) === skill.reviewedSha)) skills.push(skill);
  }

  const skillIds = skills.map((skill) => skill.id);
  let skillsContext: { name: string; description: string; path: string }[];

  if (start.seatDir) {
    const seatSkillsMap = await syncSeatSkills(start.seatDir, skillIds, { allowedRootOverride: start.allowedRootOverride });
    skillsContext = skills.map((skill) => ({
      name: skill.id,
      description: skill.description,
      path: seatSkillsMap.get(skill.id) ?? join(start.seatDir!, ".agents", "skills", skill.id, "SKILL.md"),
    }));
  } else {
    const paths = await linkBotSkills(bot.id, skillIds);
    skillsContext = skills.map((skill) => ({
      name: skill.id,
      description: skill.description,
      path: paths.get(skill.id)!,
    }));
  }

  return {
    memory: await injectedMemory(bot.id),
    memoryPath: join(memoryFolder(bot.id), MAIN_MEMORY),
    recentWork: recentWork(await recentLogEntries(bot.id, 3), new Date()),
    playbooks,
    team,
    skills: skillsContext,
    paseoTools,
    botTools: true,
    apps: await botApps(bot),
    workdir: effectiveCwd ?? botDataPath(bot.id),
    mounts: effectiveMounts,
    sessionRole: resolvedRole,
    sessionRoleText: start.sessionRoleText,
    sessionBoardPath: start.sessionBoardPath,
    teamMemory,
    targetProjects,
  };
}

/** Whether this host gives the provider's agents Paseo's tools. Assumes yes when the config can't be read. */
async function paseoToolsOn(paseo: PaseoApi | null, provider: string): Promise<boolean> {
  if (!paseo) return true;
  try {
    const { config } = await paseo.config.get();
    return paseoToolsState(config as PaseoToolsConfig, provider).on;
  } catch {
    return true;
  }
}

/** The system prompt for a new chat; `settings` supplies the bot's team. */
export async function systemPrompt(
  {
    bot,
    local,
    message,
    group,
    syncAgy = true,
    syncClaude = true,
    claudeAgentsDir,
    claudeProjectDir,
    claudeBotDataDir,
    agyAgentsDir,
    plugin,
    mcpServers,
    soulsDir,
    sessionRole,
    sessionRoleText,
    sessionBoardPath,
    teamRootPath,
    targetProjectDirs,
    targetProjects,
    teamMemory,
    seatDir,
    runsDir,
    agentId,
    allowedRootOverride,
    isWorkflowStage,
    askedByBotId,
  }: {
    bot: Bot;
    local: boolean;
    message?: string;
    group?: BotGroup | null;
    syncAgy?: boolean;
    syncClaude?: boolean;
    claudeAgentsDir?: string;
    claudeProjectDir?: string;
    claudeBotDataDir?: string;
    agyAgentsDir?: string;
    plugin?: PluginServers;
    mcpServers?: Record<string, McpServerConfig>;
    soulsDir?: string;
    sessionRole?: SessionRoleKind;
    sessionRoleText?: string | null;
    sessionBoardPath?: string | null;
    teamRootPath?: string | null;
    targetProjectDirs?: readonly string[];
    targetProjects?: Array<{ path: string; rulesFile?: string; rulesExcerpt?: string; truncated?: boolean }>;
    teamMemory?: { path: string; content: string } | null;
    seatDir?: string;
    runsDir?: string;
    agentId?: string;
    allowedRootOverride?: string;
    isWorkflowStage?: boolean;
    askedByBotId?: string | null;
  },
  library: Library,
  paseo: PaseoApi | null,
  settings?: BotSettingsValues | null,
) {
  const soul = await readBotSoul(bot.id, bot.soul, soulsDir);
  const effectiveBot = { ...bot, soul };
  const groups = teamsOf(effectiveBot.id, settings?.groups ?? []);
  const activeGroup = group ?? primaryGroupForBot(effectiveBot.id, groups);
  const effectiveSessionRole = sessionRole ?? (isWorkflowStage || askedByBotId || activeGroup
    ? resolveSessionRole({ botId: effectiveBot.id, group: activeGroup, askedByBotId, isWorkflowStage })
    : undefined);

  const start: ChatStart = {
    ...(message !== undefined ? { message } : {}),
    ...((groups.length && settings) || activeGroup
      ? {
          team: {
            ...(activeGroup ? { group: activeGroup } : {}),
            groups: groups.length ? groups : (activeGroup ? [activeGroup] : []),
            bots: settings?.bots ?? [effectiveBot],
            ...(settings?.workflows ? { globalWorkflows: settings.workflows } : {}),
          },
        }
      : {}),
    sessionRole: effectiveSessionRole,
    sessionRoleText,
    sessionBoardPath,
    teamRootPath,
    targetProjectDirs,
    targetProjects,
    teamMemory,
    seatDir,
    allowedRootOverride,
  };

  // Another host's config isn't readable from here; Paseo gives agents its tools by default.
  const context = await promptContext(effectiveBot, local, library, local ? await paseoToolsOn(paseo, effectiveBot.provider) : true, start);
  const composed = composeSystemPrompt(effectiveBot, context);

  if (syncAgy && local && isAgyProvider(effectiveBot.provider)) {
    await syncBotToAgyAgent(effectiveBot, {
      body: composed,
      soulsDir,
      ...(agyAgentsDir !== undefined ? { agentsDir: agyAgentsDir } : {}),
    });
  }

  const resolvedMcpServers = mcpServers ?? {
    ...mcpServersRecord(botMcpServers(effectiveBot, library)),
    ...(plugin?.apps ? { [APPS_MCP_NAME]: plugin.apps } : {}),
    ...(plugin?.tools ? { [TOOLS_MCP_NAME]: plugin.tools } : {}),
  };

  let promptFilePath: string | undefined;
  let mcpConfigPath: string | null | undefined;
  let skillsDir: string | null | undefined;

  const targetAgentId = agentId ?? (runsDir ? effectiveBot.id : undefined);
  if (runsDir && targetAgentId) {
    const artifacts = await writeSessionRunArtifacts({
      runsDir,
      agentId: targetAgentId,
      systemPrompt: composed,
      mcpServers: resolvedMcpServers,
      allowedRootOverride,
    });
    promptFilePath = artifacts.promptPath;
    mcpConfigPath = artifacts.mcpPath;
  }

  if (syncClaude && local && isClaudeProvider(effectiveBot.provider)) {
    const effectiveBotDataDir = claudeBotDataDir ?? botDataPath(effectiveBot.id);
    const effectiveProjectDir = claudeProjectDir ?? context.workdir ?? effectiveBotDataDir;
    const claudeResult = await syncBotToClaudeAgent(effectiveBot, {
      ...(claudeAgentsDir !== undefined ? { agentsDir: claudeAgentsDir } : { projectDir: effectiveProjectDir }),
      projectDir: effectiveProjectDir,
      botDataDir: effectiveBotDataDir,
      body: composed,
      soulsDir,
      skills: context.skills.map((s) => s.name),
      mcpServers: resolvedMcpServers,
      syncMcpConfig: !runsDir,
      syncSkills: !seatDir,
      systemPromptMode: effectiveBot.systemPromptMode,
    });
    if (!mcpConfigPath) {
      mcpConfigPath = claudeResult.mcpConfigPath;
    }
    skillsDir = claudeResult.skillsDir;
  }

  return {
    systemPrompt: composed,
    sections: promptSections(effectiveBot, context),
    ...(promptFilePath ? { promptFilePath } : {}),
    ...(mcpConfigPath ? { mcpConfigPath } : {}),
    ...(skillsDir ? { skillsDir } : {}),
  };
}
