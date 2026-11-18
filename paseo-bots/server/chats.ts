import { primaryGroupForBot, type Bot, type BotGroup, type FallbackModel } from "../shared/bot";
import {
  chatLabels,
  ENGINE_LABEL,
  isFallbackEligibleError,
  isTeamBotEligibleForFallback,
  ModelFallbackExhaustedError,
  parseEngine,
  resolveBotPlacement,
  resolveCandidateModels,
  sendBotMessage,
  SESSION_ROLE_LABEL,
  startBotChat,
  switchAgentModel,
  TEAM_SESSION_LABEL,
  type SubagentEngine,
} from "../shared/chat";
import { resolveSessionRole, teamsOf } from "../shared/groups";
import { ASKED_IN_LABEL } from "../shared/handoff";
import { newUuid } from "../shared/uuid";
import { ensureManagedSessionHome } from "./bot-home";
import type { BotsHost } from "./host";
import { systemPrompt } from "./prompt";
import type { Relay } from "./relay";

declare module "../shared/chat" {
  interface StartChatInput {
    promptFilePath?: string;
    additionalDirectories?: string[];
  }
}

export {
  isFallbackEligibleError,
  isTeamBotEligibleForFallback,
  ModelFallbackExhaustedError,
  resolveCandidateModels,
  sendBotMessage,
  switchAgentModel,
};

export interface FallbackEvent {
  botId: string;
  botName: string;
  provider: string;
  fromModel: string;
  toModel: string;
  error: unknown;
  timestamp: string;
}

/**
 * Runs an action through the bot's candidate models in order (primary first, then configured fallbacks).
 * Retries if the failure is eligible (rate limit, quota, capacity, model unavailable).
 */
export async function runWithModelFallback<T>(
  bot: Bot,
  defaultModel: string,
  action: (candidate: FallbackModel) => Promise<T>,
  onFallback?: (event: FallbackEvent) => void,
): Promise<T> {
  const isEligible = isTeamBotEligibleForFallback(bot);
  const candidates = isEligible ? resolveCandidateModels(bot, defaultModel) : [{ model: bot.model ?? defaultModel, thinkingOptionId: bot.thinkingOptionId ?? null }];
  let lastError: unknown;
  const attemptedModels: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    attemptedModels.push(candidate.model);
    try {
      return await action(candidate);
    } catch (error) {
      lastError = error;
      const nextCandidate = candidates[i + 1];
      if (isEligible && isFallbackEligibleError(error) && nextCandidate) {
        const event: FallbackEvent = {
          botId: bot.id,
          botName: bot.name,
          provider: bot.provider,
          fromModel: candidate.model,
          toModel: nextCandidate.model,
          error,
          timestamp: new Date().toISOString(),
        };
        console.warn(
          `[paseo-bots] Fallback triggered for bot "${bot.name}" (${bot.id}): model "${candidate.model}" failed (${error instanceof Error ? error.message : String(error)}). Retrying with fallback model "${nextCandidate.model}"...`,
        );
        onFallback?.(event);
        continue;
      }
      if (isEligible && candidates.length > 1 && i === candidates.length - 1 && isFallbackEligibleError(error)) {
        throw new ModelFallbackExhaustedError({
          botId: bot.id,
          provider: bot.provider,
          attemptedModels,
          lastError: error,
        });
      }
      throw error;
    }
  }

  if (isEligible && candidates.length > 1) {
    throw new ModelFallbackExhaustedError({
      botId: bot.id,
      provider: bot.provider,
      attemptedModels,
      lastError,
    });
  }
  throw lastError;
}

/**
 * Starts a chat for a bot on this host, the way the app does: its system
 * prompt, its folder, and the plugin's tools and connected apps. Routines and
 * requests from other bots start chats with it.
 */
