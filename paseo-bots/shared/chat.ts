/**
 * Purpose: Bot workspace management, placement resolution, chat initiation and silent self-healing fallback delivery.
 * Context: Paseo bots runtime chat controller and resilient execution layer.
 * Usage: import { startBotChat, sendBotMessage, switchAgentModel, ModelFallbackExhaustedError } from "./chat";
 * Prerequisites: Paseo daemon/client ChatApi and configured bot definitions.
 * Budget Justification: ~540 lines consolidating workspace lifecycle with resilient fallback execution.
 */

import type { WireAttachment } from "./attachments";
import { BOT_LABEL, buildAgentConfig, defaultModelId, type Bot, type BotGroup, type FallbackModel, type Library, type PluginServers } from "./bot";

/** Label on chats carrying the team session correlation ID (teamSessionId). */
export const TEAM_SESSION_LABEL = "paseo-bots.team-session";

/** Label on chats carrying the session role (dm, team-lead, team-direct-specialist, dispatched-worker). */
export const SESSION_ROLE_LABEL = "paseo-bots.session-role";

/** Label on chats carrying the workflow task ID. */
export const WORKFLOW_TASK_LABEL = "paseo-bots:workflow-task";
export const WORKFLOW_ID_LABEL = WORKFLOW_TASK_LABEL;

/** Label on chats carrying the workflow stage ID. */
export const WORKFLOW_STAGE_LABEL = "paseo-bots:workflow-stage";
export const WORKFLOW_STAGE_ID_LABEL = WORKFLOW_STAGE_LABEL;

/** Label on chats started by a routine, carrying the routine id. */
export const ROUTINE_LABEL = "paseo-bots.routine";

/**
 * Label on a chat that picked its subagent engine. Absent means both tool sets
 * stay on, which is what every existing chat keeps.
 */
export const ENGINE_LABEL = "paseo-bots.engine";
export const SUBAGENT_ENGINES = ["native", "paseo-bot"] as const;
/** "native" = the runtime's own subagent tools (AGY invoke_subagent); "paseo-bot" = this plugin's ask_bot family. */
export type SubagentEngine = (typeof SUBAGENT_ENGINES)[number];

/** Reads the engine a chat was started with; unknown or missing values mean the old both-tool-sets behaviour. */
export function chatEngine(labels: Record<string, string> | null | undefined): SubagentEngine | null {
  const value = labels?.[ENGINE_LABEL];
  return (SUBAGENT_ENGINES as readonly string[]).includes(value ?? "") ? (value as SubagentEngine) : null;
}

/** The labels a chat is created with: the caller's, plus the engine when the chat picked one. */
export function chatLabels(labels: Record<string, string>, engine: SubagentEngine | null): Record<string, string> {
  return engine ? { ...labels, [ENGINE_LABEL]: engine } : labels;
}

/** Validates an engine chosen in the UI; anything else is refused rather than silently downgraded. */
export function parseEngine(value: string | null | undefined): SubagentEngine | null {
  if (value === undefined || value === null || value === "") return null;
  if ((SUBAGENT_ENGINES as readonly string[]).includes(value)) return value as SubagentEngine;
  throw new Error(`Unknown subagent engine "${value}". Use one of: ${SUBAGENT_ENGINES.join(", ")}.`);
}
/** Longest title Paseo accepts (protocol/agent-title-limits.ts). */
const MAX_TITLE_CHARS = 200;

/** Older chats were titled "[Bot Name] …"; places grouped by bot show them without the prefix. */
export function displayTitle(title: string | null | undefined): string {
  return (title ?? "").replace(/^\[[^\]]*\]\s*/, "") || "New chat";
}

