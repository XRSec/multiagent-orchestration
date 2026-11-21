import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  APPS_MCP_NAME,
  BOT_LABEL,
  EMPTY_LIBRARY,
  isAgyProvider,
  LIFECYCLE_MOUNT_LABEL,
  resolveAgyAgent,
  TOOLS_MCP_NAME,
  type Bot,
} from "../shared/bot";
import { defaultAgyAgentsDir, syncBotToAgyAgent } from "./agy-agents";
import type { BotsHost } from "./host";
import type { McpOAuthProxy } from "./mcp-oauth-proxy";
import type { PaseoApi } from "./paseo";
import { systemPrompt } from "./prompt";
import type { Relay } from "./relay";

async function ensureAgyPromptFile(
  bot: Bot,
  host: BotsHost,
  paseo: PaseoApi | null,
): Promise<string | null> {
  const agyAgent = resolveAgyAgent(bot);
  if (!agyAgent) return null;
  const promptPath = join(defaultAgyAgentsDir(), `${agyAgent}.md`);
  if (!existsSync(promptPath)) {
    const [lib, values] = await Promise.all([
      typeof host.library === "function" ? host.library().catch(() => EMPTY_LIBRARY) : Promise.resolve(EMPTY_LIBRARY),
      typeof host.values === "function" ? host.values().catch(() => null) : Promise.resolve(null),
    ]);
    const { systemPrompt: body } = await systemPrompt(
      { bot, local: true, syncAgy: false, syncClaude: false },
      lib,
      paseo,
      values,
    );
    await syncBotToAgyAgent(bot, { body });
  }
  return promptPath;
}

async function mergeOAuthServers(
  oauthProxy: Pick<McpOAuthProxy, "servers">,
  botId: string,
  agentId: string,
  nextMcp: Record<string, any>,
): Promise<boolean> {
  const oauthMounts = await oauthProxy.servers(botId, agentId);
  let changed = false;
  for (const [name, config] of Object.entries(oauthMounts)) {
    if (name in nextMcp) {
      throw new Error(`MCP server '${name}' conflicts with another plugin. Rename it in Skills & Tools.`);
    }
    nextMcp[name] = config;
    changed = true;
  }
  return changed;
}

/**
 * Registers the single unified `agent.open.before` hook for bot sessions:
 * - Mounts OAuth proxy MCP servers for interactive bot sessions while checking collisions.
 * - Only when `paseo-bots.lifecycle-mount=true` is set, mounts live `bots` / `composio`
 *   MCP servers and ensures `PASEO_AGY_BOT_PROMPT_FILE` points to the synced AGY prompt file.
 */
export function registerBotSessionLifecycle(
  server: PluginServerContext,
  host: BotsHost,
  relay: Pick<Relay, "mountTools" | "mountApps">,
  oauthProxy?: Pick<McpOAuthProxy, "servers">,
): () => void {
  return server.addHook("agent.open.before", async ({ request }, context) => {
    host.attach(context.paseo);
    const botId = request.labels[BOT_LABEL];
    if (!botId || request.purpose === "history") return;

    const bot = await host.bot(botId).catch(() => null);
    if (!bot || bot.hostId) return;

    const shouldMountLifecycle = request.labels[LIFECYCLE_MOUNT_LABEL] === "true";
    let mcpChanged = false;
    const nextMcp: Record<string, any> = { ...(request.mcpServers ?? {}) };

    if (shouldMountLifecycle) {
      if (!(TOOLS_MCP_NAME in nextMcp)) {
        nextMcp[TOOLS_MCP_NAME] = await relay.mountTools(botId, request.agentId);
        mcpChanged = true;
      }
      if (bot.apps.length > 0 && !(APPS_MCP_NAME in nextMcp)) {
        const apps = await relay.mountApps(botId).catch(() => null);
        if (apps) {
          nextMcp[APPS_MCP_NAME] = apps;
          mcpChanged = true;
        }
      }
    }

    if (oauthProxy && (await mergeOAuthServers(oauthProxy, botId, request.agentId, nextMcp))) {
      mcpChanged = true;
    }

    let envChanged = false;
    const reqEnv = request.env ?? {};
    let nextEnv = reqEnv;
    if (shouldMountLifecycle && isAgyProvider(bot.provider) && !reqEnv.PASEO_AGY_BOT_PROMPT_FILE) {
      const promptPath = await ensureAgyPromptFile(bot, host, context.paseo);
      if (promptPath) {
        nextEnv = { ...reqEnv, PASEO_AGY_BOT_PROMPT_FILE: promptPath };
        envChanged = true;
      }
    }

    if (!mcpChanged && !envChanged) return undefined;

    return {
      ...request,
      ...(mcpChanged ? { mcpServers: nextMcp } : {}),
      ...(envChanged ? { env: nextEnv } : {}),
    };
  });
}
