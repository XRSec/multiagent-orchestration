import { createContext, useContext } from "react";
import type { LibraryKind } from "../shared/library";

/** The library item to show: a skill, an MCP server, a connected app, or the app catalog. */
export type LibraryTarget = { kind: LibraryKind | "app"; id: string } | { kind: "apps" };

type Listener = (target: LibraryTarget | null) => void;
const listeners = new Set<Listener>();

export function openLibrary(target: LibraryTarget | null = null): void {
  for (const listener of listeners) listener(target);
}

export function onLibraryTarget(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let globalNavigation: any = null;

export function setGlobalNavigation(navigation: any): void {
  globalNavigation = navigation;
}

export function getGlobalNavigation(): any {
  return globalNavigation;
}

export interface OpenChatOptions {
  botId?: string;
  serverId?: string;
  navigation?: any;
  client?: any;
}

/**
 * Navigates directly to an existing agent chat session using the available Paseo navigation API.
 * Supports both (chatId, options) and (chatId, botId, options) or (botId, chatId, options) order.
 */
export function navigateToAgentChat(
  first: string,
  second?: string | OpenChatOptions,
  maybeOptions?: OpenChatOptions,
): boolean {
  if (!first) return false;
  let chatId: string;
  let botId: string | undefined;
  let options: OpenChatOptions = {};

  if (typeof second === "string") {
    options = maybeOptions ?? {};
    if (first.startsWith("bot-") && !second.startsWith("bot-")) {
      botId = first;
      chatId = second;
    } else if (second.startsWith("bot-") && !first.startsWith("bot-")) {
      chatId = first;
      botId = second;
    } else {
      chatId = first;
      botId = second;
    }
  } else {
    chatId = first;
    options = second ?? {};
    botId = options.botId;
  }

  const nav = options.navigation ?? getGlobalNavigation() ?? options.client?.navigation;
  if (nav?.openAgent) {
    nav.openAgent({
      agentId: chatId,
      ...(options.serverId ? { serverId: options.serverId } : {}),
    });
    return true;
  }
  if (nav?.openChat) {
    nav.openChat(chatId);
    return true;
  }
  if (options.client?.navigation?.openAgent) {
    options.client.navigation.openAgent({
      agentId: chatId,
      ...(options.serverId ? { serverId: options.serverId } : {}),
    });
    return true;
  }
  if (options.client?.navigation?.openChat) {
    options.client.navigation.openChat(chatId);
    return true;
  }
  if (options.client?.navigateToAgent) {
    options.client.navigateToAgent(chatId);
    return true;
  }
  if (typeof (options.client?.paseo?.agents?.ref as any) === "function") {
    const handle = options.client.paseo.agents.ref(chatId);
    if (typeof handle?.open === "function") {
      handle.open();
      return true;
    }
  }
  if (options.client?.openScreen) {
    options.client.openScreen({
      screenId: "bot-chat",
      params: { ...(botId ? { botId } : {}), chatId },
    });
    return true;
  }
  return false;
}

// Navigation belongs to the surface that contains the pressed control. Previous
// mobile routes can remain mounted in Paseo's stack without handling its presses.
export const LibraryNavigation = createContext<(target?: LibraryTarget | null) => void>(() => {});
export const useOpenLibrary = () => useContext(LibraryNavigation);