/** Where a bot's chats live. */
export interface BotPlacement {
  /** The bot's own folder: its workspace's working folder / managed CWD. */
  path: string;
  /** Folder of the shared Bots/Team project, or null when the bot has its own working folder. */
  projectRoot: string | null;
  /** Display title for the project (e.g. team name) when grouped under a team. */
  projectTitle?: string | null;
  /** Personal home Bots/<botId> for personal MEMORY.md lookup. */
  botHomePath?: string;
  /** Team root Teams/<team> for team MEMORY.md lookup. */
  teamRootPath?: string | null;
  /** Shared session blackboard directory for this conversation or workflow run. */
  sessionBoardPath?: string;
  /** External code repositories attached from group.cwd, bot.cwd, and mounts (deduplicated). */
  targetProjectDirs?: string[];
}

/** Resolves session placement: managed-seat placement plus explicit targetProjectDirs. */
export function resolveBotPlacement(
  bot: Pick<Bot, "cwd"> & Partial<Pick<Bot, "mounts">>,
  group: (Pick<BotGroup, "id" | "name" | "cwd"> & Partial<Pick<BotGroup, "mounts">>) | null | undefined,
  home: {
    path: string;
    root: string;
    botHomePath?: string;
    teamRootPath?: string | null;
    sessionBoardPath?: string;
  },
): BotPlacement & { targetProjectDirs: string[] } {
  const rawDirs: (string | null | undefined)[] = group
    ? [group.cwd, ...(group.mounts ?? []), ...(bot.mounts ?? [])]
    : [bot.cwd, ...(bot.mounts ?? [])];

  const seen = new Set<string>();
  const targetProjectDirs: string[] = [];
  for (const dir of rawDirs) {
    if (typeof dir === "string") {
      const trimmed = dir.trim();
      if (trimmed.length > 0 && !seen.has(trimmed)) {
        seen.add(trimmed);
        targetProjectDirs.push(trimmed);
      }
    }
  }

  return {
    path: home.path,
    projectRoot: home.root,
    projectTitle: group?.name ?? null,
    ...(home.botHomePath !== undefined ? { botHomePath: home.botHomePath } : {}),
    ...(home.teamRootPath !== undefined ? { teamRootPath: home.teamRootPath } : {}),
    ...(home.sessionBoardPath !== undefined ? { sessionBoardPath: home.sessionBoardPath } : {}),
    targetProjectDirs,
  };
}

const normalize = (path: string | null | undefined) => (path ?? "").replace(/\/+$/, "");

// The part of Paseo's API these helpers use. Shared code may only import the plugin SDK's
// root, so the app and the server pass their Paseo API in, and it's checked against this.

interface ChatWorkspace {
  background?: boolean;
  projectId: string;
  projectRootPath: string;
  projectCustomName?: string | null;
  projectDisplayName?: string | null;
  workspaceDirectory?: string;
  title?: string | null;
}

interface WorkspaceHandle {
  readonly id?: string;
  current(): ChatWorkspace | null;
  refresh(): Promise<ChatWorkspace | null>;
  setTitle(title: string): Promise<unknown>;
  archive(): Promise<unknown>;
}

export interface ChatSendOptions {
  messageId?: string;
  images?: { data: string; mimeType: string }[];
  attachments?: unknown;
  [key: string]: unknown;
}

export interface ChatApi {
  readonly projects: {
    list(): Promise<{ projects: ChatWorkspace[] }>;
    rename?(projectId: string, name: string): Promise<void>;
  };
  readonly workspaces: {
    list(options?: { filter: { includeBackground: boolean } }): Promise<{ entries: ChatWorkspace[] }>;
    ref(workspace: string | ChatWorkspace): WorkspaceHandle;
    open(path: string): Promise<WorkspaceHandle>;
    create(options: { title: string; background?: true; source: { kind: "directory"; path: string; projectId?: string } }): Promise<WorkspaceHandle>;
  };
  readonly agents?: {
    create(options: {
      agentId?: string;
      config: ReturnType<typeof buildAgentConfig>;
      cwd: string;
      workspaceId?: string;
      labels: Record<string, string>;
      prompt: string;
      title?: string;
      images?: { data: string; mimeType: string }[];
      attachments?: WireAttachment[];
      clientMessageId?: string;
    }): Promise<{ readonly id: string }>;
    ref?(agent: any): {
      send(text: string, options?: any): Promise<void>;
      setModel?(modelId: string | null): Promise<void>;
      setAgentModel?(modelId: string | null): Promise<void>;
    };
    setModel?(agentId: string, modelId: string | null): Promise<void>;
    setAgentModel?(agentId: string, modelId: string | null): Promise<void>;
  };
  readonly setAgentModel?: (agentId: string, modelId: string | null) => Promise<void>;
  readonly setAgentThinkingOption?: (agentId: string, thinkingOptionId: string | null) => Promise<void>;
  readonly daemonClient?: {
    setAgentModel?(agentId: string, modelId: string | null): Promise<void>;
    setAgentThinkingOption?(agentId: string, thinkingOptionId: string | null): Promise<void>;
  };
  readonly providers: { snapshot(): Promise<{ entries: { provider: string; models?: { id: string; isDefault?: boolean; isSelectable?: boolean }[] }[] }> };
}

