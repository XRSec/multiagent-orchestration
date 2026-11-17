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
  startBotChat,
  switchAgentModel,
  type SubagentEngine,
} from "../shared/chat";
import { teamsOf } from "../shared/groups";
import { newUuid } from "../shared/uuid";
import { ensureBotHome } from "./bot-home";
import type { BotsHost } from "./host";
import { systemPrompt } from "./prompt";
import type { Relay } from "./relay";

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
  input: { prompt: string; title: string; labels: Record<string, string>; agentId?: string; group?: BotGroup | null; askedByBotId?: string; thinkingOptionId?: string | null; engine?: SubagentEngine },
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
  const home = await ensureBotHome({ botId: bot.id, ...(group ? { groupId: group.id, groupName: group.name } : {}) });
  const { systemPrompt: system } = await systemPrompt({ bot, local: true, message: input.prompt, group }, library, paseo, values);
  const agentId = input.agentId ?? newUuid();
  const effectiveBot = input.thinkingOptionId !== undefined ? { ...bot, thinkingOptionId: input.thinkingOptionId } : bot;
  return startBotChat(
    paseo,
    {
      bot: effectiveBot,
      library,
      agentId,
      plugin: { tools: await relay.mountTools(bot.id, agentId), apps: bot.apps.length ? await relay.mountApps(bot.id) : null },
      placement: resolveBotPlacement(effectiveBot, group, home),
      prompt: input.prompt,
      systemPrompt: system,
      title: input.title,
      labels: chatLabels(input.labels, engine),
      ...(engine ? { engine } : {}),
    },
    onFallback,
  );
}
