import { getPaseoClient, usePaseo, useHosts } from "@getpaseo/plugin/client";
import type { PaseoAgent, PaseoApi } from "./paseo";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { BOT_LABEL, type Bot } from "../shared/bot";
import { paseoToolsState, type PaseoToolsConfig } from "../shared/paseo-tools";
import { listBotChats } from "./chat-directory";

export interface LocalHost {
  id: string;
  label: string;
}

export interface BotHost {
  api: PaseoApi | null;
  /** Stable key for queries; the local host uses its own id. */
  key: string;
  label: string;
  isLocal: boolean;
  online: boolean;
}

type HostSummaries = ReturnType<typeof useHosts>;

function resolveHost(hostId: string | null, local: LocalHost, localApi: PaseoApi, hosts: HostSummaries): BotHost {
  if (!hostId || hostId === local.id) {
    return { api: localApi, key: local.id, label: local.label, isLocal: true, online: true };
  }
  const summary = hosts.find((host) => host.serverId === hostId);
  const label = summary?.label ?? "Unknown host";
  if (summary?.status !== "online") return { api: null, key: hostId, label, isLocal: false, online: false };
  try {
    return { api: getPaseoClient(hostId), key: hostId, label, isLocal: false, online: true };
  } catch {
    return { api: null, key: hostId, label, isLocal: false, online: false };
  }
}

/** Resolves the host a bot runs on. `hostId === null` is the host that stores the bots. */
export function useBotHost(hostId: string | null, local: LocalHost): BotHost {
  const localApi = usePaseo();
  const hosts = useHosts();
  const summary = hostId ? hosts.find((host) => host.serverId === hostId) : undefined;
  const status = summary?.status;
  return useMemo(
    () => resolveHost(hostId, local, localApi, hosts),
    // Only the fields that change the result.
    [hostId, local.id, local.label, localApi, summary?.label, status],
  );
}

/** The same resolution outside render, e.g. for menu actions. */
export function useHostResolver(local: LocalHost): (hostId: string | null) => BotHost {
  const localApi = usePaseo();
  const hosts = useHosts();
  return (hostId) => resolveHost(hostId, local, localApi, hosts);
}

export type ProviderEntry = Awaited<ReturnType<PaseoApi["providers"]["snapshot"]>>["entries"][number];

export function useProviders(host: BotHost) {
  const queryClient = useQueryClient();
  const key = ["paseo-bots", "providers", host.key];

  useEffect(() => {
    if (!host.api) return;
    return host.api.providers.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: key });
    });
  }, [host.api, host.key, queryClient]);

  return useQuery({
    queryKey: key,
    enabled: !!host.api,
    staleTime: 60_000,
    queryFn: async () => {
      if (!host.api) return [];
      const snapshot = await host.api.providers.snapshot();
      return (snapshot?.entries ?? []).filter((entry) => entry.enabled);
    },
  });
}

export function useAgentProfiles(host: BotHost) {
  return useQuery({
    queryKey: ["paseo-bots", "profiles", host.key],
    enabled: !!host.api,
    staleTime: 60_000,
    queryFn: async () => (await host.api!.config.get()).config.agentProfiles ?? [],
  });
}

export interface HostProjectOption {
  id: string;
  label: string;
  directory: string;
}

function isManagedBotsDirectory(projectRootPath: string): boolean {
  const normalized = projectRootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return (
    normalized.endsWith("/paseo-bots/shared/Bots") ||
    normalized.endsWith("/paseo-bots/shared/Teams") ||
    normalized.includes("/paseo-bots/shared/Teams/")
  );
}

export function mapHostProjects(
  projects: Awaited<ReturnType<PaseoApi["projects"]["list"]>>["projects"],
): HostProjectOption[] {
  const seen = new Set<string>();
  const mapped: HostProjectOption[] = [];
  for (const project of projects) {
    if (!project.projectRootPath || isManagedBotsDirectory(project.projectRootPath)) continue;
    if (seen.has(project.projectRootPath)) continue;
    seen.add(project.projectRootPath);
    mapped.push({
      id: project.projectId,
      label: project.projectCustomName?.trim() || project.projectDisplayName || project.projectRootPath,
      directory: project.projectRootPath,
    });
  }
  return mapped;
}

export function useHostProjects(host: BotHost) {
  return useQuery({
    queryKey: ["paseo-bots", "projects", host.key],
    enabled: !!host.api,
    staleTime: 30_000,
    queryFn: async () => {
      const result = await host.api!.projects.list();
      return mapHostProjects(result.projects);
    },
  });
}