/**
 * The Bots project: one Paseo project for the plugin, one workspace per bot.
 * Paseo registers a project the first time a folder is opened; that opening
 * also creates a workspace for the project folder itself, which is archived so
 * the project only lists bot workspaces.
 */
async function botsProjectId(api: ChatApi, root: string, projectTitle?: string | null): Promise<string> {
  const { projects } = await api.projects.list();
  const existing = projects.find((project) => normalize(project.projectRootPath) === normalize(root));
  let projectId: string;
  let currentName: string | null | undefined;
  if (existing) {
    projectId = existing.projectId;
    currentName = existing.projectCustomName ?? existing.projectDisplayName;
  } else {
    const rootWorkspace = await api.workspaces.open(root);
    const snapshot = rootWorkspace.current() ?? (await rootWorkspace.refresh());
    if (!snapshot) throw new Error("Paseo didn't register the Bots project.");
    await rootWorkspace.archive().catch(() => undefined);
    projectId = snapshot.projectId;
    currentName = snapshot.projectCustomName ?? snapshot.projectDisplayName;
  }
  if (projectTitle && currentName !== projectTitle) {
    await api.projects.rename?.(projectId, projectTitle);
  }
  return projectId;
}

/** Finds the bot's workspace matching placement path and target projectId (when grouped under a project). */
async function findBotWorkspace(
  api: ChatApi,
  bot: Bot,
  placement: BotPlacement | (Pick<BotPlacement, "path" | "projectRoot"> & Partial<BotPlacement>),
  targetProjectId: string | undefined,
): Promise<ChatWorkspace | undefined> {
  const { entries } = await api.workspaces.list({ filter: { includeBackground: true } });
  return entries.find(
    (workspace) =>
      workspace.background !== false &&
      normalize(workspace.workspaceDirectory ?? workspace.projectRootPath) === normalize(placement.path) &&
      (placement.projectRoot === null || workspace.projectId === targetProjectId) &&
      // A custom folder can have other workspaces; only the one named after the bot is the bot's.
      (placement.projectRoot !== null || workspace.title === bot.name),
  );
}

/** Finds the bot's workspace (by its folder) or creates it, and keeps its title in step with the bot's name. */
async function ensureBotWorkspace(
  api: ChatApi,
  bot: Bot,
  placement: BotPlacement | (Pick<BotPlacement, "path" | "projectRoot"> & Partial<BotPlacement>),
) {
  const targetProjectId =
    placement.projectRoot !== null ? await botsProjectId(api, placement.projectRoot, placement.projectTitle) : undefined;
  const mine = await findBotWorkspace(api, bot, placement, targetProjectId);
  if (mine) {
    const handle = api.workspaces.ref(mine);
    if (mine.title !== bot.name) await handle.setTitle(bot.name);
    if (placement.projectTitle && (mine.projectCustomName ?? mine.projectDisplayName) !== placement.projectTitle) {
      await api.projects.rename?.(mine.projectId, placement.projectTitle);
    }
    return handle;
  }
  return api.workspaces.create({
    title: bot.name,
    background: true,
    source: { kind: "directory", path: placement.path, ...(targetProjectId ? { projectId: targetProjectId } : {}) },
  });
}

