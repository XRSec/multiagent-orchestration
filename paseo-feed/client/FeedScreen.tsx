/**
 * Purpose: Main responsive screen for continuous Bot DMs and Team conversation feeds.
 * Context: Registered via client.addScreen({ id: "feed", ... }) in index.client.tsx.
 * Usage: Supports desktop split rail+stream, virtualized cursor lazy-loading, and mobile drill-down.
 */

import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc, useSubscription } from "@getpaseo/plugin/client";
import { FlatList, Icon, Loading, useToast } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type FlatList as NativeFlatList,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import {
  feedChannelsRpc,
  feedEntriesRpc,
  feedSendRpc,
  feedSyncRpc,
  feedUpdatesSub,
  type ChannelKind,
  type FeedChannel,
  type FeedEntry,
  type FeedUpdateEvent,
} from "../shared/protocol.ts";
import { ChannelList } from "./ChannelList.tsx";
import { FeedComposer } from "./FeedComposer.tsx";
import { FeedMessageCard } from "./FeedMessageCard.tsx";
import {
  createInitialPaginationState,
  filterFeedEntries,
  isEntryAppendedAtBottom,
  markAgentArchived,
  mergeFeedEntry,
  prependOlderEntries,
  resolveInitialChannel,
  resolvePaginationFromPage,
  resolveHeaderChatAgentId,
  resolveTaskJumpTarget,
  shouldTriggerLoadOlder,
  type FeedPaginationState,
} from "./feed-helpers.ts";
import { createFeedPalette, FEED_STREAM_MAX_WIDTH, type FeedPalette } from "./styles.ts";

const PAGE_SIZE = 20;
const LOAD_OLDER_SCROLL_THRESHOLD = 60;

interface SelectedChannelRef {
  kind: ChannelKind;
  id: string;
}

interface FeedEntriesRequest {
  channelKind: ChannelKind;
  channelId: string;
  limit?: number;
  beforeCursor?: string;
  humanOnly?: boolean;
  sync?: boolean;
}

interface FeedEntriesResponse {
  channel: FeedChannel | null;
  entries: FeedEntry[];
  hasOlder?: boolean;
  nextCursor?: string | null;
  totalPointers?: number;
  syncedAgents: number;
}

function StreamHeader({
  channel, compact, humanOnly, syncing, countLabel, chatAgentId, palette,
  onBack, onToggleHumanOnly, onSync, onOpenChat,
}: {
  channel: FeedChannel | null;
  compact: boolean;
  humanOnly: boolean;
  syncing: boolean;
  countLabel: string;
  chatAgentId: string | null;
  palette: FeedPalette;
  onBack(): void;
  onToggleHumanOnly(): void;
  onSync(): void;
  onOpenChat(agentId: string): void;
}) {
  const pill = {
    flexDirection: "row" as const, alignItems: "center" as const, gap: 5,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
  };
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.railBg,
    }}>
      {compact ? (
        <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => ({
          padding: 6, borderRadius: 8, backgroundColor: pressed ? palette.pillMutedBg : "transparent",
        })}>
          <Icon name="ArrowLeft" size={16} color={palette.fg} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: "700", color: palette.fg }}>
            {channel ? channel.name : "Feed (助理)"}
          </Text>
          {channel ? (
            <View style={{ backgroundColor: palette.pillMutedBg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: palette.fgMuted }}>{countLabel}</Text>
            </View>
          ) : null}
        </View>
        {channel?.subtitle ? (
          <Text numberOfLines={1} style={{ fontSize: 11.5, color: palette.fgMuted }}>{channel.subtitle}</Text>
        ) : null}
      </View>
      {chatAgentId ? (
        <Pressable onPress={() => onOpenChat(chatAgentId)} style={({ pressed }) => ({
          ...pill,
          backgroundColor: palette.accentSoftBg,
          borderColor: palette.accentBorder,
          opacity: pressed ? 0.8 : 1,
        })}>
          <Icon name="MessageSquare" size={12} color={palette.accentBg} />
          <Text style={{ fontSize: 11.5, fontWeight: "600", color: palette.accentBg }}>
            打开会话 ↗
          </Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onToggleHumanOnly} style={({ pressed }) => ({
        ...pill,
        backgroundColor: humanOnly ? palette.accentSoftBg : palette.pillMutedBg,
        borderColor: humanOnly ? palette.accentBorder : palette.borderSubtle,
        opacity: pressed ? 0.8 : 1,
      })}>
        <Icon name="Filter" size={12} color={humanOnly ? palette.accentBg : palette.fgMuted} />
        <Text style={{ fontSize: 11.5, fontWeight: "600", color: humanOnly ? palette.accentBg : palette.fgMuted }}>
          仅人工指令
        </Text>
      </Pressable>
      <Pressable disabled={syncing || !channel} onPress={onSync} style={({ pressed }) => ({
        ...pill, backgroundColor: palette.pillMutedBg, borderColor: palette.borderSubtle,
        opacity: syncing || !channel ? 0.5 : pressed ? 0.8 : 1,
      })}>
        <Icon name="RefreshCw" size={12} color={palette.fg} />
        <Text style={{ fontSize: 11.5, fontWeight: "600", color: palette.fg }}>{syncing ? "同步中…" : "同步历史"}</Text>
      </Pressable>
    </View>
  );
}

