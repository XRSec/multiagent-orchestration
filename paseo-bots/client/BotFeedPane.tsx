/**
 * Purpose: Continuous Feed UI pane for viewing distilled bot/team timelines, cursor lazy-loading, and jumping to source tasks.
 * Context: Rendered in the right pane (or slide-over on compact screens) of BotsSurfaceReady.
 * Usage: <BotFeedPane colors={colors} channelKind="bot" channelId={bot.id} ... />
 * Budget Justification: ~680 lines consolidating feed header, cursor pagination, entry card, Markdown rendering, and quick composer.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import type { Bot } from "../shared/bot";
import { compareFeedChronological, type BotFeedChannelKind, type BotFeedEntry } from "../shared/feed-view";
import { botFeedReadRpc } from "../shared/rpc";
import { Avatar } from "./Avatar";
import { formatPluralCount, formatRelativeTime, useT } from "./i18n";
import { isImeComposing } from "./keyboard";
import { Markdown } from "./Markdown";
import { CONTENT_MAX_WIDTH, errorText, nativeTokens, withAlpha } from "./native";
import { ui } from "./typography";
import { tooltip } from "./ui/Tooltip";

const FEED_PAGE_SIZE = 20;
const POST_SEND_REFRESH_DELAYS_MS = [2500, 6500] as const;

type Colors = PluginTheme["colors"];

export interface BotFeedPaneProps {
  colors: Colors;
  channelKind: BotFeedChannelKind;
  channelId: string;
  channelName: string;
  subtitle?: string;
  leading?: ReactNode;
  bots?: readonly Bot[];
  compact: boolean;
  bottomInset: number;
  onOpenTask(agentId: string, botId: string): void;
  onSendMessage(text: string): Promise<void> | void;
  onBack(): void;
  onOpenActiveChat?(): void;
  onOpenWorkflows?(): void;
  onOpenTeam?(): void;
}

export function BotFeedPane({
  colors,
  channelKind,
  channelId,
  channelName,
  subtitle,
  leading,
  bots = [],
  compact,
  bottomInset,
  onOpenTask,
  onSendMessage,
  onBack,
  onOpenActiveChat,
  onOpenWorkflows,
  onOpenTeam,
}: BotFeedPaneProps) {
  const { t } = useT();
  const tokens = nativeTokens(colors);
  const readFeed = useRpc(botFeedReadRpc);

  const [humanOnly, setHumanOnly] = useState(false);
  const [entries, setEntries] = useState<BotFeedEntry[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalPointers, setTotalPointers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollRef = useRef<{
    scrollToEnd?: (options?: { animated?: boolean }) => void;
    scrollTo?: (options: { y: number; animated?: boolean }) => void;
  } | null>(null);
  const requestEpoch = useRef(0);
  const scrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  const shouldScrollToBottomRef = useRef(true);
  const lastBottomIdRef = useRef<string | null>(null);
  const pendingPrependAnchorRef = useRef<{ prevContentHeight: number; prevScrollY: number } | null>(null);
  const postSendTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearPostSendTimers = useCallback(() => {
    for (const timer of postSendTimersRef.current) {
      clearTimeout(timer);
    }
    postSendTimersRef.current = [];
  }, []);

  useEffect(() => {
    clearPostSendTimers();
    return clearPostSendTimers;
  }, [channelKind, channelId, humanOnly, clearPostSendTimers]);

  const loadFeed = useCallback(
    async (isRefresh = false, forceScrollBottom = false) => {
      const epoch = ++requestEpoch.current;
      if (isRefresh) setRefreshing(true);
      else {
        setLoading(true);
        shouldScrollToBottomRef.current = true;
      }
      setLoadError(null);
      try {
        const res = await readFeed({ channelKind, channelId, limit: FEED_PAGE_SIZE, humanOnly });
        if (epoch !== requestEpoch.current) return;
        const nextEntries = res.entries ?? [];
        const nextBottomId = nextEntries.length > 0 ? nextEntries[nextEntries.length - 1]!.id : null;
        if (!isRefresh || forceScrollBottom || (nextBottomId && nextBottomId !== lastBottomIdRef.current)) {
          shouldScrollToBottomRef.current = true;
        }
        lastBottomIdRef.current = nextBottomId;
        pendingPrependAnchorRef.current = null;
        setEntries(nextEntries);
        setHasOlder(Boolean(res.hasOlder));
        setNextCursor(res.nextCursor ?? null);
        setTotalPointers(typeof res.totalPointers === "number" ? res.totalPointers : nextEntries.length);
      } catch (err) {
        if (epoch !== requestEpoch.current) return;
        setLoadError(errorText(err));
      } finally {
        if (epoch === requestEpoch.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [readFeed, channelKind, channelId, humanOnly],
  );

  useEffect(() => {
    lastBottomIdRef.current = null;
    pendingPrependAnchorRef.current = null;
    scrollOffsetRef.current = 0;
    contentHeightRef.current = 0;
    setHasOlder(false);
    setNextCursor(null);
    setTotalPointers(0);
    setLoadingOlder(false);
    void loadFeed(false);
  }, [loadFeed]);

  const lastEntryId = entries.length > 0 ? entries[entries.length - 1]!.id : null;
  useEffect(() => {
    if (!lastEntryId || !shouldScrollToBottomRef.current) return;
    shouldScrollToBottomRef.current = false;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd?.({ animated: false });
    }, 30);
    return () => clearTimeout(timer);
  }, [lastEntryId, channelKind, channelId]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasOlder || !nextCursor) return;
    const epoch = requestEpoch.current;
    setLoadingOlder(true);
    try {
      const res = await readFeed({
        channelKind,
        channelId,
        limit: FEED_PAGE_SIZE,
        beforeCursor: nextCursor,
        humanOnly,
      });
      if (epoch !== requestEpoch.current) return;
      const olderEntries = res.entries ?? [];
      shouldScrollToBottomRef.current = false;
      pendingPrependAnchorRef.current = {
        prevContentHeight: contentHeightRef.current,
        prevScrollY: scrollOffsetRef.current,
      };
      setEntries((prev) => {
        const merged = new Map<string, BotFeedEntry>();
        for (const item of olderEntries) merged.set(item.id, item);
        for (const item of prev) merged.set(item.id, item);
        return [...merged.values()].sort(compareFeedChronological);
      });
      setHasOlder(Boolean(res.hasOlder));
      setNextCursor(res.nextCursor ?? null);
      if (typeof res.totalPointers === "number") {
        setTotalPointers(res.totalPointers);
      }
    } catch (err) {
      if (epoch === requestEpoch.current) {
        setLoadError(errorText(err));
      }
    } finally {
      if (epoch === requestEpoch.current) {
        setLoadingOlder(false);
      }
    }
  }, [loadingOlder, hasOlder, nextCursor, readFeed, channelKind, channelId, humanOnly]);

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await onSendMessage(trimmed);
      setDraft("");
      void loadFeed(true, true);
      clearPostSendTimers();
      for (const delayMs of POST_SEND_REFRESH_DELAYS_MS) {
        const timer = setTimeout(() => {
          postSendTimersRef.current = postSendTimersRef.current.filter((item) => item !== timer);
          void loadFeed(true, false);
        }, delayMs);
        postSendTimersRef.current.push(timer);
      }
    } catch (err) {
      setSendError(errorText(err));
    } finally {
      setSending(false);
    }
  }, [draft, sending, onSendMessage, loadFeed, clearPostSendTimers]);

  const botById = new Map(bots.map((bot) => [bot.id, bot]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      <FeedHeader
        colors={colors}
        tokens={tokens}
        compact={compact}
        channelName={channelName}
        subtitle={subtitle}
        leading={leading}
        humanOnly={humanOnly}
        refreshing={refreshing}
        onToggleHumanOnly={() => setHumanOnly((prev) => !prev)}
        onRefresh={() => void loadFeed(true)}
        onBack={onBack}
        onOpenActiveChat={onOpenActiveChat}
        onOpenWorkflows={onOpenWorkflows}
        onOpenTeam={onOpenTeam}
      />

      <ScrollView
        ref={scrollRef as never}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={(_w, nextHeight) => {
          const anchor = pendingPrependAnchorRef.current;
          if (anchor) {
            pendingPrependAnchorRef.current = null;
            if (nextHeight > anchor.prevContentHeight) {
              const delta = nextHeight - anchor.prevContentHeight;
              scrollRef.current?.scrollTo?.({ y: anchor.prevScrollY + delta, animated: false });
            }
          }
          contentHeightRef.current = nextHeight;
        }}
        contentContainerStyle={{
          paddingHorizontal: compact ? 14 : 24,
          paddingVertical: 16,
          alignItems: "center",
          flexGrow: 1,
        }}
      >
        <View style={{ width: "100%", maxWidth: CONTENT_MAX_WIDTH, gap: 16, flex: 1 }}>
          {loading && entries.length === 0 ? (
            <View style={{ paddingVertical: 48, alignItems: "center", gap: 10 }}>
              <ActivityIndicator size="small" color={colors.foregroundMuted} />
              <Text style={{ fontSize: ui(13), color: colors.foregroundMuted }}>{t("feed.loading")}</Text>
            </View>
          ) : loadError && entries.length === 0 ? (
            <View style={{ padding: 20, borderRadius: 12, borderWidth: 1, borderColor: colors.statusDanger, backgroundColor: colors.surface1, gap: 10, alignItems: "center" }}>
              <Text style={{ fontSize: ui(13), color: colors.statusDanger, textAlign: "center" }}>
                {t("feed.loadFailed", { error: loadError })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("feed.retry")}
                onPress={() => void loadFeed(false)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.surface2 }}
              >
                <Text style={{ fontSize: ui(13), fontWeight: "500", color: colors.foreground }}>{t("feed.retry")}</Text>
              </Pressable>
            </View>
          ) : entries.length === 0 ? (
            <View style={{ paddingVertical: 48, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1, alignItems: "center", gap: 8 }}>
              <Icon name="MessageSquareText" size={22} color={colors.foregroundMuted} />
              <Text style={{ fontSize: ui(14), fontWeight: "600", color: colors.foreground }}>{t("feed.emptyTitle")}</Text>
              <Text style={{ fontSize: ui(13), color: colors.foregroundMuted, textAlign: "center", maxWidth: 420 }}>
                {t("feed.emptyDesc")}
              </Text>
            </View>
          ) : (
            <>
              {hasOlder && nextCursor ? (
                <View style={{ alignItems: "center" }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={loadingOlder ? t("feed.loadingOlder") : t("feed.loadOlder")}
                    disabled={loadingOlder}
                    onPress={() => void loadOlder()}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: pressed ? colors.surface2 : colors.surface1,
                      opacity: loadingOlder ? 0.65 : 1,
                    })}
                  >
                    {loadingOlder ? (
                      <ActivityIndicator size="small" color={colors.foregroundMuted} />
                    ) : (
                      <Icon name="ChevronUp" size={14} color={colors.foregroundMuted} />
                    )}
                    <Text style={{ fontSize: ui(12), fontWeight: "500", color: colors.foreground }}>
                      {loadingOlder ? t("feed.loadingOlder") : t("feed.loadOlder")}
                    </Text>
                    {totalPointers > entries.length ? (
                      <Text style={{ fontSize: ui(11), color: colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>
                        {t("feed.showingCount", { shown: entries.length, total: totalPointers })}
                      </Text>
                    ) : null}
                  </Pressable>
                </View>
              ) : null}
              {entries.map((entry) => (
                <FeedEntryCard
                  key={entry.id}
                  colors={colors}
                  tokens={tokens}
                  entry={entry}
                  bot={botById.get(entry.botId)}
                  onOpenTask={() => onOpenTask(entry.agentId, entry.botId)}
                />
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <FeedComposer
        colors={colors}
        tokens={tokens}
        channelName={channelName}
        draft={draft}
        sending={sending}
        sendError={sendError}
        compact={compact}
        bottomInset={bottomInset}
        onChangeDraft={setDraft}
        onSend={() => void handleSend()}
      />
    </View>
  );
}

function HeaderQuickButton({
  colors,
  tokens,
  compact,
  icon,
  label,
  onPress,
}: {
  colors: Colors;
  tokens: ReturnType<typeof nativeTokens>;
  compact: boolean;
  icon: string;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...tooltip(label, "bottom")}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: compact ? 7 : 9,
        paddingVertical: 5,
        borderRadius: 8,
        borderWidth: 0,
        backgroundColor: pressed ? tokens.interactionHighlight : colors.surface1,
      })}
    >
      <Icon name={icon} size={13} color={colors.foregroundMuted} />
      {!compact ? (
        <Text style={{ fontSize: ui(12), fontWeight: "500", color: colors.foregroundMuted }}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

function FeedHeader({
  colors,
  tokens,
  compact,
  channelName,
  subtitle,
  leading,
  humanOnly,
  refreshing,
  onToggleHumanOnly,
  onRefresh,
  onBack,
  onOpenActiveChat,
  onOpenWorkflows,
  onOpenTeam,
}: {
  colors: Colors;
  tokens: ReturnType<typeof nativeTokens>;
  compact: boolean;
  channelName: string;
  subtitle?: string;
  leading?: ReactNode;
  humanOnly: boolean;
  refreshing: boolean;
  onToggleHumanOnly(): void;
  onRefresh(): void;
  onBack(): void;
  onOpenActiveChat?(): void;
  onOpenWorkflows?(): void;
  onOpenTeam?(): void;
}) {
  const { t } = useT();
  const backLabel = t("feed.backToBots");
  const filterLabel = humanOnly ? t("feed.filterHumanOnly") : t("feed.filterAll");
  const refreshLabel = t("feed.refresh");
  const closeLabel = t("feed.close");

  return (
    <View
      style={{
        minHeight: compact ? 56 : 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: compact ? 6 : 12,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface0,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        {...tooltip(backLabel, "bottom")}
        onPress={onBack}
        style={({ pressed }) => ({
          padding: compact ? 10 : 6,
          borderRadius: 8,
          backgroundColor: pressed ? tokens.interactionHighlight : "transparent",
        })}
      >
        <Icon name="ArrowLeft" size={compact ? 20 : 16} color={colors.foregroundMuted} />
      </Pressable>

      {leading ?? <Icon name="MessageSquareText" size={16} color={colors.foregroundMuted} />}

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: ui(14), fontWeight: "600", color: colors.foreground }}>
          {channelName}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ fontSize: ui(11), color: colors.foregroundMuted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {onOpenActiveChat ? (
        <HeaderQuickButton
          colors={colors}
          tokens={tokens}
          compact={compact}
          icon="MessageCircle"
          label={t("feed.openChat")}
          onPress={onOpenActiveChat}
        />
      ) : null}
      {onOpenWorkflows ? (
        <HeaderQuickButton
          colors={colors}
          tokens={tokens}
          compact={compact}
          icon="GitBranch"
          label={t("feed.openWorkflows")}
          onPress={onOpenWorkflows}
        />
      ) : null}
      {onOpenTeam ? (
        <HeaderQuickButton
          colors={colors}
          tokens={tokens}
          compact={compact}
          icon="Users"
          label={t("feed.openTeam")}
          onPress={onOpenTeam}
        />
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={filterLabel}
        onPress={onToggleHumanOnly}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: humanOnly ? colors.accent : colors.border,
          backgroundColor: pressed ? colors.surface2 : humanOnly ? withAlpha(colors.accent, 0.14) : colors.surface1,
        })}
      >
        <Icon name={humanOnly ? "User" : "Layers"} size={13} color={humanOnly ? colors.accent : colors.foregroundMuted} />
        <Text style={{ fontSize: ui(12), fontWeight: "500", color: humanOnly ? colors.foreground : colors.foregroundMuted }}>
          {filterLabel}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={refreshLabel}
        {...tooltip(refreshLabel, "bottom")}
        onPress={onRefresh}
        disabled={refreshing}
        style={({ pressed }) => ({
          width: 30,
          height: 30,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? tokens.interactionHighlight : "transparent",
          opacity: refreshing ? 0.5 : 1,
        })}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.foregroundMuted} />
        ) : (
          <Icon name="RefreshCw" size={15} color={colors.foregroundMuted} />
        )}
      </Pressable>

      {!compact ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          {...tooltip(closeLabel, "bottom")}
          onPress={onBack}
          style={({ pressed }) => ({
            width: 30,
            height: 30,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? tokens.interactionHighlight : "transparent",
          })}
        >
          <Icon name="X" size={15} color={colors.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function FeedEntryCard({
  colors,
  tokens,
  entry,
  bot,
  onOpenTask,
}: {
  colors: Colors;
  tokens: ReturnType<typeof nativeTokens>;
  entry: BotFeedEntry;
  bot?: Bot;
  onOpenTask(): void;
}) {
  const { t } = useT();
  const relTime = formatRelativeTime(t, entry.timestamp);
  const toolsText = entry.toolsCount > 0 ? formatPluralCount(t, "tool", entry.toolsCount) : null;
  const isWorkflowSource = entry.source === "workflow";
  const sourceLabel =
    entry.source === "routine"
      ? t("feed.sourceRoutine")
      : entry.source === "delegated"
        ? t("feed.sourceDelegated")
        : isWorkflowSource
          ? t("feed.sourceWorkflow")
          : null;
  const workflowStageChip =
    entry.workflowStageName?.trim() ||
    entry.workflowStageId?.trim() ||
    (isWorkflowSource ? entry.workflowTaskId?.trim() : null) ||
    null;

  return (
    <View style={{ gap: 8 }}>
      {entry.command.trim() ? (
        <View style={{ alignItems: "flex-end", gap: 3 }}>
          <View
            style={{
              maxWidth: "86%",
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
              borderBottomRightRadius: 4,
              backgroundColor: colors.surface2,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: ui(14), lineHeight: 20, color: colors.foreground }}>{entry.command}</Text>
          </View>
          {relTime ? (
            <Text style={{ fontSize: ui(11), color: colors.foregroundMuted, paddingHorizontal: 4 }}>{relTime}</Text>
          ) : null}
        </View>
      ) : null}

      <View
        style={{
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: entry.status === "failed" ? withAlpha(colors.statusDanger, 0.55) : colors.border,
          backgroundColor: colors.surface1,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.surface2 }}>
            {bot ? <Avatar avatar={bot.avatar} size={14} dark={tokens.dark} /> : null}
            <Text style={{ fontSize: ui(12), fontWeight: "600", color: colors.foreground }}>{entry.botName}</Text>
          </View>

          {sourceLabel ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 6,
                backgroundColor: isWorkflowSource ? withAlpha(colors.accent, 0.14) : colors.surface0,
                borderWidth: 1,
                borderColor: isWorkflowSource ? withAlpha(colors.accent, 0.35) : colors.border,
              }}
            >
              {isWorkflowSource ? <Icon name="GitBranch" size={11} color={colors.accent} /> : null}
              <Text style={{ fontSize: ui(11), fontWeight: isWorkflowSource ? "600" : "400", color: isWorkflowSource ? colors.accent : colors.foregroundMuted }}>
                {sourceLabel}
              </Text>
            </View>
          ) : null}

          {workflowStageChip ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 0, backgroundColor: colors.surface2 }}>
              <Icon name="Layers" size={11} color={colors.foregroundMuted} />
              <Text numberOfLines={1} style={{ fontSize: ui(11), color: colors.foregroundMuted, maxWidth: 180 }}>
                {workflowStageChip}
              </Text>
            </View>
          ) : null}

          {toolsText ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.surface0, borderWidth: 1, borderColor: colors.border }}>
              <Icon name="Wrench" size={11} color={colors.foregroundMuted} />
              <Text style={{ fontSize: ui(11), color: colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>{toolsText}</Text>
            </View>
          ) : null}

          {entry.archived ? (
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.surface2 }}>
              <Text style={{ fontSize: ui(11), color: colors.foregroundMuted }}>{t("feed.archivedBadge")}</Text>
            </View>
          ) : null}

          {entry.hydrated === false ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.surface0, borderWidth: 1, borderColor: colors.border }}>
              <Icon name="Eye" size={11} color={colors.foregroundMuted} />
              <Text style={{ fontSize: ui(11), color: colors.foregroundMuted }}>{t("feed.previewOnlyBadge")}</Text>
            </View>
          ) : null}

          {!entry.command.trim() && relTime ? (
            <Text style={{ fontSize: ui(11), color: colors.foregroundMuted }}>{relTime}</Text>
          ) : null}

          <View style={{ flex: 1 }} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("feed.viewTask")}
            onPress={onOpenTask}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 7,
              borderWidth: 1,
              borderColor: tokens.borderAccent,
              backgroundColor: pressed ? colors.surface2 : colors.surface0,
            })}
          >
            <Text style={{ fontSize: ui(12), fontWeight: "500", color: colors.accent }}>{t("feed.viewTask")}</Text>
          </Pressable>
        </View>

        {entry.status === "failed" ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: withAlpha(colors.statusDanger, 0.5),
              backgroundColor: withAlpha(colors.statusDanger, 0.1),
            }}
          >
            <Icon name="AlertCircle" size={14} color={colors.statusDanger} />
            <Text style={{ flex: 1, fontSize: ui(12), color: colors.statusDanger }}>
              {entry.errorMessage || t("feed.turnFailed")}
            </Text>
          </View>
        ) : null}

        {entry.reply.trim() ? (
          <Markdown colors={colors} text={entry.reply} />
        ) : entry.status !== "failed" ? (
          <Text style={{ fontSize: ui(13), color: colors.foregroundMuted, fontStyle: "italic" }}>
            {t("feed.noReplyBody")}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function FeedComposer({
  colors,
  tokens,
  channelName,
  draft,
  sending,
  sendError,
  compact,
  bottomInset,
  onChangeDraft,
  onSend,
}: {
  colors: Colors;
  tokens: ReturnType<typeof nativeTokens>;
  channelName: string;
  draft: string;
  sending: boolean;
  sendError: string | null;
  compact: boolean;
  bottomInset: number;
  onChangeDraft(text: string): void;
  onSend(): void;
}) {
  const { t } = useT();
  const canSend = draft.trim().length > 0 && !sending;

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface0,
        paddingHorizontal: compact ? 12 : 24,
        paddingTop: 10,
        paddingBottom: Math.max(12, bottomInset + 10),
        alignItems: "center",
      }}
    >
      <View style={{ width: "100%", maxWidth: CONTENT_MAX_WIDTH, gap: 6 }}>
        {sendError ? (
          <Text style={{ fontSize: ui(12), color: colors.statusDanger }}>
            {t("feed.sendFailed", { error: sendError })}
          </Text>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: tokens.borderAccent,
            backgroundColor: colors.surface1,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={onChangeDraft}
            multiline
            editable={!sending}
            placeholder={t("feed.composerPlaceholder", { name: channelName })}
            placeholderTextColor={colors.foregroundMuted}
            onKeyPress={(event) => {
              if (Platform.OS !== "web" || isImeComposing(event)) return;
              const native = event.nativeEvent as { key?: string; shiftKey?: boolean };
              if (native.key === "Enter" && !native.shiftKey) {
                (event as { preventDefault?: () => void }).preventDefault?.();
                onSend();
              }
            }}
            style={{
              flex: 1,
              minHeight: 28,
              maxHeight: 120,
              fontSize: ui(14),
              color: colors.foreground,
              paddingVertical: 4,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sending ? t("feed.sending") : t("feed.send")}
            disabled={!canSend}
            onPress={onSend}
            style={({ pressed }) => ({
              minHeight: 32,
              paddingHorizontal: 12,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: canSend ? colors.accent : colors.surface2,
              opacity: !canSend ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.accentForeground} />
            ) : (
              <Icon name="Send" size={14} color={canSend ? colors.accentForeground : colors.foregroundMuted} />
            )}
            <Text style={{ fontSize: ui(13), fontWeight: "500", color: canSend ? colors.accentForeground : colors.foregroundMuted }}>
              {sending ? t("feed.sending") : t("feed.send")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