/** Renames the bot's workspace after the bot is renamed; does nothing if it doesn't exist yet. */
export async function syncBotWorkspaceTitle(
  api: ChatApi,
  bot: Bot,
  placement: BotPlacement | (Pick<BotPlacement, "path" | "projectRoot"> & Partial<BotPlacement>),
): Promise<void> {
  if (placement.projectRoot === null) return;
  const targetProjectId = await botsProjectId(api, placement.projectRoot, placement.projectTitle);
  const mine = await findBotWorkspace(api, bot, placement, targetProjectId);
  if (mine && mine.title !== bot.name) await api.workspaces.ref(mine).setTitle(bot.name);
  if (mine && placement.projectTitle && (mine.projectCustomName ?? mine.projectDisplayName) !== placement.projectTitle) {
    await api.projects.rename?.(mine.projectId, placement.projectTitle);
  }
}

export interface StartChatInput {
  bot: Bot;
  /** Resolves the bot's MCP servers. */
  library: Library;
  /** The chat's agent id, picked in advance so its tools URL can name it. */
  agentId?: string;
  /** The plugin's servers for this chat (tools, connected apps), from the relay on the bot's host. */
  plugin?: PluginServers;
  placement: BotPlacement | (Pick<BotPlacement, "path" | "projectRoot"> & Partial<BotPlacement>);
  prompt: string;
  systemPrompt: string;
  /** Defaults to Paseo's own title derived from the prompt. */
  title?: string;
  labels?: Record<string, string>;
  /** The subagent engine this chat narrowed to; null/undefined keeps both tool sets. */
  engine?: SubagentEngine | null;
  images?: { data: string; mimeType: string }[];
  attachments?: WireAttachment[];
  clientMessageId?: string;
  skills?: string[];
  mcpConfigPath?: string;
  defaults?: { model?: string | null; modeId?: string | null; provider?: string | null } | null;
}

/**
 * Thrown when all candidate fallback models for a Team Bot under the active provider have been exhausted.
 */
export class ModelFallbackExhaustedError extends Error {
  readonly outcome = "exhausted" as const;
  readonly botId: string;
  readonly provider: string;
  readonly attemptedModels: string[];
  readonly lastError: unknown;

  constructor(options: { botId: string; provider: string; attemptedModels: string[]; lastError: unknown }) {
    const errorDetail = options.lastError instanceof Error ? options.lastError.message : String(options.lastError);
    super(
      `Model fallback chain exhausted for bot "${options.botId}" on provider "${options.provider}". Attempted models: ${options.attemptedModels.join(", ")}. Last error: ${errorDetail}`,
    );
    this.name = "ModelFallbackExhaustedError";
    this.botId = options.botId;
    this.provider = options.provider;
    this.attemptedModels = options.attemptedModels;
    this.lastError = options.lastError;
  }
}

/**
 * Scope Guard: Only Team Bots configured with non-empty fallbackModels are eligible for automatic fallback.
 * Ordinary non-bot chat sessions and bots without fallbackModels must never trigger automatic fallback.
 */
export function isTeamBotEligibleForFallback(bot: Pick<Bot, "fallbackModels"> | null | undefined): boolean {
  return !!bot && Array.isArray(bot.fallbackModels) && bot.fallbackModels.length > 0;
}