function StreamListHeader({
  hasOlder, loadingOlder, hasEntries, palette, onLoadOlder,
}: {
  hasOlder: boolean; loadingOlder: boolean; hasEntries: boolean; palette: FeedPalette; onLoadOlder(): void;
}) {
  if (hasOlder) {
    return (
      <View style={{ alignItems: "center", paddingBottom: 12 }}>
        <Pressable disabled={loadingOlder} onPress={onLoadOlder} style={({ pressed }) => ({
          flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.pillMutedBg,
          borderWidth: 1, borderColor: palette.borderSubtle, borderRadius: 16,
          paddingHorizontal: 12, paddingVertical: 6, opacity: loadingOlder ? 0.75 : pressed ? 0.8 : 1,
        })}>
          {loadingOlder ? <ActivityIndicator size="small" color={palette.accentBg} /> : <Icon name="ChevronUp" size={13} color={palette.accentBg} />}
          <Text style={{ fontSize: 12, fontWeight: "600", color: palette.accentBg }}>
            {loadingOlder ? "正在加载更早历史…" : "加载更早历史"}
          </Text>
        </Pressable>
      </View>
    );
  }
  if (!hasEntries) return null;
  return (
    <View style={{ alignItems: "center", paddingVertical: 10 }}>
      <Text style={{ fontSize: 11.5, color: palette.fgMuted }}>已显示全部历史</Text>
    </View>
  );
}

function StreamEmptyState({
  activeChannel, humanOnly, palette,
}: { activeChannel: FeedChannel | null; humanOnly: boolean; palette: FeedPalette }) {
  const title = activeChannel ? (humanOnly ? "暂无符合“仅人工指令”的消息" : "暂无消息流记录") : "请选择左侧频道";
  const hint = activeChannel ? "点击右上角“同步历史”抓取历史会话，或在下方发送指令" : "从左侧选择伙伴私聊或团队群聊开始阅读";
  return (
    <View style={{ paddingVertical: 48, alignItems: "center", gap: 6 }}>
      <Icon name="MessageSquareText" size={28} color={palette.fgMuted} />
      <Text style={{ fontSize: 14, fontWeight: "600", color: palette.fg }}>{title}</Text>
      <Text style={{ fontSize: 12.5, color: palette.fgMuted }}>{hint}</Text>
    </View>
  );
}

