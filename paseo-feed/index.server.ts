/**
 * Purpose: Paseo server plugin entrypoint registering Feed RPCs, subscriptions, and lifecycle hooks.
 * Context: Bridges Paseo daemon turn/archive events, pointer pagination, on-demand hydration, and client queries.
 * Usage: Exported default function contribute(server) invoked by Paseo plugin host.
 * Prerequisites: ./shared/protocol.ts and ./server/* modules.
 */

import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { FeedHydrator } from "./server/hydrator.ts";
import { migrateLegacyChannelsToIndex, readChannelPointers } from "./server/store.ts";
import {
  handleArchiveAfter,
  handleTurnAfter,
  listChannelsWithStats,
  sendToFeedChannel,
  syncChannelFromPaseo,
} from "./server/sync.ts";
import {
  feedChannelsRpc,
  feedEntriesRpc,
  feedSendRpc,
  feedSyncRpc,
  feedUpdatesSub,
  type ChannelKind,
  type FeedUpdateEvent,
} from "./shared/protocol.ts";

interface FeedSubscriber {
  channelKind?: ChannelKind;
  channelId?: string;
  push: (event: FeedUpdateEvent) => Promise<void>;
  signal: AbortSignal;
}

function matchesFilter(sub: FeedSubscriber, event: FeedUpdateEvent): boolean {
  if (event.kind === "agent_archived") return true;
  if (event.kind === "synced" && !event.channelKind && !event.channelId) return true;
  if (sub.channelKind && event.channelKind && sub.channelKind !== event.channelKind) return false;
  if (sub.channelId && event.channelId && sub.channelId !== event.channelId) return false;
  return true;
}

export default function contribute(server: PluginServerContext): PluginCleanup {
  try {
    migrateLegacyChannelsToIndex();
  } catch (err) {
    console.warn("[paseo-feed] Failed to migrate legacy channels to index.jsonl:", err);
  }

  const subscribers = new Set<FeedSubscriber>();
  const hydrator = new FeedHydrator();

  const broadcast = (event: FeedUpdateEvent): void => {
    for (const sub of subscribers) {
      if (sub.signal.aborted) {
        subscribers.delete(sub);
        continue;
      }
      if (!matchesFilter(sub, event)) continue;
      void sub.push(event).catch(() => {});
    }
  };

  server.handle(feedChannelsRpc, async (input, context) => {
    const channels = await listChannelsWithStats(context.paseo, {
      includeArchived: input.includeArchived,
    });
    return { channels };
  });

  server.handle(feedEntriesRpc, async (input, context) => {
    let syncedAgents = 0;
    if (input.sync) {
      const synced = await syncChannelFromPaseo(
        context.paseo,
        input.channelKind,
        input.channelId,
        15,
        { hydrator },
      );
      syncedAgents = synced.syncedAgents;
      broadcast({
        kind: "synced",
        channelKind: input.channelKind,
        channelId: input.channelId,
      });
    }

    const page = readChannelPointers(input.channelKind, input.channelId, {
      limit: input.limit,
      beforeCursor: input.beforeCursor,
      humanOnly: input.humanOnly,
    });
    const entries = await hydrator.hydratePointers(
      context.paseo,
      input.channelKind,
      input.channelId,
      page.pointers,
    );
    const channels = await listChannelsWithStats(context.paseo, { includeArchived: true });
    const channel =
      channels.find((item) => item.kind === input.channelKind && item.id === input.channelId) ?? null;

    return {
      channel,
      entries,
      hasOlder: page.hasOlder,
      nextCursor: page.nextCursor,
      totalPointers: page.totalPointers,
      syncedAgents,
    };
  });

  server.handle(feedSyncRpc, async (input, context) => {
    const maxAgents = input.maxAgents ?? 15;
    let syncedAgents = 0;
    let addedEntries = 0;

    if (input.channelKind && input.channelId) {
      const res = await syncChannelFromPaseo(
        context.paseo,
        input.channelKind,
        input.channelId,
        maxAgents,
        { hydrator },
      );
      syncedAgents += res.syncedAgents;
      addedEntries += res.addedEntries;
    } else {
      const channels = await listChannelsWithStats(undefined, { includeArchived: false });
      for (const ch of channels) {
        if (input.channelKind && ch.kind !== input.channelKind) continue;
        const res = await syncChannelFromPaseo(context.paseo, ch.kind, ch.id, maxAgents, {
          hydrator,
        });
        syncedAgents += res.syncedAgents;
        addedEntries += res.addedEntries;
      }
    }

    broadcast({
      kind: "synced",
      ...(input.channelKind ? { channelKind: input.channelKind } : {}),
      ...(input.channelId ? { channelId: input.channelId } : {}),
    });
    return { syncedAgents, addedEntries };
  });

  server.handle(feedSendRpc, async (input, context) => {
    return sendToFeedChannel(context.paseo, input.channelKind, input.channelId, input.text);
  });

  server.handle(feedUpdatesSub, (input, context) => {
    if (context.signal.aborted) return;
    const sub: FeedSubscriber = {
      channelKind: input.channelKind,
      channelId: input.channelId,
      push: context.push,
      signal: context.signal,
    };
    subscribers.add(sub);
    context.signal.addEventListener(
      "abort",
      () => {
        subscribers.delete(sub);
      },
      { once: true },
    );
  });

  const offTurn = server.addHook("agent.turn.after", async (event, context) => {
    await handleTurnAfter(event, context, broadcast, { hydrator });
  });

  const offArchive = server.addHook("agent.archive.after", async (event) => {
    handleArchiveAfter(event, broadcast, { hydrator });
  });

  return () => {
    offTurn();
    offArchive();
    hydrator.clear();
    subscribers.clear();
  };
}