export function isFallbackEligibleError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

  // Non-recoverable guardrails fail fast without retrying (from Cindy architecture)
  if (
    /user (?:denied|rejected)|approval (?:denied|required)|permission denied/i.test(msg) ||
    /context.{0,20}(?:overflow|too long)|prompt too long/i.test(msg)
  ) {
    return false;
  }

  const isRateLimit =
    msg.includes("rate_limit") ||
    msg.includes("rate limit") ||
    msg.includes("ratelimit") ||
    msg.includes("too many requests") ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("tokens per minute") ||
    msg.includes("requests per minute") ||
    msg.includes("tpm") ||
    msg.includes("rpm");

  const isQuota =
    msg.includes("quota") ||
    msg.includes("credit balance") ||
    msg.includes("insufficient_quota") ||
    msg.includes("billing") ||
    msg.includes("usagelimitexceeded") ||
    msg.includes("usage limit") ||
    msg.includes("exceeded your current quota");

  const isCapacity =
    msg.includes("overloaded") ||
    msg.includes("capacity") ||
    msg.includes("503") ||
    msg.includes("service unavailable") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("high demand") ||
    msg.includes("server_error") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("504") ||
    msg.includes("529") ||
    msg.includes("internal server error") ||
    msg.includes("is overloaded") ||
    msg.includes("upstream-overload");

  const isModelUnavailable =
    msg.includes("model_not_found") ||
    msg.includes("unknown model") ||
    msg.includes("streamgeneratecontent") ||
    msg.includes("stream_generate_content") ||
    (msg.includes("model") &&
      (msg.includes("not found") ||
        msg.includes("unavailable") ||
        msg.includes("not supported") ||
        msg.includes("exist") ||
        msg.includes("unknown") ||
        msg.includes("deprecated") ||
        msg.includes("access") ||
        msg.includes("invalid") ||
        msg.includes("no longer available")));

  return isRateLimit || isQuota || isCapacity || isModelUnavailable;
}

export function resolveCandidateModels(bot: Bot, defaultModel: string): FallbackModel[] {
  const primaryModel = bot.model ?? defaultModel;
  const primary: FallbackModel = {
    model: primaryModel,
    thinkingOptionId: bot.thinkingOptionId ?? null,
  };
  const list: FallbackModel[] = [primary];
  for (const fb of bot.fallbackModels ?? []) {
    if (!fb.model) continue;
    const duplicate = list.some(
      (existing) => existing.model === fb.model && (existing.thinkingOptionId ?? null) === (fb.thinkingOptionId ?? null),
    );
    if (!duplicate) {
      list.push({
        model: fb.model,
        thinkingOptionId: fb.thinkingOptionId ?? null,
      });
    }
  }
  return list;
}

/**
 * Switches the active model of a running agent session under the same provider.
 */
export async function switchAgentModel(
  api: unknown,
  agentId: string,
  modelId: string | null,
  thinkingOptionId?: string | null,
): Promise<void> {
  const rawApi = api as {
    setAgentModel?(agentId: string, modelId: string | null): Promise<void>;
    setAgentThinkingOption?(agentId: string, thinkingOptionId: string | null): Promise<void>;
    daemonClient?: {
      setAgentModel?(agentId: string, modelId: string | null): Promise<void>;
      setAgentThinkingOption?(agentId: string, thinkingOptionId: string | null): Promise<void>;
    };
    agents?: {
      setModel?(agentId: string, modelId: string | null): Promise<void>;
      setAgentModel?(agentId: string, modelId: string | null): Promise<void>;
      ref?(id: string): {
        setModel?(modelId: string | null): Promise<void>;
        setAgentModel?(modelId: string | null): Promise<void>;
      };
    };
  };

  const handle = rawApi.agents?.ref?.(agentId);
  if (typeof handle?.setModel === "function") {
    await handle.setModel(modelId);
  } else if (typeof handle?.setAgentModel === "function") {
    await handle.setAgentModel(modelId);
  } else if (typeof rawApi.agents?.setModel === "function") {
    await rawApi.agents.setModel(agentId, modelId);
  } else if (typeof rawApi.agents?.setAgentModel === "function") {
    await rawApi.agents.setAgentModel(agentId, modelId);
  } else if (typeof rawApi.setAgentModel === "function") {
    await rawApi.setAgentModel(agentId, modelId);
  } else if (typeof rawApi.daemonClient?.setAgentModel === "function") {
    await rawApi.daemonClient.setAgentModel(agentId, modelId);
  }

  if (thinkingOptionId !== undefined) {
    if (typeof rawApi.setAgentThinkingOption === "function") {
      await rawApi.setAgentThinkingOption(agentId, thinkingOptionId);
    } else if (typeof rawApi.daemonClient?.setAgentThinkingOption === "function") {
      await rawApi.daemonClient.setAgentThinkingOption(agentId, thinkingOptionId);
    }
  }
}