export async function startChat(
  host: BotsHost,
  relay: Relay,
  bot: Bot,
  input: {
    prompt: string;
    title: string;
    labels: Record<string, string>;
    agentId?: string;
    group?: BotGroup | null;
    askedByBotId?: string;
    thinkingOptionId?: string | null;
    engine?: SubagentEngine;
    skillIds?: string[];
    mcpServerIds?: string[];
    mcpConfigPath?: string;
    teamSessionId?: string;
    isWorkflowStage?: boolean;
    stageSeatKey?: string;
  },
  onFallback?: (fromModel: string, toModel: string, error: unknown) => void,
): Promise<string> {
  const paseo = host.requirePaseo();
  if (bot.hostId) throw new Error(`${bot.name} runs on another host, so its chats can't be started from here.`);
  const values = await host.values();
  const library = await host.library();
  const engine = parseEngine(input.engine);
  const groups = values?.groups ?? [];
  const sharedGroup = input.askedByBotId
    ? teamsOf(bot.id, groups).find((candidate) => candidate.leadId === input.askedByBotId || candidate.memberIds.includes(input.askedByBotId!)) ?? null
    : null;
  const group = input.group !== undefined ? input.group : (sharedGroup ?? primaryGroupForBot(bot.id, groups));

  const agentId = input.agentId ?? newUuid();
  const callerChat = input.labels?.[ASKED_IN_LABEL] ? await host.chatOf(input.labels[ASKED_IN_LABEL]).catch(() => null) : null;
  const teamSessionId = input.teamSessionId ?? input.labels?.[TEAM_SESSION_LABEL] ?? callerChat?.labels?.[TEAM_SESSION_LABEL] ?? agentId;

  const home = await ensureManagedSessionHome({
    botId: bot.id,
    sessionId: teamSessionId,
    ...(group ? { groupId: group.id, groupName: group.name } : {}),
    ...(input.stageSeatKey ? { stageSeatKey: input.stageSeatKey } : {}),
  });

  const effectiveBot: Bot = {
    ...bot,
    ...(input.thinkingOptionId !== undefined ? { thinkingOptionId: input.thinkingOptionId } : {}),
    ...(input.skillIds !== undefined ? { skillIds: input.skillIds } : {}),
    ...(input.mcpServerIds !== undefined ? { mcpServerIds: input.mcpServerIds } : {}),
  };
  const placement = resolveBotPlacement(effectiveBot, group, home);

  const sessionRole = resolveSessionRole({
    botId: bot.id,
    group,
    askedByBotId: input.askedByBotId,
    isWorkflowStage: input.isWorkflowStage,
  });

  const plugin = { tools: await relay.mountTools(bot.id, agentId), apps: bot.apps.length ? await relay.mountApps(bot.id) : null };
  const promptResult = await systemPrompt(
    {
      bot: effectiveBot,
      local: true,
      message: input.prompt,
      group,
      plugin,
      claudeProjectDir: placement.path,
      seatDir: home.path,
      runsDir: home.runsPath,
      teamRootPath: home.teamRootPath,
      sessionBoardPath: home.sessionBoardPath,
      targetProjectDirs: placement.targetProjectDirs,
      sessionRole,
      agentId,
      isWorkflowStage: input.isWorkflowStage,
      askedByBotId: input.askedByBotId,
    },
    library,
    paseo,
    values,
  );
  const resolvedMcpConfigPath = promptResult.mcpConfigPath ?? input.mcpConfigPath;

  const labels: Record<string, string> = {
    ...input.labels,
    [TEAM_SESSION_LABEL]: teamSessionId,
    [SESSION_ROLE_LABEL]: sessionRole,
  };

  return startBotChat(
    paseo,
    {
      bot: effectiveBot,
      library,
      agentId,
      plugin,
      placement,
      prompt: input.prompt,
      systemPrompt: promptResult.systemPrompt,
      title: input.title,
      labels: chatLabels(labels, engine),
      ...(engine ? { engine } : {}),
      ...(resolvedMcpConfigPath ? { mcpConfigPath: resolvedMcpConfigPath } : {}),
      ...(promptResult.promptFilePath ? { promptFilePath: promptResult.promptFilePath } : {}),
      ...(placement.targetProjectDirs && placement.targetProjectDirs.length > 0
        ? { additionalDirectories: placement.targetProjectDirs }
        : {}),
    },
    onFallback,
  );
}