/** Responsive split-view Feed screen with virtualized FlatList lazy-loading and live sync. */
export function FeedScreen({ theme, host, layout, navigation, params }: PluginScreenProps) {
  const palette = useMemo(() => createFeedPalette(theme.colors), [theme.colors]);
  const toast = useToast();

  const callChannels = useRpc(feedChannelsRpc);
  const callEntries = useRpc(feedEntriesRpc);
  const callSync = useRpc(feedSyncRpc);
  const callSend = useRpc(feedSendRpc);
  const rpcRef = useRef({ callChannels, callEntries, callSync, callSend });
  rpcRef.current = { callChannels, callEntries, callSync, callSend };

  const [channels, setChannels] = useState<FeedChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [selected, setSelected] = useState<SelectedChannelRef | null>(
    params.channelId && (params.channelKind === "bot" || params.channelKind === "team")
      ? { kind: params.channelKind, id: params.channelId }
      : null,
  );
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [pagination, setPagination] = useState<FeedPaginationState>(createInitialPaginationState);
  const [humanOnly, setHumanOnly] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"channels" | "stream">(params.channelId ? "stream" : "channels");

  const listRef = useRef<NativeFlatList<FeedEntry> | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const paginationRef = useRef(pagination);
  paginationRef.current = pagination;
  const humanOnlyRef = useRef(humanOnly);
  humanOnlyRef.current = humanOnly;
  const channelSeqRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const autoSyncedChannelsRef = useRef<Set<string>>(new Set());
  const ignoreTopScrollUntilRef = useRef(0);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchEntriesPage = useCallback((req: FeedEntriesRequest) => {
    const fn = rpcRef.current.callEntries as unknown as (input: FeedEntriesRequest) => Promise<FeedEntriesResponse>;
    return fn(req);
  }, []);

  const requestScrollToEnd = useCallback((animated: boolean) => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    ignoreTopScrollUntilRef.current = Date.now() + 600;
    scrollTimerRef.current = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated });
    }, 60);
  }, []);

  useEffect(() => () => { if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current); }, []);

  const loadChannels = useCallback(async () => {
    try {
      const res = await rpcRef.current.callChannels({ includeArchived: false });
      setChannels(res.channels);
      setSelected((prev) => {
        if (prev && res.channels.some((c) => c.kind === prev.kind && c.id === prev.id)) return prev;
        const initial = resolveInitialChannel(res.channels, params);
        return initial ? { kind: initial.kind, id: initial.id } : null;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载频道列表失败");
    } finally {
      setLoadingChannels(false);
    }
  }, [params, toast]);

  useEffect(() => {
    autoSyncedChannelsRef.current.clear();
    setLoadingChannels(true);
    void loadChannels();
  }, [host.id, loadChannels]);

  useEffect(() => {
    if (!params.channelId) return;
    const match = resolveInitialChannel(channels, params);
    if (match) {
      setSelected({ kind: match.kind, id: match.id });
      setMobileView("stream");
    } else if (params.channelKind === "bot" || params.channelKind === "team") {
      setSelected({ kind: params.channelKind, id: params.channelId });
      setMobileView("stream");
    }
  }, [channels, params.channelId, params.channelKind]);

  const loadEntries = useCallback(
    async (target: SelectedChannelRef, withSync = false, background = false) => {
      const seq = background ? channelSeqRef.current : ++channelSeqRef.current;
      if (!background) {
        loadingOlderRef.current = false;
        setPagination(createInitialPaginationState());
        setLoadingEntries(true);
      }
      try {
        const res = await fetchEntriesPage({
          channelKind: target.kind,
          channelId: target.id,
          limit: PAGE_SIZE,
          humanOnly: humanOnlyRef.current,
          sync: withSync,
        });
        const cur = selectedRef.current;
        if (channelSeqRef.current !== seq || !cur || cur.kind !== target.kind || cur.id !== target.id) return;
        setEntries(res.entries);
        setPagination(resolvePaginationFromPage(res));
        if (res.entries.length > 0) requestScrollToEnd(false);
        if (background && (res.syncedAgents > 0 || res.entries.length > 0)) void loadChannels();
        const total = typeof res.totalPointers === "number" ? res.totalPointers : res.entries.length;
        const chKey = `${target.kind}:${target.id}`;
        if (total === 0 && !withSync && !autoSyncedChannelsRef.current.has(chKey)) {
          autoSyncedChannelsRef.current.add(chKey);
          void loadEntries(target, true, true);
        }
      } catch (error) {
        if (!background) toast.error(error instanceof Error ? error.message : "加载消息流失败");
      } finally {
        if (!background && channelSeqRef.current === seq) setLoadingEntries(false);
      }
    },
    [fetchEntriesPage, loadChannels, requestScrollToEnd, toast],
  );

  useEffect(() => {
    setCreatedAgentId(null);
    if (!selected) {
      channelSeqRef.current += 1;
      setEntries([]);
      setPagination(createInitialPaginationState());
      return;
    }
    setEntries([]);
    void loadEntries(selected, false, false);
  }, [selected?.kind, selected?.id, humanOnly, loadEntries]);

  const loadOlder = useCallback(async () => {
    const target = selectedRef.current;
    const page = paginationRef.current;
    if (!target || !page.hasOlder || !page.nextCursor || loadingOlderRef.current) return;
    const seq = channelSeqRef.current;
    loadingOlderRef.current = true;
    setPagination((prev) => ({ ...prev, loadingOlder: true }));
    try {
      const res = await fetchEntriesPage({
        channelKind: target.kind,
        channelId: target.id,
        limit: PAGE_SIZE,
        beforeCursor: page.nextCursor,
        humanOnly: humanOnlyRef.current,
      });
      if (channelSeqRef.current !== seq) return;
      ignoreTopScrollUntilRef.current = Date.now() + 400;
      setEntries((prev) => prependOlderEntries(prev, res.entries));
      setPagination((prev) => resolvePaginationFromPage(res, prev.totalPointers));
    } catch (error) {
      if (channelSeqRef.current === seq) {
        toast.error(error instanceof Error ? error.message : "加载更早历史失败");
        setPagination((prev) => ({ ...prev, loadingOlder: false }));
      }
    } finally {
      loadingOlderRef.current = false;
    }
  }, [fetchEntriesPage, toast]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Date.now() < ignoreTopScrollUntilRef.current) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height <= layoutMeasurement.height) return;
    if (shouldTriggerLoadOlder(paginationRef.current, contentOffset.y, LOAD_OLDER_SCROLL_THRESHOLD)) {
      void loadOlder();
    }
  }, [loadOlder]);

  const emptySubInput = useMemo(() => ({}), []);
  const handleUpdateEvent = useCallback((event: FeedUpdateEvent) => {
    const current = selectedRef.current;
    if (
      event.kind === "entry_added" && event.entry && current &&
      event.entry.channelKind === current.kind && event.entry.channelId === current.id
    ) {
      const next = mergeFeedEntry(entriesRef.current, event.entry);
      const appended = isEntryAppendedAtBottom(entriesRef.current, next, event.entry.id);
      setEntries(next);
      if (appended) {
        setPagination((prev) => ({ ...prev, totalPointers: Math.max(prev.totalPointers + 1, next.length) }));
        requestScrollToEnd(true);
      }
    } else if (event.kind === "agent_archived" && event.agentId) {
      setEntries((prev) => markAgentArchived(prev, event.agentId!));
    } else if (
      event.kind === "synced" && current && !loadingOlderRef.current &&
      (!event.channelId || (event.channelKind === current.kind && event.channelId === current.id))
    ) {
      void loadEntries(current, false, true);
    }
    void loadChannels();
  }, [loadChannels, loadEntries, requestScrollToEnd]);
  useSubscription(feedUpdatesSub, emptySubInput, handleUpdateEvent);

  const visibleEntries = useMemo(() => filterFeedEntries(entries, humanOnly), [entries, humanOnly]);
  const activeChannel = useMemo(
    () => (selected ? (channels.find((ch) => ch.kind === selected.kind && ch.id === selected.id) ?? null) : null),
    [channels, selected],
  );
  const headerChatAgentId = useMemo(
    () => resolveHeaderChatAgentId(activeChannel, entries, createdAgentId),
    [activeChannel, entries, createdAgentId],
  );

  const openAgentById = useCallback((agentId: string) => {
    const target = resolveTaskJumpTarget({ agentId }, host.id);
    const nav = navigation as
      | (NonNullable<PluginScreenProps["navigation"]> & {
          openChat?: (id: string) => void;
          navigate?: (input: { agentId: string; serverId?: string }) => void;
        })
      | undefined;
    if (nav?.openAgent) {
      nav.openAgent(target);
      return;
    }
    if (nav?.openChat) {
      nav.openChat(agentId);
      return;
    }
    if (nav?.navigate) {
      nav.navigate(target);
      return;
    }
    toast.show("当前宿主版本不支持直接跳转到任务会话", { variant: "warning" });
  }, [host.id, navigation, toast]);

  const handleSync = useCallback(async () => {
    if (!selected || syncing) return;
    setSyncing(true);
    try {
      const res = await rpcRef.current.callSync({ channelKind: selected.kind, channelId: selected.id });
      await Promise.all([loadEntries(selected, false, false), loadChannels()]);
      toast.show(`已同步 ${res.syncedAgents} 个会话，新增 ${res.addedEntries} 条消息`, { variant: "success" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "同步历史失败");
    } finally {
      setSyncing(false);
    }
  }, [loadChannels, loadEntries, selected, syncing, toast]);

  const renderEntry = useCallback<ListRenderItem<FeedEntry>>(
    ({ item }) => <FeedMessageCard entry={item} palette={palette} onOpenTask={(entry) => openAgentById(entry.agentId)} />,
    [openAgentById, palette],
  );

  const countLabel =
    pagination.hasOlder && pagination.totalPointers > visibleEntries.length && !humanOnly
      ? `${visibleEntries.length}/${pagination.totalPointers} 条`
      : `${visibleEntries.length} 条`;
  const showRail = !layout.compact || mobileView === "channels";
  const showStream = !layout.compact || mobileView === "stream";

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: palette.canvasBg }}>
      {showRail ? (
        <ChannelList
          channels={channels}
          selectedKind={selected?.kind ?? null}
          selectedId={selected?.id ?? null}
          loading={loadingChannels}
          compact={layout.compact}
          palette={palette}
          onSelect={(ch) => { setSelected({ kind: ch.kind, id: ch.id }); setMobileView("stream"); }}
        />
      ) : null}
      {showStream ? (
        <View style={{ flex: 1, minWidth: 0, backgroundColor: palette.canvasBg }}>
          <StreamHeader
            channel={activeChannel}
            compact={layout.compact}
            humanOnly={humanOnly}
            syncing={syncing}
            countLabel={countLabel}
            chatAgentId={headerChatAgentId}
            palette={palette}
            onBack={() => setMobileView("channels")}
            onToggleHumanOnly={() => setHumanOnly((prev) => !prev)}
            onSync={() => void handleSync()}
            onOpenChat={openAgentById}
          />
          {loadingEntries && visibleEntries.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Loading /></View>
          ) : (
            <FlatList
              ref={listRef}
              data={visibleEntries}
              keyExtractor={(item) => item.id}
              renderItem={renderEntry}
              onScroll={handleScroll}
              scrollEventThrottle={100}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={7}
              ListHeaderComponent={
                <StreamListHeader
                  hasOlder={pagination.hasOlder}
                  loadingOlder={pagination.loadingOlder}
                  hasEntries={visibleEntries.length > 0}
                  palette={palette}
                  onLoadOlder={() => void loadOlder()}
                />
              }
              ListEmptyComponent={
                <StreamEmptyState activeChannel={activeChannel} humanOnly={humanOnly} palette={palette} />
              }
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 16, paddingVertical: 16, width: "100%",
                maxWidth: FEED_STREAM_MAX_WIDTH, alignSelf: "center",
              }}
            />
          )}
          <FeedComposer
            channel={activeChannel}
            palette={palette}
            onSend={async (text) => {
              if (!activeChannel) return { ok: false, agentId: null, reason: "channel_not_found" };
              return rpcRef.current.callSend({ channelKind: activeChannel.kind, channelId: activeChannel.id, text });
            }}
            onOpenAgent={openAgentById}
            onSent={(res) => {
              if (res.reason === "created") {
                if (res.agentId) setCreatedAgentId(res.agentId);
                if (activeChannel) {
                  void loadChannels();
                  void loadEntries({ kind: activeChannel.kind, id: activeChannel.id }, true, true);
                }
              }
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