export function useHostWorkspaces(host: BotHost) {
  return useQuery({
    queryKey: ["paseo-bots", "workspaces", host.key],
    enabled: !!host.api,
    staleTime: 30_000,
    queryFn: async () => {
      const result = await host.api!.workspaces.list();
      return result.entries.map((workspace) => ({
        id: workspace.id,
        label: workspace.title || `${workspace.projectDisplayName} · ${workspace.name}`,
        directory: workspace.workspaceDirectory ?? workspace.projectRootPath,
      }));
    },
  });
}

export function useBotChats(host: BotHost, botId: string) {
  return useQuery({
    queryKey: ["paseo-bots", "chats", host.key, botId],
    enabled: !!host.api,
    // The local host pushes agent updates (useChatInvalidation); other hosts are polled.
    refetchInterval: host.isLocal ? false : 15_000,
    queryFn: ({ signal }): Promise<PaseoAgent[]> => listBotChats(host.api!, botId, signal),
  });
}

export interface BotChatItem {
  bot: Bot;
  chat: PaseoAgent;
}

/** Fetches active (non-archived) chats across a list of bots using shared per-bot query keys. */
export function useBotsChats(bots: readonly Bot[], local: LocalHost): { items: BotChatItem[]; isLoading: boolean } {
  const localApi = usePaseo();
  const hosts = useHosts();
  const resolved = useMemo(
    () => bots.map((bot) => ({ bot, host: resolveHost(bot.hostId, local, localApi, hosts) })),
    [bots, local.id, local.label, localApi, hosts],
  );
  const results = useQueries({
    queries: resolved.map(({ bot, host }) => ({
      queryKey: ["paseo-bots", "chats", host.key, bot.id],
      enabled: !!host.api,
      refetchInterval: host.isLocal ? false : (15_000 as const),
      queryFn: async (): Promise<PaseoAgent[]> => {
        const result = await host.api!.agents.list({ filter: { labels: { [BOT_LABEL]: bot.id } } });
        return result.entries
          .map((entry) => entry.agent)
          .filter((agent) => !agent.archivedAt)
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      },
    })),
  });

  const isLoading = results.some((r, idx) => Boolean(resolved[idx]?.host.api) && r.isLoading);
  const items = useMemo(() => {
    const all: BotChatItem[] = [];
    for (let i = 0; i < resolved.length; i++) {
      const bot = resolved[i]!.bot;
      const entries = results[i]?.data ?? [];
      for (const chat of entries) {
        all.push({ bot, chat });
      }
    }
    all.sort((a, b) => Date.parse(b.chat.updatedAt) - Date.parse(a.chat.updatedAt));
    return all;
  }, [resolved, results]);

  return { items, isLoading };
}

/** Refetches chat lists shortly after any agent update, so chats routines start show up too. */
export function useChatInvalidation() {
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let subscription: { release(): Promise<void> } | null = null;
    const unsubscribe = paseo.agents.subscribe(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: ["paseo-bots", "chats"] });
      }, 500);
    });
    // The daemon only sends agent updates to sessions that subscribed through a list request.
    void paseo.agents
      .list({ filter: { includeBackground: true }, page: { limit: 1 }, subscribe: {} })
      .then((result) => {
        if (closed) void result.subscription.release();
        else subscription = result.subscription;
      })
      .catch(() => {});
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      void subscription?.release();
    };
  }, [paseo, queryClient]);
}

/** The host's Paseo-tools settings for a provider, and a way to turn them on. */
export function usePaseoTools(host: BotHost, provider: string) {
  const queryClient = useQueryClient();
  const key = ["paseo-bots", "paseo-tools", host.key];
  const config = useQuery({
    queryKey: key,
    enabled: !!host.api,
    staleTime: 30_000,
    queryFn: async () => (await host.api!.config.get()).config as PaseoToolsConfig,
  });
  const state = config.data ? paseoToolsState(config.data, provider) : null;
  const turnOn = async () => {
    if (!host.api || !state || state.on) return;
    await host.api.config.patch(state.reason === "provider" ? { providers: { [provider]: { paseoTools: { enabled: true } } } } : { mcp: { injectIntoAgents: true } });
    await queryClient.invalidateQueries({ queryKey: key });
  };
  return { state, loading: config.isLoading, turnOn };
}