/**
 * Starts a chat (a thread in the bot's workspace) with the bot's configuration
 * and sends the first message. Used by the app and by the routine scheduler.
 * Retries with fallback models under the same provider if the primary model fails.
 */
export async function startBotChat(
  api: ChatApi,
  input: StartChatInput,
  onFallback?: (fromModel: string, toModel: string, error: unknown) => void,
): Promise<string> {
  const { bot } = input;
  const defaultsModel = (!input.defaults?.provider || input.defaults.provider === bot.provider)
    ? input.defaults?.model?.trim() || null
    : null;
  const defaultsModeId = (!input.defaults?.provider || input.defaults.provider === bot.provider)
    ? input.defaults?.modeId?.trim() || null
    : null;

  const inheritedModel = (!bot.model || !bot.model.trim()) ? defaultsModel : bot.model;
  const inheritedModeId = (!bot.modeId || !bot.modeId.trim()) ? defaultsModeId : bot.modeId;

  const effectiveBot: Bot = (inheritedModel !== bot.model || inheritedModeId !== bot.modeId)
    ? {
        ...bot,
        ...(inheritedModel ? { model: inheritedModel } : {}),
        ...(inheritedModeId ? { modeId: inheritedModeId } : {}),
      }
    : bot;

  const isEligible = isTeamBotEligibleForFallback(effectiveBot);
  const defaultModel = !isEligible && effectiveBot.model
    ? effectiveBot.model
    : (defaultsModel || (await resolveDefaultModel(api, effectiveBot.provider)));
  const candidates = isEligible
    ? resolveCandidateModels(effectiveBot, defaultModel)
    : [{ model: effectiveBot.model ?? defaultModel, thinkingOptionId: effectiveBot.thinkingOptionId ?? null }];
  const workspace = await ensureBotWorkspace(api, effectiveBot, input.placement);
  const wsSnapshot = workspace.current?.() ?? (await workspace.refresh?.().catch(() => null));
  const workspaceId = workspace.id ?? (wsSnapshot as { id?: string } | null)?.id;

  let lastError: unknown;
  const attemptedModels: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    attemptedModels.push(candidate.model);
    try {
      const createInput = {
        ...(input.agentId ? { agentId: input.agentId } : {}),
        config: buildAgentConfig(
          effectiveBot,
          input.library,
          candidate.model,
          input.systemPrompt,
          input.plugin,
          candidate.thinkingOptionId,
          isEligible ? effectiveBot.fallbackModels : undefined,
          input.engine ?? null,
          input.skills,
          input.mcpConfigPath,
          undefined,
          { defaults: input.defaults },
        ),
        cwd: input.placement.path,
        ...(workspaceId ? { workspaceId } : {}),
        labels: { [BOT_LABEL]: effectiveBot.id, ...input.labels },
        prompt: input.prompt,
        ...(input.title ? { title: input.title.slice(0, MAX_TITLE_CHARS) } : {}),
        ...(input.images?.length ? { images: input.images } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
        ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
      };
      const wsAgents = (workspace as { agents?: { create(opts: typeof createInput): Promise<{ readonly id: string }> } }).agents;
      const agent = api.agents ? await api.agents.create(createInput) : await wsAgents!.create(createInput);
      return agent.id;
    } catch (error) {
      lastError = error;
      const nextCandidate = candidates[i + 1];
      if (isEligible && isFallbackEligibleError(error) && nextCandidate) {
        console.warn(
          `[paseo-bots] Model "${candidate.model}" failed (${error instanceof Error ? error.message : String(error)}). Falling back to "${nextCandidate.model}" for bot "${effectiveBot.name}" (${effectiveBot.id}).`,
        );
        onFallback?.(candidate.model, nextCandidate.model, error);
        continue;
      }
      if (isEligible && candidates.length > 1 && i === candidates.length - 1 && isFallbackEligibleError(error)) {
        throw new ModelFallbackExhaustedError({
          botId: effectiveBot.id,
          provider: effectiveBot.provider,
          attemptedModels,
          lastError: error,
        });
      }
      throw error;
    }
  }

  if (isEligible && candidates.length > 1) {
    throw new ModelFallbackExhaustedError({
      botId: effectiveBot.id,
      provider: effectiveBot.provider,
      attemptedModels,
      lastError,
    });
  }
  throw lastError;
}

export interface SendBotMessageInput {
  agentId: string;
  text: string;
  options?: ChatSendOptions | any;
  bot?: Bot | null;
  currentModel?: string | null;
  defaultModel?: string;
  onFallback?: (fromModel: string, toModel: string, error: unknown) => void;
}

/**
 * Sends a message in an existing bot chat with silent self-healing fallback retry.
 * If the active model fails with an eligible recoverable error on a Team Bot,
 * it suppresses the exception, switches the agent to the next fallback model under the same provider,
 * and re-delivers the prompt.
 */
export async function sendBotMessage(
  api: ChatApi,
  input: SendBotMessageInput,
): Promise<void> {
  const { agentId, text, options, bot, currentModel, onFallback } = input;

  if (!isTeamBotEligibleForFallback(bot)) {
    const handle = api.agents?.ref ? api.agents.ref(agentId) : (api as any).agents?.ref?.(agentId);
    await handle.send(text, options);
    return;
  }

  const teamBot = bot!;
  const defaultModel = input.defaultModel ?? (await resolveDefaultModel(api, teamBot.provider).catch(() => ""));
  const candidates = resolveCandidateModels(teamBot, defaultModel);
  const current = currentModel || teamBot.model || defaultModel;
  let currentIndex = candidates.findIndex((c) => c.model === current);
  if (currentIndex < 0) currentIndex = 0;

  const attemptedModels: string[] = [candidates[currentIndex]!.model];
  let lastError: unknown;

  for (let i = currentIndex; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    try {
      const handle = api.agents?.ref ? api.agents.ref(agentId) : (api as any).agents?.ref?.(agentId);
      await handle.send(text, options);
      return;
    } catch (error) {
      lastError = error;
      const nextCandidate = candidates[i + 1];
      if (isFallbackEligibleError(error) && nextCandidate) {
        attemptedModels.push(nextCandidate.model);
        console.warn(
          `[paseo-bots] Model "${candidate.model}" failed for bot "${teamBot.name}" (${teamBot.id}) in chat "${agentId}" (${error instanceof Error ? error.message : String(error)}). Falling back to "${nextCandidate.model}" and retrying...`,
        );
        onFallback?.(candidate.model, nextCandidate.model, error);
        await switchAgentModel(api, agentId, nextCandidate.model, nextCandidate.thinkingOptionId).catch((switchErr) => {
          console.warn(`[paseo-bots] Could not switch model to "${nextCandidate.model}":`, switchErr);
        });
        continue;
      }
      if (candidates.length > 1 && i === candidates.length - 1 && isFallbackEligibleError(error)) {
        throw new ModelFallbackExhaustedError({
          botId: teamBot.id,
          provider: teamBot.provider,
          attemptedModels,
          lastError: error,
        });
      }
      throw error;
    }
  }

  if (candidates.length > 1) {
    throw new ModelFallbackExhaustedError({
      botId: teamBot.id,
      provider: teamBot.provider,
      attemptedModels,
      lastError,
    });
  }
  throw lastError;
}

async function resolveDefaultModel(api: ChatApi, provider: string): Promise<string> {
  const snapshot = await api.providers.snapshot();
  const entry = snapshot.entries.find((candidate) => candidate.provider === provider);
  const model = defaultModelId(entry?.models ?? []);
  if (!model) throw new Error(`${provider} has no models available. Pick a model in the bot's settings.`);
  return model;
}
